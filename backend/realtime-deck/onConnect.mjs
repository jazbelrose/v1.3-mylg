import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const connectionsTable = process.env.DECK_CONNECTIONS_TABLE;

export const handler = async (event) => {
  if (!connectionsTable) {
    console.error("DECK_CONNECTIONS_TABLE not configured");
    return { statusCode: 500, body: "Missing table" };
  }

  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connectionId" };
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: connectionsTable,
        Item: {
          connectionId,
          joinedAt: new Date().toISOString(),
        },
      })
    );
    return { statusCode: 200 };
  } catch (error) {
    console.error("Failed to persist websocket connection", error);
    return { statusCode: 500, body: "Failed to persist connection" };
  }
};
