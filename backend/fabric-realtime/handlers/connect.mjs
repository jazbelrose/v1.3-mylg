import { createConnectionItem, makeDocumentId, putConnection, respond } from "./shared.mjs";

export const handler = async event => {
  try {
    const { queryStringParameters = {}, requestContext } = event;
    const { projectId, pageId, actorId, userId } = queryStringParameters;
    const connectionId = requestContext?.connectionId;

    if (!connectionId || !projectId || !pageId) {
      console.warn("Missing connection parameters", { connectionId, projectId, pageId });
      return respond(400, { message: "Missing projectId or pageId" });
    }

    const connectionItem = createConnectionItem({
      connectionId,
      projectId,
      pageId,
      actorId: actorId || connectionId,
      userId,
    });

    await putConnection(connectionItem);

    return respond(200, {
      message: "connected",
      documentId: makeDocumentId(projectId, pageId),
    });
  } catch (err) {
    console.error("Failed to handle $connect", err);
    return respond(500, { message: "Connection failed" });
  }
};
