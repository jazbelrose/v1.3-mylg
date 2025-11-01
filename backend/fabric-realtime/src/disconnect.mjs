import { DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAME, documentClient } from "./common.mjs";

export const handler = async (event) => {
  const connectionId = event?.requestContext?.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connection identifier" };
  }

  try {
    const metadata = await documentClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `CONNECTION#${connectionId}`, sk: "METADATA" },
      })
    );

    const documentId = metadata.Item?.documentId;

    await documentClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: `CONNECTION#${connectionId}`, sk: "METADATA" },
      })
    );

    if (documentId) {
      await documentClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { pk: `DOCUMENT#${documentId}`, sk: `CONNECTION#${connectionId}` },
        })
      );
    }

    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Failed to cleanup connection", error);
    return { statusCode: 500, body: "Failed to cleanup connection" };
  }
};
