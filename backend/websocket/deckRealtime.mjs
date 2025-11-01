import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { randomUUID } from "crypto";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const apigw = new ApiGatewayManagementApiClient({
  endpoint: (process.env.WEBSOCKET_ENDPOINT || "").trim() || undefined,
});

const stateTable = (process.env.DECK_STATE_TABLE || "").trim();
const sessionsTable = (process.env.DECK_SESSIONS_TABLE || "").trim();
const sessionsProjectIndex = "projectId-index";

const nowIso = () => new Date().toISOString();

const toJsonString = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.warn("Failed to stringify deck page payload", err);
    return null;
  }
};

const sanitizePage = (input, fallback = {}, index = 0, userId) => {
  const now = nowIso();
  const id =
    typeof input?.id === "string" && input.id.trim()
      ? input.id.trim()
      : typeof fallback.id === "string"
      ? fallback.id
      : `page-${randomUUID()}`;

  const name =
    typeof input?.name === "string" && input.name.trim()
      ? input.name.trim()
      : typeof fallback.name === "string"
      ? fallback.name
      : `Page ${index + 1}`;

  const canvasJson =
    toJsonString(input?.canvasJson) ?? toJsonString(fallback.canvasJson) ?? null;

  const updatedAt =
    typeof input?.updatedAt === "string"
      ? input.updatedAt
      : typeof fallback.updatedAt === "string"
      ? fallback.updatedAt
      : now;

  const updatedBy =
    typeof input?.updatedBy === "string"
      ? input.updatedBy
      : typeof fallback.updatedBy === "string"
      ? fallback.updatedBy
      : userId ?? null;

  const position =
    typeof input?.position === "number"
      ? input.position
      : typeof fallback.position === "number"
      ? fallback.position
      : index;

  return {
    id,
    name,
    canvasJson,
    updatedAt,
    updatedBy,
    position,
  };
};

const ensureDeck = (deck, userId) => {
  if (deck && Array.isArray(deck.pages) && deck.pages.length) {
    const pages = deck.pages.map((page, index) => sanitizePage(page, page, index, userId));
    return {
      version: typeof deck.version === "number" ? deck.version : Number(deck.version) || 1,
      pages,
      updatedAt: deck.updatedAt ?? nowIso(),
    };
  }

  const seedPage = sanitizePage({ name: "Page 1", canvasJson: null }, {}, 0, userId);
  seedPage.position = 0;
  return {
    version: 1,
    pages: [seedPage],
    updatedAt: nowIso(),
  };
};

const readDeck = async (projectId, userId) => {
  if (!stateTable) return ensureDeck(null, userId);
  try {
    const response = await dynamo.send(
      new GetCommand({
        TableName: stateTable,
        Key: { projectId },
      })
    );
    return ensureDeck(response?.Item, userId);
  } catch (error) {
    console.error("Failed to read deck state", { projectId, error });
    return ensureDeck(null, userId);
  }
};

const writeDeck = async (projectId, deck) => {
  if (!stateTable) return;
  try {
    await dynamo.send(
      new PutCommand({
        TableName: stateTable,
        Item: {
          projectId,
          version: deck.version,
          pages: deck.pages,
          updatedAt: deck.updatedAt ?? nowIso(),
        },
      })
    );
  } catch (error) {
    console.error("Failed to persist deck state", { projectId, error });
  }
};

const registerConnection = async (connectionId, projectId, userId) => {
  if (!sessionsTable) return;
  try {
    await dynamo.send(
      new PutCommand({
        TableName: sessionsTable,
        Item: {
          connectionId,
          projectId,
          userId: userId ?? null,
          joinedAt: nowIso(),
        },
      })
    );
  } catch (error) {
    console.error("Failed to register deck session", { connectionId, projectId, error });
  }
};

const removeConnection = async (connectionId) => {
  if (!sessionsTable) return;
  try {
    await dynamo.send(
      new DeleteCommand({
        TableName: sessionsTable,
        Key: { connectionId },
      })
    );
  } catch (error) {
    console.warn("Failed to remove deck session", { connectionId, error: error?.message });
  }
};

const broadcastToProject = async (projectId, payload) => {
  if (!sessionsTable) return;
  let lastKey;
  do {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: sessionsTable,
        IndexName: sessionsProjectIndex,
        KeyConditionExpression: "projectId = :p",
        ExpressionAttributeValues: { ":p": projectId },
        ProjectionExpression: "connectionId",
        ExclusiveStartKey: lastKey,
      })
    );
    const items = result?.Items ?? [];
    await Promise.all(
      items.map(async ({ connectionId }) => {
        if (!connectionId) return;
        try {
          await apigw.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: Buffer.from(JSON.stringify(payload)),
            })
          );
        } catch (error) {
          if (error?.statusCode === 410) {
            await removeConnection(connectionId);
          } else {
            console.error("Failed to fan-out deck event", { connectionId, error });
          }
        }
      })
    );
    lastKey = result?.LastEvaluatedKey;
  } while (lastKey);
};

const parseEvent = (event) => {
  try {
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body ?? {};
  } catch (error) {
    console.error("Invalid deck payload", error);
    return {};
  }
};

const buildDeckPayload = (deck) => ({
  version: deck.version,
  pages: deck.pages,
  updatedAt: deck.updatedAt,
});

export const join = async (event) => {
  const connectionId = event?.requestContext?.connectionId;
  const userId = event?.requestContext?.authorizer?.userId ?? null;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connectionId" };
  }
  const payload = parseEvent(event);
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null;
  if (!projectId) {
    return { statusCode: 400, body: "Missing projectId" };
  }

  await registerConnection(connectionId, projectId, userId);
  const deck = await readDeck(projectId, userId);
  await writeDeck(projectId, deck);

  try {
    await apigw.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(
          JSON.stringify({
            action: "deck.snapshot",
            projectId,
            deck: buildDeckPayload(deck),
          })
        ),
      })
    );
  } catch (error) {
    console.error("Failed to send deck snapshot", { connectionId, error });
  }

  return { statusCode: 200, body: "joined" };
};

export const patch = async (event) => {
  const connectionId = event?.requestContext?.connectionId;
  const userId = event?.requestContext?.authorizer?.userId ?? null;
  const payload = parseEvent(event);
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null;
  const pagePayload = payload?.page ?? {};
  const pageId =
    typeof payload?.pageId === "string" && payload.pageId
      ? payload.pageId
      : typeof pagePayload?.id === "string"
      ? pagePayload.id
      : null;
  if (!projectId || !pageId) {
    return { statusCode: 400, body: "Missing projectId or pageId" };
  }

  const requestId = typeof payload?.requestId === "string" ? payload.requestId : randomUUID();
  const clientId = typeof payload?.clientId === "string" ? payload.clientId : null;

  const existingDeck = await readDeck(projectId, userId);
  const index = existingDeck.pages.findIndex((page) => page.id === pageId);
  const fallback = index >= 0 ? existingDeck.pages[index] : undefined;
  const mergedPage = sanitizePage(
    { ...pagePayload, id: pageId, canvasJson: payload?.canvasJson ?? pagePayload?.canvasJson },
    fallback,
    index >= 0 ? existingDeck.pages[index].position ?? index : existingDeck.pages.length,
    userId
  );
  mergedPage.updatedAt = nowIso();
  mergedPage.updatedBy = userId ?? mergedPage.updatedBy ?? null;

  const pages = [...existingDeck.pages];
  if (index >= 0) {
    pages[index] = { ...pages[index], ...mergedPage };
  } else {
    pages.push({ ...mergedPage, position: pages.length });
  }

  const deck = {
    version: (existingDeck.version ?? 0) + 1,
    pages,
    updatedAt: nowIso(),
  };

  await writeDeck(projectId, deck);

  const message = {
    action: "deck.patch",
    projectId,
    page: mergedPage,
    version: deck.version,
    sourceClientId: clientId,
    requestId,
    syncedAt: deck.updatedAt,
  };

  await broadcastToProject(projectId, message);

  return { statusCode: 200, body: "patched" };
};

export const meta = async (event) => {
  const payload = parseEvent(event);
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null;
  if (!projectId) {
    return { statusCode: 400, body: "Missing projectId" };
  }
  const userId = event?.requestContext?.authorizer?.userId ?? null;
  const requestId = typeof payload?.requestId === "string" ? payload.requestId : randomUUID();
  const clientId = typeof payload?.clientId === "string" ? payload.clientId : null;

  const incomingPages = Array.isArray(payload?.pages) ? payload.pages : [];
  const existingDeck = await readDeck(projectId, userId);
  const indexMap = new Map(existingDeck.pages.map((page) => [page.id, page]));

  const normalized = incomingPages.map((page, idx) => {
    const fallback = indexMap.get(page?.id);
    return sanitizePage(page, fallback, idx, userId);
  });

  const pages = normalized.length ? normalized : existingDeck.pages;
  const deck = {
    version: (existingDeck.version ?? 0) + 1,
    pages,
    updatedAt: nowIso(),
  };
  await writeDeck(projectId, deck);

  const message = {
    action: "deck.meta",
    projectId,
    pages,
    version: deck.version,
    sourceClientId: clientId,
    requestId,
    syncedAt: deck.updatedAt,
  };
  await broadcastToProject(projectId, message);

  return { statusCode: 200, body: "meta-updated" };
};

export const exportDeck = async (event) => {
  const connectionId = event?.requestContext?.connectionId;
  const payload = parseEvent(event);
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null;
  if (!connectionId || !projectId) {
    return { statusCode: 400, body: "Missing connectionId or projectId" };
  }
  const format = typeof payload?.format === "string" ? payload.format : "pdf";
  const requestId = typeof payload?.requestId === "string" ? payload.requestId : randomUUID();
  const jobId = randomUUID();
  const queuedAt = nowIso();

  try {
    await apigw.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(
          JSON.stringify({
            action: "deck.export.ack",
            projectId,
            format,
            jobId,
            requestId,
            status: "queued",
            queuedAt,
          })
        ),
      })
    );
  } catch (error) {
    console.error("Failed to acknowledge export request", { connectionId, error });
  }

  // Simulate immediate completion for now.
  try {
    await apigw.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(
          JSON.stringify({
            action: "deck.export.ready",
            projectId,
            format,
            jobId,
            requestId,
            status: "ready",
            readyAt: nowIso(),
            url: `s3://exports/${projectId}/${jobId}.${format === "site" ? "zip" : "pdf"}`,
          })
        ),
      })
    );
  } catch (error) {
    console.error("Failed to send export ready event", { connectionId, error });
  }

  return { statusCode: 200, body: "export-queued" };
};
