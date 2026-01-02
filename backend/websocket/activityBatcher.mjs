/**
 * Lambda: ActivityBatcher
 * Trigger: CloudWatch Events (every 5 minutes) or DynamoDB Stream
 * Purpose: Batch edit events into activity summaries and emit to Activity table
 * 
 * This Lambda processes pending edit batches that have been idle for 90+ seconds
 * and writes summarized activity events to the ProjectActivity table.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { randomUUID } from "crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

const BATCH_CONFIG = {
  IDLE_THRESHOLD_MS: 90_000,          // 90 seconds
  MAX_BATCH_INTERVAL_MS: 30 * 60_000, // 30 minutes
  MIN_CHANGES_FOR_EARLY_EMIT: 10,
  MAX_CHANGES_PER_BATCH: 100,
  ACTIVITY_TTL_DAYS: 90,
};

// ============================================================================
// CLIENTS
// ============================================================================

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const apigwManagementApi = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT,
});

// Table names from environment
const PENDING_BATCHES_TABLE = process.env.PENDING_BATCHES_TABLE || "PendingEditBatches";
const ACTIVITY_TABLE = process.env.ACTIVITY_TABLE || "ProjectActivity";
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "Connections";

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const handler = async (event) => {
  console.log("[ActivityBatcher] Starting batch processing");

  try {
    // 1. Scan pending edit batches
    const pendingBatches = await getPendingBatches();
    console.log(`[ActivityBatcher] Found ${pendingBatches.length} pending batches`);

    const processed = [];
    const skipped = [];

    for (const batch of pendingBatches) {
      const { batchId, projectId, userId, userName, deckId, deckName, changes, lastEditAt, firstEditAt } = batch;

      // 2. Check if idle threshold met
      const idleDuration = Date.now() - new Date(lastEditAt).getTime();
      const totalDuration = Date.now() - new Date(firstEditAt).getTime();
      const changeCount = changes?.length || 0;

      const shouldEmit =
        idleDuration >= BATCH_CONFIG.IDLE_THRESHOLD_MS ||
        totalDuration >= BATCH_CONFIG.MAX_BATCH_INTERVAL_MS ||
        changeCount >= BATCH_CONFIG.MAX_CHANGES_PER_BATCH;

      if (!shouldEmit) {
        skipped.push(batchId);
        continue;
      }

      // 3. Skip if no meaningful changes
      if (changeCount === 0) {
        await clearBatch(batchId);
        continue;
      }

      // 4. Build summary
      const summary = buildActivitySummary(userName, deckName, changes, idleDuration);

      // 5. Write to Activity table
      const activityId = generateActivityId();
      const activityEvent = {
        activityId,
        projectId,
        type: "slide_edit",
        category: "slides",
        summary,
        changes,
        userId,
        userName,
        userAvatar: batch.userAvatar,
        createdAt: new Date().toISOString(),
        periodStart: firstEditAt,
        periodEnd: lastEditAt,
        batchId,
        changeCount,
        expiresAt: computeActivityTTL(),
      };

      await writeActivityEvent(activityEvent);
      console.log(`[ActivityBatcher] Wrote activity ${activityId} for project ${projectId}`);

      // 6. Broadcast to project Activity panel
      await broadcastActivityToProject(projectId, {
        action: "activityUpdate",
        ...activityEvent,
      });

      // 7. Clear batch
      await clearBatch(batchId);
      processed.push(batchId);
    }

    console.log(`[ActivityBatcher] Processed: ${processed.length}, Skipped: ${skipped.length}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ processed: processed.length, skipped: skipped.length }),
    };
  } catch (err) {
    console.error("[ActivityBatcher] Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all pending edit batches from DynamoDB
 */
async function getPendingBatches() {
  const result = await dynamoDb.send(
    new ScanCommand({
      TableName: PENDING_BATCHES_TABLE,
    })
  );
  return result.Items || [];
}

/**
 * Write activity event to ProjectActivity table
 */
async function writeActivityEvent(activity) {
  await dynamoDb.send(
    new PutCommand({
      TableName: ACTIVITY_TABLE,
      Item: activity,
    })
  );
}

/**
 * Delete a processed batch
 */
async function clearBatch(batchId) {
  await dynamoDb.send(
    new DeleteCommand({
      TableName: PENDING_BATCHES_TABLE,
      Key: { batchId },
    })
  );
}

/**
 * Generate activity ID with timestamp for sorting
 */
function generateActivityId() {
  return `A#${Date.now()}#${randomUUID().split("-")[0]}`;
}

/**
 * Compute TTL for activity records (90 days from now)
 */
function computeActivityTTL() {
  return Math.floor(Date.now() / 1000) + BATCH_CONFIG.ACTIVITY_TTL_DAYS * 24 * 60 * 60;
}

/**
 * Build a human-readable activity summary from changes
 */
function buildActivitySummary(userName, deckName, changes, idleDurationMs) {
  const slideNumbers = [
    ...new Set(changes.map((c) => c.slideNumber).filter(Boolean)),
  ].sort((a, b) => a - b);
  const changeCount = changes.length;
  const durationMinutes = Math.round(idleDurationMs / 60_000);

  let summary = `${userName || "Someone"} edited ${deckName || "Slides"}`;
  summary += ` · ${changeCount} change${changeCount === 1 ? "" : "s"}`;
  summary += ` · ${slideNumbers.length} slide${slideNumbers.length === 1 ? "" : "s"}`;

  if (durationMinutes > 0) {
    summary += ` · ${durationMinutes}m ago`;
  }

  return summary;
}

/**
 * Broadcast activity update to all connections viewing this project
 */
async function broadcastActivityToProject(projectId, payload) {
  try {
    // Find connections with activeConversation = project#<projectId>
    const conversationId = `project#${projectId}`;
    const data = await dynamoDb.send(
      new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        FilterExpression: "activeConversation = :conv",
        ExpressionAttributeValues: { ":conv": conversationId },
      })
    );

    const connections = data.Items || [];
    console.log(`[broadcastActivityToProject] ${connections.length} connections for ${projectId}`);

    const stale = [];

    await Promise.allSettled(
      connections.map(async ({ connectionId }) => {
        try {
          await apigwManagementApi.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify(payload),
            })
          );
        } catch (err) {
          if (err?.statusCode === 410) {
            stale.push(connectionId);
          } else {
            console.error("[broadcastActivityToProject] WS send failed:", err);
          }
        }
      })
    );

    // Clean up stale connections
    if (stale.length > 0) {
      console.log("[broadcastActivityToProject] Cleaning stale connections:", stale);
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
    console.error("[broadcastActivityToProject] Error:", err);
  }
}
