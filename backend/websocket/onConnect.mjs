import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const apigw = new ApiGatewayManagementApiClient({
  endpoint: (process.env.WEBSOCKET_ENDPOINT || "").trim(),
});

// JWT validation setup
const client = jwksClient({
  jwksUri: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EmStQTtG1/.well-known/jwks.json",
});

async function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key.getPublicKey());
      }
    });
  });
}

async function validateJWT(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
      throw new Error("Invalid JWT token");
    }

    const signingKey = await getSigningKey(decoded.header.kid);
    const verified = jwt.verify(token, signingKey, {
      issuer: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EmStQTtG1",
      audience: "6f5f1vsm5bejjaffihc3e0n95k",
    });

    return verified;
  } catch (error) {
    console.error("JWT validation failed:", error.message);
    throw error;
  }
}

async function broadcastPresence(userId, online, excludeConnectionId) {
  if (!process.env.CONNECTIONS_TABLE) return;
  const payload = {
    action: "presenceChanged",
    userId,
    online,
    at: new Date().toISOString(),
  };

  let lastKey;
  do {
    const r = await dynamoDb.send(new ScanCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      ProjectionExpression: "connectionId",
      ExclusiveStartKey: lastKey,
    }));

    const ids = (r.Items || [])
      .map((i) => i.connectionId)
      .filter((id) => id && id !== excludeConnectionId);

    // 🔎 add this log here
    console.log("📣 Broadcasting presence", payload, "to", ids.length, "connections:", ids);

    await Promise.allSettled(
      ids.map((id) =>
        apigw.send(new PostToConnectionCommand({ ConnectionId: id, Data: JSON.stringify(payload) }))
          .catch(async (e) => {
            if (e && e.statusCode === 410) {
              console.warn("💀 Stale connection", id, "removing...");
              try {
                await dynamoDb.send(new DeleteCommand({
                  TableName: process.env.CONNECTIONS_TABLE,
                  Key: { connectionId: id },
                }));
              } catch {}
            } else {
              console.error("postToConnection error", { id, msg: e && e.message });
            }
          })
      )
    );
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
}

async function sendPresenceSnapshot(connectionId) {
  if (!process.env.CONNECTIONS_TABLE) return;
  try {
    const r = await dynamoDb.send(new ScanCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      ProjectionExpression: "userId",
    }));

    const users = Array.from(new Set((r.Items || []).map((i) => i.userId).filter(Boolean)));
    const payload = {
      action: "presenceSnapshot",
      userIds: users,
      at: new Date().toISOString(),
    };

    // 🔎 add this log here
    console.log("📤 Sending snapshot to", connectionId, "with users:", users);

    await apigw.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(payload),
    }));
  } catch (e) {
    console.error("sendPresenceSnapshot error", { connectionId, msg: e && e.message });
  }
}


export const handler = async (event) => {
  console.log("🚀 onConnect triggered");

  const connectionId = event?.requestContext?.connectionId;

  // Normalize headers to lowercase
  const H = Object.fromEntries(
    Object.entries(event?.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  let userId = null;
  let role = null;

  // Validate JWT token
  try {
    // For WebSocket, token comes from Sec-WebSocket-Protocol header
    const rawProto =
      H["sec-websocket-protocol"] ||
      (Array.isArray(MV["sec-websocket-protocol"])
        ? MV["sec-websocket-protocol"][0]
        : "") ||
      "";
    
    const parts = rawProto
      .split(",")
      .map((s) => s && s.trim())
      .filter(Boolean);
    const token = parts[0] || ""; // first subprotocol is JWT token
    
    if (!token) {
      throw new Error("No JWT token in subprotocol");
    }

    const decoded = await validateJWT(token);

    userId = decoded["custom:userId"] || decoded.sub;
    role = decoded.role || "user";

    console.log("✅ JWT validated for user:", userId, "role:", role);
  } catch (error) {
    console.error("❌ JWT validation failed:", error.message);
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  // Continue with the rest of the connection logic
  const MV = Object.fromEntries(
    Object.entries(event.multiValueHeaders || {}).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ])
  );

  // Browser sent: "token, sessionId"
  const rawProto =
    H["sec-websocket-protocol"] ||
    (Array.isArray(MV["sec-websocket-protocol"])
      ? MV["sec-websocket-protocol"][0]
      : "") ||
    "";

  const parts = rawProto
    .split(",")
    .map((s) => s && s.trim())
    .filter(Boolean);
  const sessionId = parts[1] || ""; // second subprotocol offered
  const selected = parts[0] || undefined; // echo EXACTLY ONE back (the token)

  const safeLog = {
    connectionId,
    userId,
    role: role,
    stage: event?.requestContext?.stage,
    sourceIp: event?.requestContext?.identity?.sourceIp,
    userAgent: event?.requestContext?.identity?.userAgent,
    sessionId,
  };
  console.log("� New WebSocket Connection (safe):", JSON.stringify(safeLog));

  if (!userId) {
    console.error("🚫 Unauthorized connection attempt.");
    return { statusCode: 403, body: "Unauthorized" };
  }

  try {
    // 1) OPTIONAL: prune only duplicates for the same (userId, sessionId)
    if (sessionId) {
      const dup = await dynamoDb.send(new QueryCommand({
        TableName: process.env.CONNECTIONS_TABLE,
        IndexName: "userId-sessionId-index",
        KeyConditionExpression: "userId = :u AND sessionId = :s",
        ExpressionAttributeValues: { ":u": userId, ":s": sessionId },
      }));

      if (dup.Items?.length) {
        await Promise.all(
          dup.Items.map((conn) =>
            dynamoDb.send(new DeleteCommand({
              TableName: process.env.CONNECTIONS_TABLE,
              Key: { connectionId: conn.connectionId },
            }))
          )
        );
      }
    }

    // 2) Save new connection (omit undefined fields)
    const item = {
      connectionId,
      userId,
      connectedAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
    if (sessionId) item.sessionId = sessionId;

    await dynamoDb.send(new PutCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(connectionId)", // only write if not present
    }));

    console.log(
      `✅ Connection ${connectionId} saved for user ${userId} (session: ${
        sessionId || "none"
      })`
    );

    // Snapshot may 410 during $connect — harmless; keep it if you want best-effort
    await sendPresenceSnapshot(connectionId);

    // ⬅️ KEY FIX: Don’t broadcast to the brand-new connection
    await broadcastPresence(userId, true, connectionId);

    return {
      statusCode: 200,
      body: "Connected.",
      headers: selected ? { "Sec-WebSocket-Protocol": selected } : undefined,
    };
  } catch (err) {
    console.error("❌ Error in $connect:", err);
    return { statusCode: 500, body: "Failed to connect." };
  }
};
