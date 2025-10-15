// src/shared/utils/index.ts

// Generic utilities
export * as slug from "./slug";
export * as hash from "./hash";
export { default as pLimit } from "./pLimit";
export * as requestQueue from "./requestQueue";
export * as storageWithTTL from "./storageWithTTL";
export * as colorUtils from "./colorUtils";

// Domain-specific (could later be moved into dashboard/*)
export * as budgetUtils from "./budgetUtils";
export * as messageUtils from "./messageUtils";
export * as notificationUtils from "./notificationUtils";

// Auth-related (could later live in app/auth/)
export * as auth from "./auth";
export { default as normalizeCognitoError } from "./normalizeCognitoError";
export { default as usePendingAuthChallenge } from "./usePendingAuthChallenge";
export * as waitForAuthReady from "./waitForAuthReady";

// WebSocket / Security
export * as secureWebSocketAuth from "./secureWebSocketAuth";
export * as securityUtils from "./securityUtils";
export * as securityEnhancements from "./securityEnhancements";
export * as websocketUtils from "./websocketUtils";

// Modal stack hook
export { default as useModalStack } from "./useModalStack";










