import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const documentsTable = process.env.FABRIC_DOCUMENTS_TABLE;
const connectionsTable = process.env.FABRIC_CONNECTIONS_TABLE;

const parseBody = (event) => {
  if (!event.body) return {};
  try {
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (error) {
    console.error("Failed to parse WS payload", error);
    return {};
  }
};

const buildEndpoint = (event) => {
  const domain = event.requestContext?.domainName;
  const stage = event.requestContext?.stage;
  if (!domain || !stage) {
    throw new Error("Missing WebSocket endpoint metadata");
  }
  return `${domain}/${stage}`.startsWith("http")
    ? `${domain}/${stage}`
    : `https://${domain}/${stage}`;
};

const broadcast = async ({
  items,
  data,
  endpoint,
}) => {
  const api = new ApiGatewayManagementApiClient({ endpoint });

  await Promise.all(
    (items ?? []).map(async (item) => {
      const targetConnectionId = item.connectionId;
      if (!targetConnectionId) return;
      try {
        await api.send(
          new PostToConnectionCommand({
            ConnectionId: targetConnectionId,
            Data: JSON.stringify(data),
          })
        );
      } catch (error) {
        if (error.statusCode === 410) {
          console.warn("Found stale connection", targetConnectionId);
          await docClient.send(
            new DeleteCommand({
              TableName: connectionsTable,
              Key: {
                documentId: item.documentId,
                connectionId: item.connectionId,
              },
            })
          );
        } else {
          console.error("Failed to post to connection", targetConnectionId, error);
        }
      }
    })
  );
};

export const handler = async (event) => {
  if (!documentsTable || !connectionsTable) {
    console.error("Fabric tables are not configured");
    return { statusCode: 500, body: "Server misconfigured" };
  }

  const payload = parseBody(event);

  const documentId = (payload.documentId ?? "").toString().trim();
  const content = typeof payload.content === "string" ? payload.content : null;
  const revision = typeof payload.revision === "number" ? payload.revision : Date.now();
  const clientId = payload.clientId ? String(payload.clientId) : null;

  if (!documentId || !content) {
    return { statusCode: 400, body: "Missing documentId or content" };
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: documentsTable,
        Item: {
          documentId,
          content,
          revision,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  } catch (error) {
    console.error("Failed to persist realtime state", error);
    return { statusCode: 500, body: "Failed to persist state" };
  }

  let connections;
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: connectionsTable,
        KeyConditionExpression: "documentId = :d",
        ExpressionAttributeValues: { ":d": documentId },
      })
    );
    connections = result.Items ?? [];
  } catch (error) {
    console.error("Failed to read connections", error);
    return { statusCode: 500, body: "Failed to load connections" };
  }

  const endpoint = buildEndpoint(event);
  await broadcast({
    items: connections,
    endpoint,
    data: {
      action: "sync",
      documentId,
      content,
      revision,
      clientId,
    },
  });

  return { statusCode: 200, body: "Synced" };
};
