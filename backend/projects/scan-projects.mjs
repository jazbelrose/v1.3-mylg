// scan-projects.mjs
// Usage: node scan-projects.mjs [--update]

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.startsWith("--") ? a.slice(2).split("=") : [a, true];
  return [k, v ?? true];
}));

const REGION = process.env.AWS_REGION || "us-west-2";
const TABLE_NAME = process.env.PROJECTS_TABLE || "Projects";
const UPDATE = !!args.update || args.update === "true";

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function scanAndUpdateProjects() {
  const items = [];
  let lastKey;
  let scannedCount = 0;
  let updatedCount = 0;

  console.log(`🔍 Scanning Projects table in ${REGION}...`);

  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
      Limit: 100,
    });

    const response = await ddb.send(command);
    const batchItems = response.Items || [];
    items.push(...batchItems);
    lastKey = response.LastEvaluatedKey;
    scannedCount += response.ScannedCount || 0;

    if (UPDATE) {
      const itemsToUpdate = batchItems.filter(item => {
        const team = item.team || [];
        const teamUserIds = item.teamUserIds || [];
        const expectedUserIds = team.map(m => m.userId).filter(Boolean);
        return expectedUserIds.length > 0 && JSON.stringify(teamUserIds.sort()) !== JSON.stringify(expectedUserIds.sort());
      });
      
      if (itemsToUpdate.length > 0) {
        const putRequests = itemsToUpdate.map(item => {
          const team = item.team || [];
          const teamUserIds = Array.from(new Set(team.map(m => m.userId).filter(Boolean)));
          
          return {
            PutRequest: {
              Item: {
                ...item,
                teamUserIds: teamUserIds
              }
            }
          };
        });

        console.log(`Updating ${putRequests.length} projects with teamUserIds...`);
        await ddb.send(new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: putRequests
          }
        }));
        updatedCount += putRequests.length;

        // Sleep to avoid throttling
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`📊 Scanned ${scannedCount} items so far...`);
  } while (lastKey);

  console.log(`✅ Found ${items.length} total projects`);
  if (UPDATE) {
    console.log(`✅ Updated ${updatedCount} projects with teamUserIds`);
  }

  console.log("Projects:");
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item.projectId}: ${item.title || 'No title'}`);
    console.log(`   Status: ${item.status || 'N/A'}`);
    console.log(`   Visibility: ${item.visibility || 'N/A'}`);
    
    // Display team information
    const team = item.team || [];
    const teamUserIds = item.teamUserIds || [];
    console.log(`   Team Members: ${team.length}`);
    if (team.length > 0) {
      team.forEach((member, idx) => {
        console.log(`     ${idx + 1}. ${member.userId || 'N/A'} - ${member.name || 'No name'} (${member.role || 'No role'})`);
      });
    } else {
      console.log(`     No team members assigned`);
    }
    
    console.log(`   Team User IDs: ${teamUserIds.length > 0 ? teamUserIds.join(', ') : 'None'}`);
    console.log(`   Created: ${item.createdAt || item.dateCreated || 'N/A'}`);
    console.log('');
  });

  return items;
}

scanAndUpdateProjects().catch(console.error);