import { fetchDocument, makeDocumentId, respond } from "./shared.mjs";

export const handler = async event => {
  try {
    const { projectId, pageId } = event?.pathParameters || {};
    if (!projectId || !pageId) {
      return respond(400, { message: "Missing projectId/pageId" });
    }
    const documentId = event.headers?.["x-fabric-document-id"] || makeDocumentId(projectId, pageId);
    const document = await fetchDocument(documentId);
    return respond(200, {
      documentId,
      projectId,
      pageId,
      snapshot: document?.snapshot ?? null,
      revision: document?.revision ?? 0,
      updatedAt: document?.updatedAt ?? null,
      updatedBy: document?.updatedBy ?? null,
    });
  } catch (err) {
    console.error("Failed to load fabric document", err);
    return respond(500, { message: "Failed to load document" });
  }
};
