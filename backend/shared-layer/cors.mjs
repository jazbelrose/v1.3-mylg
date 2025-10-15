// /opt/nodejs/utils/cors.mjs
// Force redeploy for CORS updates - updated 2025-10-10

// =============================================================================
// CORS CONFIGURATION - CENTRALIZED SETTINGS
// =============================================================================
// This file contains all CORS configuration for the entire backend.
// To add new allowed origins, modify the environment variables in serverless.common.yml
//
// Environment Variables (set in serverless.common.yml):
// - ALLOWED_ORIGINS: Comma-separated list of allowed origins
// - CORS_WILDCARD_HOSTS: Comma-separated list of wildcard domains (e.g., "mylg.studio")
// - CORS_DEFAULT_ORIGIN: Default origin to use when none specified
// - CORS_ALLOW_CREDENTIALS: Whether to allow credentials (true/false)
//
// Current Configuration:
// ALLOWED_ORIGINS = https://beta.mylg.studio,https://mylg.studio,http://localhost:3000,http://localhost:5173,http://192.168.1.172:5173,http://192.168.1.200:5173,http://192.168.1.172:3000,http://192.168.1.200:3000
// CORS_WILDCARD_HOSTS = mylg.studio
// CORS_DEFAULT_ORIGIN = https://beta.mylg.studio
// CORS_ALLOW_CREDENTIALS = false
//
// To fix CORS issues:
// 1. Add your origin to ALLOWED_ORIGINS in serverless.common.yml
// 2. Redeploy the shared-layer: cd shared-layer && serverless deploy --stage dev
// 3. Redeploy affected services: cd <service> && serverless deploy --stage dev
// =============================================================================

// ---- Config via env (with sensible defaults) ----
const DEFAULT_ORIGIN =
  process.env.CORS_DEFAULT_ORIGIN?.replace(/\/$/, "") || "http://localhost:5173";

// Comma-separated list of exact origins to allow (no trailing slashes)
const ENV_ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Defaults you likely always want in dev/prod
const DEFAULT_ALLOWED = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://192.168.1.200:3000",
];

const EXPLICIT_ALLOW = new Set([...ENV_ALLOWED, ...DEFAULT_ALLOWED]);

// Comma-separated base hosts allowed for wildcard subdomains
// e.g. "mylg.studio,staging.mylg.studio" → allows *.mylg.studio and *.staging.mylg.studio
const WILDCARD_HOSTS = (process.env.CORS_WILDCARD_HOSTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// "true" to send Access-Control-Allow-Credentials
const ALLOW_CREDENTIALS =
  String(process.env.CORS_ALLOW_CREDENTIALS || "false").toLowerCase() === "true";

// ---- Internals ----
function hostAllowed(hostname) {
  // exact base domain OR any subdomain of listed bases
  return WILDCARD_HOSTS.some(
    (base) => hostname === base || hostname.endsWith(`.${base}`)
  );
}

function isPrivateLan(host) {
  return /^10\.\d+\.\d+\.\d+$/.test(host)
      || /^192\.168\.\d+\.\d+$/.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host);
}

function isLoopback(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function pickAllowOrigin(reqOrigin) {
  if (!reqOrigin) return DEFAULT_ORIGIN;
  const normalized = String(reqOrigin).replace(/\/$/, "");
  if (EXPLICIT_ALLOW.has(normalized)) return normalized;

  try {
    const u = new URL(normalized);
    if (hostAllowed(u.hostname) || isLoopback(u.hostname) || isPrivateLan(u.hostname)) {
      return `${u.protocol}//${u.host}`; // keep scheme+host+port
    }
  } catch {}
  return DEFAULT_ORIGIN;
}

// ---- Public API ----
export function corsHeaders(origin) {
  const allowOrigin = pickAllowOrigin(origin);
  const base = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, authorization, X-Requested-With, X-CSRF-Token, X-Amz-Date, X-Amz-Security-Token, X-Amz-User-Agent",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "Authorization,x-amzn-RequestId,x-amz-apigw-id",
    "Access-Control-Max-Age": "600",
  };
  if (ALLOW_CREDENTIALS) base["Access-Control-Allow-Credentials"] = "true";
  return base;
}

export function corsHeadersFromEvent(event) {
  const h = event?.headers || {};
  const origin = h.origin || h.Origin || h.ORIGIN || "";
  return corsHeaders(origin);
}

export function preflight(origin) {
  return { statusCode: 204, headers: corsHeaders(origin), body: "" };
}

export function preflightFromEvent(event) {
  return { statusCode: 204, headers: corsHeadersFromEvent(event), body: "" };
}

// Handy JSON response helper (keeps things consistent)
export function json(statusCode, headers, body) {
  const response = {
    statusCode,
    headers: { ...headers, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body ?? ""),
  };
  console.log("Response headers:", response.headers);
  return response;
}
