import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const connectionsTable = process.env.FABRIC_CONNECTIONS_TABLE;

export const handler = async (event) => {
  if (!connectionsTable) {
    console.error("FABRIC_CONNECTIONS_TABLE not configured");
    return { statusCode: 500, body: "Server misconfigured" };
  }

  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connectionId" };
  }

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: connectionsTable,
        IndexName: "byConnectionId",
        KeyConditionExpression: "connectionId = :c",
        ExpressionAttributeValues: {
          ":c": connectionId,
        },
      })
    );

    const items = result.Items ?? [];
    if (items.length === 0) {
      return { statusCode: 200, body: "Disconnected" };
    }

    await Promise.all(
      items.map((item) =>
        docClient.send(
          new DeleteCommand({
            TableName: connectionsTable,
            Key: {
              documentId: item.documentId,
              connectionId: item.connectionId,
            },
          })
        )
      )
    );

    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Failed to clean up connection", error);
    return { statusCode: 500, body: "Failed to clean up connection" };
  }
};
