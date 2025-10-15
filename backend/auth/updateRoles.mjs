import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";

const cognito = new CognitoIdentityProviderClient({});
const M = (e) => e?.requestContext?.http?.method?.toUpperCase?.() || e?.httpMethod?.toUpperCase?.() || "GET";

export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  try {
    const body = JSON.parse(event.body || "{}");
    const userId = body.userId || body.username || body.sub;
    const roles = Array.isArray(body.roles) ? body.roles : [];
    if (!userId || !roles.length) return json(400, CORS, { error: "userId and roles required" });

    const poolId = process.env.COGNITO_USER_POOL_ID;
    const listResp = await cognito.send(new AdminListGroupsForUserCommand({
      UserPoolId: poolId,
      Username: userId,
    }));
    const current = (listResp.Groups || []).map((g) => g.GroupName);

    const toAdd = roles.filter((r) => !current.includes(r));
    const toRemove = current.filter((g) => !roles.includes(g));

    for (const group of toAdd) {
      await cognito.send(
        new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: userId, GroupName: group })
      );
    }
    for (const group of toRemove) {
      await cognito.send(
        new AdminRemoveUserFromGroupCommand({ UserPoolId: poolId, Username: userId, GroupName: group })
      );
    }

    return json(200, CORS, { userId, added: toAdd, removed: toRemove, roles });
  } catch (err) {
    console.error("update_roles_error", err);
    return json(500, CORS, { error: err?.message || "Failed to update roles" });
  }
}
