import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const connectionsTable = process.env.DECK_CONNECTIONS_TABLE;
const connectionsDeckGsi = process.env.DECK_CONNECTIONS_DECK_GSI || "deckKey-index";
const pagesTable = process.env.DECK_PAGES_TABLE;
const endpoint = process.env.DECK_WEBSOCKET_ENDPOINT;

const clientCache = new Map();

const getApiGatewayClient = (event) => {
  if (endpoint) {
    if (!clientCache.has(endpoint)) {
      clientCache.set(endpoint, new ApiGatewayManagementApiClient({ endpoint }));
    }
    return clientCache.get(endpoint);
  }

  const domainName = event?.requestContext?.domainName;
  const stage = event?.requestContext?.stage;
  if (domainName && stage) {
    const derivedEndpoint = `https://${domainName}/${stage}`;
    if (!clientCache.has(derivedEndpoint)) {
      clientCache.set(
        derivedEndpoint,
        new ApiGatewayManagementApiClient({ endpoint: derivedEndpoint })
      );
    }
    return clientCache.get(derivedEndpoint);
  }

  const fallbackKey = "__default__";
  if (!clientCache.has(fallbackKey)) {
    clientCache.set(fallbackKey, new ApiGatewayManagementApiClient({}));
  }
  return clientCache.get(fallbackKey);
};

export const deckKeyOf = (projectId, pageId) => `${projectId}#${pageId}`;

export const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (error) {
      console.error("Invalid JSON payload", error);
      return {};
    }
  }
  return body;
};

const sendWithClient = async (apigwClient, connectionId, payload) => {
  try {
    await apigwClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload),
      })
    );
  } catch (error) {
    if (error.statusCode === 410) {
      console.warn(`Stale connection ${connectionId}, will be cleaned up separately.`);
      return;
    }
    throw error;
  }
};

export const postTo = async (event, connectionId, payload) => {
  const apigwClient = getApiGatewayClient(event);
  await sendWithClient(apigwClient, connectionId, payload);
};

export const broadcastToDeck = async (event, deckKey, payload, excludeConnectionId) => {
  if (!connectionsTable) return;
  const result = await dynamo.send(
    new QueryCommand({
      TableName: connectionsTable,
      IndexName: connectionsDeckGsi,
      KeyConditionExpression: "deckKey = :deckKey",
      ExpressionAttributeValues: { ":deckKey": deckKey },
    })
  );

  const items = result.Items ?? [];
  const apigwClient = getApiGatewayClient(event);
  await Promise.all(
    items
      .filter((item) => item.connectionId && item.connectionId !== excludeConnectionId)
      .map((item) =>
        sendWithClient(apigwClient, item.connectionId, payload).catch((error) => {
          console.error(`Failed to post to ${item.connectionId}`, error);
        })
      )
  );
};

export const handleJoinDeck = async (event, payload) => {
  if (!connectionsTable || !pagesTable) {
    return { statusCode: 500, body: "Tables not configured" };
  }
  const connectionId = event.requestContext?.connectionId;
  const { projectId, pageId, pageName } = payload ?? {};
  if (!connectionId || !projectId || !pageId) {
    return { statusCode: 400, body: "Missing identifiers" };
  }
  const deckKey = deckKeyOf(projectId, pageId);
  const nowIso = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: connectionsTable,
      Key: { connectionId },
      UpdateExpression:
        "SET projectId = :projectId, pageId = :pageId, deckKey = :deckKey, pageName = :pageName, updatedAt = :now",
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":pageId": pageId,
        ":deckKey": deckKey,
        ":pageName": pageName ?? null,
        ":now": nowIso,
      },
    })
  );

  const existing = await dynamo.send(
    new GetCommand({
      TableName: pagesTable,
      Key: { projectId, pageId },
    })
  );

  await postTo(event, connectionId, {
    action: "deckState",
    projectId,
    pageId,
    state: existing.Item?.state ?? null,
    version: existing.Item?.version ?? 0,
    updatedAt: existing.Item?.updatedAt ?? null,
  });

  return { statusCode: 200 };
};

export const handleDeckPatch = async (event, payload) => {
  if (!pagesTable || !connectionsTable) {
    return { statusCode: 500, body: "Tables not configured" };
  }
  const connectionId = event.requestContext?.connectionId;
  const { projectId, pageId, state } = payload ?? {};
  if (!connectionId || !projectId || !pageId) {
    return { statusCode: 400, body: "Missing identifiers" };
  }
  const deckKey = deckKeyOf(projectId, pageId);
  const nowIso = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: pagesTable,
      Key: { projectId, pageId },
      UpdateExpression:
        "SET #state = :state, updatedAt = :now, version = if_not_exists(version, :zero) + :one",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":state": state ?? null,
        ":now": nowIso,
        ":zero": 0,
        ":one": 1,
      },
    })
  );

  const payloadToBroadcast = {
    action: "deckPatch",
    projectId,
    pageId,
    state: state ?? null,
    updatedAt: nowIso,
  };

  await broadcastToDeck(event, deckKey, payloadToBroadcast, connectionId);
  return { statusCode: 200 };
};
