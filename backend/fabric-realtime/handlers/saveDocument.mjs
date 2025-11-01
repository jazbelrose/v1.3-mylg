import { parseBody, persistDocument, respond } from "./shared.mjs";

export const handler = async event => {
  try {
    const { projectId, pageId } = event?.pathParameters || {};
    if (!projectId || !pageId) {
      return respond(400, { message: "Missing projectId/pageId" });
    }

    const body = parseBody(event);
    if (!body.snapshot) {
      return respond(400, { message: "Missing snapshot" });
    }

    const documentId = event.headers?.["x-fabric-document-id"] || `${projectId}#${pageId}`;
    const revision = await persistDocument({
      documentId,
      snapshot: body.snapshot,
      updatedBy: event.headers?.["x-fabric-user-id"] ?? null,
    });

    return respond(200, {
      documentId,
      projectId,
      pageId,
      revision,
      snapshot: body.snapshot,
    });
  } catch (err) {
    console.error("Failed to save fabric document", err);
    return respond(500, { message: "Failed to save" });
  }
};
