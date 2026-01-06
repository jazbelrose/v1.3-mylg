// backend/hq/router.mjs
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";
import { requireCallerUserId, httpError } from "/opt/nodejs/utils/auth.mjs";
import { requireOrgMember, requireOrgAdmin } from "/opt/nodejs/utils/orgAuth.mjs";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

/* ------------ ENV ------------ */
const REGION = process.env.AWS_REGION || "us-west-2";

const HQ_TABLE = process.env.HQ_TABLE || "HqLedger";
const ORG_MEMBERS_TABLE = process.env.ORG_MEMBERS_TABLE || "OrgMembers";

/* ------------ DDB ------------ */
const ddb = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

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

const chunk = (arr, n = 25) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/* ------------ Handlers ------------ */
const health = async (_e, C) => json(200, C, { ok: true, domain: "hq" });

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
    accountName: a.accountName,
    institution: a.institution,
    currency: a.currency || "USD",
    accountMask: a.accountMask,
    notes: a.notes,
    anchorDate: a.anchorDate,
    anchorBalance: a.anchorBalance,
    createdAt: a.createdAt,
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
    createdAt: r.createdAt,
  }));

  return json(200, C, {
    orgId,
    orgRole: membership.role,
    accounts,
    importRuns,
  });
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
    createdAt: t.createdAt,
  }));

  if (accountId) {
    txns = txns.filter((t) => t.accountId === accountId);
  }

  return json(200, C, { orgId, transactions: txns, cursor: encodeCursor(res.LastEvaluatedKey) });
};

// POST /hq/accounts?orgId=...
const createAccount = async (e, C) => {
  const userId = requireCallerUserId(e);
  const orgId = pkForOrg(Q(e).orgId);
  if (!orgId) return json(400, C, { error: "orgId required" });

  await requireOrgAdmin({ ddb, tableName: ORG_MEMBERS_TABLE, orgId, userId });

  const body = B(e);
  const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
  const institution = typeof body.institution === "string" ? body.institution.trim() : "";

  if (accountName.length < 2 || institution.length < 2) {
    return json(400, C, { error: "accountName and institution required" });
  }

  const accountId = uuidv4();
  const createdAt = nowISO();

  const item = {
    orgId,
    sk: skAccount(accountId),
    entityType: "account",
    accountId,
    accountName,
    institution,
    currency: "USD",
    accountMask: typeof body.accountMask === "string" ? body.accountMask.trim() || undefined : undefined,
    notes: typeof body.notes === "string" ? body.notes.trim() || undefined : undefined,
    anchorDate: typeof body.anchorDate === "string" ? body.anchorDate.trim() || undefined : undefined,
    anchorBalance: typeof body.anchorBalance === "number" ? body.anchorBalance : undefined,
    createdAt,
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

  if (typeof body.accountName === "string") setField("accountName", body.accountName.trim());
  if (typeof body.institution === "string") setField("institution", body.institution.trim());
  if (typeof body.accountMask === "string") setField("accountMask", body.accountMask.trim() || null);
  if (typeof body.notes === "string") setField("notes", body.notes.trim() || null);
  if (typeof body.anchorDate === "string") setField("anchorDate", body.anchorDate.trim() || null);
  if (typeof body.anchorBalance === "number" || body.anchorBalance === null) setField("anchorBalance", body.anchorBalance);

  if (!sets.length) return json(400, C, { error: "No fields to update" });

  const res = await ddb.update({
    TableName: HQ_TABLE,
    Key: { orgId, sk: skAccount(accountId) },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: "ALL_NEW",
  });

  return json(200, C, { account: res.Attributes || null });
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

  // De-dupe by existing TXN keys within the org.
  const txKeys = transactions
    .map((t) => ({
      orgId,
      sk: skTxn(String(t.postedAt || ""), String(t.dedupeHash || "")),
      accountId: String(t.accountId || accountId),
      postedAt: String(t.postedAt || ""),
      dedupeHash: String(t.dedupeHash || ""),
      raw: t,
    }))
    .filter((k) => k.postedAt && k.dedupeHash);

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
  for (const batch of chunk(uniqueTxKeys, 100)) {
    const keys = batch.map((k) => ({ orgId: k.orgId, sk: k.sk }));
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
  for (const k of uniqueTxKeys) {
    if (existing.has(k.sk)) {
      duplicates += 1;
      continue;
    }
    imported += 1;
    const t = k.raw || {};
    toWrite.push({
      PutRequest: {
        Item: {
          orgId,
          sk: k.sk,
          entityType: "transaction",
          accountId,
          postedAt: k.postedAt,
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
          importRunId,
          dedupeHash: k.dedupeHash,
          createdAt,
        },
      },
    });
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
    accountId,
    filename,
    rowCount: transactions.length,
    importedCount: imported,
    duplicateCount: duplicates,
    status: "completed",
    createdAt,
  };

  await ddb.put({ TableName: HQ_TABLE, Item: runItem });

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

  return json(200, C, { ok: true, deletedTransactions: deletedTxns, importRunId });
};

/* ------------ Routes ------------ */
const routes = [
  { m: "GET", r: /^\/hq\/health$/i, h: health },

  { m: "GET", r: /^\/hq\/summary\/?$/i, h: getSummary },
  { m: "GET", r: /^\/hq\/transactions\/?$/i, h: listTransactions },

  { m: "POST", r: /^\/hq\/import-csv\/?$/i, h: importCsv },

  { m: "DELETE", r: /^\/hq\/import-runs\/(?<importRunId>[^/]+)\/?$/i, h: deleteImportRun },

  { m: "POST", r: /^\/hq\/accounts\/?$/i, h: createAccount },
  { m: "PATCH", r: /^\/hq\/accounts\/(?<accountId>[^/]+)\/?$/i, h: patchAccount },
];

export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  const method = M(event);
  const path = P(event);

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
