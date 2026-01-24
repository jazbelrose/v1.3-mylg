/**
 * File Reconciliation Job
 * Runs periodically to detect and fix inconsistencies
 * 
 * Checks:
 * 1. S3 objects without File records (orphaned S3)
 * 2. File records without S3 objects (missing S3)
 * 3. FileRefs pointing to non-existent or deleted Files (orphaned refs)
 * 4. FAILED uploads older than 7 days (cleanup)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  getFile,
  getFileByStorageKey,
  updateFileStatus,
  hardDeleteFile,
  getRefsForFile,
  FILE_STATUS,
} from "./filesDal.mjs";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const FILES_TABLE = process.env.FILES_TABLE || "Files";
const FILE_REFS_TABLE = process.env.FILE_REFS_TABLE || "FileRefs";
const S3_BUCKET = process.env.S3_BUCKET || "mylg-files-v12";

// Cleanup threshold: 7 days for FAILED uploads
const FAILED_UPLOAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const handler = async (event) => {
  console.log("🔄 File reconciliation started:", JSON.stringify(event));

  const report = {
    startedAt: new Date().toISOString(),
    orphanedS3Objects: [],
    missingS3Objects: [],
    orphanedRefs: [],
    cleanedFailedUploads: 0,
    errors: [],
  };

  try {
    // 1. Find FAILED uploads older than threshold and clean them
    await cleanupFailedUploads(report);

    // 2. Find File records where S3 object is missing
    await detectMissingS3Objects(report);

    // 3. Find FileRefs pointing to non-existent or deleted Files
    await detectOrphanedRefs(report);

    // 4. (Optional) Find S3 objects without File records
    // This is expensive, so only run on explicit request
    if (event.action === "full-reconcile") {
      await detectOrphanedS3Objects(report);
    }
  } catch (err) {
    console.error("❌ Reconciliation error:", err);
    report.errors.push(err.message);
  }

  report.completedAt = new Date().toISOString();
  console.log("✅ Reconciliation complete:", JSON.stringify(report, null, 2));

  return report;
};

/**
 * Clean up FAILED uploads older than threshold
 */
const cleanupFailedUploads = async (report) => {
  console.log("🧹 Cleaning up failed uploads...");

  const cutoff = Date.now() - FAILED_UPLOAD_RETENTION_MS;
  let lastKey = undefined;

  do {
    const result = await dynamoDb.send(
      new ScanCommand({
        TableName: FILES_TABLE,
        FilterExpression: "#status = :failed",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":failed": FILE_STATUS.FAILED },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const file of result.Items || []) {
      const createdAt = new Date(file.createdAt).getTime();
      if (createdAt < cutoff) {
        try {
          await hardDeleteFile(file.PK, file.fileId);
          report.cleanedFailedUploads++;
          console.log(`  Cleaned failed upload: ${file.fileId}`);
        } catch (err) {
          report.errors.push(`Failed to clean ${file.fileId}: ${err.message}`);
        }
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
};

/**
 * Find File records where S3 object doesn't exist
 */
const detectMissingS3Objects = async (report) => {
  console.log("🔍 Detecting missing S3 objects...");

  let lastKey = undefined;

  do {
    const result = await dynamoDb.send(
      new ScanCommand({
        TableName: FILES_TABLE,
        FilterExpression: "#status = :ready",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":ready": FILE_STATUS.READY },
        ExclusiveStartKey: lastKey,
        Limit: 100,
      })
    );

    for (const file of result.Items || []) {
      try {
        await s3Client.send(
          new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: file.storageKey,
          })
        );
      } catch (err) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
          report.missingS3Objects.push({
            fileId: file.fileId,
            storageKey: file.storageKey,
          });

          // Mark as FAILED
          await updateFileStatus(file.PK, file.fileId, FILE_STATUS.FAILED, "system-reconcile");
          console.log(`  Marked as FAILED (missing S3): ${file.fileId}`);
        }
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
};

/**
 * Find FileRefs pointing to non-existent or deleted Files
 */
const detectOrphanedRefs = async (report) => {
  console.log("🔍 Detecting orphaned refs...");

  let lastKey = undefined;

  do {
    const result = await dynamoDb.send(
      new ScanCommand({
        TableName: FILE_REFS_TABLE,
        ExclusiveStartKey: lastKey,
        Limit: 100,
      })
    );

    for (const ref of result.Items || []) {
      const fileId = ref.fileId;

      // Try to get the file - we need to know the scope
      // FileRef.PK is "file#<fileId>", so we need to look up the file differently
      // We'll scan Files table by fileId using the GSI

      const fileResult = await dynamoDb.send(
        new ScanCommand({
          TableName: FILES_TABLE,
          FilterExpression: "fileId = :fileId",
          ExpressionAttributeValues: { ":fileId": fileId },
          Limit: 1,
        })
      );

      const file = fileResult.Items?.[0];

      if (!file) {
        report.orphanedRefs.push({
          fileId,
          containerType: ref.containerType,
          containerId: ref.containerId,
          reason: "file_not_found",
        });
      } else if (file.status === FILE_STATUS.DELETED) {
        report.orphanedRefs.push({
          fileId,
          containerType: ref.containerType,
          containerId: ref.containerId,
          reason: "file_deleted",
        });
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
};

/**
 * Find S3 objects without corresponding File records
 * This is expensive - only run on explicit full reconcile
 */
const detectOrphanedS3Objects = async (report) => {
  console.log("🔍 Detecting orphaned S3 objects (full scan)...");

  const prefixes = ["public/projects/", "public/orgs/"];

  for (const prefix of prefixes) {
    let continuationToken = undefined;

    do {
      const result = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 100,
        })
      );

      for (const obj of result.Contents || []) {
        // Skip thumbnails and embeds (they're derived)
        if (
          obj.Key.includes("_thumbnails/") ||
          obj.Key.includes("_embed/")
        ) {
          continue;
        }

        const file = await getFileByStorageKey(obj.Key);
        if (!file) {
          report.orphanedS3Objects.push({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified?.toISOString(),
          });
        }
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);
  }
};
