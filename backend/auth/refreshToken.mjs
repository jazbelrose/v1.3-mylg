import { InitiateAuthCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";

const cognito = new CognitoIdentityProviderClient({});
const M = (e) => e?.requestContext?.http?.method?.toUpperCase?.() || e?.httpMethod?.toUpperCase?.() || "GET";

export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  try {
    const body = JSON.parse(event.body || "{}");
    const refreshToken = body.refreshToken || body.refresh_token;
    if (!refreshToken) return json(400, CORS, { error: "refreshToken required" });
    const cmd = new InitiateAuthCommand({
      ClientId: process.env.COGNITO_USER_CLIENT_ID,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });
    const r = await cognito.send(cmd);
    return json(200, CORS, r.AuthenticationResult || {});
  } catch (err) {
    console.error("refresh_token_error", err);
    return json(500, CORS, { error: err?.message || "Failed to refresh token" });
  }
}
