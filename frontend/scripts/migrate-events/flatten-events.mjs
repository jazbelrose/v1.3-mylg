import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

const REGION = "us-west-1"; // ← adjust if needed
const TABLE = "Events";
const DRY = process.argv.includes("--dry");

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

function toNumber(val) {
  if (typeof val === "number") return val;
  if (typeof val === "string" && !isNaN(+val)) return +val;
  return undefined;
}

function extractDate(iso) {
  return typeof iso === "string" && iso.includes("T") ? iso.split("T")[0] : undefined;
}

function flattenEvent(item) {
  const p = item.payload || {};
  const cleaned = { ...item };

  // Prefer top-level values
  cleaned.eventId = item.eventId ?? p.id;
  cleaned.description = item.description ?? p.description;
  cleaned.hours = toNumber(item.hours) ?? toNumber(p.hours);
  cleaned.date = item.date ?? p.date ?? extractDate(item.createdAt);
  cleaned.createdBy = item.createdBy ?? item.userId ?? item.ownerId ?? "system";

  if (p.budgetItemId && !cleaned.budgetItemId) {
    cleaned.budgetItemId = p.budgetItemId;
  }

  // Log mismatches
  const mismatches = [];
  if (item.eventId && p.id && item.eventId !== p.id) mismatches.push("eventId ≠ payload.id");
  if (item.description && p.description && item.description !== p.description) mismatches.push("description ≠ payload.description");
  if (toNumber(item.hours) !== toNumber(p.hours)) mismatches.push("hours ≠ payload.hours");

  // Clean up
  delete cleaned.payload;

  return { cleaned, mismatches };
}

async function* scanAll() {
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    for (const i of out.Items ?? []) yield i;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

(async () => {
  let updated = 0, skipped = 0, warned = 0;

  for await (const item of scanAll()) {
    const { cleaned, mismatches } = flattenEvent(item);

    if (mismatches.length) {
      console.warn(`⚠️  MISMATCH in ${cleaned.projectId}/${cleaned.eventId}: ${mismatches.join(", ")}`);
      warned++;
    }

const updateFields = {
  "#desc": "description",
  "#hrs": "hours",
  "#date": "date",
  "#createdBy": "createdBy"
};
const updateValues = {
  ":desc": cleaned.description,
  ":hrs": cleaned.hours,
  ":date": cleaned.date,
  ":createdBy": cleaned.createdBy
};
const setParts = [
  "#desc = :desc",
  "#hrs = :hrs",
  "#date = :date",
  "#createdBy = :createdBy"
];


    if (cleaned.budgetItemId) {
      updateFields["#bid"] = "budgetItemId";
      updateValues[":bid"] = cleaned.budgetItemId;
      setParts.push("#bid = :bid");
    }

    const cmd = {
      TableName: TABLE,
      Key: {
        projectId: cleaned.projectId,
        eventId: cleaned.eventId,
      },
      UpdateExpression: `SET ${setParts.join(", ")} REMOVE #payload`,
      ExpressionAttributeNames: {
        ...updateFields,
        "#payload": "payload"
      },
      ExpressionAttributeValues: updateValues,
      ConditionExpression: "attribute_exists(projectId) AND attribute_exists(eventId)"
    };

    if (DRY) {
      console.log(`— would update: ${cleaned.projectId} / ${cleaned.eventId}`);
    } else {
      await ddb.send(new UpdateCommand(cmd));
    }

    updated++;
  }

  console.log(`✅ Flatten complete. Updated=${updated}, Skipped=${skipped}, Mismatches=${warned}, Dry=${DRY}`);
})().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
