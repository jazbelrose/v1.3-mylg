import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const apigw = new ApiGatewayManagementApiClient({
  endpoint: (process.env.WEBSOCKET_ENDPOINT || "").trim() || undefined,
});

const deckPagesTable = process.env.DECK_PAGES_TABLE || "DeckPages";
const connectionsTable = process.env.CONNECTIONS_TABLE || "Connections";
const connectionsDeckIndex = process.env.CONNECTIONS_DECK_PROJECT_GSI || "activeDeckProjectId-index";

const toResponse = (statusCode, body) => ({
  statusCode,
  body: typeof body === "string" ? body : JSON.stringify(body),
});

export const handler = async (event) => {
  let payload;
  try {
    payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (err) {
    console.error("deckSync_parse_failed", err);
    return toResponse(400, { error: "invalid_json" });
  }

  const { projectId, pageId, canvasJson, revision, name } = payload || {};
  if (!projectId || !pageId || typeof canvasJson !== "string") {
    return toResponse(400, { error: "missing_fields" });
  }

  const nowIso = new Date().toISOString();
  const userId = event?.requestContext?.authorizer?.userId || event?.requestContext?.authorizer?.sub || "anonymous";
  const trimmedName = typeof name === "string" && name.trim() ? name.trim() : null;

  const expressionParts = [
    "canvasJson = :json",
    "updatedAt = :updatedAt",
    "updatedBy = :updatedBy",
    "revision = if_not_exists(revision, :zero) + :inc",
    "createdAt = if_not_exists(createdAt, :createdAt)",
  ];

  const expressionAttributeNames = {};
  const expressionAttributeValues = {
    ":json": canvasJson,
    ":updatedAt": nowIso,
    ":updatedBy": userId,
    ":zero": 0,
    ":inc": 1,
    ":createdAt": nowIso,
  };

  if (trimmedName) {
    expressionAttributeNames["#name"] = "name";
    expressionAttributeValues[":name"] = trimmedName;
    expressionParts.push("#name = :name");
  } else {
    expressionAttributeNames["#name"] = "name";
    expressionAttributeValues[":defaultName"] = "Untitled page";
    expressionParts.push("#name = if_not_exists(#name, :defaultName)");
  }

  const updateCommand = new UpdateCommand({
    TableName: deckPagesTable,
    Key: { projectId, pageId },
    UpdateExpression: `SET ${expressionParts.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "ALL_NEW",
  });

  if (Number.isFinite(Number(revision))) {
    updateCommand.input.ConditionExpression = "attribute_not_exists(revision) OR revision = :expected";
    updateCommand.input.ExpressionAttributeValues = {
      ...updateCommand.input.ExpressionAttributeValues,
      ":expected": Number(revision),
    };
  }

  let updated;
  try {
    const result = await docClient.send(updateCommand);
    updated = result.Attributes;
  } catch (err) {
    if (err?.name === "ConditionalCheckFailedException") {
      const current = await docClient.send(
        new GetCommand({ TableName: deckPagesTable, Key: { projectId, pageId } })
      );
      return toResponse(409, { error: "revision_mismatch", current: current.Item || null });
    }
    console.error("deckSync_update_failed", { projectId, pageId, err });
    return toResponse(500, { error: "update_failed" });
  }

  if (!updated) {
    return toResponse(500, { error: "update_missing" });
  }

  const broadcastPayload = {
    action: "deckSyncUpdate",
    projectId,
    pageId,
    canvasJson: updated.canvasJson,
    revision: updated.revision,
    updatedAt: updated.updatedAt,
    updatedBy: updated.updatedBy,
    name: updated.name,
  };

  await broadcastToProject(projectId, broadcastPayload);

  return toResponse(200, { ok: true, revision: updated.revision, updatedAt: updated.updatedAt });
};

async function broadcastToProject(projectId, payload) {
  if (!connectionsTable || !connectionsDeckIndex) return;
  try {
    const query = await docClient.send(
      new QueryCommand({
        TableName: connectionsTable,
        IndexName: connectionsDeckIndex,
        KeyConditionExpression: "activeDeckProjectId = :p",
        ExpressionAttributeValues: { ":p": projectId },
      })
    );

    const connections = (query.Items || [])
      .map((item) => item.connectionId)
      .filter((connectionId) => Boolean(connectionId));

    await Promise.allSettled(
      connections.map(async (connectionId) => {
        try {
          await apigw.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify(payload),
            })
          );
        } catch (err) {
          if (err?.statusCode === 410) {
            await docClient.send(
              new DeleteCommand({
                TableName: connectionsTable,
                Key: { connectionId },
              })
            );
          } else {
            console.error("deckSync_broadcast_failed", { connectionId, err });
          }
        }
      })
    );
  } catch (err) {
    console.error("deckSync_query_failed", { projectId, err });
  }
}
