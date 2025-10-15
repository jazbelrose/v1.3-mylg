// one-shot-migrate-107.mjs
// Usage:
//   Dry-run: node one-shot-migrate-107.mjs --table=Events --region=us-west-1 --dry
//   Apply:   node one-shot-migrate-107.mjs --table=Events --region=us-west-1
//   Dedupe resolution (optional): --resolve=soft|hard|none  (default: soft)
//   TTL for soft-deleted losers (days): --ttlDays=14
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const args = Object.fromEntries(process.argv.slice(2).map(a=>{
  const [k,v]=a.startsWith("--")?a.slice(2).split("="):[a,true];
  return [k, v ?? true];
}));

const TABLE = args.table || "Events";
const REGION = args.region || process.env.AWS_REGION || "us-west-1";
const DRY = !!args.dry || args.dry === "true";
const RESOLVE = (args.resolve || "soft"); // soft|hard|none
const TTL_DAYS = Number(args.ttlDays || 0);
const CREATED_BY_FALLBACK = String(args.createdByFallback || "system");

const low = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(low, { marshallOptions: { removeUndefinedValues: true } });

const toNum = (v)=> typeof v==="number" ? v : (typeof v==="string" && v.trim()!=="" && !isNaN(+v) ? +v : undefined);
const isoYmdFromIso = (s)=> (typeof s==="string" && s.includes("T")) ? s.split("T")[0] : undefined;
const norm = (s)=> (s??"").toString().trim().replace(/\s+/g," ").toLowerCase();
const ttlEpoch = (days)=> Math.floor((Date.now() + days*86400_000)/1000);

function mapToTarget(item){
  const p = item.payload || {};
  const eventId = item.eventId ?? p.id;
  if(!item.projectId || !eventId) throw new Error("Missing key(s)");
  const date = item.date ?? (typeof p.date==="string" ? p.date : isoYmdFromIso(item.createdAt));
  const description = item.description ?? p.description;
  const hours = toNum(item.hours) ?? toNum(p.hours);
  const budgetItemId = item.budgetItemId ?? p.budgetItemId;
  const createdBy = item.createdBy ?? item.userId ?? item.ownerId ?? CREATED_BY_FALLBACK;

  return {
    projectId: item.projectId,
    eventId,
    createdAt: item.createdAt,
    createdBy,
    description,
    hours,
    date,
    ...(budgetItemId ? { budgetItemId } : {}),
  };
}

function fingerprint(t){
  return [t.projectId||"", t.date||"", norm(t.description), (typeof t.hours==="number"?t.hours:""), t.budgetItemId||""].join("|");
}

function chooseWinner(group){
  // has budgetItemId > has createdBy > earliest createdAt > smallest eventId
  const score = it=>({
    b: it.budgetItemId?1:0,
    c: it.createdBy?1:0,
    a: Date.parse(it.createdAt || "9999-12-31"),
    e: it.eventId || ""
  });
  return [...group].sort((x,y)=>{
    const A=score(x), B=score(y);
    if(B.b!==A.b) return B.b-A.b;
    if(B.c!==A.c) return B.c-A.c;
    if(A.a!==B.a) return A.a-B.a;
    return A.e.localeCompare(B.e);
  })[0];
}

async function* scanAll(){
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    for(const i of out.Items ?? []) yield i;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

(async ()=>{
  console.log(`➡️  Migrating ${TABLE} (region=${REGION}, dry=${DRY}, resolve=${RESOLVE})`);

  // Load, map, and index by fingerprint for dedupe
  const original = [];
  for await (const it of scanAll()) original.push(it);
  console.log(`📦 scanned=${original.length}`);

  const mapped = original.map(mapToTarget);

  // Group for dedupe
  const buckets = new Map();
  for(const t of mapped){
    const fp = fingerprint(t);
    (buckets.get(fp) ?? buckets.set(fp, []).get(fp)).push(t);
  }

  let dupGroups = 0, losersTotal = 0;
  const updates = [];
  const deletes = [];

  for(const [_, group] of buckets){
    if(group.length===1){
      const t = group[0];
      updates.push({ t, dropPayload:true });
      continue;
    }
    dupGroups++;
    const winner = chooseWinner(group);
    updates.push({ t: winner, dropPayload:true });

    const losers = group.filter(g => !(g.projectId===winner.projectId && g.eventId===winner.eventId));
    losersTotal += losers.length;

    if (RESOLVE === "hard"){
      for(const l of losers) deletes.push({ projectId:l.projectId, eventId:l.eventId });
    } else if (RESOLVE === "soft"){
      for(const l of losers){
        updates.push({
          t: l,
          softDelete: true,
          ttl: TTL_DAYS>0 ? ttlEpoch(TTL_DAYS) : undefined,
        });
      }
    } // else "none" → leave losers untouched
  }

  // Execute
  let changed=0, removed=0;
  for(const u of updates){
    const names = { "#desc":"description", "#hours":"hours", "#date":"date", "#createdBy":"createdBy" };
    const vals = { ":desc":u.t.description, ":hours":u.t.hours, ":date":u.t.date, ":createdBy":u.t.createdBy };
    let setParts = ["#desc=:desc", "#hours=:hours", "#date=:date", "#createdBy=:createdBy"];
    if(u.t.budgetItemId){ names["#bid"]="budgetItemId"; vals[":bid"]=u.t.budgetItemId; setParts.push("#bid=:bid"); }
    if(u.softDelete){ names["#deleted"]="deleted"; vals[":deleted"]=true; setParts.push("#deleted=:deleted"); }
    if(u.ttl){ names["#ttl"]="ttl"; vals[":ttl"]=u.ttl; setParts.push("#ttl=:ttl"); }

    let UpdateExpression = "SET " + setParts.join(", ");
    const removes = [];
    if (u.dropPayload){ removes.push("#payload"); names["#payload"]="payload"; }
    if (removes.length) UpdateExpression += " REMOVE " + removes.join(", ");

    const cmd = {
      TableName: TABLE,
      Key: { projectId: u.t.projectId, eventId: u.t.eventId },
      UpdateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
      ConditionExpression: "attribute_exists(projectId) AND attribute_exists(eventId)"
    };

    if (DRY){
      console.log("— UPDATE", JSON.stringify(cmd, null, 2));
      changed++;
    } else {
      await ddb.send(new UpdateCommand(cmd));
      changed++;
    }
  }

  if (!DRY && deletes.length && RESOLVE==="hard"){
    for(const del of deletes){
      const cmd = { TableName: TABLE, Key: del, ConditionExpression: "attribute_exists(projectId) AND attribute_exists(eventId)" };
      await ddb.send(new DeleteCommand(cmd));
      removed++;
    }
  }

  console.log(`✅ done. changed=${changed} dupGroups=${dupGroups} losers=${losersTotal} hardDeleted=${removed} (dry=${DRY})`);
})().catch(e=>{ console.error("❌ failed:", e); process.exit(1); });
