import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const apigw = new ApiGatewayManagementApiClient({
  endpoint: (process.env.WEBSOCKET_ENDPOINT || "").trim(),
});

const CONNECTIONS_TABLE = (process.env.CONNECTIONS_TABLE || "").trim();
const USER_GSI = (process.env.CONNECTIONS_USER_GSI || "userId-sessionId-index").trim();

/* ------------------------- helpers ------------------------- */

// Global fanout (keep your Scan for now; swap to shard GSI later if you want)
async function listAllConnectionIds() {
  let lastKey, ids = [];
  do {
    const r = await dynamoDb.send(new ScanCommand({
      TableName: CONNECTIONS_TABLE,
      ProjectionExpression: "connectionId",
      ExclusiveStartKey: lastKey,
    }));
    ids.push(...(r.Items || []).map(i => i.connectionId));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

async function fanoutPresence(userId, online) {
  const payload = { action: "presenceChanged", userId, online, at: new Date().toISOString() };
  const ids = await listAllConnectionIds();
  if (ids.length === 0) return;

  await Promise.allSettled(
    ids.map((cid) =>
      apigw.send(new PostToConnectionCommand({ ConnectionId: cid, Data: JSON.stringify(payload) }))
        .catch(async (e) => {
          if (e?.statusCode === 410) {
            try { await dynamoDb.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId: cid } })); } catch {}
          } else {
            console.error("postToConnection error", { cid, msg: e?.message });
          }
        })
    )
  );
}

// Return 1 if this is the only row for that user, 2 if there’s another (we only need to know “>1”)
async function userHasAnotherSession(userId) {
  // NOTE: GSIs are eventually consistent. For your “de-complexified” plan we accept that.
  // We only fetch up to 2 to decide “only” vs “multiple”.
  const r = await dynamoDb.send(new QueryCommand({
    TableName: CONNECTIONS_TABLE,
    IndexName: USER_GSI,                  // PK: userId (SK: sessionId or connectionId)
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
    ProjectionExpression: "connectionId",
    Limit: 2,
  }));

  const n = (r.Items || []).length;
  if (n >= 2) return true;   // multiple
  return false;              // zero or one (i.e., this one)
}

async function updateUserPresenceOffline(userId) {
  const table = (process.env.USER_PROFILES_TABLE || "").trim();
  if (!table || !userId) return;
  const nowIso = new Date().toISOString();

  try {
    await dynamoDb.send(
      new UpdateCommand({
        TableName: table,
        Key: { userId },
        UpdateExpression: "SET #presence = :p, #lastSeenAt = :s, #connectedAt = :c",
        ExpressionAttributeNames: {
          "#presence": "presence",
          "#lastSeenAt": "lastSeenAt",
          "#connectedAt": "connectedAt",
        },
        ExpressionAttributeValues: {
          ":p": "offline",
          ":s": nowIso,
          ":c": null,
        },
      })
    );
  } catch (e) {
    console.warn("presence update (offline) failed", { userId, msg: e?.message });
  }
}

/* ------------------------ handler ------------------------- */

export const handler = async (event) => {
  if (!event?.requestContext?.connectionId) {
    return { statusCode: 400, body: "Missing connectionId" };
  }
  if (!CONNECTIONS_TABLE) {
    return { statusCode: 500, body: "Server misconfigured: CONNECTIONS_TABLE" };
  }

  const connectionId = event.requestContext.connectionId;
  console.log("🛑 Disconnect for", connectionId);

  // 1) Strongly-consistent Get on the base table (learn userId even if item vanishes later)
  let userId;
  try {
    const got = await dynamoDb.send(new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
      ConsistentRead: true,
    }));
    userId = got?.Item?.userId;
  } catch (e) {
    console.warn("⚠️ GetItem failed:", e?.message);
  }

  if (!userId) {
    // Nothing to broadcast without a user; just ensure the row is gone and exit.
    try { await dynamoDb.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } })); } catch {}
    console.log("ℹ️ No userId resolved; deleted row if present; skipping broadcast.");
    return { statusCode: 200, body: "Disconnected (no user resolved)." };
  }

  // 2) GSI quick-check: does the user have another session?
  let hasAnother = false;
  try {
    hasAnother = await userHasAnotherSession(userId);
  } catch (e) {
    // If the index briefly lags, we still follow your simple plan:
    // treat as “this is last” → broadcast then delete. (Remove this if you’d rather skip broadcast on error.)
    console.warn("⚠️ GSI check failed; treating as last session:", e?.message);
  }

  if (hasAnother) {
    // 3A) Multiple sessions: delete this connection row, skip broadcast
    try {
      await dynamoDb.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
      console.log(`✅ Deleted ${connectionId}; other sessions remain for user ${userId}.`);
    } catch (e) {
      console.error("❌ Delete failed (multiple sessions case):", e?.message);
      // Still ok; don’t broadcast.
    }
    return { statusCode: 200, body: "Disconnected (other sessions remain)." };
  } else {
    // 3B) This is the last session: broadcast OFFLINE first, then delete
    try {
      await fanoutPresence(userId, false);   // broadcast first (your preference)
    } catch (e) {
      console.error("❌ Fanout offline failed:", e?.message);
      // Continue; we’ll still delete to avoid zombie rows.
    }

    // Best-effort: persist offline presence on the user profile.
    await updateUserPresenceOffline(userId);

    try {
      await dynamoDb.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
      console.log(`✅ Deleted ${connectionId}; user ${userId} now offline.`);
    } catch (e) {
      console.error("❌ Delete failed after broadcast:", e?.message);
      // We already told the world they’re offline; return 200 to avoid retry storms.
    }
    return { statusCode: 200, body: "Disconnected (last session → broadcasted offline)." };
  }
};
