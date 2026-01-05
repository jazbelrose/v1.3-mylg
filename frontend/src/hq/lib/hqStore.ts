import { useSyncExternalStore } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  HqAccount,
  HqCategoryId,
  HqCategoryRule,
  HqImportRun,
  HqStoreStateV1,
  HqTransaction,
} from "@/hq/types";

const HQ_STORE_VERSION = 1 as const;
const HQ_STORE_EVENT = "mylg:hq-store-changed";

function storageKey(orgId: string) {
  const normalized = (orgId || "local").trim() || "local";
  return `mylg.hq.v${HQ_STORE_VERSION}.${normalized}`;
}

type CachedSnapshot = {
  raw: string | null;
  state: HqStoreStateV1;
};

const snapshotCache = new Map<string, CachedSnapshot>();

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function defaultState(orgId: string): HqStoreStateV1 {
  return {
    version: HQ_STORE_VERSION,
    orgId,
    accounts: [],
    importRuns: [],
    transactions: [],
    categoryRules: [],
  };
}

export function readHqState(orgId: string): HqStoreStateV1 {
  if (typeof window === "undefined") return defaultState(orgId);

  const key = storageKey(orgId);
  const rawString = localStorage.getItem(key);
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === rawString) {
    return cached.state;
  }

  const parsed = safeParseJson<HqStoreStateV1>(rawString);
  if (!parsed || parsed.version !== HQ_STORE_VERSION || parsed.orgId !== orgId) {
    const state = defaultState(orgId);
    snapshotCache.set(key, { raw: rawString, state });
    return state;
  }

  const state: HqStoreStateV1 = {
    ...defaultState(orgId),
    ...parsed,
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    importRuns: Array.isArray(parsed.importRuns) ? parsed.importRuns : [],
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    categoryRules: Array.isArray(parsed.categoryRules) ? parsed.categoryRules : [],
  };

  snapshotCache.set(key, { raw: rawString, state });
  return state;
}

function writeHqState(orgId: string, state: HqStoreStateV1) {
  if (typeof window === "undefined") return;
  const key = storageKey(orgId);
  const raw = JSON.stringify(state);
  localStorage.setItem(key, raw);
  snapshotCache.set(key, { raw, state });
  window.dispatchEvent(new Event(HQ_STORE_EVENT));
}

function updateState(orgId: string, updater: (prev: HqStoreStateV1) => HqStoreStateV1) {
  const next = updater(readHqState(orgId));
  writeHqState(orgId, next);
}

export function subscribeHqStore(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback();
  window.addEventListener(HQ_STORE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(HQ_STORE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useHqStore<T>(orgId: string, selector: (state: HqStoreStateV1) => T): T {
  return useSyncExternalStore(
    subscribeHqStore,
    () => selector(readHqState(orgId)),
    () => selector(readHqState(orgId))
  );
}

export function createAccount(
  orgId: string,
  input: Omit<HqAccount, "orgId" | "accountId" | "createdAt" | "currency"> & {
    currency?: "USD";
  }
): HqAccount {
  const now = new Date().toISOString();
  const account: HqAccount = {
    orgId,
    accountId: uuidv4(),
    accountName: input.accountName,
    institution: input.institution,
    currency: "USD",
    accountMask: input.accountMask?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    anchorDate: input.anchorDate,
    anchorBalance: input.anchorBalance,
    createdAt: now,
  };

  updateState(orgId, (prev) => ({ ...prev, accounts: [account, ...prev.accounts] }));
  return account;
}

export function updateAccount(
  orgId: string,
  accountId: string,
  patch: Partial<Pick<HqAccount, "accountName" | "institution" | "accountMask" | "notes" | "anchorDate" | "anchorBalance">>
) {
  updateState(orgId, (prev) => {
    const accounts = prev.accounts.map((acct) =>
      acct.accountId === accountId
        ? {
            ...acct,
            ...patch,
            accountMask: patch.accountMask === undefined ? acct.accountMask : patch.accountMask?.trim() || undefined,
            notes: patch.notes === undefined ? acct.notes : patch.notes?.trim() || undefined,
          }
        : acct
    );
    return { ...prev, accounts };
  });
}

export function getAccount(orgId: string, accountId: string): HqAccount | undefined {
  return readHqState(orgId).accounts.find((a) => a.accountId === accountId);
}

export function upsertCategoryRule(orgId: string, rule: HqCategoryRule) {
  updateState(orgId, (prev) => {
    const existingIndex = prev.categoryRules.findIndex((r) => r.ruleId === rule.ruleId);
    const nextRules = [...prev.categoryRules];
    if (existingIndex >= 0) nextRules[existingIndex] = rule;
    else nextRules.unshift(rule);
    nextRules.sort((a, b) => b.priority - a.priority);
    return { ...prev, categoryRules: nextRules };
  });
}

export type ImportTransactionsResult = {
  importRun: HqImportRun;
  imported: number;
  duplicates: number;
};

export function importTransactions(
  orgId: string,
  input: {
    accountId: string;
    filename: string;
    transactions: HqTransaction[];
  }
): ImportTransactionsResult {
  const importRunId = uuidv4();
  const createdAt = new Date().toISOString();

  const baseRun: HqImportRun = {
    orgId,
    importRunId,
    accountId: input.accountId,
    filename: input.filename,
    rowCount: input.transactions.length,
    importedCount: 0,
    duplicateCount: 0,
    status: "processing",
    createdAt,
  };

  let imported = 0;
  let duplicates = 0;

  updateState(orgId, (prev) => {
    const existingKeys = new Set(prev.transactions.map((t) => `${t.accountId}::${t.dedupeHash}`));
    const nextTransactions = [...prev.transactions];

    for (const txn of input.transactions) {
      const key = `${txn.accountId}::${txn.dedupeHash}`;
      if (existingKeys.has(key)) {
        duplicates += 1;
        continue;
      }
      existingKeys.add(key);
      imported += 1;
      nextTransactions.push({ ...txn, orgId, accountId: input.accountId, importRunId });
    }

    nextTransactions.sort((a, b) => b.postedAt.localeCompare(a.postedAt));

    const importRun: HqImportRun = {
      ...baseRun,
      status: "completed",
      importedCount: imported,
      duplicateCount: duplicates,
    };

    return {
      ...prev,
      importRuns: [importRun, ...prev.importRuns],
      transactions: nextTransactions,
    };
  });

  const importRun: HqImportRun = {
    ...baseRun,
    status: "completed",
    importedCount: imported,
    duplicateCount: duplicates,
  };

  return { importRun, imported, duplicates };
}

export function updateTransaction(
  orgId: string,
  dedupeHash: string,
  patch: Partial<Pick<HqTransaction, "categoryId" | "projectId" | "isInternalTransfer">>
) {
  updateState(orgId, (prev) => {
    const transactions = prev.transactions.map((txn) =>
      txn.dedupeHash === dedupeHash ? { ...txn, ...patch } : txn
    );
    return { ...prev, transactions };
  });
}

export function setTransactionCategory(orgId: string, dedupeHash: string, categoryId: HqCategoryId | undefined) {
  updateTransaction(orgId, dedupeHash, { categoryId });
}
