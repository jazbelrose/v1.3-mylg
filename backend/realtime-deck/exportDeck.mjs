import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const pagesTable = process.env.DECK_PAGES_TABLE;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const buildPdfPlaceholder = (projectId, pageId) => {
  const content = `Deck export for ${projectId}/${pageId}`;
  return Buffer.from(content, "utf8").toString("base64");
};

const buildHtmlPlaceholder = (state) => {
  const safeState = state ? JSON.stringify(state) : "{}";
  const html = `<!doctype html><html><head><meta charset=\"utf-8\" /><title>Deck Export</title></head><body><pre id=\"deck\">${safeState}</pre></body></html>`;
  return Buffer.from(html, "utf8").toString("base64");
};

export const handler = async (event) => {
  // Handle preflight OPTIONS request
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }
  if (!pagesTable) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Deck pages table not configured" })
    };
  }

  let body;
  if (typeof event.body === "string") {
    try {
      body = JSON.parse(event.body || "{}");
    } catch (error) {
      console.error("Invalid export payload", error);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Invalid JSON payload" })
      };
    }
  } else {
    body = event.body ?? {};
  }
  const { projectId, pageId, format, state } = body;
  if (!projectId || !pageId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "projectId and pageId are required" })
    };
  }

  let deckState = state ?? null;
  if (!deckState) {
    const item = await dynamo.send(
      new GetCommand({
        TableName: pagesTable,
        Key: { projectId, pageId },
      })
    );
    deckState = item.Item?.state ?? null;
  }

  const pdfBase64 = buildPdfPlaceholder(projectId, pageId);
  const siteBase64 = buildHtmlPlaceholder(deckState);

  const payload = {
    projectId,
    pageId,
    pdf: `data:application/pdf;base64,${pdfBase64}`,
    site: `data:text/html;base64,${siteBase64}`,
  };

  if (format === "pdf") {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ projectId, pageId, pdf: payload.pdf }),
    };
  }
  if (format === "site") {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ projectId, pageId, site: payload.site }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  };
};
