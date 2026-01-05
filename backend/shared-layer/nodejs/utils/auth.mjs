// /opt/nodejs/utils/auth.mjs

function normalizeGroupClaim(groupsClaim) {
  if (Array.isArray(groupsClaim)) return groupsClaim;
  if (typeof groupsClaim === "string") {
    return groupsClaim
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

export function getCallerFromEvent(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};

  const rawUserId = claims["custom:userId"] || claims.sub;
  const userId = typeof rawUserId === "string" && rawUserId.trim() ? rawUserId.trim() : null;

  const email = typeof claims.email === "string" && claims.email.trim() ? claims.email.trim().toLowerCase() : null;

  const groupsClaim = claims["cognito:groups"] || claims.groups;
  const groups = normalizeGroupClaim(groupsClaim).map((g) => g.toLowerCase());

  return { userId, email, groups, claims };
}

export function requireCallerUserId(event) {
  const caller = getCallerFromEvent(event);
  if (!caller.userId) {
    const err = new Error("Unauthorized");
    // Align with API Gateway authorizer behavior; still guard server-side.
    err.statusCode = 401;
    throw err;
  }
  return caller.userId;
}

export function httpError(statusCode, message) {
  const err = new Error(message || "Error");
  err.statusCode = statusCode;
  return err;
}
