import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

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
      new DeleteCommand({
        TableName: connectionsTable,
        Key: { connectionId },
      })
    );
    return { statusCode: 200 };
  } catch (error) {
    console.error("Failed to remove websocket connection", error);
    return { statusCode: 500, body: "Failed to disconnect" };
  }
};
