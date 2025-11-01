import { broadcastUpdate, fetchDocument, makeDocumentId, parseBody, persistDocument, respond, safeSnapshot } from "./shared.mjs";

export const handler = async event => {
  try {
    const body = parseBody(event);
    const { type } = body;
    const connectionId = event?.requestContext?.connectionId;

    if (!type) {
      return respond(400, { message: "Missing message type" });
    }

    if (type === "ping") {
      return respond(200, { message: "pong" });
    }

    const projectId = body.projectId || event?.queryStringParameters?.projectId;
    const pageId = body.pageId || event?.queryStringParameters?.pageId;
    const documentId = body.documentId || (projectId && pageId ? makeDocumentId(projectId, pageId) : null);

    if (!documentId) {
      return respond(400, { message: "Missing projectId/pageId" });
    }

    if (type === "init") {
      const document = await fetchDocument(documentId);
      return respond(200, {
        type: "init",
        documentId,
        snapshot: document?.snapshot ?? null,
        revision: document?.revision ?? 0,
      });
    }

    if (type === "sync") {
      const snapshot = safeSnapshot(body.snapshot);
      if (!snapshot) {
        return respond(400, { message: "Snapshot missing" });
      }
      const revision = await persistDocument({
        documentId,
        snapshot,
        updatedBy: body.actorId ?? connectionId,
      });

      await broadcastUpdate({
        event,
        documentId,
        snapshot,
        revision,
        excludeConnectionId: connectionId,
      });

      return respond(200, { type: "ack", documentId, revision });
    }

    if (type === "presence") {
      await broadcastUpdate({
        event,
        documentId,
        snapshot: {
          presence: true,
          actorId: body.actorId ?? connectionId,
          userId: body.userId ?? null,
          cursor: body.cursor ?? { x: body.x, y: body.y },
          color: body.color ?? null,
        },
        revision: Date.now(),
        excludeConnectionId: connectionId,
      });
      return respond(200, { ok: true });
    }

    console.warn("Unknown message type", type);
    return respond(400, { message: "Unknown message" });
  } catch (err) {
    console.error("Realtime handler error", err);
    return respond(500, { message: "Realtime failure" });
  }
};
