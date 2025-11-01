import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const connectionsTable = process.env.FABRIC_CONNECTIONS_TABLE;

const normalize = (value) => {
  if (value === undefined || value === null) return "";
  return value.toString().trim();
};

export const handler = async (event) => {
  if (!connectionsTable) {
    console.error("FABRIC_CONNECTIONS_TABLE not configured");
    return { statusCode: 500, body: "Server misconfigured" };
  }

  const connectionId = event.requestContext?.connectionId;
  const query = event.queryStringParameters ?? {};
  const documentId = normalize(query.documentId);
  const clientId = normalize(query.clientId);

  if (!connectionId || !documentId) {
    console.warn("Missing connectionId or documentId", { connectionId, documentId });
    return { statusCode: 400, body: "Missing documentId" };
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: connectionsTable,
        Item: {
          documentId,
          connectionId,
          clientId: clientId || null,
          connectedAt: new Date().toISOString(),
        },
      })
    );
    return { statusCode: 200, body: "Connected" };
  } catch (error) {
    console.error("Failed to register connection", error);
    return { statusCode: 500, body: "Failed to register connection" };
  }
};
