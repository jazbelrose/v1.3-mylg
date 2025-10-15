// duplicate-userprofiles.mjs
// Usage:
//   Dry-run: node duplicate-userprofiles.mjs --dry
//   Apply:   node duplicate-userprofiles.mjs
//   Source region: --sourceRegion=us-west-1 (default)
//   Target region: --targetRegion=us-west-2 (default)
//   Batch size: --batchSize=25 (default)

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.startsWith("--") ? a.slice(2).split("=") : [a, true];
  return [k, v ?? true];
}));

const SOURCE_REGION = args.sourceRegion || "us-west-1";
const TARGET_REGION = args.targetRegion || "us-west-2";
const SOURCE_TABLE = "UserProfiles";
const TARGET_TABLE = "UserProfiles";
const DRY = !!args.dry || args.dry === "true";
const BATCH_SIZE = Number(args.batchSize) || 25;

const sourceClient = new DynamoDBClient({ region: SOURCE_REGION });
const targetClient = new DynamoDBClient({ region: TARGET_REGION });
const sourceDdb = DynamoDBDocumentClient.from(sourceClient, {
  marshallOptions: { removeUndefinedValues: true }
});
const targetDdb = DynamoDBDocumentClient.from(targetClient, {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAllItems() {
  const items = [];
  let lastKey;

  console.log(`🔍 Scanning UserProfiles from ${SOURCE_REGION}...`);

  do {
    const command = new ScanCommand({
      TableName: SOURCE_TABLE,
      ExclusiveStartKey: lastKey,
    });

    const response = await sourceDdb.send(command);
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;

    console.log(`📊 Scanned ${items.length} items so far...`);
  } while (lastKey);

  console.log(`✅ Found ${items.length} total items in source table`);
  return items;
}

async function batchWriteItems(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  console.log(`📦 Processing ${batches.length} batches of up to ${BATCH_SIZE} items each...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const putRequests = batch.map(item => ({
      PutRequest: { Item: item }
    }));

    if (DRY) {
      console.log(`🔍 DRY RUN: Would write batch ${i + 1}/${batches.length} with ${batch.length} items`);
      successCount += batch.length;
      continue;
    }

    try {
      const command = new BatchWriteCommand({
        RequestItems: {
          [TARGET_TABLE]: putRequests
        }
      });

      const response = await targetDdb.send(command);

      if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
        console.warn(`⚠️  Batch ${i + 1}: ${Object.keys(response.UnprocessedItems[TARGET_TABLE] || {}).length} unprocessed items`);
      }

      successCount += batch.length;
      console.log(`✅ Batch ${i + 1}/${batches.length} completed (${successCount} total)`);

    } catch (error) {
      errorCount += batch.length;
      console.error(`❌ Batch ${i + 1} failed:`, error.message);
    }
  }

  return { successCount, errorCount };
}

async function main() {
  console.log(`🚀 Starting UserProfiles duplication`);
  console.log(`   Source: ${SOURCE_REGION}/${SOURCE_TABLE}`);
  console.log(`   Target: ${TARGET_REGION}/${TARGET_TABLE}`);
  console.log(`   Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log('');

  try {
    // Scan all items from source
    const items = await scanAllItems();

    if (items.length === 0) {
      console.log('⚠️  No items found in source table');
      return;
    }

    // Write items to target
    const { successCount, errorCount } = await batchWriteItems(items);

    console.log('');
    console.log('📊 Migration Summary:');
    console.log(`   Total items processed: ${items.length}`);
    console.log(`   Successfully written: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);

    if (DRY) {
      console.log('');
      console.log('🔍 This was a DRY RUN - no data was actually written');
      console.log('💡 To perform the actual migration, run without --dry flag');
    } else {
      console.log('');
      console.log('✅ Migration completed!');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main();