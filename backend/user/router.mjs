// backend/users/router.mjs
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

/* ---------- ENV ---------- */
const REGION = process.env.AWS_REGION || "us-west-2";
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";
const INVITES_TABLE = process.env.INVITES_TABLE || "ProjectInvitations";
const INVITES_BY_SENDER_INDEX = process.env.INVITES_BY_SENDER_INDEX || "senderId-index";
const INVITES_BY_RECIPIENT_INDEX = process.env.INVITES_BY_RECIPIENT_INDEX || "recipientId-index";
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE || "Notifications";
const SCANS_ALLOWED = (process.env.SCANS_ALLOWED || "true").toLowerCase() === "true";

/* ---------- DDB ---------- */
const ddb = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

/* ---------- utils ---------- */
const M = (e) => e?.requestContext?.http?.method?.toUpperCase?.() || e?.httpMethod?.toUpperCase?.() || "GET";
const P = (e) => (e?.rawPath || e?.path || "/");
const Q = (e) => e?.queryStringParameters || {};
const B = (e) => { try { return JSON.parse(e?.body || "{}"); } catch { return {}; } };
const nowISO = () => new Date().toISOString();

const lowerEmail = (s) => (s || "").toLowerCase().trim();
const pendingKeyForEmail = (email) => `PENDING#${lowerEmail(email)}`;

// Handle /user/{proxy} routes
async function handleUserProxy(event, CORS, { proxy }) {
  if (proxy === 'notifications') {
    const method = M(event);
    if (method === 'GET') return await getUserNotifications(event, CORS);
    if (method === 'PATCH') return await patchNotification(event, CORS);
    if (method === 'DELETE') return await deleteNotification(event, CORS);
  }
  // For other unknown user endpoints
  return json(404, CORS, { error: `Unknown user endpoint: /user/${proxy}` });
}

// Get user notifications (proxy to messages service or implement locally)
async function getUserNotifications(event, CORS) {
  const q = Q(event);
  const userId = q.userId;
  
  console.log("getUserNotifications called with userId:", userId);
  console.log("NOTIFICATIONS_TABLE:", NOTIFICATIONS_TABLE);
  
  if (!userId) {
    return json(400, CORS, { error: "userId query parameter required" });
  }

  try {
    // Query notifications for the user
    const r = await ddb.query({
      TableName: NOTIFICATIONS_TABLE,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
      ScanIndexForward: false, // Most recent first
      Limit: Math.min(parseInt(q.limit || "100", 10), 500),
    });

    console.log("Query result:", r);
    
    return json(200, CORS, { 
      userId, 
      notifications: r.Items || [],
      count: r.Items?.length || 0,
      version: "updated"
    });
  } catch (error) {
    console.error("Error fetching user notifications:", error);
    return json(500, CORS, { error: "Failed to fetch notifications", details: error.message });
  }
}

async function patchNotification(event, CORS) {
  const q = Q(event);
  const userId = q.userId;
  const ts = q['timestamp#uuid'];
  if (!userId || !ts) {
    return json(400, CORS, { error: 'userId and timestamp#uuid required' });
  }
  try {
    await ddb.update({
      TableName: NOTIFICATIONS_TABLE,
      Key: { userId, 'timestamp#uuid': ts },
      UpdateExpression: 'SET #r = :t',
      ExpressionAttributeNames: { '#r': 'read' },
      ExpressionAttributeValues: { ':t': true },
    });
    return json(200, CORS, { ok: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return json(500, CORS, { error: 'Failed to mark notification read', details: error.message });
  }
}

async function deleteNotification(event, CORS) {
  const q = Q(event);
  const userId = q.userId;
  const ts = q['timestamp#uuid'];
  if (!userId || !ts) {
    return json(400, CORS, { error: 'userId and timestamp#uuid required' });
  }
  try {
    await ddb.delete({
      TableName: NOTIFICATIONS_TABLE,
      Key: { userId, 'timestamp#uuid': ts },
    });
    return json(200, CORS, { ok: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return json(500, CORS, { error: 'Failed to delete notification', details: error.message });
  }
}

function buildUpdate(obj) {
  const Names = {}, Values = {}, sets = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    Names["#" + k] = k;
    Values[":" + k] = v;
    sets.push(`#${k} = :${k}`);
  }
  if (!sets.length) return null;
  return {
    UpdateExpression: "SET " + sets.join(", "),
    ExpressionAttributeNames: Names,
    ExpressionAttributeValues: Values,
  };
}

async function batchGetUsersByIds(ids) {
  // Always fetch directly from UserProfiles in chunks
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const out = [];
  for (const ch of chunks) {
    const r = await ddb.batchGet({
      RequestItems: { [USER_PROFILES_TABLE]: { Keys: ch.map((userId) => ({ userId })) } },
    });
    out.push(...(r.Responses?.[USER_PROFILES_TABLE] || []));
  }
  return out;
}

const withFirstNameFallback = (u) =>
  u ? { ...u, firstName: u.firstName || u.cognitoAttributes?.given_name || "" } : u;

/* ---------- handlers ---------- */

// health
const health = async (_e, C) => json(200, C, { ok: true, domain: "users" });

/* ======== USER PROFILES ======== */

// GET /userProfiles/{userId}
async function getUserProfile(_e, C, { userId }) {
  if (!userId) return json(400, C, { error: "userId required" });
  const r = await ddb.get({ TableName: USER_PROFILES_TABLE, Key: { userId } });
  return json(200, C, withFirstNameFallback(r.Item) || null);
}

// GET /userProfiles?ids=a,b,c  (batch)  OR (authenticated) GET /userProfiles (scan)
async function getUserProfiles(event, C) {
  const authorizer = event?.requestContext?.authorizer || {};
  const jwtClaims = authorizer?.jwt?.claims || {};
  const role = jwtClaims.role;
  const isAuthenticated = !!jwtClaims.sub; // Check if user has JWT claims (authenticated)
  
  const idsRaw = Q(event).ids || "";
  let decodedIds = idsRaw;
  try {
    decodedIds = decodeURIComponent(idsRaw);
  } catch {
    // ignore malformed URI components
  }
  const ids = decodedIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length) {
    const users = await batchGetUsersByIds(ids);
    return json(200, C, { Items: users.map(withFirstNameFallback) });
  }
  // Allow authenticated users to scan all users
  if (isAuthenticated) {
    // Always fallback to UserProfiles scan
    const r = await ddb.scan({ TableName: USER_PROFILES_TABLE });
    return json(200, C, { Items: (r.Items || []).map(withFirstNameFallback) });
  }
  if (!SCANS_ALLOWED) return json(400, C, { error: "ids required (comma-separated)" });
  // Always fallback to UserProfiles scan
  const r = await ddb.scan({ TableName: USER_PROFILES_TABLE });
  return json(200, C, { Items: (r.Items || []).map(withFirstNameFallback) });
}

// PUT /userProfiles  (v1.1 semantics: upsert + merge pending PENDING#<email>)
async function putUserProfile(event, C) {
  const input = B(event);
  const table = USER_PROFILES_TABLE;
  const userId = input.userId || input.cognitoSub;
  if (!userId) return json(400, C, { error: "userId or cognitoSub required" });

  const email = lowerEmail(input.email);
  let item = { ...input, userId, role: input.role || "user" };

  // preserve existing pending if not provided
  if (typeof item.pending !== "boolean") {
    const existing = await ddb.get({ TableName: table, Key: { userId } });
    if (typeof existing.Item?.pending === "boolean") item.pending = existing.Item.pending;
  }

  // merge from same-table pending record
  if (email) {
    const pk = pendingKeyForEmail(email);
    const pending = await ddb.get({ TableName: table, Key: { userId: pk } });
    if (pending.Item) {
      item = { ...pending.Item, ...item, userId, pending: pending.Item.pending };
      delete item.ttl;
      await ddb.delete({ TableName: table, Key: { userId: pk } });
    }
  }

  await ddb.put({ TableName: table, Item: item });
  return json(200, C, { ok: true, Item: withFirstNameFallback(item) });
}

// PATCH /userProfiles/{userId}
async function patchUserProfile(event, C, { userId }) {
  if (!userId) return json(400, C, { error: "userId required" });
  const b = B(event);
  delete b.userId;
  const upd = buildUpdate({ ...b, updatedAt: nowISO() });
  if (!upd) return json(400, C, { error: "No fields to update" });
  const r = await ddb.update({
    TableName: USER_PROFILES_TABLE,
    Key: { userId },
    ...upd,
    ReturnValues: "ALL_NEW",
  });
  return json(200, C, withFirstNameFallback(r.Attributes));
}

// DELETE /userProfiles/{userId}
async function deleteUserProfile(_e, C, { userId }) {
  if (!userId) return json(400, C, { error: "userId required" });
  await ddb.delete({ TableName: USER_PROFILES_TABLE, Key: { userId } });
  return json(204, C, "");
}

// PATCH /userProfilesPending/{email}  (write pending record in same table)
async function patchUserProfilePending(event, C, { email }) {
  const e = lowerEmail(email);
  if (!e) return json(400, C, { error: "email required in path" });
  const pk = pendingKeyForEmail(e);
  const b = B(event);
  delete b.userId;

  const ts = nowISO();
  const item = {
    userId: pk,
    email: e,
    pending: true,
    updatedAt: ts,
    createdAt: b.createdAt || ts,
    ...b,
  };
  await ddb.put({ TableName: USER_PROFILES_TABLE, Item: item });
  return json(200, C, { pending: item });
}

/* ======== INVITES & PROJECT LINK ======== */

// POST /sendProjectInvitation  (specialized)
async function sendProjectInvitation(event, C) {
  const b = B(event);
  const inviteId = b.inviteId || `INV-${uuidv4()}`;
  const ts = nowISO();
  const item = {
    inviteId,
    type: "project",
    senderId: b.senderId,
    recipientId: b.recipientId,
    recipientEmail: lowerEmail(b.recipientEmail),
    projectId: b.projectId,
    status: "sent",
    createdAt: ts,
    updatedAt: ts,
    meta: b.meta || {},
  };
  if (!item.senderId) return json(400, C, { error: "senderId required" });
  if (!item.projectId) return json(400, C, { error: "projectId required" });
  if (!item.recipientId && !item.recipientEmail)
    return json(400, C, { error: "recipientId or recipientEmail required" });

  await ddb.put({
    TableName: INVITES_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(inviteId)",
  });
  return json(201, C, { invite: item });
}

// alias: POST /inviteUserToProject  → same as sendProjectInvitation
const inviteUserToProject = sendProjectInvitation;

// GET /invites/outgoing?userId=...
async function listInvitesOutgoing(event, C) {
  const userId = Q(event).userId;
  if (!userId) return json(400, C, { error: "userId required" });

  const r = await ddb.query({
    TableName: INVITES_TABLE,
    IndexName: INVITES_BY_SENDER_INDEX,
    KeyConditionExpression: "senderId = :s",
    ExpressionAttributeValues: { ":s": userId },
    ScanIndexForward: false,
  });
  return json(200, C, { userId, invites: r.Items || [] });
}

// GET /invites/incoming?userId=...
async function listInvitesIncoming(event, C) {
  const userId = Q(event).userId;
  if (!userId) return json(400, C, { error: "userId required" });

  const r = await ddb.query({
    TableName: INVITES_TABLE,
    IndexName: INVITES_BY_RECIPIENT_INDEX,
    KeyConditionExpression: "recipientId = :r",
    ExpressionAttributeValues: { ":r": userId },
    ScanIndexForward: false,
  });
  return json(200, C, { userId, invites: r.Items || [] });
}

// POST /invites/send  (generic)
async function sendInvite(event, C) {
  const b = B(event);
  const inviteId = b.inviteId || `INV-${uuidv4()}`;
  const ts = nowISO();

  const item = {
    inviteId,
    type: b.type || "project",
    senderId: b.senderId,
    recipientId: b.recipientId,
    recipientEmail: lowerEmail(b.recipientEmail),
    projectId: b.projectId,
    status: "sent",
    createdAt: ts,
    updatedAt: ts,
    meta: b.meta || {},
  };

  if (!item.senderId) return json(400, C, { error: "senderId required" });
  if (!item.recipientId && !item.recipientEmail)
    return json(400, C, { error: "recipientId or recipientEmail required" });

  await ddb.put({
    TableName: INVITES_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(inviteId)",
  });

  return json(201, C, { invite: item });
}

async function setInviteStatus(event, C, status) {
  const b = B(event);
  const inviteId = b.inviteId;
  if (!inviteId) return json(400, C, { error: "inviteId required in body" });

  const upd = buildUpdate({ status, updatedAt: nowISO() });
  const r = await ddb.update({
    TableName: INVITES_TABLE,
    Key: { inviteId },
    ...upd,
    ReturnValues: "ALL_NEW",
  });
  return json(200, C, { invite: r.Attributes });
}
const acceptInvite  = (e, C) => setInviteStatus(e, C, "accepted");
const declineInvite = (e, C) => setInviteStatus(e, C, "declined");
const cancelInvite  = (e, C) => setInviteStatus(e, C, "canceled");

// alias: POST /respondProjectInvitation  → decision -> accept/decline/cancel
async function respondProjectInvitation(event, C) {
  const { decision } = B(event);
  if (!["accept", "decline", "cancel"].includes(decision))
    return json(400, C, { error: "decision must be one of accept|decline|cancel" });
  if (decision === "accept")  return acceptInvite(event, C);
  if (decision === "decline") return declineInvite(event, C);
  return cancelInvite(event, C);
}

/* ======== PROJECT -> USER LINK ======== */

// POST /postProjectToUserId  (attach projectId to user.projects[])
async function postProjectToUserId(event, C) {
  const b = B(event);
  const userId = Q(event).userId || b.userId;
  if (!userId) return json(400, C, { error: "userId required (query or body)" });
  if (!b.projectId) return json(400, C, { error: "projectId required (body)" });

  const current = await ddb.get({
    TableName: USER_PROFILES_TABLE,
    Key: { userId },
    ProjectionExpression: "projects",
  });
  const existing = Array.isArray(current.Item?.projects) ? current.Item.projects : [];
  if (!existing.includes(b.projectId)) existing.push(b.projectId);

  const r = await ddb.update({
    TableName: USER_PROFILES_TABLE,
    Key: { userId },
    UpdateExpression: "SET #projects = :p, #updatedAt = :u",
    ExpressionAttributeNames: { "#projects": "projects", "#updatedAt": "updatedAt" },
    ExpressionAttributeValues: { ":p": existing, ":u": nowISO() },
    ReturnValues: "ALL_NEW",
  });

  return json(200, C, { userId, projectId: b.projectId, projects: r.Attributes.projects || [] });
}

/* ---------- routes ---------- */
const routes = [
  { M: "GET",    R: /^\/user\/health$/i,                                        H: health },
  { M: "GET",    R: /^\/user\/(?<proxy>[^/]+)$/i,                               H: handleUserProxy },
  { M: "PATCH",  R: /^\/user\/(?<proxy>[^/]+)$/i,                               H: handleUserProxy },
  { M: "DELETE", R: /^\/user\/(?<proxy>[^/]+)$/i,                               H: handleUserProxy },

  // user profiles
  { M: "GET",    R: /^\/userProfiles\/(?<userId>[^/]+)$/i,                      H: getUserProfile },
  { M: "GET",    R: /^\/userProfiles$/i,                                        H: getUserProfiles },
  { M: "PUT",    R: /^\/userProfiles$/i,                                        H: putUserProfile },
  { M: "PATCH",  R: /^\/userProfiles\/(?<userId>[^/]+)$/i,                      H: patchUserProfile },
  { M: "DELETE", R: /^\/userProfiles\/(?<userId>[^/]+)$/i,                      H: deleteUserProfile },

  // pending (same table; key=PENDING#<email>)
  { M: "PATCH",  R: /^\/userProfilesPending\/(?<email>[^/]+)$/i,                H: patchUserProfilePending },

  // invites & aliases
  { M: "POST",   R: /^\/sendProjectInvitation$/i,                               H: sendProjectInvitation },
  { M: "POST",   R: /^\/inviteUserToProject$/i,                                 H: inviteUserToProject },
  { M: "POST",   R: /^\/respondProjectInvitation$/i,                            H: respondProjectInvitation },

  { M: "GET",    R: /^\/invites\/outgoing$/i,                                   H: listInvitesOutgoing },
  { M: "GET",    R: /^\/invites\/incoming$/i,                                   H: listInvitesIncoming },
  { M: "POST",   R: /^\/invites\/send$/i,                                       H: sendInvite },
  { M: "POST",   R: /^\/invites\/accept$/i,                                     H: acceptInvite },
  { M: "POST",   R: /^\/invites\/decline$/i,                                    H: declineInvite },
  { M: "POST",   R: /^\/invites\/cancel$/i,                                     H: cancelInvite },

  // project link
  { M: "POST",   R: /^\/postProjectToUserId$/i,                                 H: postProjectToUserId },
];

/* ---------- entry ---------- */
export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  console.log("CORS headers:", CORS);
  const method = M(event);
  const path   = P(event);

  try {
    for (const { M: mth, R, H } of routes) {
      if (mth !== method) continue;
      const match = R.exec(path);
      if (match) return await H(event, CORS, match.groups || {});
    }
    return json(404, CORS, { error: "Not found", method, path });
  } catch (err) {
    console.error("users_router_error", { method, path, err });
    const msg = err?.message || "Server error";
    const status = /ConditionalCheckFailed/i.test(msg) ? 409 : 500;
    return json(status, CORS, { error: msg });
  }
}
