// backend/hq/router.mjs
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";
import { requireCallerUserId, httpError } from "/opt/nodejs/utils/auth.mjs";
import { requireOrgMember, requireOrgAdmin } from "/opt/nodejs/utils/orgAuth.mjs";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectsCommand, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";

/* ------------ ENV ------------ */
const REGION = process.env.AWS_REGION || "us-west-2";
const FILE_BUCKET = process.env.FILE_BUCKET || "mylg-files-v12";

const HQ_TABLE = process.env.HQ_TABLE || "HqLedger";
const ORG_MEMBERS_TABLE = process.env.ORG_MEMBERS_TABLE || "OrgMembers";

// Bump this when changing how LEDGER# aggregate rows are derived.
// Used to trigger a one-time rebuild so existing orgs don't keep stale aggregates.
const HQ_LEDGER_VERSION = 2;

/* ------------ DDB ------------ */
const ddb = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

/* ------------ S3 ------------ */
const s3 = new S3Client({ region: REGION });

/* ------------ utils ------------ */
const M = (e) => e?.requestContext?.http?.method?.toUpperCase?.() || e?.httpMethod?.toUpperCase?.() || "GET";
const P = (e) => (e?.rawPath || e?.path || "/");
const Q = (e) => e?.queryStringParameters || {};
const B = (e) => {
  if (!e) return {};
  const body = e.body;
  if (!body) return {};
  try {
    const raw = e.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
    if (typeof raw === "string" && raw.trim().length) return JSON.parse(raw);
    return typeof raw === "object" && raw !== null ? raw : {};
  } catch {
    return {};
  }
};

const nowISO = () => new Date().toISOString();

// Normalize API Gateway path differences across REST API (stage prefix) vs HTTP API,
// and across deployments that may mount this router at either `/hq/*` or `/*`.
const normalizePathForRoutes = (event) => {
  let path = String(P(event) || "/");

  const stage = String(event?.requestContext?.stage || "").trim();
  if (stage && path.startsWith(`/${stage}/`)) {
    path = path.slice(stage.length + 1);
  }

  // If this router is mounted at the API root, requests might come in as `/import-csv`.
  // Our route table expects `/hq/import-csv`.
  if (path === "/") return "/hq";
  if (!path.startsWith("/hq")) {
    path = `/hq${path.startsWith("/") ? "" : "/"}${path}`;
  }

  return path;
};

const decodeCursor = (raw) => {
  if (!raw) return undefined;
  try {
    return JSON.parse(decodeURIComponent(String(raw)));
  } catch {
    return undefined;
  }
};

const encodeCursor = (key) => (key ? encodeURIComponent(JSON.stringify(key)) : null);

const pkForOrg = (orgId) => String(orgId || "").trim();

const skAccount = (accountId) => `ACCOUNT#${accountId}`;
const skImport = (createdAt, importRunId) => `IMPORT#${createdAt}#${importRunId}`;
const skTxn = (postedAt, dedupeHash) => `TXN#${postedAt}#${dedupeHash}`;
const skRule = (ruleId) => `RULE#${ruleId}`;

// HQ derived storage
const skHqHeader = () => "HQHDR#v1";
const skLedgerDay = (date) => `LEDGER#${date}`; // date=YYYY-MM-DD
const skLedgerDayAccount = (accountId, date) => `LEDGERA#${accountId}#${date}`;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const chunk = (arr, n = 25) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const normalizeForMatching = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u2013\u2014]/g, "-");

// Keep parity with frontend `normalizeTransactionDescription` for hashing/idempotency.
const normalizeTxnDescriptionForDedupe = (raw) => {
  const upper = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  return upper.replace(/[^\w\s#/-]/g, "").replace(/\s+/g, " ").trim();
};

const sha256Hex = (input) => createHash("sha256").update(String(input || ""), "utf8").digest("hex");

// Legacy dedupe hash used by older clients (kept for back-compat so re-importing the same CSV
// doesn't create duplicates if the old version already exists in Dynamo).
const computeTransactionDedupeHashV1 = ({ accountId, postedAt, amount, rawDescription, normalizedDescription }) => {
  const normalized = normalizeTxnDescriptionForDedupe(rawDescription || normalizedDescription || "").slice(0, 120);
  const amt = typeof amount === "number" ? amount : Number(amount);
  // Legacy frontend format: `${accountId}${postedAt}${amount.toFixed(2)}${normalized}`
  const payload = `${String(accountId || "")}${String(postedAt || "")}${Number.isFinite(amt) ? amt.toFixed(2) : ""}${normalized}`;
  return sha256Hex(payload);
};

// Current server-authoritative dedupe hash.
// Goal: avoid collisions for lookalike txns (e.g. multiple Owner Draw transfers) while remaining stable
// across re-imports of the same CSV.
const computeTransactionDedupeHashV2 = ({
  accountId,
  postedAt,
  amount,
  rawDescription,
  normalizedDescription,
  paymentType,
  vendor,
  counterparty,
  referenceId,
  cardLast4,
}) => {
  const normalized = normalizeTxnDescriptionForDedupe(rawDescription || normalizedDescription || "");
  // Defensive cap: hashing huge strings is fine, but cap to keep payload bounded.
  const desc = normalized.slice(0, 800);
  const ref = normalizeTxnDescriptionForDedupe(referenceId || "").slice(0, 80);
  const card = String(cardLast4 || "").trim().slice(0, 8);
  const v = normalizeTxnDescriptionForDedupe(vendor || "").slice(0, 160);
  const cp = normalizeTxnDescriptionForDedupe(counterparty || "").slice(0, 160);
  const pt = String(paymentType || "").trim().toLowerCase();
  const amt = typeof amount === "number" ? amount : Number(amount);

  const payload = [
    "v2",
    String(accountId || ""),
    String(postedAt || ""),
    Number.isFinite(amt) ? amt.toFixed(2) : "",
    desc,
    pt,
    ref,
    card,
    v,
    cp,
  ].join("|");
  return sha256Hex(payload);
};

const normalizeVendorKey = (value) =>
  normalizeForMatching(value)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    // Strip trailing location-ish / noise tokens to stabilize vendor clustering.
    .filter((t, idx, arr) => {
      void idx;
      const last = arr[arr.length - 1];
      if (t !== last) return true;
      if (/^[a-z]{2}$/.test(t)) return false; // state codes like CA
      if (/^\d{5}$/.test(t)) return false; // zip
      if (/^\d{1,4}$/.test(t) && arr.length >= 3) return false; // store/location ids
      return true;
    })
    .join(" ")
    .trim();

const HQ_TIME_ZONE = "America/Los_Angeles";

const todayIsoInTimeZone = (timeZone = HQ_TIME_ZONE) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const isoToDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
const dateToIso = (d) => new Date(d.getTime()).toISOString().slice(0, 10);
const addDaysIso = (iso, deltaDays) => {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return dateToIso(d);
};

const monthKey = (iso) => String(iso || "").slice(0, 7);

const parseYyyyMm = (yyyyMm) => {
  const [y, m] = String(yyyyMm || "").split("-");
  return { year: Number(y), monthIndex: Number(m) - 1 };
};

const addMonths = (yyyyMm, deltaMonths) => {
  const { year, monthIndex } = parseYyyyMm(yyyyMm);
  const total = year * 12 + monthIndex + deltaMonths;
  const nextYear = Math.floor(total / 12);
  const nextMonthIndex = total % 12;
  return `${String(nextYear)}-${String(nextMonthIndex + 1).padStart(2, "0")}`;
};

const firstDayOfMonth = (yyyyMm) => `${String(yyyyMm || "").slice(0, 7)}-01`;

const lastDayOfMonth = (yyyyMm) => {
  const { year, monthIndex } = parseYyyyMm(yyyyMm);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  return dateToIso(d);
};

const parseLimitParam = (raw, fallback, min, max) => {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const minIso = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
};

const isLikelyInternalTransfer = (txn) => {
  const d = String(txn?.normalizedDescription || txn?.rawDescription || "").toUpperCase();
  if (txn?.type === "transfer" && d.startsWith("ONLINE TRANSFER")) return true;
  if (d.startsWith("ONLINE TRANSFER")) return true;
  return false;
};

const DEFAULT_RULEPACK = [
  { pattern: "\\bADOBE\\b", categoryId: "SOFTWARE_SAAS", priority: 180 },
  { pattern: "\\bAMAZON WEB SERVICE\\b|\\bAWS\\b", categoryId: "SOFTWARE_SAAS", priority: 175 },
  { pattern: "\\bNOTION\\b", categoryId: "SOFTWARE_SAAS", priority: 170 },
  { pattern: "\\bGOOGLE\\b|\\bG SUITE\\b|\\bWORKSPACE\\b", categoryId: "SOFTWARE_SAAS", priority: 165 },
  { pattern: "\\bUBER\\b|\\bLYFT\\b", categoryId: "TRAVEL", priority: 160 },
  { pattern: "\\bDELTA\\b|\\bUNITED\\b|\\bAMERICAN AIRLINES\\b|\\bJETBLUE\\b", categoryId: "TRAVEL", priority: 155 },
  { pattern: "\\bWEWORK\\b", categoryId: "RENT_LEASE", priority: 150 },
  { pattern: "\\bSQUARE\\b|\\bSTRIPE\\b", categoryId: "CLIENT_PAYMENT", priority: 145 },
  { pattern: "\\bTESLA\\s+FINANCE\\b", categoryId: "AUTO_PAYMENT", priority: 142 },
  { pattern: "\\bTESLA\\s+INSURANCE\\b", categoryId: "AUTO_INSURANCE", priority: 141 },
  { pattern: "\\bCHARGEPOINT\\b|\\bELECTRIFY\\s+AMERICA\\b", categoryId: "CHARGING", priority: 140 },
  // Income patterns
  { pattern: "\\bPAYPAL\\s+TRANSFER\\b|\\bPAYPAL\\s+DEPOSIT\\b", categoryId: "CLIENT_PAYMENT", priority: 138 },
  { pattern: "\\bVENMO\\s+PAYMENT\\b|\\bZELLE\\s+FROM\\b", categoryId: "CLIENT_PAYMENT", priority: 136 },
  { pattern: "\\bREFUND\\b|\\bCREDIT\\s+MEMO\\b", categoryId: "REFUND_RECEIVED", priority: 130 },
  { pattern: "\\bINTEREST\\s+EARNED\\b|\\bINTEREST\\s+PAID\\b|\\bINTEREST\\s+PAYMENT\\b", categoryId: "INTEREST_INCOME", priority: 125 },
];

const isUncategorizedTxn = (t) => {
  const c = String(t?.categoryId || "OTHER");
  return !c || c === "OTHER";
};

const cleanVendorLabel = (input) => {
  const raw = String(input?.vendor || input?.counterparty || input?.rawDescription || "").trim();
  if (!raw) return "Unknown";

  let value = raw.replace(/\s+/g, " ").trim();
  value = value
    .replace(/\b(PURCHASE|RECURRING\s+PAYMENT)\s+AUTHORIZED\s+ON\b/i, "")
    .replace(/\bAUTHORIZED\s+ON\b/i, "")
    .replace(/\bONLINE\s+TRANSFER\b/i, "")
    .replace(/\bPOS\b/i, "")
    .replace(/\bDEBIT\b/i, "")
    .replace(/\bCREDIT\b/i, "")
    .replace(/\bCARD\s+\d{4}\b/i, "")
    .replace(/\bREF\s*#\s*[A-Z0-9-]+\b/i, "")
    .replace(/\bFED#\s*[A-Z0-9-]+\b/i, "")
    .replace(/\b\d{4,}\b/g, "");

  value = value.replace(/\s+/g, " ").trim();
  value = value.replace(/^AMAZON\s+MKTPLCE\*?.*$/i, "Amazon");
  value = value.replace(/^SQ\s*\*\s*/i, "");
  value = value.replace(/\s+/g, " ").trim();
  return value.length > 60 ? `${value.slice(0, 57)}.` : value;
};

const getVendorKeyForTxn = (txn) => {
  const vendorLabel = cleanVendorLabel(txn);
  const vendorKey = normalizeVendorKey(vendorLabel) || "unknown";
  return { vendorLabel, vendorKey };
};

const extractRecurringSeriesDiscriminator = (txn) => {
  const cardLast4 = typeof txn?.cardLast4 === "string" ? txn.cardLast4.trim() : "";
  if (/^\d{4}$/.test(cardLast4)) return cardLast4;

  const ref = typeof txn?.referenceId === "string" ? txn.referenceId.trim() : "";
  if (ref && ref.length <= 12) {
    const refDigits = /\b(\d{4})\b/.exec(ref)?.[1];
    if (refDigits && !/^19\d{2}$|^20\d{2}$/.test(refDigits)) return refDigits;
  }

  const text = String(txn?.normalizedDescription || txn?.rawDescription || "").toUpperCase();
  const matches = [...text.matchAll(/\b(\d{4})\b/g)].map((m) => m?.[1]).filter(Boolean);
  // Prefer the last 4-digit token (often acct last4). Avoid years.
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const token = matches[i];
    if (!token) continue;
    if (/^19\d{2}$|^20\d{2}$/.test(token)) continue;
    return token;
  }

  return "";
};

const recurringCommitmentSeriesKeyForTxn = (txn, { vendorKey, signed }) => {
  const recurringSeriesId = typeof txn?.recurringSeriesId === "string" ? txn.recurringSeriesId.trim() : "";
  if (recurringSeriesId) return `rs:${recurringSeriesId}`;

  const accountId = typeof txn?.accountId === "string" ? txn.accountId.trim() : "unknown";
  const direction = signed < 0 ? "out" : "in";
  const amountBucket = Math.round(Math.abs(Number(signed) || 0));
  const discriminator = extractRecurringSeriesDiscriminator(txn);
  if (discriminator) return `${vendorKey}:${accountId}:${direction}:${amountBucket}:${discriminator}`;

  // Fallback: split identical-looking same-day duplicates into stable slots.
  // This avoids collapsing two distinct commitments that share vendorKey+account+amount.
  const day = String(txn?.postedAt || "").slice(8, 10) || "??";
  return `${vendorKey}:${accountId}:${direction}:${amountBucket}:d${day}`;
};

const medianNonZero = (values) => {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Number(v) || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
};

// GET /hq/vendor-counts?orgId=...&vendorKeys=a,b,c&from=...&to=...&includeCategorized=1&accountId=...
const getVendorCounts = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const rawKeys = q.vendorKeys ? String(q.vendorKeys) : "";
  const vendorKeys = rawKeys
    .split(",")
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 120);
  if (!vendorKeys.length) return json(400, C, { error: "vendorKeys required" });

  const keySet = new Set(vendorKeys);
  const from = q.from ? String(q.from).trim() : "";
  const to = q.to ? String(q.to).trim() : "";
  const accountId = q.accountId ? String(q.accountId).trim() : "";
  const includeCategorized = String(q.includeCategorized || "1").trim() !== "0";

  const counts = {};
  for (const k of vendorKeys) counts[k] = 0;

  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      const postedAt = String(t.postedAt || "");
      if (from && postedAt && postedAt < from) continue;
      if (to && postedAt && postedAt > to) continue;
      if (accountId && t.accountId !== accountId) continue;
      if (!includeCategorized && !isUncategorizedTxn(t)) continue;

      const vendor = normalizeForMatching(t.vendor || t.counterparty || "");
      const key = normalizeVendorKey(vendor || t.rawDescription || t.normalizedDescription || "");
      if (!key || !keySet.has(key)) continue;
      counts[key] = (counts[key] || 0) + 1;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return json(200, C, { orgId, counts });
};

// GET /hq/vendor-matches?orgId=...&vendorKey=...&from=...&to=...&includeCategorized=1&accountId=...&cursor=...&limit=...
const getVendorMatches = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const vendorKey = q.vendorKey ? String(q.vendorKey).trim() : "";
  if (!vendorKey) return json(400, C, { error: "vendorKey required" });

  const from = q.from ? String(q.from).trim() : "0000-00-00";
  const to = q.to ? String(q.to).trim() : "9999-99-99";
  const accountId = q.accountId ? String(q.accountId).trim() : "";
  const includeCategorized = String(q.includeCategorized || "1").trim() !== "0";
  const limit = Math.min(parseInt(q.limit || "30", 10), 60);
  const exclusiveStartKey = decodeCursor(q.cursor);

  const start = `TXN#${from}`;
  const end = `TXN#${to}~`;

  const matches = [];
  let lastKey = exclusiveStartKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND sk BETWEEN :a AND :b",
      ExpressionAttributeValues: { ":o": orgId, ":a": start, ":b": end },
      ScanIndexForward: false,
      Limit: 250,
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      if (matches.length >= limit) break;
      if (accountId && t.accountId !== accountId) continue;
      if (!includeCategorized && !isUncategorizedTxn(t)) continue;

      const vendor = normalizeForMatching(t.vendor || t.counterparty || "");
      const key = normalizeVendorKey(vendor || t.rawDescription || t.normalizedDescription || "");
      if (!key || key !== vendorKey) continue;

      matches.push({
        orgId,
        accountId: t.accountId,
        postedAt: t.postedAt,
        authorizedAt: t.authorizedAt,
        amount: t.amount,
        currency: t.currency || "USD",
        rawDescription: t.rawDescription,
        normalizedDescription: t.normalizedDescription,
        type: t.type,
        direction: t.direction,
        vendor: t.vendor,
        counterparty: t.counterparty,
        locationCity: t.locationCity,
        locationState: t.locationState,
        cardLast4: t.cardLast4,
        referenceId: t.referenceId,
        categoryId: t.categoryId,
        categoryConfidence: t.categoryConfidence,
        isInternalTransfer: t.isInternalTransfer,
        projectId: t.projectId,
        importRunId: t.importRunId,
        dedupeHash: t.dedupeHash,
      });
    }

    lastKey = page.LastEvaluatedKey;
    if (!lastKey) break;
  } while (matches.length < limit);

  return json(200, C, { orgId, vendorKey, matches, cursor: encodeCursor(lastKey) });
};

const listCategoryRules = async (orgId) => {
  const res = await ddb.query({
    TableName: HQ_TABLE,
    KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":o": orgId, ":p": "RULE#" },
    ScanIndexForward: false,
  });

  return (res.Items || []).map((r) => ({
    orgId,
    ruleId: r.ruleId,
    priority: r.priority,
    matchType: r.matchType,
    pattern: r.pattern,
    categoryId: r.categoryId,
    projectId: r.projectId,
    scope: r.scope || "org",
    accountId: r.accountId,
    cardLast4: r.cardLast4,
    direction: r.direction,
    method: r.method,
    applyMode: r.applyMode,
    amountMin: r.amountMin,
    amountMax: r.amountMax,
    frequencyHint: r.frequencyHint,
    enabled: r.enabled !== false,
    createdAt: r.createdAt,
  }));
};

const inferMethod = (txn) => {
  const type = String(txn?.type || "").toLowerCase();
  const hasCard = Boolean(txn?.cardLast4) || type === "card_purchase";
  if (hasCard) return "card";
  if (type === "wire") return "wire";
  if (Boolean(txn?.isInternalTransfer)) return "transfer";
  if (type === "transfer" || type === "zelle") return "transfer";

  const d = String(txn?.normalizedDescription || txn?.rawDescription || "").toUpperCase();
  if (d.includes("CHECK")) return "check";

  if (type === "recurring") return "ach";
  if (type === "deposit") return "ach";

  return "ach";
};

const ensureSeedRulepack = async (orgId) => {
  const existing = await listCategoryRules(orgId);
  if (existing.length) return existing;

  const createdAt = nowISO();
  const writes = DEFAULT_RULEPACK.map((seed) => {
    const ruleId = uuidv4();
    return {
      PutRequest: {
        Item: {
          orgId,
          sk: skRule(ruleId),
          entityType: "categoryRule",
          ruleId,
          priority: seed.priority,
          matchType: "regex",
          pattern: seed.pattern,
          categoryId: seed.categoryId,
          scope: "org",
          enabled: true,
          createdAt,
        },
      },
    };
  });

  for (const batch of chunk(writes, 25)) {
    await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
  }

  return listCategoryRules(orgId);
};

const pickCategorization = (txn, rules) => {
  const normalizedDescription = normalizeForMatching(txn.normalizedDescription);
  // Use same fallback chain as vendor-counts/matches to ensure preview ↔ apply parity
  const vendorRaw = normalizeForMatching(txn.vendor || txn.counterparty || "");
  const vendorKey = normalizeVendorKey(vendorRaw || txn.rawDescription || txn.normalizedDescription || "");
  const isInternalTransfer = Boolean(txn.isInternalTransfer) || isLikelyInternalTransfer(txn);

  const currentCategory = normalizeForMatching(txn.currentCategory || txn.categoryId || "OTHER") || "OTHER";
  const amountAbs = Math.abs(typeof txn.amount === "number" ? txn.amount : Number(txn.amount || 0));
  const method = inferMethod(txn);

  const enabledRules = (Array.isArray(rules) ? rules : [])
    .filter((r) => r && r.enabled !== false)
    .slice()
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of enabledRules) {
    const applyMode = String(rule.applyMode || "uncategorized").toLowerCase();
    // Treat TRANSFER_INTERNAL like uncategorized so rules (e.g. Owner Draw) can override
    // heuristic internal-transfer detection.
    if (applyMode !== "overwrite" && currentCategory && currentCategory !== "OTHER" && currentCategory !== "TRANSFER_INTERNAL") continue;

    const dirGuard = typeof rule.direction === "string" ? rule.direction.trim().toLowerCase() : "";
    if (dirGuard === "in" || dirGuard === "out") {
      const tdir = String(txn.direction || "").toLowerCase();
      if (tdir !== dirGuard) continue;
    }

    const methodGuard = typeof rule.method === "string" ? rule.method.trim().toLowerCase() : "";
    if (methodGuard) {
      if (method !== methodGuard) continue;
    }

    const minAmt = Number.isFinite(Number(rule.amountMin)) ? Number(rule.amountMin) : null;
    const maxAmt = Number.isFinite(Number(rule.amountMax)) ? Number(rule.amountMax) : null;
    if (minAmt !== null && amountAbs < minAmt) continue;
    if (maxAmt !== null && amountAbs > maxAmt) continue;

    const scope = rule.scope || "org";
    if (scope === "account" && rule.accountId && txn.accountId !== rule.accountId) continue;
    if (scope === "card" && rule.cardLast4 && txn.cardLast4 !== rule.cardLast4) continue;

    if (rule.matchType === "vendor") {
      const patternKey = normalizeVendorKey(rule.pattern);
      if (vendorKey && patternKey && vendorKey === patternKey) {
        return { categoryId: rule.categoryId, categoryConfidence: 0.99, isInternalTransfer: false };
      }
      continue;
    }

    if (rule.matchType === "regex") {
      const pat = String(rule.pattern || "").trim();
      if (!pat || pat.length > 300) continue;
      try {
        const re = new RegExp(pat, "i");
        if (re.test(normalizedDescription) || (txn.vendor && re.test(txn.vendor))) {
          return { categoryId: rule.categoryId, categoryConfidence: 0.95, isInternalTransfer: false };
        }
      } catch {
        // ignore invalid regex
      }
    }
  }

  // Only after giving rules a chance do we lock it into transfer.
  if (isInternalTransfer) {
    return {
      isInternalTransfer: true,
      categoryId: "TRANSFER_INTERNAL",
      categoryConfidence: 0.95,
    };
  }

  return null;
};

/* ------------ Handlers ------------ */
const health = async (_e, C) => json(200, C, { ok: true, domain: "hq" });

const inferTxnDirection = (t) => {
  const type = typeof t?.type === "string" ? t.type.trim().toLowerCase() : "";
  const normalized = typeof t?.normalizedDescription === "string" ? t.normalizedDescription : "";

  if (type === "deposit") return "in";
  if (type === "card_purchase" || type === "recurring" || type === "fee") return "out";

  if (type === "transfer") {
    const m = /^ONLINE\s+TRANSFER\s+(TO|FROM)\b/i.exec(normalized);
    if (m?.[1]) return m[1].toUpperCase() === "TO" ? "out" : "in";
  }

  if (type === "zelle") {
    const m = /^ZELLE\s+(TO|FROM)\b/i.exec(normalized);
    if (m?.[1]) return m[1].toUpperCase() === "TO" ? "out" : "in";
  }

  const directionRaw = typeof t?.direction === "string" ? t.direction.trim().toLowerCase() : "";
  if (directionRaw === "in" || directionRaw === "out") return directionRaw;

  const amt = typeof t?.amount === "number" ? t.amount : Number(t?.amount);
  if (Number.isFinite(amt)) return amt >= 0 ? "in" : "out";
  return undefined;
};

const canonicalSignedAmount = (t) => {
  const amt = typeof t?.amount === "number" ? t.amount : Number(t?.amount);
  if (!Number.isFinite(amt)) return null;

  // If it's already negative, assume it's correctly signed.
  // This avoids flipping legitimately-signed inflows/outflows based on heuristic direction.
  if (amt < 0) return amt;

  const dir = inferTxnDirection(t);
  if (dir === "in") return Math.abs(amt);
  if (dir === "out") return -Math.abs(amt);
  return amt;
};

// GET /hq/top-categories?orgId=...&range=1W|1M|3M|YTD|1Y|ALL&limit=...&direction=out|in|net
const getTopCategories = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const rangeRaw = String(q.range || "1M").trim().toUpperCase();
  const range = ["1W", "1M", "3M", "YTD", "1Y", "ALL"].includes(rangeRaw) ? rangeRaw : "1M";

  const directionRaw = String(q.direction || "out").trim().toLowerCase();
  const direction = directionRaw === "in" ? "in" : directionRaw === "net" ? "net" : "out";

  const limit = parseLimitParam(q.limit, 8, 1, 12);

  const today = todayIsoInTimeZone();
  const fixedRangeDays =
    range === "1W" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : range === "1Y" ? 365 : null;

  let startDate = fixedRangeDays ? addDaysIso(today, -(fixedRangeDays - 1)) : null;
  if (range === "YTD") startDate = `${today.slice(0, 4)}-01-01`;

  if (range === "ALL") {
    const earliest = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ScanIndexForward: true,
      Limit: 1,
    });
    const first = (earliest.Items || [])[0];
    const posted = first?.postedAt ? String(first.postedAt).slice(0, 10) : "";
    startDate = posted || today;
  }

  startDate = startDate || today;
  const endDate = today;

  const totals = {};

  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":o": orgId,
        ":from": `TXN#${startDate}`,
        ":to": `TXN#${endDate}~`,
      },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      if (!t) continue;
      const postedAt = String(t.postedAt || "").slice(0, 10);
      if (!postedAt || postedAt < startDate || postedAt > endDate) continue;

      const signed = canonicalSignedAmount(t);
      if (typeof signed !== "number" || !Number.isFinite(signed) || signed === 0) continue;

      if (direction === "out" && signed >= 0) continue;
      if (direction === "in" && signed <= 0) continue;

      const categoryId = t.categoryId ? String(t.categoryId) : "OTHER";
      // Only exclude true transfer categories; do not drop user-categorized Owner Draw/etc
      // just because an upstream heuristic flagged the txn as an internal transfer.
      if (categoryId === "TRANSFERS" || categoryId === "TRANSFER_INTERNAL") continue;

      const add = direction === "out" ? Math.abs(signed) : direction === "in" ? signed : signed;
      totals[categoryId] = round2((totals[categoryId] || 0) + add);
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  const items = Object.entries(totals)
    .map(([categoryId, amount]) => ({ categoryId, amount: round2(amount) }))
    .filter((x) => Number.isFinite(x.amount) && x.amount !== 0)
    .sort((a, b) => {
      if (direction === "net") return Math.abs(b.amount) - Math.abs(a.amount);
      return b.amount - a.amount;
    })
    .slice(0, limit);

  return json(200, C, {
    orgId,
    range,
    direction,
    startDate,
    endDate,
    items,
  });
};

// GET /hq/recurring-commitments?orgId=...&months=...&limit=...&excludeInternalTransfers=1
const getRecurringCommitments = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const months = parseLimitParam(q.months, 3, 1, 12);
  const limit = parseLimitParam(q.limit, 8, 1, 12);
  const excludeInternalTransfers =
    String(q.excludeInternalTransfers ?? "1").trim() === "0" || String(q.excludeInternalTransfers ?? "").toLowerCase() === "false"
      ? false
      : true;

  const today = todayIsoInTimeZone();
  const currentMonth = monthKey(today);
  const keys = [];
  for (let i = 1; i <= months; i += 1) keys.push(addMonths(currentMonth, -i));
  const monthKeys = keys.filter(Boolean).sort();
  const earliest = monthKeys[0] || currentMonth;
  const latest = monthKeys[monthKeys.length - 1] || currentMonth;
  const startDate = firstDayOfMonth(earliest);
  const endDate = lastDayOfMonth(latest) || today;

  const bySeriesKey = {};
  const slotCountsByDayKey = {};

  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":o": orgId,
        ":from": `TXN#${startDate}`,
        ":to": `TXN#${endDate}~`,
      },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      if (!t) continue;
      const postedAt = String(t.postedAt || "").slice(0, 10);
      if (!postedAt || postedAt < startDate || postedAt > endDate) continue;
      const month = monthKey(postedAt);
      if (!monthKeys.includes(month)) continue;

      // Only confirmed recurring commitments count toward burn/runway.
      // Import hints like "RECURRING PAYMENT ..." should NOT be treated as truth.
      if (t.isRecurring !== true) continue;

      if (excludeInternalTransfers) {
        const categoryId = t.categoryId ? String(t.categoryId) : "OTHER";
        // Exclude only true transfer categories; do not drop user-categorized Owner Draw/etc
        // just because an upstream heuristic flagged the txn as an internal transfer.
        if (categoryId === "TRANSFERS" || categoryId === "TRANSFER_INTERNAL") continue;
      }

      const signed = canonicalSignedAmount(t);
      if (typeof signed !== "number" || !Number.isFinite(signed) || signed >= 0) continue;

      const amt = Math.abs(signed);
      const { vendorLabel, vendorKey } = getVendorKeyForTxn(t);
      let seriesKey = recurringCommitmentSeriesKeyForTxn(t, { vendorKey, signed });
      // Split same-day duplicates into distinct slot series even if a discriminator exists.
      // This prevents two identical-looking recurring streams (e.g. 2 × $2,000 Owner Draw on the 12th)
      // from collapsing into one row.
      if (!String(t?.recurringSeriesId || "").trim()) {
        const daySlotKey = `${postedAt}|${seriesKey}`;
        slotCountsByDayKey[daySlotKey] = (slotCountsByDayKey[daySlotKey] || 0) + 1;
        const slot = slotCountsByDayKey[daySlotKey];
        seriesKey = `${seriesKey}:slot${slot}`;
      }
      if (!bySeriesKey[seriesKey]) {
        bySeriesKey[seriesKey] = { seriesKey, vendorKey, labelCounts: {}, categoryCounts: {}, byMonth: {} };
      }
      const entry = bySeriesKey[seriesKey];
      entry.byMonth[month] = round2((entry.byMonth[month] || 0) + amt);
      entry.labelCounts[vendorLabel] = (entry.labelCounts[vendorLabel] || 0) + 1;
      const categoryId = t.categoryId ? String(t.categoryId) : "OTHER";
      entry.categoryCounts[categoryId] = (entry.categoryCounts[categoryId] || 0) + 1;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  const all = Object.values(bySeriesKey).map((entry) => {
    // “/mo” should mean “typical month for this series”, not an average diluted by missing months.
    const amountMonthly = round2(medianNonZero(monthKeys.map((m) => entry.byMonth[m] || 0)));
    const label =
      Object.entries(entry.labelCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
        .find(Boolean) || "Unknown";
    const categoryId =
      Object.entries(entry.categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .find(Boolean) || "OTHER";
    return { seriesKey: entry.seriesKey, vendorKey: entry.vendorKey, label, categoryId, amountMonthly };
  });

  const mandatoryMonthlyBurn = round2(all.reduce((acc, x) => acc + (x.amountMonthly || 0), 0));
  const items = all
    .filter((x) => Number.isFinite(x.amountMonthly) && x.amountMonthly > 0)
    .sort((a, b) => b.amountMonthly - a.amountMonthly)
    .slice(0, limit);

  return json(200, C, {
    orgId,
    months,
    startDate,
    endDate,
    excludeInternalTransfers,
    mandatoryMonthlyBurn,
    items,
  });
};

const queryAllByPrefix = async ({ orgId, prefix }) => {
  const items = [];
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": prefix },
      ExclusiveStartKey: lastKey,
    });
    for (const item of page.Items || []) items.push(item);
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
};

const queryAllBetween = async ({ orgId, fromSk, toSk, scanIndexForward }) => {
  const items = [];
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND sk BETWEEN :a AND :b",
      ExpressionAttributeValues: { ":o": orgId, ":a": fromSk, ":b": toSk },
      ScanIndexForward: typeof scanIndexForward === "boolean" ? scanIndexForward : true,
      ExclusiveStartKey: lastKey,
    });
    for (const item of page.Items || []) items.push(item);
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
};

const hasAnyByPrefix = async ({ orgId, prefix }) => {
  const res = await ddb.query({
    TableName: HQ_TABLE,
    KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":o": orgId, ":p": prefix },
    ScanIndexForward: true,
    Limit: 1,
  });
  return Boolean((res.Items || []).length);
};

const deleteByPrefix = async ({ orgId, prefix }) => {
  let deleted = 0;
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": prefix },
      ExclusiveStartKey: lastKey,
    });

    const deletes = (page.Items || []).map((it) => ({ DeleteRequest: { Key: { orgId, sk: it.sk } } }));
    for (const batch of chunk(deletes, 25)) {
      await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
      deleted += batch.length;
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return deleted;
};

const computeAccountBalanceFromLedger = async ({ orgId, accountId, anchorDate, anchorBalance, today }) => {
  if (!anchorDate || typeof anchorBalance !== "number" || !Number.isFinite(anchorBalance)) return null;
  const from = addDaysIso(anchorDate, 1);
  if (from > today) return round2(anchorBalance);

  const rows = await queryAllBetween({
    orgId,
    fromSk: skLedgerDayAccount(accountId, from),
    toSk: skLedgerDayAccount(accountId, today),
    scanIndexForward: true,
  });

  let net = 0;
  for (const r of rows) {
    const inflow = typeof r.inflow === "number" ? r.inflow : Number(r.inflow);
    const outflow = typeof r.outflow === "number" ? r.outflow : Number(r.outflow);
    net += (Number.isFinite(inflow) ? inflow : 0) - (Number.isFinite(outflow) ? outflow : 0);
  }
  return round2(anchorBalance + net);
};

const recomputeHqHeaderFromLedger = async ({ orgId, nowIso }) => {
  const today = todayIsoInTimeZone();

  const allAccounts = await queryAllByPrefix({ orgId, prefix: "ACCOUNT#" });
  const includedAccounts = (allAccounts || []).filter((a) => !a.archivedAt && a.includeInCashOnHand !== false);

  const missingAnchorAccountIds = includedAccounts
    .filter((a) => !(a.anchorDate && typeof a.anchorBalance === "number"))
    .map((a) => a.accountId)
    .filter(Boolean);

  let cashOnHandAggregate = null;
  const anchoredIncluded = includedAccounts.filter((a) => a.anchorDate && typeof a.anchorBalance === "number");
  if (anchoredIncluded.length) {
    let total = 0;
    for (const a of anchoredIncluded) {
      const currentBalance = typeof a.currentBalance === "number" ? a.currentBalance : null;
      if (typeof currentBalance === "number" && Number.isFinite(currentBalance)) {
        total += currentBalance;
        continue;
      }
      const computed = await computeAccountBalanceFromLedger({
        orgId,
        accountId: a.accountId,
        anchorDate: String(a.anchorDate).slice(0, 10),
        anchorBalance: Number(a.anchorBalance),
        today,
      });
      if (typeof computed === "number" && Number.isFinite(computed)) total += computed;
    }
    cashOnHandAggregate = round2(total);
  }

  const yearStart = `${today.slice(0, 4)}-01-01`;
  const ytdRows = await queryAllBetween({ orgId, fromSk: skLedgerDay(yearStart), toSk: skLedgerDay(today), scanIndexForward: true });

  let ytdInflow = 0;
  let ytdOutflow = 0;
  for (const r of ytdRows) {
    const inflow = typeof r.inflow === "number" ? r.inflow : Number(r.inflow);
    const outflow = typeof r.outflow === "number" ? r.outflow : Number(r.outflow);
    ytdInflow += Number.isFinite(inflow) ? inflow : 0;
    ytdOutflow += Number.isFinite(outflow) ? outflow : 0;
  }
  ytdInflow = round2(ytdInflow);
  ytdOutflow = round2(ytdOutflow);
  const ytdNet = round2(ytdInflow - ytdOutflow);

  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const currentMonthStartDate = isoToDate(currentMonthStart);
  currentMonthStartDate.setUTCMonth(currentMonthStartDate.getUTCMonth() - 3);
  const trailingStart = dateToIso(currentMonthStartDate);
  const trailingEnd = addDaysIso(currentMonthStart, -1);

  let trailing3FullMonthsOutflow = 0;
  if (trailingStart <= trailingEnd) {
    const trailingRows = await queryAllBetween({
      orgId,
      fromSk: skLedgerDay(trailingStart),
      toSk: skLedgerDay(trailingEnd),
      scanIndexForward: true,
    });
    for (const r of trailingRows) {
      const outflow = typeof r.outflow === "number" ? r.outflow : Number(r.outflow);
      trailing3FullMonthsOutflow += Number.isFinite(outflow) ? outflow : 0;
    }
  }
  trailing3FullMonthsOutflow = round2(trailing3FullMonthsOutflow);

  const header = {
    orgId,
    sk: skHqHeader(),
    entityType: "hqHeader",
    updatedAt: nowIso,
    ledgerVersion: HQ_LEDGER_VERSION,
    cashOnHandAggregate,
    missingAnchorAccountIds,
    ytdInflow,
    ytdOutflow,
    ytdNet,
    trailing3FullMonthsOutflow,
  };

  await ddb.put({ TableName: HQ_TABLE, Item: header });
  return header;
};

const updateLedgerFromImportedTxns = async ({ orgId, accountId, txns, account, nowIso }) => {
  const dayOrg = new Map();
  const dayAcct = new Map();
  let deltaAfterAnchor = 0;

  const includeInAggregateLedger = Boolean(account) && !account?.archivedAt && account?.includeInCashOnHand !== false;

  const anchorDate = account?.anchorDate ? String(account.anchorDate).slice(0, 10) : "";
  const hasAnchor = anchorDate && typeof account?.anchorBalance === "number";

  for (const t of txns) {
    const postedAt = String(t.postedAt || "").slice(0, 10);
    if (!postedAt) continue;

    const signed = canonicalSignedAmount(t);
    if (typeof signed !== "number" || !Number.isFinite(signed)) continue;

    const inflow = signed > 0 ? signed : 0;
    const outflow = signed < 0 ? Math.abs(signed) : 0;

    if (includeInAggregateLedger) {
      const o = dayOrg.get(postedAt) || { inflow: 0, outflow: 0, txCount: 0 };
      o.inflow += inflow;
      o.outflow += outflow;
      o.txCount += 1;
      dayOrg.set(postedAt, o);
    }

    const a = dayAcct.get(postedAt) || { inflow: 0, outflow: 0, txCount: 0 };
    a.inflow += inflow;
    a.outflow += outflow;
    a.txCount += 1;
    dayAcct.set(postedAt, a);

    if (hasAnchor && postedAt > anchorDate) deltaAfterAnchor += signed;
  }

  const updates = [];
  for (const [date, agg] of dayOrg.entries()) {
    updates.push(() =>
      ddb.update({
        TableName: HQ_TABLE,
        Key: { orgId, sk: skLedgerDay(date) },
        UpdateExpression:
          "SET entityType = if_not_exists(entityType, :et), date = if_not_exists(date, :d), updatedAt = :u " +
          "ADD inflow :in, outflow :out, txCount :n",
        ExpressionAttributeValues: {
          ":et": "hqLedgerDay",
          ":d": date,
          ":u": nowIso,
          ":in": round2(agg.inflow),
          ":out": round2(agg.outflow),
          ":n": agg.txCount,
        },
      })
    );
  }

  for (const [date, agg] of dayAcct.entries()) {
    updates.push(() =>
      ddb.update({
        TableName: HQ_TABLE,
        Key: { orgId, sk: skLedgerDayAccount(accountId, date) },
        UpdateExpression:
          "SET entityType = if_not_exists(entityType, :et), date = if_not_exists(date, :d), accountId = if_not_exists(accountId, :a), updatedAt = :u " +
          "ADD inflow :in, outflow :out, txCount :n",
        ExpressionAttributeValues: {
          ":et": "hqLedgerDayAccount",
          ":d": date,
          ":a": accountId,
          ":u": nowIso,
          ":in": round2(agg.inflow),
          ":out": round2(agg.outflow),
          ":n": agg.txCount,
        },
      })
    );
  }

  for (const batch of chunk(updates, 25)) {
    await Promise.all(batch.map((fn) => fn()));
  }

  if (hasAnchor && Number.isFinite(deltaAfterAnchor)) {
    await ddb.update({
      TableName: HQ_TABLE,
      Key: { orgId, sk: skAccount(accountId) },
      UpdateExpression: "SET currentBalance = if_not_exists(currentBalance, :init) + :d, updatedAt = :u",
      ExpressionAttributeValues: {
        ":init": Number(account.anchorBalance),
        ":d": round2(deltaAfterAnchor),
        ":u": nowIso,
      },
    });
  }
};

const rebuildLedgerAndHeaderFromTxns = async ({ orgId, deleteExistingLedger = false }) => {
  const nowIso = nowISO();

  if (deleteExistingLedger) {
    await deleteByPrefix({ orgId, prefix: "LEDGER#" });
    await deleteByPrefix({ orgId, prefix: "LEDGERA#" });
    await ddb.delete({ TableName: HQ_TABLE, Key: { orgId, sk: skHqHeader() } }).catch(() => {});
  }

  const accounts = await queryAllByPrefix({ orgId, prefix: "ACCOUNT#" });

  // Aggregate cash series should reflect only accounts included in cash-on-hand.
  // Account-specific series (LEDGERA#) remains complete regardless of inclusion.
  const includedAccountIds = new Set(
    (accounts || [])
      .filter((a) => a && !a.archivedAt && a.includeInCashOnHand !== false)
      .map((a) => a.accountId)
      .filter(Boolean)
  );
  const anchorByAccountId = new Map(
    (accounts || [])
      .filter((a) => a && a.accountId && a.anchorDate && typeof a.anchorBalance === "number")
      .map((a) => [
        a.accountId,
        {
          anchorDate: String(a.anchorDate).slice(0, 10),
          anchorBalance: Number(a.anchorBalance),
        },
      ])
  );

  const deltaAfterAnchorByAccountId = new Map(Array.from(anchorByAccountId.keys()).map((id) => [id, 0]));

  const dayOrg = new Map();
  const dayAcct = new Map(); // accountId -> Map(date -> agg)

  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      const postedAt = String(t?.postedAt || "").slice(0, 10);
      if (!postedAt) continue;

      const acctId = String(t?.accountId || "").trim();
      if (!acctId) continue;

      const signed = canonicalSignedAmount(t);
      if (typeof signed !== "number" || !Number.isFinite(signed)) continue;

      const inflow = signed > 0 ? signed : 0;
      const outflow = signed < 0 ? Math.abs(signed) : 0;

      if (includedAccountIds.has(acctId)) {
        const o = dayOrg.get(postedAt) || { inflow: 0, outflow: 0, txCount: 0 };
        o.inflow += inflow;
        o.outflow += outflow;
        o.txCount += 1;
        dayOrg.set(postedAt, o);
      }

      const m = dayAcct.get(acctId) || new Map();
      const a = m.get(postedAt) || { inflow: 0, outflow: 0, txCount: 0 };
      a.inflow += inflow;
      a.outflow += outflow;
      a.txCount += 1;
      m.set(postedAt, a);
      dayAcct.set(acctId, m);

      const anchor = anchorByAccountId.get(acctId);
      if (anchor && postedAt > anchor.anchorDate) {
        deltaAfterAnchorByAccountId.set(acctId, (deltaAfterAnchorByAccountId.get(acctId) || 0) + signed);
      }
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  const puts = [];
  for (const [date, agg] of dayOrg.entries()) {
    puts.push({
      PutRequest: {
        Item: {
          orgId,
          sk: skLedgerDay(date),
          entityType: "hqLedgerDay",
          date,
          inflow: round2(agg.inflow),
          outflow: round2(agg.outflow),
          txCount: agg.txCount,
          updatedAt: nowIso,
        },
      },
    });
  }

  for (const [acctId, m] of dayAcct.entries()) {
    for (const [date, agg] of m.entries()) {
      puts.push({
        PutRequest: {
          Item: {
            orgId,
            sk: skLedgerDayAccount(acctId, date),
            entityType: "hqLedgerDayAccount",
            date,
            accountId: acctId,
            inflow: round2(agg.inflow),
            outflow: round2(agg.outflow),
            txCount: agg.txCount,
            updatedAt: nowIso,
          },
        },
      });
    }
  }

  for (const batch of chunk(puts, 25)) {
    await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
  }

  // Recompute account currentBalance from anchors + txns.
  for (const [acctId, delta] of deltaAfterAnchorByAccountId.entries()) {
    const anchor = anchorByAccountId.get(acctId);
    if (!anchor) continue;
    const nextBalance = round2(anchor.anchorBalance + round2(delta));
    await ddb.update({
      TableName: HQ_TABLE,
      Key: { orgId, sk: skAccount(acctId) },
      UpdateExpression: "SET currentBalance = :b, updatedAt = :u",
      ExpressionAttributeValues: { ":b": nextBalance, ":u": nowIso },
    });
  }

  await recomputeHqHeaderFromLedger({ orgId, nowIso });
};

const ensureHqHeader = async ({ orgId }) => {
  const hdr = await ddb.get({ TableName: HQ_TABLE, Key: { orgId, sk: skHqHeader() } });
  const existing = hdr?.Item || null;
  const existingVersion = existing && typeof existing.ledgerVersion === "number" ? existing.ledgerVersion : 0;
  if (existing && existingVersion >= HQ_LEDGER_VERSION) return existing;

  const nowIso = nowISO();
  const ledgerExists = await hasAnyByPrefix({ orgId, prefix: "LEDGER#" });
  if (!ledgerExists) {
    await rebuildLedgerAndHeaderFromTxns({ orgId, deleteExistingLedger: false });
  } else {
    // If derived aggregate ledger was built with an older derivation, rebuild it.
    if (existing && existingVersion < HQ_LEDGER_VERSION) {
      await rebuildLedgerAndHeaderFromTxns({ orgId, deleteExistingLedger: true });
    } else {
      await recomputeHqHeaderFromLedger({ orgId, nowIso });
    }
  }

  const hdr2 = await ddb.get({ TableName: HQ_TABLE, Key: { orgId, sk: skHqHeader() } });
  return hdr2?.Item || null;
};

// GET /hq/balance-series?orgId=...&accountId=...&days=365
// Returns end-of-day balance points from (anchorDate - days) .. anchorDate (inclusive), oldest -> newest.
// Anchor is treated as end-of-day for anchorDate.
const getBalanceSeries = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const accountId = typeof q.accountId === "string" ? q.accountId.trim() : "";
  if (!accountId) return json(400, C, { error: "accountId required" });

  const daysRaw = typeof q.days === "string" ? q.days.trim() : "365";
  const days = Math.min(3660, Math.max(1, parseInt(daysRaw || "365", 10)));
  if (!Number.isFinite(days)) return json(400, C, { error: "days must be an integer" });

  // Load the account (and its anchor).
  const accountsRes = await ddb.query({
    TableName: HQ_TABLE,
    KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":o": orgId, ":p": "ACCOUNT#" },
  });

  const account = (accountsRes.Items || []).find((a) => a && a.accountId === accountId) || null;
  if (!account) throw httpError(404, "Not found");

  const anchorDate = String(account.anchorDate || "").slice(0, 10);
  const anchorBalance = typeof account.anchorBalance === "number" ? Number(account.anchorBalance) : null;

  if (!anchorDate || typeof anchorBalance !== "number" || !Number.isFinite(anchorBalance)) {
    return json(400, C, { error: "Account is missing anchorDate/anchorBalance" });
  }

  const endDate = anchorDate;
  const startDate = addDaysIso(endDate, -days);

  const netByDate = {};

  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":o": orgId,
        ":from": `TXN#${startDate}`,
        ":to": `TXN#${endDate}~`,
      },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      if (!t || t.accountId !== accountId) continue;
      // Transfers still change cash/balances (e.g. card payments, moves to non-included accounts).
      // Only exclude transfers from spend analytics, not balance math.
      const postedAt = String(t.postedAt || "").slice(0, 10);
      if (!postedAt || postedAt < startDate || postedAt > endDate) continue;

      const signedAmt = canonicalSignedAmount(t);
      if (typeof signedAmt !== "number" || !Number.isFinite(signedAmt) || signedAmt === 0) continue;
      netByDate[postedAt] = (netByDate[postedAt] || 0) + signedAmt;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  const dates = [];
  for (let d = startDate; d <= endDate; d = addDaysIso(d, 1)) dates.push(d);

  const balanceOn = {};
  balanceOn[endDate] = Math.round(anchorBalance * 100) / 100;

  for (let i = dates.length - 2; i >= 0; i -= 1) {
    const nextDay = dates[i + 1];
    const netNextDay = netByDate[nextDay] || 0;
    balanceOn[dates[i]] = Math.round((balanceOn[nextDay] - netNextDay) * 100) / 100;
  }

  const points = dates.map((d) => ({ date: d, balance: balanceOn[d] ?? 0 }));

  return json(200, C, {
    accountId,
    currency: "USD",
    anchorDate,
    anchorBalance: Math.round(anchorBalance * 100) / 100,
    days,
    points,
  });
};

// GET /hq/chart-series?orgId=...&scope=aggregate|account&accountId=...&range=1W|1M|3M|1Y|ALL
const getChartSeries = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const scopeRaw = String(q.scope || "aggregate").trim().toLowerCase();
  const scope = scopeRaw === "account" ? "account" : "aggregate";
  const rangeRaw = String(q.range || "1M").trim().toUpperCase();
  const range = ["1W", "1M", "3M", "YTD", "1Y", "ALL"].includes(rangeRaw) ? rangeRaw : "1M";

  const today = todayIsoInTimeZone();
  const accountIdParam = typeof q.accountId === "string" ? q.accountId.trim() : "";

  // Ensure derived state exists (ledger/header) on first read.
  if (!(await hasAnyByPrefix({ orgId, prefix: "LEDGER#" }))) {
    await rebuildLedgerAndHeaderFromTxns({ orgId, deleteExistingLedger: false });
  }

  const anchorDate = today;

  const fixedRangeDays =
    range === "1W" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : range === "1Y" ? 365 : null;

  let startDate = fixedRangeDays ? addDaysIso(today, -(fixedRangeDays - 1)) : null;

  if (range === "YTD") {
    startDate = `${today.slice(0, 4)}-01-01`;
  }

  if (range === "ALL") {
    if (scope === "account") {
      if (!accountIdParam) return json(400, C, { error: "accountId required for scope=account" });
      const earliest = await ddb.query({
        TableName: HQ_TABLE,
        KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":o": orgId, ":p": `LEDGERA#${accountIdParam}#` },
        ScanIndexForward: true,
        Limit: 1,
      });
      const first = (earliest.Items || [])[0];
      startDate = first?.date ? String(first.date).slice(0, 10) : (first?.sk ? String(first.sk).split("#").slice(-1)[0] : today);
    } else {
      const earliest = await ddb.query({
        TableName: HQ_TABLE,
        KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":o": orgId, ":p": "LEDGER#" },
        ScanIndexForward: true,
        Limit: 1,
      });
      const first = (earliest.Items || [])[0];
      startDate = first?.date ? String(first.date).slice(0, 10) : (first?.sk ? String(first.sk).split("#").slice(-1)[0] : today);
    }
  }

  startDate = startDate || today;

  let anchorBalance;
  if (scope === "aggregate") {
    const hdr = await ensureHqHeader({ orgId });
    anchorBalance = typeof hdr?.cashOnHandAggregate === "number" ? hdr.cashOnHandAggregate : 0;
  } else {
    if (!accountIdParam) return json(400, C, { error: "accountId required for scope=account" });
    const acctRes = await ddb.get({ TableName: HQ_TABLE, Key: { orgId, sk: skAccount(accountIdParam) } });
    const acct = acctRes?.Item;
    if (!acct) throw httpError(404, "Not found");

    if (typeof acct.currentBalance === "number" && Number.isFinite(acct.currentBalance)) {
      anchorBalance = round2(acct.currentBalance);
    } else if (acct.anchorDate && typeof acct.anchorBalance === "number") {
      const computed = await computeAccountBalanceFromLedger({
        orgId,
        accountId: accountIdParam,
        anchorDate: String(acct.anchorDate).slice(0, 10),
        anchorBalance: Number(acct.anchorBalance),
        today,
      });
      anchorBalance = typeof computed === "number" ? computed : 0;
    } else {
      return json(400, C, { error: "Account is missing currentBalance and anchorDate/anchorBalance" });
    }
  }

  const inflowByDate = {};
  const outflowByDate = {};

  const fromSk =
    scope === "aggregate"
      ? skLedgerDay(startDate)
      : skLedgerDayAccount(accountIdParam, startDate);
  const toSk =
    scope === "aggregate"
      ? skLedgerDay(today)
      : skLedgerDayAccount(accountIdParam, today);

  const rows = await queryAllBetween({ orgId, fromSk, toSk, scanIndexForward: true });
  for (const r of rows) {
    const date = String(r.date || "").slice(0, 10) || String(r.sk || "").split("#").slice(-1)[0];
    if (!date) continue;
    const inflow = typeof r.inflow === "number" ? r.inflow : Number(r.inflow);
    const outflow = typeof r.outflow === "number" ? r.outflow : Number(r.outflow);
    inflowByDate[date] = round2(inflowByDate[date] || 0) + (Number.isFinite(inflow) ? inflow : 0);
    outflowByDate[date] = round2(outflowByDate[date] || 0) + (Number.isFinite(outflow) ? outflow : 0);
  }

  const points = [];
  for (let d = startDate; d <= today; d = addDaysIso(d, 1)) {
    const inflow = round2(inflowByDate[d] || 0);
    const outflow = round2(outflowByDate[d] || 0);
    points.push({ date: d, inflow, outflow, balance: 0 });
  }

  if (points.length) {
    points[points.length - 1].balance = round2(anchorBalance);
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const next = points[i + 1];
      const netNext = (next.inflow || 0) - (next.outflow || 0);
      points[i].balance = round2(next.balance - netNext);
    }
  }

  const totals = points.reduce(
    (acc, p) => {
      acc.inflow += p.inflow;
      acc.outflow += p.outflow;
      return acc;
    },
    { inflow: 0, outflow: 0 }
  );
  totals.inflow = round2(totals.inflow);
  totals.outflow = round2(totals.outflow);
  const net = round2(totals.inflow - totals.outflow);

  return json(200, C, {
    scope,
    accountId: scope === "account" ? accountIdParam : undefined,
    range,
    currency: "USD",
    anchorDate,
    anchorBalance: round2(anchorBalance),
    points,
    totals: {
      inflow: totals.inflow,
      outflow: totals.outflow,
      net,
    },
  });
};

// GET /hq/summary?orgId=...
const getSummary = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  const membership = await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const accountsRes = await ddb.query({
    TableName: HQ_TABLE,
    KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":o": orgId, ":p": "ACCOUNT#" },
    ScanIndexForward: false,
  });

  const importRunsRes = await ddb.query({
    TableName: HQ_TABLE,
    KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":o": orgId, ":p": "IMPORT#" },
    ScanIndexForward: false,
    Limit: 25,
  });

  const accounts = (accountsRes.Items || []).map((a) => ({
    orgId,
    accountId: a.accountId,
    name: a.name || a.accountName,
    accountName: a.accountName,
    institution: a.institution,
    currency: a.currency || "USD",
    accountMask: a.accountMask,
    notes: a.notes,
    anchorDate: a.anchorDate,
    anchorBalance: a.anchorBalance,
    currentBalance: typeof a.currentBalance === "number" ? a.currentBalance : null,
    includeInCashOnHand: a.includeInCashOnHand !== false,
    archivedAt: a.archivedAt || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt || a.createdAt,
  }));

  const importRuns = (importRunsRes.Items || []).map((r) => ({
    orgId,
    importRunId: r.importRunId,
    accountId: r.accountId,
    filename: r.filename,
    rowCount: r.rowCount,
    importedCount: r.importedCount,
    duplicateCount: r.duplicateCount,
    status: r.status,
    warnings: Array.isArray(r.warnings) ? r.warnings : undefined,
    createdAt: r.createdAt,
  }));

  const importWarnings = Array.from(
    new Set(
      importRuns
        .flatMap((r) => (Array.isArray(r.warnings) ? r.warnings : []))
        .filter(Boolean)
    )
  );

  const categoryRules = await ensureSeedRulepack(orgId);

  // Read the precomputed header; if missing, recompute-on-read once.
  const header = await ensureHqHeader({ orgId });
  const cashOnHandAggregate = typeof header?.cashOnHandAggregate === "number" ? header.cashOnHandAggregate : null;
  const missingAnchorAccountIds = Array.isArray(header?.missingAnchorAccountIds) ? header.missingAnchorAccountIds : [];

  return json(200, C, {
    orgId,
    orgRole: membership.role,
    accounts,
    importRuns,
    importWarnings,
    categoryRules,
    cashOnHandAggregate,
    missingAnchorAccountIds,
  });
};

// POST /hq/recompute?orgId=... (admin-only)
const recomputeHq = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  await rebuildLedgerAndHeaderFromTxns({ orgId, deleteExistingLedger: true });
  const header = await ddb.get({ TableName: HQ_TABLE, Key: { orgId, sk: skHqHeader() } });
  return json(200, C, { ok: true, orgId, header: header?.Item || null });
};

// GET /hq/category-rules?orgId=...
const getCategoryRules = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const rules = await ensureSeedRulepack(orgId);
  return json(200, C, { orgId, categoryRules: rules });
};

// POST /hq/category-rules?orgId=...
const createCategoryRule = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const matchType = body.matchType === "regex" ? "regex" : "vendor";
  const pattern = normalizeForMatching(body.pattern);
  const categoryId = normalizeForMatching(body.categoryId);
  const enabled = body.enabled !== false;
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 200;

  const scopeRaw = typeof body.scope === "string" ? body.scope.trim().toLowerCase() : "org";
  const scope = scopeRaw === "account" ? "account" : scopeRaw === "card" ? "card" : "org";
    const directionRaw = typeof body.direction === "string" ? body.direction.trim().toLowerCase() : "";
    const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : undefined;

    const methodRaw = typeof body.method === "string" ? body.method.trim().toLowerCase() : "";
    const method =
      methodRaw === "ach" || methodRaw === "card" || methodRaw === "wire" || methodRaw === "check" || methodRaw === "transfer"
        ? methodRaw
        : undefined;

    const applyModeRaw = typeof body.applyMode === "string" ? body.applyMode.trim().toLowerCase() : "uncategorized";
    const applyMode = applyModeRaw === "overwrite" ? "overwrite" : "uncategorized";

    const amountMin = Number.isFinite(Number(body.amountMin)) ? Number(body.amountMin) : undefined;
    const amountMax = Number.isFinite(Number(body.amountMax)) ? Number(body.amountMax) : undefined;
    if (amountMin !== undefined && amountMin < 0) return json(400, C, { error: "amountMin must be >= 0" });
    if (amountMax !== undefined && amountMax < 0) return json(400, C, { error: "amountMax must be >= 0" });
    if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) {
      return json(400, C, { error: "amountMin must be <= amountMax" });
    }

    const frequencyHintRaw = typeof body.frequencyHint === "string" ? body.frequencyHint.trim().toLowerCase() : "";
    const frequencyHint =
      frequencyHintRaw === "weekly" || frequencyHintRaw === "biweekly" || frequencyHintRaw === "monthly" || frequencyHintRaw === "other"
        ? frequencyHintRaw
        : undefined;

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const cardLast4 = typeof body.cardLast4 === "string" ? body.cardLast4.trim() : "";

  if (!pattern) return json(400, C, { error: "pattern required" });
  if (!categoryId) return json(400, C, { error: "categoryId required" });
  if (scope === "account" && !accountId) return json(400, C, { error: "accountId required for scope=account" });
  if (scope === "card" && !/^\d{4}$/.test(cardLast4)) return json(400, C, { error: "cardLast4 required for scope=card" });
  if (matchType === "regex") {
    if (pattern.length > 300) return json(400, C, { error: "pattern too long" });
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern, "i");
    } catch {
      return json(400, C, { error: "invalid regex" });
    }
  }

  const ruleId = uuidv4();
  const createdAt = nowISO();
  const item = {
    orgId,
    sk: skRule(ruleId),
    entityType: "categoryRule",
    ruleId,
    priority,
    matchType,
    pattern,
    categoryId,
    projectId: typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined,
    scope,
    accountId: scope === "account" ? accountId : undefined,
    cardLast4: scope === "card" ? cardLast4 : undefined,
    direction,
    method,
    applyMode,
    amountMin,
    amountMax,
    frequencyHint,
    enabled,
    createdAt,
  };

  await ddb.put({ TableName: HQ_TABLE, Item: item });
  return json(200, C, { orgId, rule: item });
};

// DELETE /hq/category-rules/:ruleId?orgId=...
const deleteCategoryRule = async (e, C, { ruleId }) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  ruleId = String(ruleId || "").trim();
  if (!ruleId) return json(400, C, { error: "ruleId required" });

  await ddb.delete({ TableName: HQ_TABLE, Key: { orgId, sk: skRule(ruleId) } });
  return json(200, C, { ok: true });
};

// POST /hq/category-rules/apply?orgId=...
const applyCategoryRules = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const importRunId = typeof body.importRunId === "string" ? body.importRunId.trim() : "";
  const ruleIds = Array.isArray(body.ruleIds)
    ? body.ruleIds.map((x) => String(x || "").trim()).filter(Boolean)
    : null;
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";

  const allRules = await ensureSeedRulepack(orgId);
  const rules = ruleIds ? allRules.filter((r) => ruleIds.includes(r.ruleId)) : allRules;

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let skippedAlreadyCategorized = 0;
  let skippedNoChange = 0;
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      scanned += 1;
      const postedAt = String(t.postedAt || "");
      if (from && postedAt && postedAt < from) continue;
      if (to && postedAt && postedAt > to) continue;
      if (accountId && t.accountId !== accountId) continue;
      if (importRunId && t.importRunId !== importRunId) continue;

      const currentCategory = t.categoryId || "OTHER";
      const currentIsTransfer = Boolean(t.isInternalTransfer);
      const pick = pickCategorization(
        {
          rawDescription: t.rawDescription,
          normalizedDescription: t.normalizedDescription,
          vendor: t.vendor,
          counterparty: t.counterparty,
          type: t.type,
          direction: t.direction,
          amount: t.amount,
          isInternalTransfer: currentIsTransfer,
          accountId: t.accountId,
          cardLast4: t.cardLast4,
          currentCategory,
        },
        rules
      );
      if (!pick) continue;

      matched += 1;
      const nextCategory = pick.categoryId;
      const nextConfidence = pick.categoryConfidence;
      const nextTransfer = Boolean(pick.isInternalTransfer);

      if (
        currentCategory === nextCategory &&
        Number(t.categoryConfidence || 0) >= Number(nextConfidence || 0) &&
        currentIsTransfer === nextTransfer
      ) {
        skippedNoChange += 1;
        continue;
      }

      // If already categorized and applyMode != overwrite, skip
      // Treat TRANSFER_INTERNAL as effectively uncategorized so rules can fix
      // misclassified owner draws and similar transactions.
      const effectivelyUncategorized =
        !currentCategory ||
        currentCategory === "OTHER" ||
        (currentCategory === "TRANSFER_INTERNAL" && currentIsTransfer === true);
      if (!effectivelyUncategorized) {
        skippedAlreadyCategorized += 1;
        continue;
      }

      await ddb.update({
        TableName: HQ_TABLE,
        Key: { orgId, sk: t.sk },
        UpdateExpression: "SET categoryId = :c, categoryConfidence = :k, isInternalTransfer = :it",
        ExpressionAttributeValues: {
          ":c": nextCategory,
          ":k": nextConfidence,
          ":it": nextTransfer,
        },
      });
      updated += 1;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return json(200, C, {
    orgId,
    updated,
    scanned,
    matched,
    skipped: skippedAlreadyCategorized + skippedNoChange,
    skippedReasons: {
      alreadyCategorized: skippedAlreadyCategorized,
      noChange: skippedNoChange,
    },
  });
};

// GET /hq/uncategorized?orgId=...&importRunId=...
const listUncategorized = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const importRunId = q.importRunId ? String(q.importRunId).trim() : "";
  const rules = await ensureSeedRulepack(orgId);

  const groups = new Map();
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
    });

    for (const t of page.Items || []) {
      if (importRunId && t.importRunId !== importRunId) continue;
      if (t.isInternalTransfer) continue;
      const categoryId = t.categoryId || "OTHER";
      if (categoryId && categoryId !== "OTHER") continue;

      const vendor = normalizeForMatching(t.vendor || t.counterparty || "");
      const key = normalizeVendorKey(vendor || t.rawDescription || "");
      if (!key) continue;

      const existing = groups.get(key) || {
        vendor: vendor || "Unknown",
        vendorKey: key,
        count: 0,
        example: null,
        suggestedCategoryId: null,
      };

      existing.count += 1;
      if (!existing.example) {
        existing.example = {
          postedAt: t.postedAt,
          amount: t.amount,
          rawDescription: t.rawDescription,
          normalizedDescription: t.normalizedDescription,
          vendor: t.vendor,
          type: t.type,
        };
      }

      if (!existing.suggestedCategoryId) {
        const pick = pickCategorization(
          {
            rawDescription: t.rawDescription,
            normalizedDescription: t.normalizedDescription,
            vendor: t.vendor,
            type: t.type,
            isInternalTransfer: false,
            accountId: t.accountId,
            cardLast4: t.cardLast4,
          },
          rules
        );
        if (pick && pick.categoryId && pick.categoryId !== "OTHER" && pick.categoryId !== "TRANSFERS") {
          existing.suggestedCategoryId = pick.categoryId;
        }
      }

      groups.set(key, existing);
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  const vendors = Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  return json(200, C, { orgId, vendors });
};

// PATCH /hq/transactions/:dedupeHash?orgId=...
const patchTransaction = async (e, C, { dedupeHash }) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  dedupeHash = String(dedupeHash || "").trim();
  if (!dedupeHash) return json(400, C, { error: "dedupeHash required" });

  const body = B(e);
  const nextCategoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : undefined;
  const nextIsTransfer = typeof body.isInternalTransfer === "boolean" ? body.isInternalTransfer : undefined;
  const nextIsRecurring = typeof body.isRecurring === "boolean" ? body.isRecurring : undefined;
  const nextPaymentType = typeof body.paymentType === "string" ? body.paymentType.trim() : undefined;
  const nextRecurringSeriesId = typeof body.recurringSeriesId === "string" ? body.recurringSeriesId.trim() : undefined;
  const nextType = typeof body.type === "string" ? body.type.trim() : undefined;

  let found = null;
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
      ProjectionExpression: "sk, dedupeHash",
    });
    found = (page.Items || []).find((t) => t.dedupeHash === dedupeHash) || null;
    lastKey = found ? null : page.LastEvaluatedKey;
  } while (lastKey);

  if (!found) return json(404, C, { error: "Not found" });

  const sets = [];
  const values = {};
  if (nextCategoryId !== undefined) {
    sets.push("categoryId = :c");
    values[":c"] = nextCategoryId || "OTHER";
  }
  if (nextIsTransfer !== undefined) {
    sets.push("isInternalTransfer = :t");
    values[":t"] = nextIsTransfer;
  }
  if (nextIsRecurring !== undefined) {
    sets.push("isRecurring = :r");
    values[":r"] = nextIsRecurring;
  }
  if (nextPaymentType !== undefined) {
    sets.push("paymentType = :pt");
    values[":pt"] = nextPaymentType || "unknown";
  }
  if (nextRecurringSeriesId !== undefined) {
    sets.push("recurringSeriesId = :rs");
    values[":rs"] = nextRecurringSeriesId || null;
  }
  if (nextType !== undefined) {
    sets.push("#type = :ty");
    values[":ty"] = nextType || "unknown";
  }
  if (!sets.length) return json(400, C, { error: "No fields to update" });

  await ddb.update({
    TableName: HQ_TABLE,
    Key: { orgId, sk: found.sk },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: nextType !== undefined ? { "#type": "type" } : undefined,
    ExpressionAttributeValues: values,
  });

  return json(200, C, { ok: true });
};

// POST /hq/transactions/apply?orgId=...
// Bulk-apply (category/type) to a list of dedupeHashes, then rebuild derived ledger/header.
const applyTransactionsBulk = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const dedupeHashes = Array.isArray(body.dedupeHashes)
    ? body.dedupeHashes.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 60)
    : [];
  if (!dedupeHashes.length) return json(400, C, { error: "dedupeHashes required" });

  const nextCategoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : undefined;
  const nextIsRecurring = typeof body.isRecurring === "boolean" ? body.isRecurring : undefined;
  const nextPaymentType = typeof body.paymentType === "string" ? body.paymentType.trim() : undefined;
  const nextRecurringSeriesId = typeof body.recurringSeriesId === "string" ? body.recurringSeriesId.trim() : undefined;
  const nextType = typeof body.type === "string" ? body.type.trim() : undefined;
  if (
    nextCategoryId === undefined &&
    nextIsRecurring === undefined &&
    nextPaymentType === undefined &&
    nextRecurringSeriesId === undefined &&
    nextType === undefined
  ) {
    return json(400, C, { error: "No fields to update" });
  }

  const requested = new Set(dedupeHashes);
  const foundByHash = new Map();

  // Scan TXN items once to find sks for the requested dedupe hashes.
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
      ProjectionExpression: "sk, dedupeHash",
    });

    for (const t of page.Items || []) {
      const dh = String(t.dedupeHash || "").trim();
      if (!dh || !requested.has(dh)) continue;
      foundByHash.set(dh, String(t.sk));
      if (foundByHash.size >= requested.size) break;
    }

    lastKey = foundByHash.size >= requested.size ? null : page.LastEvaluatedKey;
  } while (lastKey);

  if (!foundByHash.size) return json(404, C, { error: "Not found" });

  const sets = [];
  const values = {};
  const names = {};
  if (nextCategoryId !== undefined) {
    sets.push("categoryId = :c");
    values[":c"] = nextCategoryId || "OTHER";
  }
  if (nextType !== undefined) {
    sets.push("#type = :ty");
    values[":ty"] = nextType || "unknown";
    names["#type"] = "type";
  }
  if (nextIsRecurring !== undefined) {
    sets.push("isRecurring = :r");
    values[":r"] = nextIsRecurring;
  }
  if (nextPaymentType !== undefined) {
    sets.push("paymentType = :pt");
    values[":pt"] = nextPaymentType || "unknown";
  }
  if (nextRecurringSeriesId !== undefined) {
    sets.push("recurringSeriesId = :rs");
    values[":rs"] = nextRecurringSeriesId || null;
  }

  const updateFns = [];
  for (const [dedupeHash, sk] of foundByHash.entries()) {
    void dedupeHash;
    updateFns.push(() =>
      ddb.update({
        TableName: HQ_TABLE,
        Key: { orgId, sk },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: values,
      })
    );
  }

  for (const batch of chunk(updateFns, 25)) {
    await Promise.all(batch.map((fn) => fn()));
  }

  // Type changes can alter inferred direction/sign; rebuild derived ledger/header.
  await rebuildLedgerAndHeaderFromTxns({ orgId, deleteExistingLedger: true });

  return json(200, C, { orgId, updated: foundByHash.size });
};

const canonicalCents = (txn) => {
  const signed = canonicalSignedAmount(txn);
  if (typeof signed !== "number" || !Number.isFinite(signed)) return 0;
  return Math.round(signed * 100);
};

const effectivePaymentTypeServer = (txn) => {
  const paymentType = txn?.paymentType;
  if (paymentType) return String(paymentType).trim();
  const legacy = String(txn?.type || "unknown").trim();
  // Legacy stored `type: "recurring"` should not be treated as a payment type.
  if (legacy === "recurring") return "unknown";
  return legacy;
};

const buildRecurringSeriesKeyIndexServer = (transactions) => {
  const out = new Map();

  const candidatesByDerivedKey = new Map();
  const ambiguousDerivedKeys = new Set();
  const countsByDerivedDate = new Map();

  for (const txn of transactions || []) {
    const dh = String(txn?.dedupeHash || "").trim();
    if (!dh) continue;

    const recurringSeriesId = typeof txn?.recurringSeriesId === "string" ? txn.recurringSeriesId.trim() : "";
    if (recurringSeriesId) {
      out.set(dh, `rs:${recurringSeriesId}`);
      continue;
    }

    const signed = canonicalSignedAmount(txn);
    if (typeof signed !== "number" || !Number.isFinite(signed)) continue;

    const direction = signed < 0 ? "out" : "in";
    const amountBucket = Math.round(Math.abs(signed));
    const { vendorKey } = getVendorKeyForTxn(txn);
    const accountId = txn?.accountId || "unknown";
    const baseKey = `${vendorKey}:${accountId}:${direction}:${amountBucket}`;

    const discriminator = extractRecurringSeriesDiscriminator(txn);
    const derivedKey = discriminator ? `${baseKey}:${discriminator}` : baseKey;

    const date = String(txn?.postedAt || "").slice(0, 10);
    const candidate = { txn, dedupeHash: dh, derivedKey, date };
    const arr = candidatesByDerivedKey.get(derivedKey) || [];
    arr.push(candidate);
    candidatesByDerivedKey.set(derivedKey, arr);

    const countKey = `${derivedKey}|||${date}`;
    const nextCount = (countsByDerivedDate.get(countKey) || 0) + 1;
    countsByDerivedDate.set(countKey, nextCount);
    if (nextCount > 1) ambiguousDerivedKeys.add(derivedKey);
  }

  for (const [derivedKey, items] of candidatesByDerivedKey.entries()) {
    items.sort((a, b) => {
      const dateCmp = String(a?.txn?.postedAt || "").localeCompare(String(b?.txn?.postedAt || ""));
      if (dateCmp) return dateCmp;
      return String(a?.dedupeHash || "").localeCompare(String(b?.dedupeHash || ""));
    });

    if (!ambiguousDerivedKeys.has(derivedKey)) {
      for (const it of items) out.set(it.dedupeHash, derivedKey);
      continue;
    }

    const byDate = new Map();
    for (const it of items) {
      const arr = byDate.get(it.date) || [];
      arr.push(it);
      byDate.set(it.date, arr);
    }

    for (const arr of byDate.values()) {
      arr.sort((a, b) => {
        const dateCmp = String(a?.txn?.postedAt || "").localeCompare(String(b?.txn?.postedAt || ""));
        if (dateCmp) return dateCmp;
        return String(a?.dedupeHash || "").localeCompare(String(b?.dedupeHash || ""));
      });
      for (let i = 0; i < arr.length; i += 1) {
        const it = arr[i];
        if (!it) continue;
        out.set(it.dedupeHash, `${derivedKey}:slot${i + 1}`);
      }
    }
  }

  return out;
};

const txnTitleForSearch = (t) => t?.vendor || t?.counterparty || t?.rawDescription || "";

const sortTransactionsStable = (arr, { sortKey, sortDir }) => {
  const dir = String(sortDir || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const key = String(sortKey || "date").toLowerCase();

  const dateKey = (t) => String(t?.postedAt || "");
  const dedupeKey = (t) => String(t?.dedupeHash || "");
  const categoryKey = (t) => String(t?.categoryId || "OTHER");
  const vendorKey = (t) => String(txnTitleForSearch(t) || "").toLowerCase();
  const centsKey = (t) => canonicalCents(t);

  const compareDateDescThenId = (a, b) => {
    const d = dateKey(b).localeCompare(dateKey(a));
    if (d) return d;
    return dedupeKey(a).localeCompare(dedupeKey(b));
  };

  const compare = (a, b) => {
    if (key === "amount") {
      const delta = centsKey(a) - centsKey(b);
      if (delta) return dir === "asc" ? delta : -delta;
      return compareDateDescThenId(a, b);
    }

    if (key === "category") {
      const c = categoryKey(a).localeCompare(categoryKey(b));
      if (c) return dir === "asc" ? c : -c;
      return compareDateDescThenId(a, b);
    }

    if (key === "vendor") {
      const v = vendorKey(a).localeCompare(vendorKey(b));
      if (v) return dir === "asc" ? v : -v;
      return compareDateDescThenId(a, b);
    }

    // date (default)
    const d = dateKey(a).localeCompare(dateKey(b));
    if (d) return dir === "asc" ? d : -d;
    return dedupeKey(a).localeCompare(dedupeKey(b));
  };

  return arr.slice().sort(compare);
};

// GET /hq/transactions?orgId=...&accountId=...&from=...&to=...&cursor=...
const listTransactions = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const accountId = q.accountId ? String(q.accountId).trim() : "";
  const from = q.from ? String(q.from).trim() : "0000-00-00";
  const to = q.to ? String(q.to).trim() : "9999-99-99";
  const limit = Math.min(parseInt(q.limit || "100", 10), 500);

  const includeTotals =
    String(q.include_totals ?? q.includeTotals ?? "").trim() === "1" ||
    String(q.include_totals ?? q.includeTotals ?? "").trim().toLowerCase() === "true";

  const textQuery = String(q.q || "").trim();
  const direction = String(q.dir ?? q.flow ?? "").trim().toLowerCase(); // in|out
  const paymentType = String(q.paymentType ?? q.type ?? "").trim();
  const recurringOnly =
    String(q.recurringOnly ?? q.recurring ?? "").trim() === "1" ||
    String(q.recurringOnly ?? q.recurring ?? "").trim().toLowerCase() === "true" ||
    String(q.filter || "").trim().toLowerCase() === "recurring";
  const seriesKey = String(q.seriesKey || "").trim();
  const categoryId = String(q.categoryId ?? q.category ?? "").trim();

  const amountMinCentsRaw = q.amount_min_cents ?? q.amountMinCents ?? q.amountMin ?? q.amount_min;
  const amountMaxCentsRaw = q.amount_max_cents ?? q.amountMaxCents ?? q.amountMax ?? q.amount_max;
  const amountMinCents = Number.isFinite(parseInt(amountMinCentsRaw ?? "", 10)) ? parseInt(amountMinCentsRaw, 10) : null;
  const amountMaxCents = Number.isFinite(parseInt(amountMaxCentsRaw ?? "", 10)) ? parseInt(amountMaxCentsRaw, 10) : null;
  const amountMode = String(q.amount_mode ?? q.amountMode ?? "ABS").trim().toUpperCase(); // ABS|SIGNED

  const sortKey = String(q.sort_key ?? q.sortKey ?? "date").trim().toLowerCase();
  const sortDir = String(q.sort_dir ?? q.sortDir ?? "desc").trim().toLowerCase();

  const wantsEnhanced =
    includeTotals ||
    Boolean(textQuery) ||
    Boolean(direction) ||
    Boolean(paymentType) ||
    recurringOnly ||
    Boolean(seriesKey) ||
    Boolean(categoryId) ||
    typeof amountMinCents === "number" ||
    typeof amountMaxCents === "number" ||
    (sortKey && sortKey !== "date") ||
    (sortDir && sortDir !== "desc") ||
    (accountId && sortKey !== "date");

  // Default path (fast): date-range query + Dynamo cursor.
  if (!wantsEnhanced) {
    const exclusiveStartKey = decodeCursor(q.cursor);
    const start = `TXN#${from}`;
    const end = `TXN#${to}~`;

    const res = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND sk BETWEEN :a AND :b",
      ExpressionAttributeValues: { ":o": orgId, ":a": start, ":b": end },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    let txns = (res.Items || []).map((t) => ({
      // Keep vendorKey generation in parity with /hq/vendor-matches.
      vendorKey: (() => {
        const vendor = normalizeForMatching(t.vendor || t.counterparty || "");
        return normalizeVendorKey(vendor || t.rawDescription || t.normalizedDescription || "");
      })(),
      orgId,
      accountId: t.accountId,
      postedAt: t.postedAt,
      authorizedAt: t.authorizedAt,
      amount: t.amount,
      currency: t.currency || "USD",
      rawDescription: t.rawDescription,
      normalizedDescription: t.normalizedDescription,
      paymentType: t.paymentType,
      type: t.type,
      isRecurring: t.isRecurring,
      recurringCandidate: t.recurringCandidate,
      recurringSeriesId: t.recurringSeriesId,
      direction: t.direction,
      vendor: t.vendor,
      counterparty: t.counterparty,
      locationCity: t.locationCity,
      locationState: t.locationState,
      cardLast4: t.cardLast4,
      referenceId: t.referenceId,
      categoryId: t.categoryId,
      categoryConfidence: t.categoryConfidence,
      isInternalTransfer: t.isInternalTransfer,
      projectId: t.projectId,
      importRunId: t.importRunId,
      dedupeHash: t.dedupeHash,
      createdAt: t.createdAt,
    }));

    if (accountId) {
      txns = txns.filter((t) => t.accountId === accountId);
    }

    return json(200, C, { orgId, transactions: txns, cursor: encodeCursor(res.LastEvaluatedKey) });
  }

  const start = `TXN#${from}`;
  const end = `TXN#${to}~`;
  const cursor = decodeCursor(q.cursor);
  const offset = typeof cursor?.offset === "number" && Number.isFinite(cursor.offset) ? Math.max(0, Math.floor(cursor.offset)) : 0;

  const all = await queryAllBetween({ orgId, fromSk: start, toSk: end, scanIndexForward: true });
  const enriched = (all || []).map((t) => ({
    ddb: t,
    txn: {
      // Keep vendorKey generation in parity with /hq/vendor-matches.
      vendorKey: (() => {
        const vendor = normalizeForMatching(t.vendor || t.counterparty || "");
        return normalizeVendorKey(vendor || t.rawDescription || t.normalizedDescription || "");
      })(),
      orgId,
      accountId: t.accountId,
      postedAt: t.postedAt,
      authorizedAt: t.authorizedAt,
      amount: t.amount,
      currency: t.currency || "USD",
      rawDescription: t.rawDescription,
      normalizedDescription: t.normalizedDescription,
      paymentType: t.paymentType,
      type: t.type,
      isRecurring: t.isRecurring,
      recurringCandidate: t.recurringCandidate,
      recurringSeriesId: t.recurringSeriesId,
      direction: t.direction,
      vendor: t.vendor,
      counterparty: t.counterparty,
      locationCity: t.locationCity,
      locationState: t.locationState,
      cardLast4: t.cardLast4,
      referenceId: t.referenceId,
      categoryId: t.categoryId,
      categoryConfidence: t.categoryConfidence,
      isInternalTransfer: t.isInternalTransfer,
      projectId: t.projectId,
      importRunId: t.importRunId,
      dedupeHash: t.dedupeHash,
      createdAt: t.createdAt,
    },
  }));

  const seriesIndex = seriesKey ? buildRecurringSeriesKeyIndexServer(enriched.map((x) => x.ddb)) : null;
  const term = textQuery.trim().toLowerCase();

  const filtered = [];
  let totalsCount = 0;
  let inCents = 0;
  let outCents = 0;
  let netCents = 0;

  for (const { ddb: raw, txn } of enriched) {
    if (accountId && String(txn.accountId || "") !== accountId) continue;

    const postedAt = String(txn.postedAt || "").slice(0, 10);
    if (from && postedAt && postedAt < from) continue;
    if (to && postedAt && postedAt > to) continue;

    const signedCents = canonicalCents(raw);

    if (direction === "in" && signedCents < 0) continue;
    if (direction === "out" && signedCents >= 0) continue;

    if (paymentType && paymentType !== "all") {
      const effective = effectivePaymentTypeServer(raw);
      if (effective !== paymentType) continue;
    }

    if (recurringOnly && raw?.isRecurring !== true) continue;

    if (categoryId) {
      if (categoryId === "UNCATEGORIZED") {
        const id = raw?.categoryId ? String(raw.categoryId) : "";
        if (id && id !== "OTHER") continue;
      } else if (categoryId !== "all") {
        const id = raw?.categoryId ? String(raw.categoryId) : "OTHER";
        if (id !== categoryId) continue;
      }
    }

    if (seriesKey && seriesIndex) {
      const key = seriesIndex.get(String(raw?.dedupeHash || "").trim()) || null;
      if (!key || key !== seriesKey) continue;
    }

    if (typeof amountMinCents === "number" || typeof amountMaxCents === "number") {
      const cmp = amountMode === "SIGNED" ? signedCents : Math.abs(signedCents);
      if (typeof amountMinCents === "number" && Number.isFinite(amountMinCents) && cmp < amountMinCents) continue;
      if (typeof amountMaxCents === "number" && Number.isFinite(amountMaxCents) && cmp > amountMaxCents) continue;
    }

    if (term) {
      const haystack = [txnTitleForSearch(txn), txn.rawDescription, txn.normalizedDescription]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) continue;
    }

    totalsCount += 1;
    netCents += signedCents;
    if (signedCents >= 0) inCents += signedCents;
    else outCents += Math.abs(signedCents);

    filtered.push(txn);
  }

  const sorted = sortTransactionsStable(filtered, { sortKey, sortDir });
  const page = sorted.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < sorted.length ? encodeCursor({ v: 1, offset: nextOffset, sortKey, sortDir }) : null;

  const payload = {
    orgId,
    items: page,
    nextCursor,
    totals: includeTotals ? { count: totalsCount, inCents, outCents, netCents } : undefined,
    // Backward-compat fields for older clients:
    transactions: page,
    cursor: nextCursor,
  };

  return json(200, C, payload);
};

// POST /hq/accounts?orgId=...
const createAccount = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const name = typeof body.name === "string" ? body.name.trim() : (typeof body.accountName === "string" ? body.accountName.trim() : "");
  const accountName = name;
  const institution = typeof body.institution === "string" ? body.institution.trim() : "";

  if (accountName.length < 2 || institution.length < 2) {
    return json(400, C, { error: "name and institution required" });
  }

  const accountId = uuidv4();
  const createdAt = nowISO();
  const updatedAt = createdAt;

  const item = {
    orgId,
    sk: skAccount(accountId),
    entityType: "account",
    accountId,
    name,
    accountName,
    institution,
    currency: "USD",
    accountMask: typeof body.accountMask === "string" ? body.accountMask.trim() || undefined : undefined,
    notes: typeof body.notes === "string" ? body.notes.trim() || undefined : undefined,
    anchorDate: typeof body.anchorDate === "string" ? body.anchorDate.trim() || undefined : undefined,
    anchorBalance: typeof body.anchorBalance === "number" ? body.anchorBalance : undefined,
    currentBalance:
      typeof body.anchorBalance === "number" && typeof body.anchorDate === "string" && body.anchorDate.trim()
        ? body.anchorBalance
        : undefined,
    includeInCashOnHand: body.includeInCashOnHand === false ? false : true,
    archivedAt: null,
    createdAt,
    updatedAt,
  };

  await ddb.put({ TableName: HQ_TABLE, Item: item });

  return json(200, C, { account: { ...item, orgId } });
};

// PATCH /hq/accounts/:accountId?orgId=...
const patchAccount = async (e, C, { accountId }) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);

  const nowIso = nowISO();
  const touchesAnchor = Object.prototype.hasOwnProperty.call(body, "anchorDate") || Object.prototype.hasOwnProperty.call(body, "anchorBalance");
  const touchesCashInclusion = Object.prototype.hasOwnProperty.call(body, "includeInCashOnHand") || Object.prototype.hasOwnProperty.call(body, "archivedAt");

  const sets = [];
  const names = {};
  const values = {};

  const setField = (field, value) => {
    const nameKey = `#${field}`;
    const valueKey = `:${field}`;
    names[nameKey] = field;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  };

  if (typeof body.name === "string") {
    const nextName = body.name.trim();
    setField("name", nextName);
    setField("accountName", nextName);
  }
  if (typeof body.accountName === "string") {
    const nextName = body.accountName.trim();
    setField("name", nextName);
    setField("accountName", nextName);
  }
  if (typeof body.institution === "string") setField("institution", body.institution.trim());
  if (typeof body.accountMask === "string") setField("accountMask", body.accountMask.trim() || null);
  if (typeof body.notes === "string") setField("notes", body.notes.trim() || null);
  if (typeof body.anchorDate === "string") setField("anchorDate", body.anchorDate.trim() || null);
  if (typeof body.anchorBalance === "number" || body.anchorBalance === null) setField("anchorBalance", body.anchorBalance);
  if (typeof body.includeInCashOnHand === "boolean") setField("includeInCashOnHand", body.includeInCashOnHand);
  if (typeof body.archivedAt === "string") setField("archivedAt", body.archivedAt.trim() || null);
  if (body.archivedAt === null) setField("archivedAt", null);

  // Always bump updatedAt for any accepted patch.
  if (sets.length) setField("updatedAt", nowIso);

  if (!sets.length) return json(400, C, { error: "No fields to update" });

  const res = await ddb.update({
    TableName: HQ_TABLE,
    Key: { orgId, sk: skAccount(accountId) },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: "ALL_NEW",
  });

  const updatedAccount = res.Attributes || null;

  // Anchor updates (and cash-inclusion toggles) affect derived fields:
  // - currentBalance per account
  // - hqHeader.cashOnHandAggregate + missingAnchorAccountIds
  if (updatedAccount && (touchesAnchor || touchesCashInclusion)) {
    // Ensure derived ledger exists so we can compute balances cheaply.
    await ensureHqHeader({ orgId });

    let nextCurrentBalance = null;
    const anchorDate = updatedAccount.anchorDate ? String(updatedAccount.anchorDate).slice(0, 10) : "";
    const anchorBalance = typeof updatedAccount.anchorBalance === "number" ? Number(updatedAccount.anchorBalance) : null;
    if (anchorDate && typeof anchorBalance === "number" && Number.isFinite(anchorBalance)) {
      nextCurrentBalance = await computeAccountBalanceFromLedger({
        orgId,
        accountId,
        anchorDate,
        anchorBalance,
        today: todayIsoInTimeZone(),
      });
    }

    await ddb.update({
      TableName: HQ_TABLE,
      Key: { orgId, sk: skAccount(accountId) },
      UpdateExpression: "SET currentBalance = :b, updatedAt = :u",
      ExpressionAttributeValues: {
        ":b": typeof nextCurrentBalance === "number" && Number.isFinite(nextCurrentBalance) ? round2(nextCurrentBalance) : null,
        ":u": nowIso,
      },
    });

    await recomputeHqHeaderFromLedger({ orgId, nowIso });

    return json(200, C, {
      account: {
        ...updatedAccount,
        currentBalance: typeof nextCurrentBalance === "number" && Number.isFinite(nextCurrentBalance) ? round2(nextCurrentBalance) : null,
        updatedAt: nowIso,
      },
    });
  }

  return json(200, C, { account: updatedAccount });
};

// DELETE /hq/accounts/:accountId?orgId=...
const deleteAccount = async (e, C, { accountId }) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const existing = await ddb.get({ TableName: HQ_TABLE, Key: { orgId, sk: skAccount(accountId) } });
  if (!existing?.Item) throw httpError(404, "Not found");

  let deletedTransactions = 0;
  let deletedImportRuns = 0;

  // Delete transactions for this account.
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
    });

    const deletes = (page.Items || [])
      .filter((t) => t.accountId === accountId)
      .map((t) => ({ DeleteRequest: { Key: { orgId, sk: t.sk } } }));

    for (const batch of chunk(deletes, 25)) {
      await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
      deletedTransactions += batch.length;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  // Delete import runs for this account.
  lastKey = undefined;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "IMPORT#" },
      ExclusiveStartKey: lastKey,
    });

    const deletes = (page.Items || [])
      .filter((r) => r.accountId === accountId)
      .map((r) => ({ DeleteRequest: { Key: { orgId, sk: r.sk } } }));

    for (const batch of chunk(deletes, 25)) {
      await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
      deletedImportRuns += batch.length;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  await ddb.delete({ TableName: HQ_TABLE, Key: { orgId, sk: skAccount(accountId) } });

  return json(200, C, { ok: true, accountId, deletedTransactions, deletedImportRuns });
};

// DELETE /hq/reset?orgId=...&mode=all|keepRules|keepAccountsAndRules|keepAccountsRulesAndImports|keepData
const resetHq = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const mode = String(q.mode || "all").trim().toLowerCase();
  const keepRules = mode === "keeprules";
  const keepAccountsAndRules = mode === "keepaccountsandrules";
  const keepAccountsRulesAndImports = mode === "keepaccountsrulesandimports";
  const keepData = mode === "keepdata";

  let deletedAccounts = 0;
  let deletedTransactions = 0;
  let deletedImportRuns = 0;
  let deletedRules = 0;
  let deletedOther = 0;

  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o",
      ExpressionAttributeValues: { ":o": orgId },
      ExclusiveStartKey: lastKey,
    });

    const deletes = [];
    for (const item of page.Items || []) {
      const sk = String(item.sk || "");

      if (keepAccountsRulesAndImports) {
        // Keep accounts, rules, and imports; only delete bank-synced TXNs.
        // Heuristic: CSV-imported txns have importRunId; bank-synced do not.
        if (sk.startsWith("ACCOUNT#") || sk.startsWith("RULE#") || sk.startsWith("IMPORT#")) continue;
        if (sk.startsWith("TXN#")) {
          if (item && item.importRunId) continue;
        } else {
          // For unknown/other entities, keep by default.
          continue;
        }
      }

      if (keepRules && sk.startsWith("RULE#")) continue;
      if (keepAccountsAndRules && (sk.startsWith("RULE#") || sk.startsWith("ACCOUNT#"))) continue;
      if (keepData && !sk.startsWith("RULE#")) continue;
      deletes.push({ DeleteRequest: { Key: { orgId, sk } } });

      if (sk.startsWith("ACCOUNT#")) deletedAccounts += 1;
      else if (sk.startsWith("TXN#")) deletedTransactions += 1;
      else if (sk.startsWith("IMPORT#")) deletedImportRuns += 1;
      else if (sk.startsWith("RULE#")) deletedRules += 1;
      else deletedOther += 1;
    }

    for (const batch of chunk(deletes, 25)) {
      await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return json(200, C, {
    ok: true,
    orgId,
    mode: keepRules
      ? "keepRules"
      : keepAccountsAndRules
        ? "keepAccountsAndRules"
        : keepAccountsRulesAndImports
          ? "keepAccountsRulesAndImports"
          : keepData
            ? "keepData"
            : "all",
    deletedAccounts,
    deletedTransactions,
    deletedImportRuns,
    deletedRules,
    deletedOther,
  });
};

// POST /hq/import-csv?orgId=...
const importCsv = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "import.csv";
  const transactions = Array.isArray(body.transactions) ? body.transactions : [];
  if (!accountId) return json(400, C, { error: "accountId required" });
  if (!transactions.length) return json(400, C, { error: "transactions required" });

  const importRunId = uuidv4();
  const createdAt = nowISO();

  // Be tolerant of historical/accountId formatting differences.
  // Some clients/records may pass or store accountId as either a raw UUID or with an `ACCOUNT#` prefix.
  const accountSkCandidates = new Set();
  accountSkCandidates.add(skAccount(accountId));
  if (accountId.startsWith("ACCOUNT#")) {
    accountSkCandidates.add(accountId);
    accountSkCandidates.add(skAccount(accountId.slice("ACCOUNT#".length)));
  } else {
    accountSkCandidates.add(skAccount(`ACCOUNT#${accountId}`));
  }

  let account = null;
  for (const sk of accountSkCandidates) {
    // eslint-disable-next-line no-await-in-loop
    const accountRes = await ddb.get({ TableName: HQ_TABLE, Key: { orgId, sk } });
    if (accountRes?.Item) {
      account = accountRes.Item;
      break;
    }
  }
  if (!account) throw httpError(404, "Not found");

  const effectiveAccountId =
    typeof account.accountId === "string" && account.accountId.trim() ? account.accountId.trim() : accountId;

  const categoryRules = await ensureSeedRulepack(orgId);

  // Sanity check: sign inversion detection.
  // If we see almost no negative amounts in a typical checking export, it's likely the sign is flipped.
  let inflowCount = 0;
  let outflowCount = 0;
  let numericCount = 0;
  for (const t of transactions) {
    const amount = typeof t.amount === "number" ? t.amount : Number(t.amount);
    if (!Number.isFinite(amount)) continue;
    numericCount += 1;
    if (amount > 0) inflowCount += 1;
    if (amount < 0) outflowCount += 1;
  }

  const warnings = [];
  if (numericCount >= 20 && inflowCount >= 5) {
    const outflowRatio = outflowCount / Math.max(1, numericCount);
    if (outflowCount <= 1 || outflowRatio < 0.05) {
      warnings.push("POSSIBLE_SIGN_INVERSION");
      console.warn(
        `[hq.importCsv] POSSIBLE_SIGN_INVERSION orgId=${orgId} accountId=${effectiveAccountId} numeric=${numericCount} in=${inflowCount} out=${outflowCount}`
      );
    }
  }

  // De-dupe by existing TXN keys within the org.
  const txKeys = transactions
    .map((t) => {
      const postedAt = String(t?.postedAt || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(postedAt)) return null;

      const amount = typeof t?.amount === "number" ? t.amount : Number(t?.amount);
      if (!Number.isFinite(amount)) return null;

      const rawDescription = String(t?.rawDescription || t?.normalizedDescription || "").trim();
      if (!rawDescription) return null;

      // Server-authoritative hash. (Client-provided hash is ignored for uniqueness.)
      const dedupeHash = computeTransactionDedupeHashV2({
        accountId: effectiveAccountId,
        postedAt,
        amount,
        rawDescription,
        normalizedDescription: t?.normalizedDescription,
        paymentType: t?.paymentType,
        vendor: t?.vendor,
        counterparty: t?.counterparty,
        referenceId: t?.referenceId,
        cardLast4: t?.cardLast4,
      });

      // Back-compat: also compute v1-style hashes so importing the same CSV twice
      // won't create duplicates if a legacy-hash TXN already exists.
      const legacyV1Effective = computeTransactionDedupeHashV1({
        accountId: effectiveAccountId,
        postedAt,
        amount,
        rawDescription,
        normalizedDescription: t?.normalizedDescription,
      });

      const clientAccountId = String(t?.accountId || accountId || "").trim();
      const legacyV1Client =
        clientAccountId && clientAccountId !== effectiveAccountId
          ? computeTransactionDedupeHashV1({
              accountId: clientAccountId,
              postedAt,
              amount,
              rawDescription,
              normalizedDescription: t?.normalizedDescription,
            })
          : null;

      const skV2 = skTxn(postedAt, dedupeHash);
      const candidates = [skV2, skTxn(postedAt, legacyV1Effective)];
      if (legacyV1Client) candidates.push(skTxn(postedAt, legacyV1Client));

      return {
        orgId,
        sk: skV2,
        skCandidates: candidates,
        accountId: effectiveAccountId,
        postedAt,
        dedupeHash,
        raw: t,
      };
    })
    .filter(Boolean);

  // De-dupe within the incoming CSV payload itself (BatchWrite rejects duplicate keys).
  // Strategy: first occurrence wins; later duplicates are counted as duplicates.
  const uniqueBySk = new Map();
  let payloadDuplicates = 0;
  for (const k of txKeys) {
    if (uniqueBySk.has(k.sk)) {
      payloadDuplicates += 1;
      continue;
    }
    uniqueBySk.set(k.sk, k);
  }
  const uniqueTxKeys = Array.from(uniqueBySk.values());

  let duplicates = payloadDuplicates;
  let imported = 0;

  // BatchGet in chunks of 100 keys.
  const existing = new Set();
  // Each txn can have multiple candidate keys (v2 + legacy v1 variants).
  // Keep batches small enough to stay under DynamoDB BatchGet 100-key limit.
  for (const batch of chunk(uniqueTxKeys, 30)) {
    const keySet = new Set();
    const keys = [];
    for (const k of batch) {
      const candidates = Array.isArray(k.skCandidates) ? k.skCandidates : [k.sk];
      for (const sk of candidates) {
        if (!sk || keySet.has(sk)) continue;
        keySet.add(sk);
        keys.push({ orgId: k.orgId, sk });
      }
    }
    const res = await ddb.batchGet({
      RequestItems: {
        [HQ_TABLE]: {
          Keys: keys,
          ProjectionExpression: "orgId, sk",
        },
      },
    });
    (res.Responses?.[HQ_TABLE] || []).forEach((item) => existing.add(item.sk));
  }

  const toWrite = [];
  const writtenTxnItems = [];
  for (const k of uniqueTxKeys) {
    const candidates = Array.isArray(k.skCandidates) ? k.skCandidates : [k.sk];
    if (candidates.some((sk) => existing.has(sk))) {
      duplicates += 1;
      continue;
    }
    imported += 1;
    const t = k.raw || {};

    const normalizedVendor =
      normalizeForMatching(t.vendor || t.counterparty || t.rawDescription || t.normalizedDescription || "").slice(0, 80) || undefined;
    const internalTransfer = Boolean(t.isInternalTransfer) || isLikelyInternalTransfer(t);
    const picked = pickCategorization(
      {
        rawDescription: t.rawDescription,
        normalizedDescription: t.normalizedDescription,
        vendor: normalizedVendor,
        type: t.type,
        isInternalTransfer: internalTransfer,
        accountId: effectiveAccountId,
        cardLast4: t.cardLast4,
      },
      categoryRules
    );

    toWrite.push({
      PutRequest: {
        Item: {
          orgId,
          sk: k.sk,
          entityType: "transaction",
          accountId: effectiveAccountId,
          postedAt: k.postedAt,
          authorizedAt: t.authorizedAt,
          amount: t.amount,
          currency: t.currency || "USD",
          rawDescription: t.rawDescription,
          normalizedDescription: t.normalizedDescription,
          paymentType: t.paymentType,
          type: t.type,
          isRecurring: t.isRecurring === true ? true : undefined,
          recurringCandidate: t.recurringCandidate === true ? true : undefined,
          recurringSeriesId: typeof t.recurringSeriesId === "string" && t.recurringSeriesId.trim() ? t.recurringSeriesId.trim() : undefined,
          direction: t.direction,
          vendor: normalizedVendor,
          counterparty: t.counterparty,
          locationCity: t.locationCity,
          locationState: t.locationState,
          cardLast4: t.cardLast4,
          referenceId: t.referenceId,
          categoryId: picked?.categoryId ?? t.categoryId,
          categoryConfidence: picked?.categoryConfidence ?? t.categoryConfidence,
          isInternalTransfer: picked?.isInternalTransfer ?? internalTransfer,
          projectId: t.projectId,
          importRunId,
          dedupeHash: k.dedupeHash,
          createdAt,
        },
      },
    });

    writtenTxnItems.push(toWrite[toWrite.length - 1].PutRequest.Item);
  }

  // Write transactions in Dynamo batchWrite chunks (25)
  for (const batch of chunk(toWrite, 25)) {
    await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
  }

  const runItem = {
    orgId,
    sk: skImport(createdAt, importRunId),
    entityType: "importRun",
    importRunId,
    accountId: effectiveAccountId,
    filename,
    rowCount: transactions.length,
    importedCount: imported,
    duplicateCount: duplicates,
    status: "completed",
    warnings: warnings.length ? warnings : undefined,
    createdAt,
  };

  await ddb.put({ TableName: HQ_TABLE, Item: runItem });

  // Update derived state using ONLY the imported transactions.
  await updateLedgerFromImportedTxns({ orgId, accountId: effectiveAccountId, txns: writtenTxnItems, account, nowIso: createdAt });
  await recomputeHqHeaderFromLedger({ orgId, nowIso: createdAt });

  return json(200, C, { importRun: runItem, imported, duplicates });
};

// DELETE /hq/import-runs/:importRunId?orgId=...
const deleteImportRun = async (e, C, { importRunId }) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  importRunId = String(importRunId || "").trim();
  if (!importRunId) return json(400, C, { error: "importRunId required" });

  // Find import run item
  const runRes = await ddb.query({
    TableName: HQ_TABLE,
    KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":o": orgId, ":p": "IMPORT#" },
    ScanIndexForward: false,
  });

  const runItem = (runRes.Items || []).find((r) => r.importRunId === importRunId);
  if (!runItem) return json(404, C, { error: "Not found" });

  // Delete transactions with this importRunId (scan org partition TXN# range)
  let deletedTxns = 0;
  let lastKey;
  do {
    const page = await ddb.query({
      TableName: HQ_TABLE,
      KeyConditionExpression: "orgId = :o AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":o": orgId, ":p": "TXN#" },
      ExclusiveStartKey: lastKey,
    });

    const matches = (page.Items || []).filter((t) => t.importRunId === importRunId);
    const deletes = matches.map((t) => ({ DeleteRequest: { Key: { orgId, sk: t.sk } } }));

    for (const batch of chunk(deletes, 25)) {
      await ddb.batchWrite({ RequestItems: { [HQ_TABLE]: batch } });
      deletedTxns += batch.length;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  await ddb.delete({ TableName: HQ_TABLE, Key: { orgId, sk: runItem.sk } });

  // Rebuild derived aggregates (ledger + header) so charts/recurring run off the new truth.
  await rebuildLedgerAndHeaderFromTxns({ orgId, deleteExistingLedger: true });

  return json(200, C, { ok: true, deletedTransactions: deletedTxns, importRunId });
};

/* ------------ Org Files S3 ------------ */

const TEXT_LIKE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "csv",
  "tsv",
  "xml",
  "css",
  "html",
  "yml",
  "yaml",
]);

const isTextLikeKey = (key, contentType) => {
  const lower = String(key || "").toLowerCase();
  const ext = lower.split(".").pop() || "";
  if (TEXT_LIKE_EXTENSIONS.has(ext)) return true;
  const ct = String(contentType || "").toLowerCase();
  if (ct.startsWith("text/")) return true;
  if (ct.includes("json")) return true;
  if (ct.includes("xml")) return true;
  return false;
};

/**
 * Normalize an S3 key from a raw query param for org files.
 * Validates the key belongs to the specified org.
 */
const normalizeS3KeyForOrg = (orgId, rawKeyOrUrl) => {
  if (!rawKeyOrUrl) return null;
  const raw = String(rawKeyOrUrl).trim();
  if (!raw) return null;

  let key = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      key = parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
      key = decodeURIComponent(key);
    } catch {
      key = raw;
    }
  }

  key = key.replace(/^\/+/, "");
  // Amplify Storage public keys live under `public/`
  if (!key.startsWith("public/")) {
    key = `public/${key}`;
  }

  // Only allow access to files within the org's namespace.
  const orgPrefix = `public/orgs/${orgId}/`;
  if (!key.startsWith(orgPrefix)) return null;

  return key;
};

/**
 * GET /hq/files/view?orgId=...&key=public/orgs/.../file.md (or &url=https://...)
 * Returns metadata + a signed GET URL for direct download/range fetching.
 */
const viewOrgFile = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId is required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const key = normalizeS3KeyForOrg(orgId, q.key || q.url);
  if (!key) return json(400, C, { error: "key (or url) is required and must be within org scope" });

  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: FILE_BUCKET,
        Key: key,
      }),
    );

    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: FILE_BUCKET,
        Key: key,
      }),
      { expiresIn: 600 },
    );

    const contentType = head.ContentType || null;
    const sizeBytes = typeof head.ContentLength === "number" ? head.ContentLength : null;
    const etag = head.ETag ? String(head.ETag).replace(/^\"|\"$/g, "") : null;

    return json(200, C, {
      key,
      orgId,
      downloadUrl,
      rangeSupported: true,
      sizeBytes,
      contentType,
      lastModified: head.LastModified ? new Date(head.LastModified).toISOString() : null,
      etag,
      isTextLike: isTextLikeKey(key, contentType),
    });
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode || 500;
    const message = status === 404 ? "File not found" : err?.message || "Failed to view file";
    console.error("view_org_file_error", { orgId, key, err });
    return json(status, C, { error: message });
  }
};

/**
 * POST /hq/files/put-url?orgId=...
 * Body: { key: string, contentType?: string, ifMatch?: string }
 * Returns a signed PUT URL for updating text-like files directly in S3.
 */
const createOrgFilePutUrl = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId is required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const key = normalizeS3KeyForOrg(orgId, body.key || body.url);
  if (!key) return json(400, C, { error: "key (or url) is required and must be within org scope" });

  const contentType = typeof body.contentType === "string" && body.contentType.trim()
    ? body.contentType.trim()
    : "text/plain; charset=utf-8";

  // Gate: only allow text-like updates via this flow.
  if (!isTextLikeKey(key, contentType)) {
    return json(400, C, { error: "Only text-like files are supported for inline editing" });
  }

  const ifMatch = typeof body.ifMatch === "string" && body.ifMatch.trim()
    ? body.ifMatch.trim().replace(/^\"|\"$/g, "")
    : null;

  try {
    const command = new PutObjectCommand({
      Bucket: FILE_BUCKET,
      Key: key,
      ContentType: contentType,
      ...(ifMatch ? { IfMatch: ifMatch } : {}),
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

    return json(200, C, {
      orgId,
      key,
      uploadUrl,
      requiresIfMatch: Boolean(ifMatch),
    });
  } catch (err) {
    console.error("create_org_file_put_url_error", { orgId, key, err });
    const message = err?.message || "Failed to create upload URL";
    return json(500, C, { error: message });
  }
};

/**
 * Helper to derive thumbnail key from a file key.
 * Mirrors logic in projects/router.mjs.
 */
const getThumbnailKey = (key) => {
  if (!key || typeof key !== "string") return null;
  const lastDot = key.lastIndexOf(".");
  if (lastDot === -1) return null;
  const base = key.slice(0, lastDot);
  const ext = key.slice(lastDot + 1).toLowerCase();
  // Only images/PDFs get thumbnails
  if (!["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "pdf"].includes(ext)) return null;
  return `${base}_thumb.webp`;
};

/**
 * POST /hq/files/delete?orgId=...
 * Body: { fileKeys: string[] }
 * Deletes S3 objects for an org. File keys must start with orgs/{orgId}/
 */
const deleteOrgFiles = async (e, C) => {
  const userId = requireCallerUserId(e);
  const q = Q(e);
  const orgId = pkForOrg(q.orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });
  await requireOrgMember({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const rawKeys = Array.isArray(body.fileKeys) ? body.fileKeys.filter(Boolean) : [];

  if (!rawKeys.length) return json(400, C, { error: "fileKeys must be a non-empty array" });

  // Keys come from frontend as "public/orgs/{orgId}/..." - keep them as-is since
  // that's how they're stored in S3
  const keys = rawKeys;

  // Validate all keys belong to this org (security check)
  // Keys may have public/ prefix, so check for both formats
  const orgPrefix = `orgs/${orgId}/`;
  const publicOrgPrefix = `public/orgs/${orgId}/`;
  const invalidKeys = keys.filter((k) => !k.startsWith(orgPrefix) && !k.startsWith(publicOrgPrefix));
  if (invalidKeys.length) {
    return json(403, C, { error: "Cannot delete files outside org scope", invalidKeys });
  }

  // Build list of objects to delete: original files + their thumbnails
  const uniqueKeys = [...new Set(keys)];
  const objects = [];

  for (const key of uniqueKeys) {
    objects.push({ Key: key });
    const thumbKey = getThumbnailKey(key);
    if (thumbKey) {
      objects.push({ Key: thumbKey });
    }
  }

  try {
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: FILE_BUCKET,
        Delete: { Objects: objects },
      }),
    );

    const deleted = (result.Deleted || []).map((item) => item.Key).filter(Boolean);
    const errors = (result.Errors || []).map((err) => ({
      key: err.Key,
      code: err.Code,
      message: err.Message,
    }));

    return json(200, C, {
      ok: errors.length === 0,
      orgId,
      deleted,
      errors,
    });
  } catch (err) {
    console.error("delete_org_files_error", { orgId, keys, err });
    const message = err?.message || "Failed to delete files";
    return json(500, C, { error: message });
  }
};

/* ------------ Routes ------------ */
const routes = [
  { m: "GET", r: /^\/hq\/health$/i, h: health },

  { m: "GET", r: /^\/hq\/summary\/?$/i, h: getSummary },
  { m: "GET", r: /^\/hq\/balance-series\/?$/i, h: getBalanceSeries },
  { m: "GET", r: /^\/hq\/chart-series\/?$/i, h: getChartSeries },
  { m: "GET", r: /^\/hq\/top-categories\/?$/i, h: getTopCategories },
  { m: "GET", r: /^\/hq\/recurring-commitments\/?$/i, h: getRecurringCommitments },
  { m: "GET", r: /^\/hq\/transactions\/?$/i, h: listTransactions },

  { m: "POST", r: /^\/hq\/recompute\/?$/i, h: recomputeHq },

  { m: "GET", r: /^\/hq\/category-rules\/?$/i, h: getCategoryRules },
  { m: "POST", r: /^\/hq\/category-rules\/?$/i, h: createCategoryRule },
  { m: "DELETE", r: /^\/hq\/category-rules\/(?<ruleId>[^/]+)\/?$/i, h: deleteCategoryRule },
  { m: "POST", r: /^\/hq\/category-rules\/apply\/?$/i, h: applyCategoryRules },
  { m: "GET", r: /^\/hq\/uncategorized\/?$/i, h: listUncategorized },
  { m: "GET", r: /^\/hq\/vendor-counts\/?$/i, h: getVendorCounts },
  { m: "GET", r: /^\/hq\/vendor-matches\/?$/i, h: getVendorMatches },

  { m: "POST", r: /^\/hq\/import-csv\/?$/i, h: importCsv },

  { m: "DELETE", r: /^\/hq\/import-runs\/(?<importRunId>[^/]+)\/?$/i, h: deleteImportRun },

  { m: "POST", r: /^\/hq\/transactions\/apply\/?$/i, h: applyTransactionsBulk },

  { m: "PATCH", r: /^\/hq\/transactions\/(?<dedupeHash>[^/]+)\/?$/i, h: patchTransaction },

  { m: "POST", r: /^\/hq\/accounts\/?$/i, h: createAccount },
  { m: "PATCH", r: /^\/hq\/accounts\/(?<accountId>[^/]+)\/?$/i, h: patchAccount },
  { m: "DELETE", r: /^\/hq\/accounts\/(?<accountId>[^/]+)\/?$/i, h: deleteAccount },

  { m: "GET", r: /^\/hq\/files\/view\/?$/i, h: viewOrgFile },
  { m: "POST", r: /^\/hq\/files\/put-url\/?$/i, h: createOrgFilePutUrl },
  { m: "POST", r: /^\/hq\/files\/delete\/?$/i, h: deleteOrgFiles },

  { m: "DELETE", r: /^\/hq\/reset\/?$/i, h: resetHq },
];

export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  const method = M(event);
  const path = normalizePathForRoutes(event);

  try {
    for (const { m, r, h } of routes) {
      if (m !== method) continue;
      const match = r.exec(path);
      if (match) {
        const params = {};
        for (const [k, v] of Object.entries(match.groups || {})) params[k] = decodeURIComponent(v);
        return await h(event, CORS, params);
      }
    }
    return json(404, CORS, { error: "Not found", method, path });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    const message = statusCode === 404 ? "Not found" : err?.message || "Server error";
    if (statusCode >= 500) {
      console.error("hq_router_error", { method, path, err });
    }
    return json(statusCode, CORS, { error: message });
  }
}
