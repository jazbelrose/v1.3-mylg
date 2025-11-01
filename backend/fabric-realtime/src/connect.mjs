import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAME, connectionTtl, documentClient, epochSeconds } from "./common.mjs";

export const handler = async (event) => {
  const connectionId = event?.requestContext?.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connection identifier" };
  }

  try {
    await documentClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `CONNECTION#${connectionId}`,
          sk: "METADATA",
          connectionId,
          createdAt: epochSeconds(),
          ttl: connectionTtl(),
        },
      })
    );

    return { statusCode: 200, body: "Connected" };
  } catch (error) {
    console.error("Failed to register connection", error);
    return { statusCode: 500, body: "Failed to register connection" };
  }
};
