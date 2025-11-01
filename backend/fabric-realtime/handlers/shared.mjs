import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { v4 as uuidv4 } from "uuid";

const dynamoClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const connectionsTable = process.env.FABRIC_CONNECTIONS_TABLE;
export const connectionsIndex = process.env.FABRIC_CONNECTIONS_INDEX;
export const documentsTable = process.env.FABRIC_DOCUMENTS_TABLE;

export const makeDocumentId = (projectId, pageId) => `${projectId}#${pageId}`;

export const createConnectionItem = ({ connectionId, projectId, pageId, actorId, userId }) => ({
  connectionId,
  documentId: makeDocumentId(projectId, pageId),
  actorId,
  userId: userId ?? null,
  projectId,
  pageId,
  connectedAt: new Date().toISOString(),
});

export const fetchDocument = async documentId => {
  const result = await docClient.send(
    new GetCommand({
      TableName: documentsTable,
      Key: { documentId },
    })
  );
  return result.Item ?? null;
};

export const persistDocument = async ({ documentId, snapshot, updatedBy }) => {
  const revision = Date.now();
  await docClient.send(
    new PutCommand({
      TableName: documentsTable,
      Item: {
        documentId,
        snapshot,
        revision,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy ?? null,
      },
    })
  );
  return revision;
};

export const listConnectionsForDocument = async documentId => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: connectionsTable,
      IndexName: connectionsIndex,
      KeyConditionExpression: "documentId = :d",
      ExpressionAttributeValues: { ":d": documentId },
    })
  );
  return result.Items ?? [];
};

export const removeConnection = async connectionId => {
  await docClient.send(
    new DeleteCommand({
      TableName: connectionsTable,
      Key: { connectionId },
    })
  );
};

export const putConnection = async item => {
  await docClient.send(
    new PutCommand({
      TableName: connectionsTable,
      Item: item,
    })
  );
};

export const managementClientForEvent = event => {
  const domain = event?.requestContext?.domainName;
  const stage = event?.requestContext?.stage;
  const endpoint = `https://${domain}/${stage}`;
  return new ApiGatewayManagementApiClient({ endpoint });
};

export const broadcastUpdate = async ({ event, documentId, snapshot, revision, excludeConnectionId }) => {
  const connections = await listConnectionsForDocument(documentId);
  if (!connections.length) return;

  const managementClient = managementClientForEvent(event);
  const payload = JSON.stringify({
    type: "update",
    documentId,
    snapshot,
    revision,
    actorId: excludeConnectionId ?? null,
  });

  await Promise.allSettled(
    connections
      .filter(conn => conn.connectionId !== excludeConnectionId)
      .map(conn =>
        managementClient.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: payload,
          })
        )
      )
  );
};

export const respond = (statusCode, body) => ({
  statusCode,
  headers: {
    "Access-Control-Allow-Origin": process.env.CORS_DEFAULT_ORIGIN || "*",
    "Access-Control-Allow-Credentials": process.env.CORS_ALLOW_CREDENTIALS || "false",
  },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

export const parseBody = event => {
  if (!event?.body) return {};
  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (err) {
      console.warn("Failed to parse event body", err);
      return {};
    }
  }
  return event.body;
};

export const safeSnapshot = snapshot => {
  if (!snapshot || typeof snapshot !== "object") return null;
  return snapshot;
};

export const generateActorId = () => uuidv4();
