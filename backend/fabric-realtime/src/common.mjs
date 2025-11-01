import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const { FABRIC_STATE_TABLE } = process.env;

if (!FABRIC_STATE_TABLE) {
  throw new Error("FABRIC_STATE_TABLE environment variable is required");
}

const baseClient = new DynamoDBClient({});

export const documentClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

export const TABLE_NAME = FABRIC_STATE_TABLE;

export const epochSeconds = () => Math.floor(Date.now() / 1000);

export const connectionTtl = () => epochSeconds() + 60 * 60 * 6;

export const stateVersion = () => Date.now();
