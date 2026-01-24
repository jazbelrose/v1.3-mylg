/**
 * WebSocket Utility for REST Lambdas
 * Allows REST endpoints to emit events to WebSocket clients
 * 
 * This utility connects to the API Gateway Management API to send
 * messages to connected WebSocket clients.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "Connections";
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

/**
 * Get API Gateway Management client
 */
function getApiGwClient() {
  if (!WEBSOCKET_ENDPOINT) {
    console.warn("⚠️ WEBSOCKET_ENDPOINT not configured");
    return null;
  }
  return new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_ENDPOINT,
  });
}

/**
 * Send a message to WebSocket clients subscribed to a conversation
 * Uses the same pattern as default.mjs - scans Connections table
 * @param {string} conversationId - The conversation/room ID (e.g., "project#abc123")
 * @param {object} payload - The message payload to send
 */
export async function broadcastToConversation(conversationId, payload) {
  const client = getApiGwClient();
  if (!client) return;

  try {
    // Scan all connections (same pattern as default.mjs)
    const data = await dynamoDb.send(new ScanCommand({ TableName: CONNECTIONS_TABLE }));
    const connections = data.Items || [];

    const convIdTrim = String(conversationId || "").trim();

    // Filter to connections in this conversation
    const recipients = connections.filter((c) => {
      const activeConv = String(c.activeConversation || "").trim();
      return activeConv === convIdTrim;
    });

    if (recipients.length === 0) {
      console.log(`📭 No active connections for ${convIdTrim}`);
      return;
    }

    console.log(`📡 Broadcasting to ${recipients.length} connections in ${convIdTrim}`);

    const stale = [];

    await Promise.allSettled(
      recipients.map(async ({ connectionId }) => {
        try {
          await client.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify(payload),
            })
          );
        } catch (err) {
          if (err.statusCode === 410 || err.$metadata?.httpStatusCode === 410) {
            stale.push(connectionId);
          } else {
            console.error(`❌ WS send failed for ${connectionId}:`, err.message);
          }
        }
      })
    );

    // Clean up stale connections
    if (stale.length > 0) {
      console.log(`🧹 Cleaning ${stale.length} stale connections`);
      await Promise.allSettled(
        stale.map((id) =>
          dynamoDb.send(
            new DeleteCommand({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId: id },
            })
          )
        )
      );
    }
  } catch (err) {
    console.error("❌ broadcastToConversation error:", err);
  }
}

/**
 * Send a message to all connections for a specific user
 * @param {string} userId - The user ID
 * @param {object} payload - The message payload to send
 */
export async function broadcastToUser(userId, payload) {
  const client = getApiGwClient();
  if (!client) return;

  // Query connections for this user
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: CONNECTIONS_TABLE,
      IndexName: "userId-sessionId-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
  );

  const connections = result.Items || [];
  if (connections.length === 0) {
    console.log(`📭 No connections for user: ${userId}`);
    return;
  }

  console.log(`📡 Broadcasting to ${connections.length} connections for user ${userId}`);

  for (const conn of connections) {
    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: JSON.stringify(payload),
        })
      );
    } catch (err) {
      if (err.statusCode !== 410 && err.$metadata?.httpStatusCode !== 410) {
        console.error(`❌ Failed to send to ${conn.connectionId}:`, err.message);
      }
    }
  }
}

/**
 * Send a WebSocket event (convenience wrapper)
 * Automatically routes to the correct conversation based on payload
 * @param {object} payload - Must include either projectId or orgId
 */
export async function sendToWebSocket(payload) {
  const { projectId, orgId, conversationId: explicitConvId } = payload;

  const conversationId =
    explicitConvId ||
    (projectId ? `project#${projectId}` : null) ||
    (orgId ? `org#${orgId}` : null);

  if (!conversationId) {
    console.warn("⚠️ sendToWebSocket: no conversationId, projectId, or orgId");
    return;
  }

  await broadcastToConversation(conversationId, payload);
}
