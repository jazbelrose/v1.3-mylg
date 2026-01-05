// /opt/nodejs/utils/orgAuth.mjs
import { httpError } from "/opt/nodejs/utils/auth.mjs";

export function isOrgAdminRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

export async function requireOrgMember({ ddb, tableName, orgId, userId }) {
  if (!orgId || !userId) throw httpError(404, "Not found");

  const pk = `ORG#${orgId}`;
  const sk = `USER#${userId}`;

  const res = await ddb.get({
    TableName: tableName,
    Key: { PK: pk, SK: sk },
  });

  const item = res?.Item;
  if (!item || (item.status && String(item.status).toLowerCase() !== "active")) {
    throw httpError(404, "Not found");
  }

  return {
    orgId,
    userId,
    role: item.role || "member",
    joinedAt: item.joinedAt || null,
    member: item,
  };
}

export async function requireOrgAdmin({ ddb, tableName, orgId, userId }) {
  const membership = await requireOrgMember({ ddb, tableName, orgId, userId });
  if (!isOrgAdminRole(membership.role)) {
    throw httpError(403, "Forbidden");
  }
  return membership;
}
