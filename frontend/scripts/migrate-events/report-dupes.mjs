import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.argv.find(a=>a.startsWith("--region="))?.split("=")[1] || "us-west-1";
const TABLE  = process.argv.find(a=>a.startsWith("--table="))?.split("=")[1]  || "Events";

const low = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(low, { marshallOptions: { removeUndefinedValues: true } });

const norm = (s) => (s ?? "").toString().trim().replace(/\s+/g," ").toLowerCase();
const toNum = (v) => typeof v === "number" ? v : (typeof v === "string" && v.trim()!=="" && !isNaN(+v) ? +v : undefined);
const isoYmdFromIso = (s)=> (typeof s==="string" && s.includes("T")) ? s.split("T")[0] : undefined;

function mapItem(raw){
  const p = raw.payload || {};
  return {
    projectId: raw.projectId,
    eventId: raw.eventId ?? p.id,
    createdAt: raw.createdAt,
    date: raw.date ?? (typeof p.date==="string" ? p.date : isoYmdFromIso(raw.createdAt)),
    description: raw.description ?? p.description,
    hours: toNum(raw.hours) ?? toNum(p.hours),
    budgetItemId: raw.budgetItemId ?? p.budgetItemId,
  };
}
function fp(t){ return [t.projectId||"", t.date||"", norm(t.description), typeof t.hours==="number"?t.hours:""].join("|"); }

async function* scanAll(){
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    for (const i of out.Items ?? []) yield i;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

const buckets = new Map();
const rows = [];
for await (const it of scanAll()) {
  const t = mapItem(it);
  rows.push(t);
  const key = fp(t);
  (buckets.get(key) ?? buckets.set(key, []).get(key)).push(t);
}

let groups=0, losers=0;
for (const [key, g] of buckets) {
  if (g.length > 1) {
    groups++; losers += (g.length - 1);
    console.log("\n— group:", key);
    for (const r of g) {
      console.log(`   ${r.projectId} | ${r.date} | ${r.description} | h=${r.hours} | eventId=${r.eventId} | budgetItemId=${r.budgetItemId ?? ""}`);
    }
  }
}
console.log(`\n🧮 duplicate groups = ${groups}, total loser items = ${losers}`);
