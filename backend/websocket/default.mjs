/**
 * Lambda: WebSocketDefaultHandler
 * Route: WS $default
 * Auth: API Gateway WebSocket (connection-based)
 * Input: { action: string, ...payload }
 * Output: { ack: true } or error via WebSocket
 * Side effects: manages real-time messaging, notifications, connection state
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, GetCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { randomUUID } from "crypto";
import { v4 as uuid } from "uuid";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const apigwManagementApi = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT,
});
const inboxTable = process.env.INBOX_TABLE;
const notificationsTable = process.env.NOTIFICATIONS_TABLE;
const projectsTable = process.env.PROJECTS_TABLE;
const pendingBatchesTable = process.env.PENDING_BATCHES_TABLE || "PendingEditBatches";
const activityTable = process.env.ACTIVITY_TABLE || "ProjectActivity";

// ============================================================================
// NOTIFICATION & ACTIVITY CONFIGURATION
// ============================================================================

const BATCH_CONFIG = {
  IDLE_THRESHOLD_MS: 90_000,          // 90 seconds
  MAX_BATCH_INTERVAL_MS: 30 * 60_000, // 30 minutes
  ACTIVITY_TTL_DAYS: 90,
};

/**
 * Events that should create notifications (rare, interruptive)
 */
const NOTIFICATION_TRIGGERS = new Set([
  'mention',
  'share',
  'review_request',
  'review_complete',
  'publish',
  'comment_resolved',
  'comment_reopened',
  'failure',
  'slide_to_task',
  'project_invite',
  'task_assigned',
  'message',
]);

/**
 * Events that should NOT create notifications or activity (completely ignored)
 */
const IGNORED_EVENTS = new Set([
  'autosave',
  'autosave_tick',
  'yjs_sync',
  'yjs_update',
  'presence_join',
  'presence_leave',
  'cursor_move',
  'cursor_update',
  'selection_change',
  'editor_open',
  'editor_close',
  'heartbeat',
  'idle_timeout',
  'background_sync',
  'connection_reconnect',
]);

const REVISION_AWARE_ACTIONS = new Set(["budgetUpdated", "lineLocked", "lineUnlocked", "lockLineUpdated"]);

const parseRevision = (value) => {
  if (value === undefined || value === null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

export const handler = async (event) => {
  console.log("📩 Received WS Message:", JSON.stringify(event, null, 2));

  let payload;
  try {
    payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    console.log("📦 Parsed Payload:", payload);
  } catch (err) {
    console.error("❌ Invalid JSON:", err);
    return { statusCode: 400, body: "Invalid JSON payload" };
  }

  const { action } = payload || {};
  if (!action) return { statusCode: 400, body: "Missing action" };

  const userId = event.requestContext?.authorizer?.userId;

  switch (action) {
      case "presenceLookup":
    return await handlePresenceLookup(event);

    case "sendMessage":
      return await handleSendMessage(payload);
    case "markRead":
      return await handleMarkRead(payload);
    case "deleteMessage":
      return await handleDeleteMessage(payload);
    case "editMessage":
      return await handleEditMessage(payload);
    case "toggleReaction":
      return await handleToggleReaction(payload);

    case "timelineUpdate":
    case "timelineDelete":
      return await broadcastTimelineUpdate(payload);
    case "setActiveConversation":
      return await handleSetActiveConversation(event, payload);
    case "timelineUpdated":
      return await persistTimelineUpdate(payload);
    case "projectUpdated":
      return await handleProjectUpdated(payload);
    case "budgetUpdated":
      return await handleBudgetUpdated(payload, userId);
    case "lineLocked":
      return await handleLineLocked(payload, userId);
    case "lineUnlocked":
      return await handleLineUnlocked(payload, userId);

    case "setActiveRevision":
      return await handleSetActiveRevision(event, payload);
    case "clientRevisionUpdated":
      return await handleClientRevisionUpdated(payload);

    case "userLocation":
      return await handleUserLocation(payload);

    case "fetchNotifications": {
      if (!notificationsTable) return { statusCode: 200, body: "Notifications disabled" };
      const connectionId = event.requestContext.connectionId;

      const result = await dynamoDb.send(new QueryCommand({
        TableName: notificationsTable,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ScanIndexForward: false,
        Limit: 100,
      }));

      await apigwManagementApi.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({ action: "notificationsBatch", items: result.Items || [] }),
      }));

      return { statusCode: 200 };
    }

    // =========================================================================
    // ACTIVITY & NOTIFICATION SYSTEM
    // =========================================================================
    
    case "trackSlideEdit":
      return await handleTrackSlideEdit(event, payload, userId);
    
    case "fetchProjectActivity":
      return await handleFetchProjectActivity(event, payload);
    
    case "createNotification":
      return await handleCreateNotification(payload, userId);

    case "slideCreated":
    case "slideDeleted":
    case "slideDuplicated":
    case "slideReordered":
    case "slideThumbnailUpdated":
    case "deckVersionCreated":
    case "deckVersionUpdated":
    case "deckVersionDeleted":
    case "deckVersionDuplicated":
    case "deckVersionSetDefault":
    case "deckVersionSetClientDefault":
      return await forwardProjectEvent(payload);

    default:
      console.warn("⚠️ Unknown action:", action);
      return { statusCode: 400, body: `Unknown action: ${action}` };
  }
};

const forwardProjectEvent = async (payload) => {
  if (!payload) {
    return { statusCode: 400, body: "Missing payload" };
  }

  const projectId = payload.projectId || "";
  const conversationId = String(
    (payload.conversationId || (projectId ? `project#${projectId}` : "")) || ""
  ).trim();

  if (!conversationId) {
    return { statusCode: 400, body: "Missing conversationId" };
  }

  try {
    await broadcastToConversation(conversationId, payload);
    return { statusCode: 200, body: "Project event broadcast" };
  } catch (err) {
    console.error("? forwardProjectEvent failed", err);
    return { statusCode: 500, body: "Failed to broadcast project event" };
  }
};

const handleSetActiveConversation = async (event, payload) => {
  const connectionId = event.requestContext.connectionId;
  const authorizerUserId = event.requestContext?.authorizer?.userId; // ✅ add this for presence
  const { conversationId, revision } = payload || {};
  const hasDeckVersionId = payload && Object.prototype.hasOwnProperty.call(payload, "deckVersionId");
  const deckVersionId = hasDeckVersionId ? String(payload.deckVersionId || "").trim() : "";

  if (!connectionId || !conversationId) {
    console.warn("⚠️ Missing connectionId or conversationId");
    return { statusCode: 400, body: "Missing connectionId or conversationId" };
  }

  // Normalize DM conversation IDs (stable ordering)
  let normalizedConversationId = conversationId;
  if (conversationId.startsWith("dm#")) {
    const userIds = conversationId.replace("dm#", "").split("___");
    if (userIds.length === 2) {
      const sortedIds = userIds.sort();
      normalizedConversationId = `dm#${sortedIds.join("___")}`;
    }
  }
  const conv = String(normalizedConversationId).trim();
  const revValue = parseRevision(revision);
  const nowIso = new Date().toISOString();

  try {
    let updateExpression = "SET activeConversation = :c, activeRevision = :rev, updatedAt = :now";
    const values = { ":c": conv, ":rev": revValue, ":now": nowIso };
    if (hasDeckVersionId) {
      if (deckVersionId) {
        updateExpression += ", activeDeckVersionId = :dv";
        values[":dv"] = deckVersionId;
      } else {
        updateExpression += " REMOVE activeDeckVersionId";
      }
    }

    // Idempotent update (no condition) - safe even if called multiple times
    await dynamoDb.send(new UpdateCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Key: { connectionId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
    }));

    console.log(`✅ Set activeConversation for ${connectionId} → ${conv}`);
    return { statusCode: 200, body: "Active conversation set" };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      console.warn(`⚠️ Connection not found for ${connectionId}, inserting new row...`);
      try {
        await dynamoDb.send(new PutCommand({
          TableName: process.env.CONNECTIONS_TABLE,
          Item: {
            connectionId,
            userId: authorizerUserId || null,       // ✅ include userId for presence
            activeConversation: conv,
            activeRevision: revValue,
            ...(hasDeckVersionId && deckVersionId ? { activeDeckVersionId: deckVersionId } : {}),
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        }));
        console.log(`✅ Inserted connection and set activeConversation for ${connectionId} → ${conv}`);
        return { statusCode: 200, body: "Active conversation set (inserted)" };
      } catch (insertErr) {
        console.error("❌ Failed to insert connection record:", insertErr);
        return { statusCode: 500, body: "DB insert error" };
      }
    }
    console.error("❌ Failed to set active conversation:", err);
    return { statusCode: 500, body: "DB update error" };
  }
};

const handleSetActiveRevision = async (event, payload) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) {
    console.warn("⚠️ Missing connectionId in setActiveRevision");
    return { statusCode: 400, body: "Missing connectionId" };
  }

  const { revision, projectId, conversationId } = payload || {};
  const normalizedRevision = parseRevision(revision);

  if (normalizedRevision === null && revision !== null && revision !== undefined) {
    console.warn("⚠️ Invalid revision payload:", revision);
    return { statusCode: 400, body: "Invalid revision value" };
  }

  const nowIso = new Date().toISOString();
  const updateParts = ["activeRevision = :rev", "updatedAt = :now"];
  const values = { ":rev": normalizedRevision, ":now": nowIso };

  if (typeof projectId === "string" && projectId.trim()) {
    updateParts.push("revisionProjectId = :proj");
    values[":proj"] = projectId.trim();
  }

  if (typeof conversationId === "string" && conversationId.trim()) {
    updateParts.push("activeConversation = :c");
    values[":c"] = conversationId.trim();
  }

  try {
    await dynamoDb.send(new UpdateCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Key: { connectionId },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeValues: values,
    }));

    console.log("[setActiveRevision] applied", {
      connectionId,
      revision: normalizedRevision,
      projectId,
      conversationId,
    });

    return { statusCode: 200, body: "Active revision updated" };
  } catch (err) {
    console.error("❌ Failed to update active revision", err);
    return { statusCode: 500, body: "Failed to update active revision" };
  }
};

const handleClientRevisionUpdated = async (payload) => {
  const { projectId, clientRevisionId, conversationId, senderId, username } = payload || {};
  const conversation = String(conversationId || (projectId ? `project#${projectId}` : "")).trim();

  if (!projectId || !conversation) {
    console.warn("⚠️ clientRevisionUpdated missing projectId or conversationId");
    return { statusCode: 400, body: "Missing projectId or conversationId" };
  }

  try {
    await broadcastToConversation(conversation, {
      action: "clientRevisionUpdated",
      projectId,
      clientRevisionId,
      senderId,
      username,
    });
    console.log("[handleClientRevisionUpdated] broadcast sent", {
      projectId,
      clientRevisionId,
      conversation,
    });
    return { statusCode: 200, body: "client revision broadcast" };
  } catch (err) {
    console.error("❌ handleClientRevisionUpdated error:", err);
    return { statusCode: 500, body: "Failed to broadcast client revision update" };
  }
};

const broadcastToConversation = async (conversationId, payload) => {
  try {
    const data = await dynamoDb.send(new ScanCommand({ TableName: process.env.CONNECTIONS_TABLE }));
    const connections = data.Items || [];

    const convIdTrim = String(conversationId || "").trim();
    const action = typeof payload?.action === "string" ? payload.action : "";
    const revisionForPayload = parseRevision(payload?.revision);
    const shouldFilterByRevision =
      revisionForPayload !== null && REVISION_AWARE_ACTIONS.has(action);
    const recipients = connections.filter((c) => {
      const activeConv = String(c.activeConversation || "").trim();
      if (activeConv !== convIdTrim) return false;
      if (!shouldFilterByRevision) return true;
      const connectionRevision = parseRevision(c.activeRevision);
      if (connectionRevision === null) return true;
      return connectionRevision === revisionForPayload;
    });

    console.log("[broadcastToConversation] conversationId:", convIdTrim, "action:", action, "revision:", revisionForPayload);
    console.log("[broadcastToConversation] recipients:", recipients.map((r) => r.connectionId));

    if (recipients.length === 0) {
      console.warn("⚠️ No active connections for", convIdTrim);
      return;
    }

    const stale = [];

    await Promise.allSettled(
      recipients.map(async ({ connectionId }) => {
        try {
          await apigwManagementApi.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(payload),
          }));
        } catch (err) {
          if (err && err.statusCode === 410) stale.push(connectionId);
          else console.error("❌ WS send failed", err);
        }
      })
    );

    if (stale.length) {
      console.log("🧹 Cleaning stale connections:", stale);
      await Promise.allSettled(
        stale.map((id) =>
          dynamoDb.send(new DeleteCommand({
            TableName: process.env.CONNECTIONS_TABLE,
            Key: { connectionId: id },
          }))
        )
      );
    }
  } catch (err) {
    console.error("❌ broadcastToConversation error:", err);
  }
};

async function handlePresenceLookup(event) {
  const connectionId = event?.requestContext?.connectionId;
  if (!connectionId) return;

  try {
    const r = await dynamoDb.send(new ScanCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      ProjectionExpression: "userId",
    }));

    const users = Array.from(
      new Set((r.Items || []).map(i => i.userId).filter(Boolean))
    );

    const payload = {
      action: "presenceSnapshot",
      userIds: users,
      at: new Date().toISOString(),
    };

    console.log("📤 Sending snapshot via presenceLookup to", connectionId, "with users:", users);

    await apigwManagementApi.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(payload),
    }));
  } catch (err) {
    console.error("❌ handlePresenceLookup error:", err);
    return { statusCode: 500, body: "Internal server error" };
  }
}


async function broadcastToUser(userId, payload) {
  try {
    const data = await dynamoDb.send(new ScanCommand({ TableName: process.env.CONNECTIONS_TABLE }));
    const userConns = (data.Items || [])
      .filter((c) => c.userId === userId)
      .map((c) => c.connectionId);

    console.log("📡 [broadcastToUser] userId:", userId);
    console.log("📡 [broadcastToUser] Matched connections:", userConns);

    if (userConns.length === 0) {
      console.warn("🚫 No active connections for user", userId);
      return;
    }

    await Promise.allSettled(
      userConns.map((connId) =>
        apigwManagementApi.send(new PostToConnectionCommand({
          ConnectionId: connId,
          Data: JSON.stringify(payload),
        }))
      )
    );

    console.log("✅ [broadcastToUser] Broadcasted to all connections");
  } catch (err) {
    console.error("❌ broadcastToUser error:", err);
  }
}

function normalizeNotificationMessage(message) {
  if (message === undefined || message === null) {
    return "";
  }

  if (typeof message === "string") {
    return message;
  }

  if (typeof message === "object") {
    if (typeof message.text === "string" && message.text.trim().length) {
      return message.text;
    }

    try {
      return JSON.stringify(message);
    } catch (err) {
      console.warn("⚠️ Failed to stringify notification payload", err);
      return String(message);
    }
  }

  return String(message);
}

async function saveNotification(userId, message, dedupeId, timestamp, senderId, projectId) {
  console.log("🔔 [saveNotification] Called with userId:", userId);

  if (!notificationsTable) {
    console.log("ℹ️ NOTIFICATIONS_TABLE not set; skipping saveNotification");
    return;
  }

  const safeMessage = normalizeNotificationMessage(message);

  try {
    const existing = await dynamoDb.send(new QueryCommand({
      TableName: notificationsTable,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
      ScanIndexForward: false,
      Limit: 5,
    }));

    if (existing.Items && existing.Items.some((n) => n.dedupeId === dedupeId)) {
      console.log("🔁 Duplicate notification skipped");
      return;
    }

    const ts = timestamp || new Date().toISOString();
    const sortKeyValue = `${ts}#${randomUUID()}`;
    const item = {
      userId,
      "timestamp#uuid": sortKeyValue,
      timestamp: ts,
      dedupeId,
      message: safeMessage,
      read: false,
      senderId,
      projectId,
    };

    await dynamoDb.send(new PutCommand({ TableName: notificationsTable, Item: item }));

    console.log("📨 [saveNotification] About to broadcast:", {
      userId,
      connectionPayload: { action: "notification", ...item },
    });

    await broadcastToUser(userId, { action: "notification", ...item });
  } catch (err) {
    console.error("❌ saveNotification error", err);
  }
}


async function saveProjectNotifications(projectId, message, dedupeId, senderId = null) {
  if (!notificationsTable) {
    console.log("ℹ️ NOTIFICATIONS_TABLE not set; skipping saveProjectNotifications");
    return;
  }

  if (!projectsTable) {
    console.log("ℹ️ PROJECTS_TABLE not set; skipping saveProjectNotifications");
    return;
  }

  try {
    const res = await dynamoDb.send(new GetCommand({
      TableName: projectsTable,
      Key: { projectId },
    }));

    const teamArr = Array.isArray(res.Item?.team) ? res.Item.team.map((t) => t.userId) : [];
    if (senderId) teamArr.push(senderId);

    const recipients = Array.from(new Set(teamArr));
    const timestamp = new Date().toISOString();

    await Promise.all(
      recipients.map((uid) => saveNotification(uid, message, dedupeId, timestamp, senderId, projectId))
    );
  } catch (err) {
    console.error("❌ saveProjectNotifications error", err);
  }
}

async function deleteNotificationsByDedupeId(dedupeId) {
  if (!dedupeId) {
    console.error("❌ deleteNotificationsByDedupeId: missing dedupeId");
    return;
  }

  if (!notificationsTable) return;

  try {
    const { Items = [] } = await dynamoDb.send(new QueryCommand({
      TableName: notificationsTable,
      IndexName: "dedupeId-index",
      KeyConditionExpression: "dedupeId = :d",
      ExpressionAttributeValues: { ":d": dedupeId },
      ProjectionExpression: "userId, #ts",
      ExpressionAttributeNames: { "#ts": "timestamp#uuid" },
    }));

    if (Items.length === 0) {
      console.warn("⚠️ No items found in GSI for that dedupeId");
      return;
    }

    const deleteRequests = Items.map((item) => ({
      DeleteRequest: { Key: { userId: item.userId, "timestamp#uuid": item["timestamp#uuid"] } },
    }));

    while (deleteRequests.length) {
      const batch = deleteRequests.splice(0, 25);
      await dynamoDb.send(new BatchWriteCommand({ RequestItems: { [notificationsTable]: batch } }));
    }

    console.log(`✅ Deleted ${Items.length} notifications for dedupeId=${dedupeId}`);
  } catch (err) {
    console.error("❌ deleteNotificationsByDedupeId error:", err);
  }
}

const handleSendMessage = async (payload) => {
  const { conversationType, conversationId, senderId, username, text, timestamp, title, attachments } = payload || {};

  if (!conversationType || !conversationId || !senderId || (!text && !attachments) || !timestamp) {
    console.error("❌ Missing required message fields");
    return { statusCode: 400, body: "Missing required fields" };
  }

  let tableName;
  if (conversationType === "dm") tableName = process.env.MESSAGES_TABLE;
  else if (conversationType === "project") tableName = process.env.PROJECT_MESSAGES_TABLE;
  else return { statusCode: 400, body: "Invalid conversation type" };

  // For DM: sort pair for stable conversationId
  let finalConversationId = conversationId;
  if (conversationType === "dm") {
    const sortedIds = conversationId.replace("dm#", "").split("___").sort();
    finalConversationId = `dm#${sortedIds.join("___")}`;
  }

  const [uid1, uid2] = finalConversationId.replace("dm#", "").split("___");
  const recipientId = senderId === uid1 ? uid2 : uid1;

  if (conversationType === "dm" && !recipientId) {
    console.warn("⚠️ Unable to resolve recipientId for DM", {
      conversationId: conversationId,
      finalConversationId,
      senderId,
      uid1,
      uid2,
    });
  }

  // sanitize attachments before saving
  const cleanAttachments = (attachments || [])
    .filter(a => a && a.key)
    .map(a => {
      let key = a.key;

      // Always ensure prefix "public/"
      if (!key.startsWith("public/")) {
        key = `public/${key.replace(/^\/?public\//, "")}`;
      }

      return {
        key,
        name: a.name || key.split("/").pop(),
        type: a.type || "application/octet-stream"
      };
    });

  const messageItem = {
    messageId: `MESSAGE#${String(timestamp).padStart(13, "0")}#${uuid()}`,
    senderId,
    username,
    text: text && !cleanAttachments.length ? text : "", // only keep text if it's not a file
    timestamp,
    conversationId: finalConversationId,
    GSI1PK: `USER#${recipientId}`,
    GSI1SK: timestamp,
    optimisticId: payload.optimisticId || undefined,
    reactions: {},
    attachments: cleanAttachments,
    ...(conversationType === "dm" && recipientId ? { recipientId } : {}),
  };

  if (conversationType === "project") {
    messageItem.projectId = finalConversationId.replace("project#", "");
  }

  try {
    await dynamoDb.send(new PutCommand({ TableName: tableName, Item: messageItem }));
    console.log("✅ Message saved to DB with GSI:", messageItem);

    if (conversationType === "dm" && inboxTable) {
      const isFile = cleanAttachments.length > 0;
      const snippet = isFile
        ? `📎 ${cleanAttachments.length} file(s) uploaded`
        : text.length > 60 ? text.slice(0, 57) + "..." : text;

      const threadUpdateSender = {
        TableName: inboxTable,
        Key: { userId: senderId, conversationId: finalConversationId },
        UpdateExpression: `SET lastMsgTs = :ts, snippet = :snip, otherUserId = :other, #r = :true`,
        ExpressionAttributeNames: { "#r": "read" },
        ExpressionAttributeValues: {
          ":ts": timestamp,
          ":snip": snippet,
          ":other": recipientId,
          ":true": true,
        },
      };

      const threadUpdateRecipient = {
        TableName: inboxTable,
        Key: { userId: recipientId, conversationId: finalConversationId },
        UpdateExpression: `SET lastMsgTs = :ts, snippet = :snip, otherUserId = :other, #r = :false`,
        ExpressionAttributeNames: { "#r": "read" },
        ExpressionAttributeValues: {
          ":ts": timestamp,
          ":snip": snippet,
          ":other": senderId,
          ":false": false,
        },
      };

      await Promise.all([
        dynamoDb.send(new UpdateCommand(threadUpdateSender)),
        dynamoDb.send(new UpdateCommand(threadUpdateRecipient)),
      ]);
      console.log("✅ Threads updated");
    }
  } catch (err) {
    console.error("❌ Error writing message to DB:", err);
    return { statusCode: 500, body: "DB write error" };
  }

  if (conversationType === "project") {
    await broadcastToConversation(finalConversationId, {
      action: "newMessage",
      conversationType,
      ...messageItem,
    });

    const projectId = finalConversationId.replace("project#", "");
    const projectName = title || projectId;
    const senderName = username || senderId;
    const isFile = Array.isArray(messageItem.attachments) && messageItem.attachments.length > 0;
    const summary = isFile
      ? `📎 ${senderName} uploaded ${messageItem.attachments.length} file(s) in "${projectName}"`
      : `💬 ${senderName} in "${projectName}": ${text.length > 60 ? text.slice(0, 57) + "..." : text}`;

    await saveProjectNotifications(projectId, summary, messageItem.messageId, senderId);
    return { statusCode: 200, body: "Project message sent" };
  }

  await Promise.all([
    broadcastToUser(uid1, { action: "newMessage", conversationType: "dm", ...messageItem }),
    broadcastToUser(uid2, { action: "newMessage", conversationType: "dm", ...messageItem }),
  ]);

  await broadcastToConversation(finalConversationId, {
    action: "newMessage",
    conversationType,
    ...messageItem,
  });

  return { statusCode: 200, body: "Message sent successfully" };
};

const handleMarkRead = async ({ conversationType, conversationId, userId, read, lastMsgTs }) => {
  if (conversationType !== "dm") return { statusCode: 400, body: "Invalid conversationType" };

  // Persist read status before notifying clients
  if (inboxTable) {
    try {
      const params = {
        TableName: inboxTable,
        Key: { userId, conversationId },
        UpdateExpression: `SET #r = :read${lastMsgTs ? ", lastMsgTs = :ts" : ""}`,
        ExpressionAttributeNames: { "#r": "read" },
        ExpressionAttributeValues: {
          ":read": read,
          ...(lastMsgTs ? { ":ts": lastMsgTs } : {}),
        },
        ConditionExpression: "attribute_exists(conversationId)",
      };
      await dynamoDb.send(new UpdateCommand(params));
    } catch (err) {
      if (err?.name === "ConditionalCheckFailedException") {
        console.warn("⚠️ Skipping markRead for missing inbox thread", { userId, conversationId });
      } else {
        console.error("❌ Failed to update read status:", err);
      }
    }
  }

  const [uid1, uid2] = conversationId.replace("dm#", "").split("___");

  await Promise.all([
    broadcastToUser(uid1, { action: "markRead", conversationType: "dm", conversationId, userId, read }),
    broadcastToUser(uid2, { action: "markRead", conversationType: "dm", conversationId, userId, read }),
  ]);

  return { statusCode: 200, body: "Read state broadcasted" };
};

const handleDeleteMessage = async (payload) => {
  const { conversationType, conversationId, messageId } = payload || {};
  if (!conversationType || !conversationId || !messageId) {
    return { statusCode: 400, body: "Missing fields" };
  }

  const eventPayload = { action: "deleteMessage", conversationType, conversationId, messageId };

  if (conversationType === "dm") {
    // Delete message from database
    try {
      await dynamoDb.send(new DeleteCommand({
        TableName: process.env.MESSAGES_TABLE,
        Key: { conversationId, messageId },
      }));
      console.log("✅ DM message deleted from DB:", messageId);
    } catch (err) {
      console.error("❌ Failed to delete DM message from DB:", err);
    }

    const [uid1, uid2] = conversationId.replace("dm#", "").split("___");
    await Promise.all([
      broadcastToUser(uid1, eventPayload),
      broadcastToUser(uid2, eventPayload),
      broadcastToConversation(conversationId, eventPayload),
    ]);
  } else if (conversationType === "project") {
    // Delete message from database
    const projectId = conversationId.replace("project#", "");
    try {
      await dynamoDb.send(new DeleteCommand({
        TableName: process.env.PROJECT_MESSAGES_TABLE,
        Key: { projectId, messageId },
      }));
      console.log("✅ Project message deleted from DB:", messageId);
    } catch (err) {
      console.error("❌ Failed to delete project message from DB:", err);
    }

    await broadcastToConversation(conversationId, eventPayload);
    await deleteNotificationsByDedupeId(messageId);
  } else {
    return { statusCode: 400, body: "Invalid conversationType" };
  }

  return { statusCode: 200, body: "Delete broadcasted" };
};

const handleEditMessage = async (payload) => {
  const { conversationType, conversationId, messageId, text, editedAt, editedBy, timestamp, projectId } = payload || {};
  if (!conversationType || !conversationId || !messageId || !text) {
    return { statusCode: 400, body: "Missing fields" };
  }

  const eventPayload = {
    action: "editMessage",
    conversationType,
    conversationId,
    messageId,
    text,
    editedAt: editedAt || new Date().toISOString(),
    editedBy,
    timestamp,
    projectId,
  };

  if (conversationType === "dm") {
    // Update message in database
    try {
      await dynamoDb.send(new UpdateCommand({
        TableName: process.env.MESSAGES_TABLE,
        Key: { conversationId, messageId },
        UpdateExpression: "SET #t = :text, edited = :edited, editedAt = :editedAt, editedBy = :editedBy",
        ExpressionAttributeNames: { "#t": "text" },
        ExpressionAttributeValues: {
          ":text": text,
          ":edited": true,
          ":editedAt": editedAt || new Date().toISOString(),
          ":editedBy": editedBy,
        },
      }));
      console.log("✅ DM message updated in DB:", messageId);
    } catch (err) {
      console.error("❌ Failed to update DM message in DB:", err);
    }

    const [uid1, uid2] = conversationId.replace("dm#", "").split("___");
    await Promise.all([
      broadcastToUser(uid1, eventPayload),
      broadcastToUser(uid2, eventPayload),
      broadcastToConversation(conversationId, eventPayload),
    ]);
  } else if (conversationType === "project") {
    // Update message in database
    const projectId = conversationId.replace("project#", "");
    try {
      await dynamoDb.send(new UpdateCommand({
        TableName: process.env.PROJECT_MESSAGES_TABLE,
        Key: { projectId, messageId },
        UpdateExpression: "SET #t = :text, edited = :edited, editedAt = :editedAt, editedBy = :editedBy",
        ExpressionAttributeNames: { "#t": "text" },
        ExpressionAttributeValues: {
          ":text": text,
          ":edited": true,
          ":editedAt": editedAt || new Date().toISOString(),
          ":editedBy": editedBy,
        },
      }));
      console.log("✅ Project message updated in DB:", messageId);
    } catch (err) {
      console.error("❌ Failed to update project message in DB:", err);
    }

    await broadcastToConversation(conversationId, eventPayload);
  } else {
    return { statusCode: 400, body: "Invalid conversationType" };
  }

  return { statusCode: 200, body: "Edit broadcasted" };
};

const handleToggleReaction = async (payload) => {
  const { conversationType, conversationId, messageId, emoji, userId } = payload || {};

  if (!conversationType || !conversationId || !messageId || !emoji || !userId) {
    return { statusCode: 400, body: "Missing fields" };
  }

  let tableName;
  let key;
  if (conversationType === "dm") {
    tableName = process.env.MESSAGES_TABLE;
    key = { conversationId, messageId };
  } else if (conversationType === "project") {
    tableName = process.env.PROJECT_MESSAGES_TABLE;
    const projectId = String(conversationId).replace("project#", "");
    key = { projectId, messageId };
  } else {
    return { statusCode: 400, body: "Invalid conversationType" };
  }

  let item;
  try {
    const res = await dynamoDb.send(new GetCommand({ TableName: tableName, Key: key }));
    item = res.Item;
    if (!item) return { statusCode: 404, body: "Message not found" };
  } catch (err) {
    console.error("❌ Failed to fetch message for toggleReaction", err);
    return { statusCode: 500, body: "DB get error" };
  }

  const reactions = { ...(item.reactions || {}) };
  const users = new Set(reactions[emoji] || []);
  if (users.has(userId)) users.delete(userId);
  else users.add(userId);
  if (users.size > 0) reactions[emoji] = Array.from(users);
  else delete reactions[emoji];

  try {
    await dynamoDb.send(new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: "SET reactions = :r",
      ExpressionAttributeValues: { ":r": reactions },
    }));
  } catch (err) {
    console.error("❌ Failed to update reactions", err);
    return { statusCode: 500, body: "DB update error" };
  }

  const eventPayload = {
    action: "toggleReaction",
    conversationType,
    conversationId,
    messageId,
    reactions,
    projectId: key.projectId,
  };

  if (conversationType === "dm") {
    const [uid1, uid2] = conversationId.replace("dm#", "").split("___");
    await Promise.all([
      broadcastToUser(uid1, eventPayload),
      broadcastToUser(uid2, eventPayload),
      broadcastToConversation(conversationId, eventPayload),
    ]);
  } else {
    await broadcastToConversation(conversationId, eventPayload);
  }

  return { statusCode: 200, body: "Reaction toggled" };
};

const broadcastTimelineUpdate = async ({ conversationType, conversationId, events, action }) => {
  if (conversationType !== "project" || !conversationId || !Array.isArray(events)) {
    return { statusCode: 400, body: "Invalid timeline payload" };
  }

  await broadcastToConversation(conversationId, {
    action,
    conversationType,
    conversationId,
    events,
  });

  return { statusCode: 200, body: "Timeline broadcasted" };
};

const persistTimelineUpdate = async (payload) => {
  const {
    projectId,
    title,
    events = [],
    conversationId,
    username,
    senderId,
    timelineAction,
  } = payload || {};

  if (!projectId || !Array.isArray(events)) {
    return { statusCode: 400, body: "Missing projectId or events" };
  }

  const newEvents = events.map((ev) => {
    const id = ev.id || ev.eventId || uuid();
    return {
      id,
      eventId: ev.eventId || id,
      date: ev.date,
      description: ev.description || ev.payload?.description,
      hours: ev.hours,
      budgetItemId: ev.budgetItemId,
      createdBy: ev.createdBy,
    };
  });

  const wsPayload = { action: "timelineUpdated", projectId, events: newEvents };
  await broadcastToConversation(conversationId, wsPayload);

  const sendNotification = async (ev) => {
    const desc = ev.description || "";
    const verb =
      timelineAction === "added"
        ? "added"
        : timelineAction === "deleted"
          ? "deleted"
          : "modified";
    const msg = `${username || "Someone"} ${verb} "${desc}" in "${title || projectId}" ${ev.date} `;
    const dedupe = `timeline#${projectId}#${verb}#${ev.id}`;
    await saveProjectNotifications(projectId, msg, dedupe, senderId, username);
  };

  if (newEvents[0]) await sendNotification(newEvents[0]);

  return { statusCode: 200, body: "timeline broadcast" };
};

const handleProjectUpdated = async (payload) => {
  console.log("🧠 [handleProjectUpdated] Called with payload:", JSON.stringify(payload, null, 2));

  const { projectId, title, fields, conversationId, username, senderId } = payload || {};

  if (!projectId || !fields) {
    console.warn("⚠️ [handleProjectUpdated] Missing projectId or fields");
    return { statusCode: 400, body: "Missing projectId or fields" };
  }

  // Always broadcast the update to other users for real-time sync
  try {
    console.log("📣 [handleProjectUpdated] Broadcasting to conversation:", conversationId);
    await broadcastToConversation(conversationId, {
      action: "projectUpdated",
      projectId,
      fields,
    });
    console.log("✅ [handleProjectUpdated] Broadcast sent");
  } catch (err) {
    console.error("❌ [handleProjectUpdated] Failed broadcastToConversation", err);
  }

  // =========================================================================
  // NOTIFICATION FILTERING: Only create notifications for non-edit fields
  // Slide edits should go to Activity, not Notifications
  // =========================================================================
  
  // Fields that should NOT trigger notifications (high-volume, mechanical edits)
  const ACTIVITY_ONLY_FIELDS = new Set([
    'slides',           // Slide content changes
    'slideOrder',       // Reordering slides
    'thumbnails',       // Thumbnail updates
    'lastEditedAt',     // Timestamp updates
    'lastEditedBy',     // Editor tracking
    'cursors',          // Cursor positions
    'presence',         // User presence
    'yjs',              // Yjs sync data
  ]);
  
  // Filter out activity-only fields
  const notifiableFields = Object.entries(fields).filter(
    ([key]) => !ACTIVITY_ONLY_FIELDS.has(key)
  );
  
  // If no notifiable fields remain, skip notification creation
  if (notifiableFields.length === 0) {
    console.log("📋 [handleProjectUpdated] Skipping notification - slides/edit-only update goes to Activity");
    return { statusCode: 200, body: "project update broadcast (activity only)" };
  }

  try {
    const displayName = title || projectId;
    const sender = username || "Someone";

    const formatValue = (key, value) => {
      if (key === "budget" && value && typeof value === "object") {
        const total = value.total ? `$${Number(value.total).toLocaleString()}` : null;
        const date = value.date || null;
        return [total, date].filter(Boolean).join(" on ");
      }
      // For arrays, just show count instead of dumping objects
      if (Array.isArray(value)) {
        return `${value.length} item${value.length === 1 ? '' : 's'}`;
      }
      // For objects, show a summary instead of [object Object]
      if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 0) return "(empty)";
        if (keys.length <= 3) return keys.join(", ");
        return `${keys.slice(0, 3).join(", ")} +${keys.length - 3} more`;
      }
      return String(value);
    };

    const readableChanges = notifiableFields
      .map(([key, value]) => `${key}: ${formatValue(key, value)}`)
      .join(" | ");

    const msg = `${sender} updated ${displayName} → ${readableChanges}`;
    const projectDedupe = `project#${projectId}#${Date.now()}`;

    console.log("📨 [handleProjectUpdated] Final message:", msg);
    console.log("📨 [handleProjectUpdated] Sending to saveProjectNotifications");

    await saveProjectNotifications(projectId, msg, projectDedupe, senderId, username);
    console.log("✅ [handleProjectUpdated] Notifications fanned out");

  } catch (err) {
    console.error("❌ [handleProjectUpdated] Failed saveProjectNotifications", err);
  }

  return { statusCode: 200, body: "project update broadcast" };
};


const handleBudgetUpdated = async (payload, senderId) => {
  const { projectId, title, revision, total, conversationId, username } = payload || {};

  if (!projectId) return { statusCode: 400, body: "Missing projectId" };

  await broadcastToConversation(conversationId, {
    action: "budgetUpdated",
    projectId,
    revision,
    total,
    senderId,
  });

  const totalStr = total ? `$${Number(total).toLocaleString()}` : "N/A";
  const displayName = title || projectId;
  const revPart = revision ? `revision ${revision} ` : "";
  const sender = username || "Someone";
  const msg = `${sender} updated budget ${revPart}for "${displayName}" → ${totalStr}`;

  const windowMinutes = parseInt(process.env.BUDGET_NOTIF_WINDOW_MINUTES || "10", 10);
  const bucket = Math.floor(Date.now() / (windowMinutes * 60 * 1000));
  const actionType = "update";
  const dedupeId = `budget#${projectId}#${revision || "unknown"}#${actionType}#${bucket}`;

  await saveProjectNotifications(projectId, msg, dedupeId, senderId, username);

  return { statusCode: 200, body: "budget update broadcast" };
};

const handleLineLocked = async (payload, senderId) => {
  const { projectId, lineId, revision, conversationId } = payload || {};
  if (!projectId || !lineId) return { statusCode: 400, body: "Missing projectId or lineId" };

  await broadcastToConversation(conversationId, {
    action: "lineLocked",
    projectId,
    lineId,
    revision,
    senderId,
  });

  return { statusCode: 200, body: "lineLocked broadcast" };
};

const handleLineUnlocked = async (payload, senderId) => {
  const { projectId, lineId, revision, conversationId } = payload || {};
  if (!projectId || !lineId) return { statusCode: 400, body: "Missing projectId or lineId" };

  await broadcastToConversation(conversationId, {
    action: "lineUnlocked",
    projectId,
    lineId,
    revision,
    senderId,
  });

  return { statusCode: 200, body: "lineUnlocked broadcast" };
};

const handleUserLocation = async (payload) => {
  // TODO: Implement user location handling
  console.log("📍 handleUserLocation called with payload:", payload);
  return { statusCode: 200, body: "userLocation handled" };
};

// ============================================================================
// ACTIVITY & NOTIFICATION HANDLERS
// ============================================================================

/**
 * Track slide edits for batching into activity events.
 * Called from frontend on meaningful content changes (not cursors/presence).
 * 
 * Payload: { projectId, deckId, deckName, changes: [{ slideId, slideNumber, changeType }], userName }
 */
const handleTrackSlideEdit = async (event, payload, userId) => {
  const { projectId, deckId, deckName, changes, userName, userAvatar } = payload || {};

  if (!projectId || !changes || !Array.isArray(changes) || changes.length === 0) {
    return { statusCode: 400, body: "Missing projectId or changes array" };
  }

  // Generate or use existing batch ID (per user + project + deck)
  const batchId = `${userId}#${projectId}#${deckId || "default"}`;
  const nowIso = new Date().toISOString();

  try {
    // Try to update existing batch first
    const existing = await dynamoDb.send(new GetCommand({
      TableName: pendingBatchesTable,
      Key: { batchId },
    }));

    if (existing.Item) {
      // Append to existing batch
      const existingChanges = existing.Item.changes || [];
      const updatedChanges = [...existingChanges, ...changes].slice(-BATCH_CONFIG.MAX_BATCH_INTERVAL_MS);

      await dynamoDb.send(new UpdateCommand({
        TableName: pendingBatchesTable,
        Key: { batchId },
        UpdateExpression: "SET #changes = :changes, lastEditAt = :now",
        ExpressionAttributeNames: { "#changes": "changes" },
        ExpressionAttributeValues: {
          ":changes": updatedChanges,
          ":now": nowIso,
        },
      }));
    } else {
      // Create new batch
      await dynamoDb.send(new PutCommand({
        TableName: pendingBatchesTable,
        Item: {
          batchId,
          projectId,
          deckId: deckId || "default",
          deckName: deckName || "Slides",
          userId,
          userName: userName || "Someone",
          userAvatar,
          changes,
          firstEditAt: nowIso,
          lastEditAt: nowIso,
        },
      }));
    }

    console.log(`[trackSlideEdit] Updated batch ${batchId} with ${changes.length} changes`);
    return { statusCode: 200, body: "Edit tracked" };
  } catch (err) {
    console.error("[trackSlideEdit] Error:", err);
    return { statusCode: 500, body: "Failed to track edit" };
  }
};

/**
 * Fetch project activity for the Activity panel.
 * Returns recent activity events for a project.
 * 
 * Payload: { projectId, limit? }
 */
const handleFetchProjectActivity = async (event, payload) => {
  const connectionId = event.requestContext?.connectionId;
  const { projectId, limit = 50 } = payload || {};

  if (!projectId) {
    return { statusCode: 400, body: "Missing projectId" };
  }

  try {
    const result = await dynamoDb.send(new QueryCommand({
      TableName: activityTable,
      KeyConditionExpression: "projectId = :p",
      ExpressionAttributeValues: { ":p": projectId },
      ScanIndexForward: false, // Most recent first
      Limit: Math.min(limit, 100),
    }));

    await apigwManagementApi.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        action: "activityBatch",
        projectId,
        items: result.Items || [],
      }),
    }));

    return { statusCode: 200 };
  } catch (err) {
    console.error("[fetchProjectActivity] Error:", err);
    return { statusCode: 500, body: "Failed to fetch activity" };
  }
};

/**
 * Create a notification for a specific user.
 * Only allowed for NOTIFICATION_TRIGGERS event types.
 * 
 * Payload: { type, recipientId, title, body?, projectId, ... }
 */
const handleCreateNotification = async (payload, senderId) => {
  const {
    type,
    recipientId,
    title,
    body,
    projectId,
    projectName,
    slideId,
    deckId,
    versionId,
    commentId,
    taskId,
    senderName,
    senderAvatar,
    actionUrl,
    meta,
  } = payload || {};

  // Validate notification type
  if (!NOTIFICATION_TRIGGERS.has(type)) {
    console.warn(`[createNotification] Rejected non-notifiable event type: ${type}`);
    return { statusCode: 400, body: `Event type '${type}' is not notifiable` };
  }

  if (!recipientId || !title) {
    return { statusCode: 400, body: "Missing recipientId or title" };
  }

  // Never notify the actor themselves
  if (recipientId === senderId) {
    console.log(`[createNotification] Skipping self-notification for ${senderId}`);
    return { statusCode: 200, body: "Skipped self-notification" };
  }

  const notificationId = `N#${Date.now()}#${uuid()}`;
  const nowIso = new Date().toISOString();

  const notification = {
    notificationId,
    userId: recipientId,
    type,
    category: inferCategory(type),
    title,
    body,
    projectId,
    projectName,
    slideId,
    deckId,
    versionId,
    commentId,
    taskId,
    senderId,
    senderName: senderName || "Someone",
    senderAvatar,
    createdAt: nowIso,
    actionUrl,
    meta,
    read: false,
  };

  try {
    // Write to Notifications table
    await dynamoDb.send(new PutCommand({
      TableName: notificationsTable,
      Item: notification,
    }));

    // Send via WebSocket to recipient if online
    await broadcastToUser(recipientId, {
      action: "notification",
      ...notification,
    });

    console.log(`[createNotification] Created ${type} notification for ${recipientId}`);
    return { statusCode: 200, body: "Notification created" };
  } catch (err) {
    console.error("[createNotification] Error:", err);
    return { statusCode: 500, body: "Failed to create notification" };
  }
};

/**
 * Infer category from notification type
 */
function inferCategory(type) {
  const categoryMap = {
    mention: 'slides',
    share: 'slides',
    review_request: 'slides',
    review_complete: 'slides',
    publish: 'slides',
    comment_resolved: 'slides',
    comment_reopened: 'slides',
    failure: 'system',
    slide_to_task: 'tasks',
    project_invite: 'project',
    task_assigned: 'tasks',
    message: 'messages',
  };
  return categoryMap[type] || 'system';
}
