/**
 * HQ WebSocket utilities for real-time sync across org members.
 * When an admin updates an account, transaction, or rule, this broadcasts
 * to all other org members so they can refresh their local cache.
 */

export type HqUpdateType = "account" | "transaction" | "rule" | "import" | "general";

interface HqUpdatedPayload {
  action: "hqUpdated";
  orgId: string;
  updateType: HqUpdateType;
  entityId?: string | null;
  senderId?: string;
}

/**
 * Send an hqUpdated message via websocket to notify other org members of changes.
 * This should be called after successful CRUD operations on HQ data.
 *
 * @param ws - The websocket instance (from useSocket)
 * @param orgId - The organization ID
 * @param updateType - Type of update (account, transaction, rule, import, general)
 * @param entityId - Optional ID of the specific entity that was updated
 * @param senderId - Optional user ID of the person making the update
 */
export function sendHqUpdated(
  ws: WebSocket | null | undefined,
  orgId: string,
  updateType: HqUpdateType,
  entityId?: string | null,
  senderId?: string
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log("📊 [sendHqUpdated] WebSocket not connected, skipping broadcast");
    return;
  }

  if (!orgId) {
    console.warn("📊 [sendHqUpdated] Missing orgId, skipping broadcast");
    return;
  }

  const payload: HqUpdatedPayload = {
    action: "hqUpdated",
    orgId,
    updateType,
    entityId: entityId ?? null,
    senderId,
  };

  try {
    ws.send(JSON.stringify(payload));
    console.log("📊 [sendHqUpdated] Broadcast sent:", payload);
  } catch (err) {
    console.error("📊 [sendHqUpdated] Failed to send:", err);
  }
}
