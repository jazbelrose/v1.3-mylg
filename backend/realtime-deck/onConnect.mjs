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

  // Extract token and sessionId from query string parameters
  const queryParams = event.queryStringParameters || {};
  const token = queryParams.token;
  const sessionId = queryParams.sessionId;

  if (!token || !sessionId) {
    console.warn("Missing authentication parameters", { 
      hasToken: !!token, 
      hasSessionId: !!sessionId 
    });
    // For now, allow connections without strict auth validation
    // In production, you might want to return 401 here
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: connectionsTable,
        Item: {
          connectionId,
          sessionId: sessionId || null,
          token: token ? "present" : null, // Don't store the actual token
          joinedAt: new Date().toISOString(),
        },
      })
    );
    
    console.log("WebSocket connection established", { 
      connectionId: connectionId.substring(0, 8) + "...",
      hasAuth: !!(token && sessionId)
    });
    
    return { statusCode: 200 };
  } catch (error) {
    console.error("Failed to persist websocket connection", error);
    return { statusCode: 500, body: "Failed to persist connection" };
  }
};
