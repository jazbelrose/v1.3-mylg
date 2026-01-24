/**
 * Hard Delete Cleanup Handler
 * Triggered by DynamoDB Streams when TTL removes a File record
 * 
 * Responsibilities:
 * - Delete S3 objects (original, thumbnail, embed)
 * - Delete all FileRefs pointing to this file
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const FILE_REFS_TABLE = process.env.FILE_REFS_TABLE || "FileRefs";
const S3_BUCKET = process.env.S3_BUCKET || "mylg-files-v12";

export const handler = async (event) => {
  console.log("🗑️ Hard delete cleanup triggered:", JSON.stringify(event));

  const results = {
    processed: 0,
    s3Deleted: 0,
    refsDeleted: 0,
    errors: [],
  };

  for (const record of event.Records) {
    // Only process REMOVE events (TTL deletions)
    if (record.eventName !== "REMOVE") {
      continue;
    }

    try {
      const file = unmarshall(record.dynamodb.OldImage);
      console.log(`Processing hard delete for file: ${file.fileId}`);

      // 1. Delete S3 objects
      const keysToDelete = [
        file.storageKey,
        file.thumbnailKey,
        file.embedKey,
      ].filter(Boolean);

      if (keysToDelete.length > 0) {
        try {
          await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: S3_BUCKET,
              Delete: {
                Objects: keysToDelete.map((Key) => ({ Key })),
              },
            })
          );
          results.s3Deleted += keysToDelete.length;
          console.log(`  Deleted ${keysToDelete.length} S3 objects`);
        } catch (s3Err) {
          console.error(`  Failed to delete S3 objects:`, s3Err);
          results.errors.push(`S3 delete failed for ${file.fileId}: ${s3Err.message}`);
        }
      }

      // 2. Delete all FileRefs for this file
      const refsDeleted = await deleteAllRefsForFile(file.fileId);
      results.refsDeleted += refsDeleted;
      console.log(`  Deleted ${refsDeleted} refs`);

      results.processed++;
    } catch (err) {
      console.error("Error processing record:", err);
      results.errors.push(err.message);
    }
  }

  console.log("✅ Hard delete cleanup complete:", JSON.stringify(results));
  return results;
};

/**
 * Delete all FileRefs for a given fileId
 */
const deleteAllRefsForFile = async (fileId) => {
  let deletedCount = 0;

  // Query all refs for this file
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: FILE_REFS_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `file#${fileId}` },
    })
  );

  const refs = result.Items || [];
  if (refs.length === 0) {
    return 0;
  }

  // Batch delete in chunks of 25
  const chunks = [];
  for (let i = 0; i < refs.length; i += 25) {
    chunks.push(refs.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await dynamoDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [FILE_REFS_TABLE]: chunk.map((ref) => ({
            DeleteRequest: {
              Key: { PK: ref.PK, SK: ref.SK },
            },
          })),
        },
      })
    );
    deletedCount += chunk.length;
  }

  return deletedCount;
};
