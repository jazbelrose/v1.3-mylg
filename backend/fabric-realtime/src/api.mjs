import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const documentsTable = process.env.FABRIC_DOCUMENTS_TABLE;

const buildResponse = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    ...extra,
  },
  body: body === undefined ? "" : JSON.stringify(body),
});

const ensureTable = () => {
  if (!documentsTable) {
    throw new Error("FABRIC_DOCUMENTS_TABLE env is required");
  }
};

const normalizeDocId = (input) => {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 512);
};

const parseBody = (event) => {
  if (!event.body) return {};
  try {
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (error) {
    console.error("Failed to parse body", error);
    throw new Error("Invalid JSON body");
  }
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return buildResponse(200, {});
  }

  ensureTable();

  const method = event.requestContext?.http?.method ?? "GET";
  const resourceId = event.pathParameters?.proxy ?? "";
  const segments = resourceId.split("/").filter(Boolean);

  if (segments[0] !== "documents") {
    return buildResponse(404, { message: "Not found" });
  }

  const documentId = normalizeDocId(segments[1]);
  if (!documentId) {
    return buildResponse(400, { message: "Missing documentId" });
  }

  if (method === "GET") {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: documentsTable,
          Key: { documentId },
        })
      );
      const item = result.Item ?? null;
      if (!item) {
        return buildResponse(200, {
          documentId,
          content: null,
          revision: null,
          updatedAt: null,
        });
      }
      return buildResponse(200, item);
    } catch (error) {
      console.error("Failed to load document", error);
      return buildResponse(500, { message: "Failed to load document" });
    }
  }

  if (method === "PUT" || method === "POST") {
    let body;
    try {
      body = parseBody(event);
    } catch (err) {
      return buildResponse(400, { message: err.message });
    }
    const content = typeof body?.content === "string" ? body.content : null;
    if (content === null) {
      return buildResponse(400, { message: "content must be a string" });
    }
    const revision = typeof body.revision === "number" ? body.revision : Date.now();
    const updatedAt = new Date().toISOString();

    try {
      await docClient.send(
        new PutCommand({
          TableName: documentsTable,
          Item: {
            documentId,
            content,
            revision,
            updatedAt,
          },
        })
      );
      return buildResponse(200, { documentId, revision, updatedAt });
    } catch (error) {
      console.error("Failed to persist document", error);
      return buildResponse(500, { message: "Failed to persist document" });
    }
  }

  return buildResponse(405, { message: "Method Not Allowed" });
};
