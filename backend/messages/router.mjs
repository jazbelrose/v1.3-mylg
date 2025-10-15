// backend/messages/router.mjs
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

/* ------------ ENV ------------ */
const REGION = process.env.AWS_REGION || "us-west-2";

// Inbox entries
const INBOX_TABLE           = process.env.INBOX_TABLE;

// Messages
const MESSAGES_TABLE        = process.env.MESSAGES_TABLE        || "Messages";

// Project-scoped messages
const PROJECT_MESSAGES_TABLE = process.env.PROJECT_MESSAGES_TABLE || "ProjectMessages";

// Notifications
const NOTIFICATIONS_TABLE          = process.env.NOTIFICATIONS_TABLE          || "Notifications";
const NOTIFICATIONS_BY_USER_INDEX  = process.env.NOTIFICATIONS_BY_USER_INDEX  || "userId-index";

// Dev-only: allow scans without userId
const SCANS_ALLOWED = (process.env.SCANS_ALLOWED || "false").toLowerCase() === "true";

/* ------------ DDB ------------ */
const ddb = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

/* ------------ utils ------------ */
const M = (e) => e?.requestContext?.http?.method?.toUpperCase?.() || e?.httpMethod?.toUpperCase?.() || "GET";
const P = (e) => (e?.rawPath || e?.path || "/");
const Q = (e) => e?.queryStringParameters || {};
const B = (e) => {
  if (!e) return {};
  const body = e.body;
  if (!body) return {};
  try {
    const raw = e.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
    if (typeof raw === "string" && raw.trim().length) {
      return JSON.parse(raw);
    }
    return typeof raw === "object" && raw !== null ? raw : {};
  } catch (err) {
    console.warn("⚠️ Failed to parse request body", err);
    return {};
  }
};

/**
 * Normalizes a DM conversation ID by sorting the user IDs
 * @param conversationId - The conversation ID to normalize (e.g., "dm#user2___user1")
 * @returns The normalized conversation ID (e.g., "dm#user1___user2")
 */
function normalizeDMConversationId(conversationId) {
  if (!conversationId.startsWith('dm#')) {
    return conversationId;
  }
  
  const userIds = conversationId.replace('dm#', '').split('___');
  if (userIds.length !== 2) {
    return conversationId;
  }
  
  const sortedIds = userIds.sort();
  return `dm#${sortedIds.join('___')}`;
}



/* ------------ Handlers ------------ */
const health = async (_e, C) => json(200, C, { ok: true, domain: "messages" });

/* Inbox: list conversations for a userId */
const getInbox = async (e, C) => {
  const userId = Q(e).userId;
  if (!userId) return json(400, C, { error: "userId required" });

  const r = await ddb.query({
    TableName: INBOX_TABLE,
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
    ScanIndexForward: false,
  });

  r.Items?.sort((a, b) => String(b.lastMsgTs || "").localeCompare(String(a.lastMsgTs || "")));
  return json(200, C, { userId, inbox: r.Items || [] });
};

/* GET /messages/threads?userId=...  (alias to inbox)
   If userId omitted and SCANS_ALLOWED=true → scan Inbox (dev only) */
const listThreads = async (e, C) => {
  const userId = Q(e).userId;
  if (userId) return getInbox(e, C);
  if (!SCANS_ALLOWED) return json(400, C, { error: "userId required (set SCANS_ALLOWED=true to scan for dev)" });

  const r = await ddb.scan({ TableName: INBOX_TABLE, Limit: 100 });
  r.Items?.sort((a, b) => String(b.lastMsgTs || "").localeCompare(String(a.lastMsgTs || "")));
  return json(200, C, { inbox: r.Items || [] });
};



const getConversation = async (e, C, { conversationId }) => {
  const userId = Q(e).userId;
  if (!userId) return json(400, C, { error: "userId required" });
  const r = await ddb.get({ TableName: INBOX_TABLE, Key: { userId, conversationId } });
  return json(200, C, { conversation: r.Item || null });
};

/* PUT /messages/threads { userId, conversationId, read?, lastMsgTs? }
   Persists read state updates for a user's inbox thread */
const updateThread = async (e, C) => {
  if (!INBOX_TABLE) return json(500, C, { error: "Inbox table not configured" });

  const { userId, conversationId, read, lastMsgTs } = B(e);
  if (!userId || !conversationId) {
    return json(400, C, { error: "userId and conversationId required" });
  }

  const updateParts = [];
  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};

  if (typeof read === "boolean") {
    ExpressionAttributeNames["#read"] = "read";
    ExpressionAttributeValues[":read"] = read;
    updateParts.push("#read = :read");
  }

  if (lastMsgTs) {
    ExpressionAttributeValues[":ts"] = lastMsgTs;
    updateParts.push("lastMsgTs = :ts");
  }

  if (!updateParts.length) {
    return json(400, C, { error: "No fields provided to update" });
  }

  try {
    await ddb.update({
      TableName: INBOX_TABLE,
      Key: { userId, conversationId },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeNames: Object.keys(ExpressionAttributeNames).length ? ExpressionAttributeNames : undefined,
      ExpressionAttributeValues,
      ConditionExpression: "attribute_exists(conversationId)",
    });
  } catch (err) {
    const status = err?.name === "ConditionalCheckFailedException" ? 404 : 500;
    const message =
      status === 404 ? "Thread not found" : err?.message || "Failed to update thread";
    console.error("❌ Failed to update inbox thread", { err, userId, conversationId });
    return json(status, C, { error: message });
  }

  return json(200, C, { ok: true, userId, conversationId });
};

/* Messages in a conversation
   MESSAGES_TABLE: PK=conversationId, SK=messageId (MESSAGE#<millis>#uuid) */
const listConversationMessages = async (e, C, { conversationId }) => {
  const normalizedId = normalizeDMConversationId(conversationId);
  let lastEvaluatedKey = undefined;
  let allItems = [];

  do {
    const r = await ddb.query({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: "conversationId = :c",
      ExpressionAttributeValues: { ":c": normalizedId },
      ScanIndexForward: true,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    allItems = allItems.concat(r.Items || []);
    lastEvaluatedKey = r.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return json(200, C, {
    conversationId: normalizedId,
    messages: allItems,
  });
};







/* Project-scoped messages: PROJECT_MESSAGES_TABLE (PK=projectId, SK=messageId) */
const listProjectMessages = async (e, C, { projectId }) => {
  projectId = projectId || Q(e).projectId;
  if (!projectId) return json(400, C, { error: "projectId required" });

  const r = await ddb.query({
    TableName: PROJECT_MESSAGES_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
    ScanIndexForward: true,
  });
  return json(200, C, { projectId, messages: r.Items || [] });
};







/* ----------------- Notifications -----------------
   NOTIFICATIONS_TABLE:
     PK: userId, SK: notificationId (e.g., N#<millis>#uuid)
     attrs: title, body, type, projectId?, createdAt, readAt?, meta
---------------------------------------------------*/

const listNotifications = async (e, C) => {
  const userId = Q(e).userId;
  if (!userId) return json(400, C, { error: "userId required" });

  // Prefer GSI if table shape differs; default is PK=userId
  const r = await ddb.query({
    TableName: NOTIFICATIONS_TABLE,
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
    ScanIndexForward: false,
    Limit: Math.min(parseInt(Q(e).limit || "100", 10), 500),
  });

  return json(200, C, { userId, notifications: r.Items || [] });
};







/* ------------ Routes ------------ */
const routes = [
  { m: "GET", r: /^\/messages\/health$/i, h: health },

  // inbox & conversations
  { m: "GET", r: /^\/messages\/inbox$/i, h: getInbox },
  { m: "GET", r: /^\/messages\/threads$/i, h: listThreads },
  { m: "GET", r: /^\/messages\/threads\/(?<conversationId>[^/]+)$/i, h: getConversation },
  { m: "PUT", r: /^\/messages\/threads$/i, h: updateThread },

  // conversation messages
  { m: "GET", r: /^\/messages\/threads\/(?<conversationId>[^/]+)\/messages$/i, h: listConversationMessages },

  // project messages (query param, allow /messages and /messages/)
  { m: "GET", r: /^\/messages\/?$/i, h: listProjectMessages },

  // project-scoped (allow with or without trailing slash)
  { m: "GET", r: /^\/messages\/project\/(?<projectId>[^/]+)\/?$/i, h: listProjectMessages },

  // notifications (v1.2)
  { m: "GET", r: /^\/messages\/notifications$/i, h: listNotifications },

  // v1.1 compat aliases (keep them working, but prefixed)
  { m: "GET", r: /^\/messages\/getDirectMessages$/i, h: listConversationMessages },
  { m: "GET", r: /^\/messages\/getDmInbox$/i, h: getInbox },
  { m: "GET", r: /^\/messages\/getProjectMessages$/i, h: listProjectMessages },
  { m: "GET", r: /^\/messages\/getNotifications$/i, h: listNotifications },
];


export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  const method = M(event);
  const path = P(event);

  try {
    for (const { m, r, h } of routes) {
      if (m !== method) continue;
      const match = r.exec(path);
      if (match) {
        // Decode any URL-encoded path parameters (e.g., conversationId with '#')
        const params = {};
        for (const [k, v] of Object.entries(match.groups || {})) {
          params[k] = decodeURIComponent(v);
        }
        return await h(event, CORS, params);
      }
    }
    return json(404, CORS, { error: "Not found", method, path });
  } catch (err) {
    console.error("messages_router_error", { method, path, err });
    const msg = err?.message || "Server error";
    const status = /ConditionalCheckFailed/i.test(msg) ? 409 : 500;
    return json(status, CORS, { error: msg });
  }
}
