/**
 * Response Utilities for Lambda HTTP Handlers
 * Provides consistent response formatting with CORS support
 */

import { corsHeaders, corsHeadersFromEvent } from "./cors.mjs";

/**
 * Create an HTTP response with CORS headers
 * @param {number} statusCode - HTTP status code
 * @param {object} body - Response body (will be JSON stringified)
 * @param {object} [event] - Lambda event (for extracting origin)
 * @param {object} [additionalHeaders] - Additional headers to include
 * @returns {object} Lambda HTTP response
 */
export function createResponse(statusCode, body, event = null, additionalHeaders = {}) {
  const headers = event
    ? corsHeadersFromEvent(event)
    : corsHeaders(null);

  return {
    statusCode,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...additionalHeaders,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Parse request body (handles string or object)
 * @param {object} event - Lambda event
 * @returns {object} Parsed body
 */
export function parseBody(event) {
  if (!event.body) return {};
  
  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch {
      return {};
    }
  }
  
  return event.body;
}

/**
 * Validate required fields in request body
 * @param {object} body - Request body
 * @param {string[]} requiredFields - List of required field names
 * @returns {object|null} Error response if validation fails, null if valid
 */
export function validateRequired(body, requiredFields) {
  const missing = requiredFields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    return createResponse(400, {
      error: "Missing required fields",
      fields: missing,
    });
  }

  return null;
}

/**
 * Extract user ID from Lambda event
 * Supports multiple authorizer patterns
 * @param {object} event - Lambda event
 * @returns {string|null} User ID or null
 */
export function extractUserId(event) {
  // HTTP API JWT authorizer
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (claims?.sub) return claims.sub;
  if (claims?.["cognito:username"]) return claims["cognito:username"];

  // REST API custom authorizer
  const authContext = event.requestContext?.authorizer;
  if (authContext?.userId) return authContext.userId;
  if (authContext?.claims?.sub) return authContext.claims.sub;

  // Lambda@Edge or direct invocation
  if (event.userId) return event.userId;

  return null;
}

/**
 * Extract organization ID from event (if available)
 * @param {object} event - Lambda event
 * @returns {string|null} Org ID or null
 */
export function extractOrgId(event) {
  // From path parameters
  if (event.pathParameters?.orgId) return event.pathParameters.orgId;
  
  // From authorizer context
  const authContext = event.requestContext?.authorizer;
  if (authContext?.orgId) return authContext.orgId;

  // From body
  const body = parseBody(event);
  if (body.orgId) return body.orgId;

  return null;
}

/**
 * Extract project ID from event (if available)
 * @param {object} event - Lambda event
 * @returns {string|null} Project ID or null
 */
export function extractProjectId(event) {
  // From path parameters
  if (event.pathParameters?.projectId) return event.pathParameters.projectId;

  // From body
  const body = parseBody(event);
  if (body.projectId) return body.projectId;

  return null;
}

/**
 * Create a 200 OK response
 */
export function ok(body, event = null) {
  return createResponse(200, body, event);
}

/**
 * Create a 201 Created response
 */
export function created(body, event = null) {
  return createResponse(201, body, event);
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(message, event = null) {
  return createResponse(400, { error: message }, event);
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(message = "Unauthorized", event = null) {
  return createResponse(401, { error: message }, event);
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message = "Forbidden", event = null) {
  return createResponse(403, { error: message }, event);
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = "Not found", event = null) {
  return createResponse(404, { error: message }, event);
}

/**
 * Create a 409 Conflict response
 */
export function conflict(message, data = {}, event = null) {
  return createResponse(409, { error: message, ...data }, event);
}

/**
 * Create a 500 Internal Server Error response
 */
export function serverError(message = "Internal server error", event = null) {
  return createResponse(500, { error: message }, event);
}
