import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const pagesTable = process.env.DECK_PAGES_TABLE;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
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
      body: JSON.stringify({ message: "Deck pages table not configured" }),
    };
  }

  let body;
  if (typeof event.body === "string") {
    try {
      body = JSON.parse(event.body || "{}");
    } catch (error) {
      console.error("Invalid JSON payload", error);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Invalid JSON payload" }),
      };
    }
  } else {
    body = event.body ?? {};
  }

  const { projectId, name, afterPageId, sourcePageId } = body;
  if (!projectId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "projectId is required" }),
    };
  }

  try {
    // Get existing pages to determine sort order
    const existingPages = await dynamo.send(
      new QueryCommand({
        TableName: pagesTable,
        KeyConditionExpression: "projectId = :projectId",
        ExpressionAttributeValues: {
          ":projectId": projectId,
        },
      })
    );

    const pages = existingPages.Items || [];
    let sortOrder = pages.length; // Default to end

    // If afterPageId is specified, insert after that page
    if (afterPageId) {
      const afterPage = pages.find((p) => p.pageId === afterPageId);
      if (afterPage) {
        sortOrder = (afterPage.sortOrder ?? 0) + 1;
        // Update sort order of subsequent pages
        const subsequentPages = pages.filter(
          (p) => (p.sortOrder ?? 0) >= sortOrder && p.pageId !== afterPageId
        );
        for (const page of subsequentPages) {
          await dynamo.send(
            new PutCommand({
              TableName: pagesTable,
              Item: {
                ...page,
                sortOrder: (page.sortOrder ?? 0) + 1,
                updatedAt: new Date().toISOString(),
              },
            })
          );
        }
      }
    }

    const pageId = randomUUID();
    const pageName = name && typeof name === "string" ? name.trim() : `Page ${pages.length + 1}`;
    const nowIso = new Date().toISOString();

    const newPage = {
      projectId,
      pageId,
      pageName,
      sortOrder,
      state: null, // Initial empty state
      version: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      isSuperSheet: false,
    };

    // If sourcePageId is provided, copy state from source page
    if (sourcePageId) {
      const sourcePage = pages.find((p) => p.pageId === sourcePageId);
      if (sourcePage && sourcePage.state) {
        newPage.state = sourcePage.state;
        newPage.version = 1;
      }
    }

    await dynamo.send(
      new PutCommand({
        TableName: pagesTable,
        Item: newPage,
      })
    );

    const responseData = {
      pageId,
      name: pageName,
      sortOrder,
      isSuperSheet: false,
    };

    return {
      statusCode: 201,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    console.error("Failed to create deck page", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Failed to create deck page" }),
    };
  }
};