// backend/orgs/router.mjs
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";
import { getCallerFromEvent, requireCallerUserId, requireCallerAdmin, httpError } from "/opt/nodejs/utils/auth.mjs";
import { requireOrgMember, requireOrgAdmin, isOrgAdminRole } from "/opt/nodejs/utils/orgAuth.mjs";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "crypto";

/* ------------ ENV ------------ */
const REGION = process.env.AWS_REGION || "us-west-2";

const ORGS_TABLE = process.env.ORGS_TABLE || "Orgs";
const ORG_MEMBERS_TABLE = process.env.ORG_MEMBERS_TABLE || "OrgMembers";
const ORG_MEMBERS_USER_INDEX = process.env.ORG_MEMBERS_USER_INDEX || "userId-orgId-index";
const ORG_INVITES_TABLE = process.env.ORG_INVITES_TABLE || "OrgInvites";

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
    if (typeof raw === "string" && raw.trim().length) return JSON.parse(raw);
    return typeof raw === "object" && raw !== null ? raw : {};
  } catch {
    return {};
  }
};

const nowISO = () => new Date().toISOString();
const epochNow = () => Math.floor(Date.now() / 1000);

const sha256Hex = (value) => createHash("sha256").update(String(value)).digest("hex");

const parseOrgId = (raw) => {
  const v = String(raw || "").trim();
  return v;
};

const fromOrgPk = (pk) => String(pk || "").replace(/^ORG#/, "");
const fromOrgSk = (sk) => String(sk || "").replace(/^ORG#/, "");

const isActiveStatus = (status) => {
  const s = String(status || "active").toLowerCase();
  return s === "active";
};

const requireActiveOrg = async (orgId) => {
  const res = await ddb.get({ TableName: ORGS_TABLE, Key: { PK: `ORG#${orgId}` } });
  const org = res?.Item;
  if (!org || !isActiveStatus(org.status)) throw httpError(404, "Not found");
  return org;
};

/* ------------ Handlers ------------ */
const health = async (_e, C) => json(200, C, { ok: true, domain: "orgs" });

// GET /orgs
const listMyOrgs = async (e, C) => {
  const userId = requireCallerUserId(e);

  const r = await ddb.query({
    TableName: ORG_MEMBERS_TABLE,
    IndexName: ORG_MEMBERS_USER_INDEX,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `USER#${userId}` },
    ScanIndexForward: true,
  });

  const orgs = (r.Items || [])
    .filter((item) => !item.status || String(item.status).toLowerCase() === "active")
    .map((item) => ({
      orgId: fromOrgSk(item.GSI1SK),
      name: item.orgName || null,
      role: item.role || "member",
      joinedAt: item.joinedAt || null,
      isAdmin: isOrgAdminRole(item.role),
    }));

  return json(200, C, { orgs });
};

// POST /orgs { name }
const createOrg = async (e, C) => {
  const userId = requireCallerUserId(e);
  requireCallerAdmin(e);
  const body = B(e);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2) return json(400, C, { error: "name required" });

  const orgId = uuidv4();
  const createdAt = nowISO();

  const orgItem = {
    PK: `ORG#${orgId}`,
    orgId,
    name,
    createdAt,
    createdBy: userId,
    status: "active",
  };

  const memberItem = {
    PK: `ORG#${orgId}`,
    SK: `USER#${userId}`,
    orgId,
    userId,
    role: "owner",
    joinedAt: createdAt,
    status: "active",
    GSI1PK: `USER#${userId}`,
    GSI1SK: `ORG#${orgId}`,
    orgName: name,
  };

  await ddb.put({ TableName: ORGS_TABLE, Item: orgItem });
  await ddb.put({ TableName: ORG_MEMBERS_TABLE, Item: memberItem });

  return json(200, C, { org: { orgId, name, role: "owner" } });
};

// DELETE /orgs/:orgId (platform admin)
const deleteOrg = async (e, C, { orgId }) => {
  const userId = requireCallerUserId(e);
  requireCallerAdmin(e);
  orgId = parseOrgId(orgId);

  const res = await ddb.get({ TableName: ORGS_TABLE, Key: { PK: `ORG#${orgId}` } });
  const org = res?.Item;
  if (!org) return json(404, C, { error: "Not found" });

  const deletedAt = nowISO();
  if (isActiveStatus(org.status)) {
    await ddb.update({
      TableName: ORGS_TABLE,
      Key: { PK: `ORG#${orgId}` },
      UpdateExpression: "SET #s = :s, deletedAt = :d, deletedBy = :u",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "deleted", ":d": deletedAt, ":u": userId },
    });
  }

  // Deactivate org memberships
  let membersKey = undefined;
  do {
    const page = await ddb.query({
      TableName: ORG_MEMBERS_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `ORG#${orgId}` },
      ExclusiveStartKey: membersKey,
    });

    for (const item of page.Items || []) {
      if (!isActiveStatus(item.status)) continue;
      await ddb.update({
        TableName: ORG_MEMBERS_TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: "SET #s = :s, leftAt = :d, leftBy = :u",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "deleted", ":d": deletedAt, ":u": userId },
      });
    }

    membersKey = page.LastEvaluatedKey;
  } while (membersKey);

  // Revoke pending invites (no orgId index; scan is OK for admin ops)
  let invitesKey = undefined;
  do {
    const page = await ddb.scan({
      TableName: ORG_INVITES_TABLE,
      FilterExpression: "orgId = :o AND (#s = :pending)",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":o": orgId, ":pending": "pending" },
      ExclusiveStartKey: invitesKey,
    });

    for (const item of page.Items || []) {
      await ddb.update({
        TableName: ORG_INVITES_TABLE,
        Key: { PK: item.PK },
        UpdateExpression: "SET #s = :s, revokedAt = :d, revokedBy = :u",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "revoked", ":d": deletedAt, ":u": userId },
      });
    }

    invitesKey = page.LastEvaluatedKey;
  } while (invitesKey);

  return json(200, C, { ok: true, orgId });
};

// GET /orgs/:orgId (404 if not member)
const getOrg = async (e, C, { orgId }) => {
  const userId = requireCallerUserId(e);
  orgId = parseOrgId(orgId);

  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const res = await ddb.get({ TableName: ORGS_TABLE, Key: { PK: `ORG#${orgId}` } });
  const org = res?.Item;
  if (!org || (org.status && String(org.status).toLowerCase() !== "active")) {
    return json(404, C, { error: "Not found" });
  }

  return json(200, C, {
    org: {
      orgId,
      name: org.name,
      createdAt: org.createdAt,
      createdBy: org.createdBy,
      branding: org.branding || null,
    },
  });
};

// PATCH /orgs/:orgId (admin+ can update org settings including branding)
const updateOrg = async (e, C, { orgId }) => {
  const userId = requireCallerUserId(e);
  orgId = parseOrgId(orgId);

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });
  await requireActiveOrg(orgId);

  const body = B(e);
  const updates = {};
  const expressionParts = [];
  const attrNames = {};
  const attrValues = {};

  // Handle name update
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length >= 2) {
      updates.name = name;
      expressionParts.push("#name = :name");
      attrNames["#name"] = "name";
      attrValues[":name"] = name;
    }
  }

  // Handle branding update
  if (body.branding !== undefined) {
    const branding = body.branding;
    if (branding === null) {
      // Clear branding
      expressionParts.push("branding = :branding");
      attrValues[":branding"] = null;
      updates.branding = null;
    } else if (typeof branding === "object") {
      // Merge branding fields
      const newBranding = {
        logoFileId: typeof branding.logoFileId === "string" ? branding.logoFileId : (branding.logoFileId === null ? null : undefined),
        logoUrl: typeof branding.logoUrl === "string" ? branding.logoUrl : (branding.logoUrl === null ? null : undefined),
        brandName: typeof branding.brandName === "string" ? branding.brandName : undefined,
        brandTagline: typeof branding.brandTagline === "string" ? branding.brandTagline : undefined,
        updatedAt: nowISO(),
      };
      // Remove undefined values
      Object.keys(newBranding).forEach((k) => newBranding[k] === undefined && delete newBranding[k]);
      
      expressionParts.push("branding = :branding");
      attrValues[":branding"] = newBranding;
      updates.branding = newBranding;
    }
  }

  if (expressionParts.length === 0) {
    return json(400, C, { error: "No valid fields to update" });
  }

  expressionParts.push("updatedAt = :updatedAt");
  attrValues[":updatedAt"] = nowISO();

  await ddb.update({
    TableName: ORGS_TABLE,
    Key: { PK: `ORG#${orgId}` },
    UpdateExpression: `SET ${expressionParts.join(", ")}`,
    ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined,
    ExpressionAttributeValues: attrValues,
  });

  return json(200, C, { ok: true, orgId, updates });
};

// POST /orgs/:orgId/invites (admin+)
const createInvite = async (e, C, { orgId }) => {
  const userId = requireCallerUserId(e);
  orgId = parseOrgId(orgId);

  await requireActiveOrg(orgId);

  const membership = await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "member";
  if (!email || !email.includes("@")) return json(400, C, { error: "email required" });
  if (role !== "admin" && role !== "member") return json(400, C, { error: "role must be admin|member" });

  const inviteId = uuidv4();
  const token = randomBytes(24).toString("hex");
  const tokenHash = sha256Hex(token);
  const createdAt = nowISO();
  const expiresAt = epochNow() + 7 * 24 * 60 * 60;

  const item = {
    PK: `INVITE#${inviteId}`,
    inviteId,
    orgId,
    email,
    role,
    tokenHash,
    createdAt,
    expiresAt,
    createdBy: userId,
    createdByRole: membership.role,
    status: "pending",
  };

  await ddb.put({ TableName: ORG_INVITES_TABLE, Item: item });

  // MVP: return token so the caller can deliver it out-of-band.
  return json(200, C, {
    invite: {
      inviteId,
      orgId,
      email,
      role,
      status: "pending",
      expiresAt,
      token,
    },
  });
};

// POST /orgs/invites/accept { inviteId, token }
const acceptInvite = async (e, C) => {
  const { email: callerEmail } = getCallerFromEvent(e);
  const userId = requireCallerUserId(e);

  const body = B(e);
  const inviteId = typeof body.inviteId === "string" ? body.inviteId.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!inviteId || !token) return json(400, C, { error: "inviteId and token required" });

  const res = await ddb.get({ TableName: ORG_INVITES_TABLE, Key: { PK: `INVITE#${inviteId}` } });
  const invite = res?.Item;

  // Hide whether invite exists if token/email mismatch.
  if (!invite) return json(404, C, { error: "Not found" });

  const now = epochNow();
  const status = String(invite.status || "").toLowerCase();
  if (status !== "pending") return json(400, C, { error: "Invite not pending" });
  if (typeof invite.expiresAt === "number" && invite.expiresAt <= now) return json(400, C, { error: "Invite expired" });

  const inviteEmail = String(invite.email || "").toLowerCase();
  if (!callerEmail || callerEmail !== inviteEmail) return json(404, C, { error: "Not found" });

  const tokenHash = sha256Hex(token);
  if (tokenHash !== invite.tokenHash) return json(404, C, { error: "Not found" });

  const orgId = invite.orgId;
  await requireActiveOrg(orgId);
  const joinedAt = nowISO();

  // Write membership (idempotent-ish)
  const memberItem = {
    PK: `ORG#${orgId}`,
    SK: `USER#${userId}`,
    orgId,
    userId,
    role: invite.role || "member",
    joinedAt,
    status: "active",
    GSI1PK: `USER#${userId}`,
    GSI1SK: `ORG#${orgId}`,
    orgName: invite.orgName || invite.orgId || null,
  };

  await ddb.put({ TableName: ORG_MEMBERS_TABLE, Item: memberItem });

  await ddb.update({
    TableName: ORG_INVITES_TABLE,
    Key: { PK: `INVITE#${inviteId}` },
    UpdateExpression: "SET #s = :s, acceptedAt = :a, acceptedBy = :u",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": "accepted", ":a": joinedAt, ":u": userId },
  });

  return json(200, C, { ok: true, orgId, role: memberItem.role });
};

/* ------------ Routes ------------ */
const routes = [
  { m: "GET", r: /^\/orgs\/health$/i, h: health },

  { m: "GET", r: /^\/orgs\/?$/i, h: listMyOrgs },
  { m: "POST", r: /^\/orgs\/?$/i, h: createOrg },

  { m: "GET", r: /^\/orgs\/(?<orgId>[^/]+)\/?$/i, h: getOrg },
  { m: "PATCH", r: /^\/orgs\/(?<orgId>[^/]+)\/?$/i, h: updateOrg },
  { m: "DELETE", r: /^\/orgs\/(?<orgId>[^/]+)\/?$/i, h: deleteOrg },
  { m: "POST", r: /^\/orgs\/(?<orgId>[^/]+)\/invites\/?$/i, h: createInvite },

  { m: "POST", r: /^\/orgs\/invites\/accept\/?$/i, h: acceptInvite },
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
        const params = {};
        for (const [k, v] of Object.entries(match.groups || {})) params[k] = decodeURIComponent(v);
        return await h(event, CORS, params);
      }
    }
    return json(404, CORS, { error: "Not found", method, path });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = statusCode === 404 ? "Not found" : err?.message || "Server error";
    if (statusCode >= 500) {
      console.error("orgs_router_error", { method, path, err });
    }
    return json(statusCode, CORS, { error: message });
  }
}
