import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  TABLE_NAME,
  connectionTtl,
  documentClient,
  epochSeconds,
  stateVersion,
} from "./common.mjs";

const parseBody = (event) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    console.warn("Failed to parse websocket payload", error);
    return {};
  }
};

const getGatewayClient = (event) => {
  const explicitEndpoint = process.env.FABRIC_WEBSOCKET_ENDPOINT;
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const endpoint = explicitEndpoint && explicitEndpoint.length > 0
    ? explicitEndpoint
    : `https://${domain}/${stage}`;

  return new ApiGatewayManagementApiClient({ endpoint });
};

const postMessage = async (client, connectionId, payload) => {
  const data = Buffer.from(JSON.stringify(payload));
  await client.send(
    new PostToConnectionCommand({ ConnectionId: connectionId, Data: data })
  );
};

const pruneConnection = async (connectionId) => {
  try {
    const metadata = await documentClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `CONNECTION#${connectionId}`, sk: "METADATA" },
      })
    );
    const documentId = metadata.Item?.documentId;

    await documentClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: `CONNECTION#${connectionId}`, sk: "METADATA" },
      })
    );

    if (documentId) {
      await documentClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { pk: `DOCUMENT#${documentId}`, sk: `CONNECTION#${connectionId}` },
        })
      );
    }
  } catch (error) {
    console.error("Failed to prune connection", error);
  }
};

const broadcast = async (client, documentId, senderConnectionId, payload) => {
  const connections = await documentClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `DOCUMENT#${documentId}`,
        ":prefix": "CONNECTION#",
      },
    })
  );

  const items = connections.Items ?? [];

  await Promise.all(
    items.map(async (item) => {
      const connectionId = item.connectionId;
      if (!connectionId || connectionId === senderConnectionId) return;
      try {
        await postMessage(client, connectionId, payload);
      } catch (error) {
        if (error?.statusCode === 410) {
          await pruneConnection(connectionId);
        } else {
          console.error("Failed to deliver realtime payload", error);
        }
      }
    })
  );
};

const refreshConnectionTtl = async (documentId, connectionId, actorId) => {
  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `DOCUMENT#${documentId}`,
        sk: `CONNECTION#${connectionId}`,
        connectionId,
        documentId,
        actorId,
        ttl: connectionTtl(),
        refreshedAt: epochSeconds(),
      },
    })
  );

  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `CONNECTION#${connectionId}`,
        sk: "METADATA",
        connectionId,
        documentId,
        actorId,
        ttl: connectionTtl(),
        refreshedAt: epochSeconds(),
      },
    })
  );
};

const handleJoin = async (client, event, message) => {
  const { documentId, actorId } = message;
  const connectionId = event.requestContext.connectionId;
  if (!documentId || !actorId) {
    return { statusCode: 400, body: "Missing documentId or actorId" };
  }

  await refreshConnectionTtl(documentId, connectionId, actorId);

  const state = await documentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `DOCUMENT#${documentId}`, sk: "STATE" },
    })
  );

  if (state.Item?.state) {
    try {
      await postMessage(client, connectionId, {
        type: "sync",
        state: state.Item.state,
        version: state.Item.version ?? 0,
      });
    } catch (error) {
      console.error("Failed to deliver initial state", error);
    }
  }

  return { statusCode: 200, body: "Joined" };
};

const handleSync = async (client, event, message) => {
  const { documentId, state, actorId } = message;
  const connectionId = event.requestContext.connectionId;
  if (!documentId || state === undefined) {
    return { statusCode: 400, body: "Missing documentId or state" };
  }

  const version = message.version ?? stateVersion();

  await documentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `DOCUMENT#${documentId}`,
        sk: "STATE",
        state,
        version,
        updatedAt: epochSeconds(),
      },
    })
  );

  await refreshConnectionTtl(documentId, connectionId, actorId);

  await broadcast(client, documentId, connectionId, {
    type: "sync",
    state,
    version,
    actorId,
  });

  try {
    await postMessage(client, connectionId, { type: "synced", version });
  } catch (error) {
    console.error("Failed to acknowledge sync", error);
  }

  return { statusCode: 200, body: "Synced" };
};

const handlePresence = async (client, event, message) => {
  const { documentId, payload, actorId } = message;
  const connectionId = event.requestContext.connectionId;
  if (!documentId) {
    return { statusCode: 400, body: "Missing documentId" };
  }

  await refreshConnectionTtl(documentId, connectionId, actorId);

  await broadcast(client, documentId, connectionId, {
    type: "presence",
    actorId: actorId ?? "unknown",
    payload: payload ?? {},
  });

  return { statusCode: 200, body: "Presence broadcast" };
};

export const handler = async (event) => {
  const connectionId = event?.requestContext?.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connection" };
  }

  const message = parseBody(event);
  const client = getGatewayClient(event);

  try {
    switch (message.action) {
      case "join":
        return await handleJoin(client, event, message);
      case "sync":
        return await handleSync(client, event, message);
      case "presence":
        return await handlePresence(client, event, message);
      default:
        console.warn("Unknown realtime action", message.action);
        return { statusCode: 200, body: "No-op" };
    }
  } catch (error) {
    console.error("Realtime handler failure", error);
    if (error?.statusCode === 410) {
      await pruneConnection(connectionId);
      return { statusCode: 410, body: "Connection gone" };
    }
    return { statusCode: 500, body: "Unhandled error" };
  }
};
