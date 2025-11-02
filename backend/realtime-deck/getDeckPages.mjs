import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const pagesTable = process.env.DECK_PAGES_TABLE;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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

  const projectId = event.queryStringParameters?.projectId;
  if (!projectId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "projectId query parameter is required" }),
    };
  }

  try {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: pagesTable,
        KeyConditionExpression: "projectId = :projectId",
        ExpressionAttributeValues: {
          ":projectId": projectId,
        },
      })
    );

    const pages = (result.Items || []).map((item, index) => ({
      pageId: item.pageId,
      name: item.pageName || `Page ${index + 1}`,
      sortOrder: item.sortOrder ?? index,
      isSuperSheet: item.isSuperSheet === true,
    }));

    // Sort by sortOrder
    pages.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pages),
    };
  } catch (error) {
    console.error("Failed to fetch deck pages", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Failed to fetch deck pages" }),
    };
  }
};