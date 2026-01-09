import { apiFetch, API_BASE_URL } from "@/shared/utils/api";
import type { HqAccount, HqCategoryRule, HqImportRun, HqTransaction } from "@/hq/types";

export type HqSummaryResponse = {
  orgId: string;
  orgRole: string;
  accounts: HqAccount[];
  importRuns: HqImportRun[];
  importWarnings?: string[];
  categoryRules?: HqCategoryRule[];
  cashOnHandAggregate?: number | null;
  missingAnchorAccountIds?: string[];
};

export type HqTransactionsResponse = {
  orgId: string;
  transactions: HqTransaction[];
  cursor: string | null;
};

export type HqChartSeriesRange = "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

export type HqTopCategoriesDirection = "out" | "in" | "net";

export type HqTopCategoriesResponse = {
  orgId: string;
  range: HqChartSeriesRange;
  direction: HqTopCategoriesDirection;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  items: Array<{ categoryId: string; amount: number }>;
};

export type HqBalanceSeriesResponse = {
  accountId: string;
  currency: "USD";
  anchorDate: string; // YYYY-MM-DD
  anchorBalance: number;
  days: number;
  points: Array<{ date: string; balance: number }>;
};

export type HqChartSeriesResponse = {
  scope: "aggregate" | "account";
  accountId?: string;
  range: HqChartSeriesRange;
  currency: "USD";
  anchorDate: string; // YYYY-MM-DD
  anchorBalance: number;
  points: Array<{
    date: string; // YYYY-MM-DD
    balance: number;
    inflow: number;
    outflow: number;
  }>;
  totals: {
    inflow: number;
    outflow: number;
    net: number;
  };
};

function getHqServiceBaseUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_HQ_SERVICE_URL;
  return raw?.trim() || API_BASE_URL;
}

export async function fetchHqSummary(orgId: string): Promise<HqSummaryResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqSummaryResponse>(`${base}/hq/summary?orgId=${encodeURIComponent(orgId)}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export async function fetchHqTransactions(input: {
  orgId: string;
  accountId?: string;
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<HqTransactionsResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId: input.orgId });
  if (input.accountId) params.set("accountId", input.accountId);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));

  return apiFetch<HqTransactionsResponse>(`${base}/hq/transactions?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export async function fetchHqChartSeries(input: {
  orgId: string;
  scope: "aggregate" | "account";
  accountId?: string;
  range: HqChartSeriesRange;
}): Promise<HqChartSeriesResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({
    orgId: input.orgId,
    scope: input.scope,
    range: input.range,
  });
  if (input.scope === "account" && input.accountId) params.set("accountId", input.accountId);

  return apiFetch<HqChartSeriesResponse>(`${base}/hq/chart-series?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export async function fetchHqTopCategories(input: {
  orgId: string;
  range: HqChartSeriesRange;
  limit?: number;
  direction?: HqTopCategoriesDirection;
}): Promise<HqTopCategoriesResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({
    orgId: input.orgId,
    range: input.range,
    direction: input.direction || "out",
  });
  if (typeof input.limit === "number") params.set("limit", String(input.limit));

  return apiFetch<HqTopCategoriesResponse>(`${base}/hq/top-categories?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export async function fetchHqBalanceSeries(input: {
  orgId: string;
  accountId: string;
  days?: number;
}): Promise<HqBalanceSeriesResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({
    orgId: input.orgId,
    accountId: input.accountId,
  });
  if (typeof input.days === "number") params.set("days", String(input.days));

  return apiFetch<HqBalanceSeriesResponse>(`${base}/hq/balance-series?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export async function createHqAccount(orgId: string, input: {
  name: string;
  /** @deprecated legacy field name; accepted for backward compatibility */
  accountName?: string;
  institution: string;
  accountMask?: string;
  notes?: string;
}): Promise<HqAccount> {
  const base = getHqServiceBaseUrl();
  const payload = {
    ...input,
    // If older UI passes accountName, normalize into name.
    name: (input.name || input.accountName || "").trim(),
  };
  const res = await apiFetch<{ account: HqAccount }>(`${base}/hq/accounts?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.account;
}

export async function patchHqAccount(orgId: string, accountId: string, patch: Partial<HqAccount>): Promise<HqAccount> {
  const base = getHqServiceBaseUrl();
  const res = await apiFetch<{ account: HqAccount }>(
    `${base}/hq/accounts/${encodeURIComponent(accountId)}?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
  return res.account;
}

export async function importHqCsv(orgId: string, input: {
  accountId: string;
  filename: string;
  transactions: HqTransaction[];
}): Promise<{ importRun: HqImportRun; imported: number; duplicates: number }> {
  const base = getHqServiceBaseUrl();
  return apiFetch(`${base}/hq/import-csv?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type HqUncategorizedVendorsResponse = {
  orgId: string;
  vendors: Array<{
    vendor: string;
    vendorKey: string;
    count: number;
    example: {
      postedAt: string;
      amount: number;
      rawDescription: string;
      normalizedDescription: string;
      vendor?: string;
      type: string;
    } | null;
    suggestedCategoryId: string | null;
  }>;
};

export async function fetchHqUncategorizedVendors(orgId: string, input?: { importRunId?: string }): Promise<HqUncategorizedVendorsResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId });
  if (input?.importRunId) params.set("importRunId", input.importRunId);
  return apiFetch<HqUncategorizedVendorsResponse>(`${base}/hq/uncategorized?${params.toString()}`, {
    method: "GET",
  });
}

export async function createHqCategoryRule(
  orgId: string,
  input: {
    matchType: "vendor" | "regex";
    pattern: string;
    categoryId: string;
    priority?: number;
    enabled?: boolean;
    scope?: "org" | "account" | "card";
    accountId?: string;
    cardLast4?: string;
    direction?: "in" | "out";
    method?: "ach" | "card" | "wire" | "check" | "transfer";
    applyMode?: "uncategorized" | "overwrite";
    amountMin?: number;
    amountMax?: number;
    frequencyHint?: "weekly" | "biweekly" | "monthly" | "other";
  }
): Promise<{ orgId: string; rule: HqCategoryRule }> {
  const base = getHqServiceBaseUrl();
  return apiFetch<{ orgId: string; rule: HqCategoryRule }>(`${base}/hq/category-rules?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteHqCategoryRule(orgId: string, ruleId: string): Promise<{ ok: boolean } & Record<string, unknown>> {
  const base = getHqServiceBaseUrl();
  return apiFetch(`${base}/hq/category-rules/${encodeURIComponent(ruleId)}?orgId=${encodeURIComponent(orgId)}`, {
    method: "DELETE",
  });
}

export interface ApplyRulesResult {
  orgId: string;
  updated: number;
  scanned?: number;
  matched?: number;
  skipped?: number;
  skippedReasons?: {
    alreadyCategorized?: number;
    noChange?: number;
  };
}

export async function applyHqCategoryRules(
  orgId: string,
  input: { importRunId?: string; ruleIds?: string[]; from?: string; to?: string; accountId?: string }
): Promise<ApplyRulesResult> {
  const base = getHqServiceBaseUrl();
  return apiFetch<ApplyRulesResult>(`${base}/hq/category-rules/apply?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteHqImportRun(orgId: string, importRunId: string): Promise<{ ok: boolean } & Record<string, unknown>> {
  const base = getHqServiceBaseUrl();
  return apiFetch(`${base}/hq/import-runs/${encodeURIComponent(importRunId)}?orgId=${encodeURIComponent(orgId)}`, {
    method: "DELETE",
  });
}

export async function deleteHqAccount(orgId: string, accountId: string): Promise<{ ok: boolean } & Record<string, unknown>> {
  const base = getHqServiceBaseUrl();
  return apiFetch(`${base}/hq/accounts/${encodeURIComponent(accountId)}?orgId=${encodeURIComponent(orgId)}`, {
    method: "DELETE",
  });
}

export async function resetHqData(
  orgId: string,
  mode: "all" | "keepRules" | "keepAccountsAndRules" | "keepAccountsRulesAndImports" | "keepData" = "all"
): Promise<{ ok: boolean } & Record<string, unknown>> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId, mode });
  return apiFetch(`${base}/hq/reset?${params.toString()}`, {
    method: "DELETE",
  });
}

export type HqVendorCountsResponse = {
  orgId: string;
  counts: Record<string, number>;
};

export async function fetchHqVendorCounts(orgId: string, input: {
  vendorKeys: string[];
  from?: string;
  to?: string;
  includeCategorized?: boolean;
  accountId?: string;
}): Promise<HqVendorCountsResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId });
  params.set("vendorKeys", input.vendorKeys.join(","));
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (typeof input.includeCategorized === "boolean") params.set("includeCategorized", input.includeCategorized ? "1" : "0");
  if (input.accountId) params.set("accountId", input.accountId);
  return apiFetch<HqVendorCountsResponse>(`${base}/hq/vendor-counts?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export type HqVendorMatchesResponse = {
  orgId: string;
  vendorKey: string;
  matches: HqTransaction[];
  cursor: string | null;
};

export async function fetchHqVendorMatches(orgId: string, input: {
  vendorKey: string;
  from?: string;
  to?: string;
  includeCategorized?: boolean;
  accountId?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<HqVendorMatchesResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId, vendorKey: input.vendorKey });
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (typeof input.includeCategorized === "boolean") params.set("includeCategorized", input.includeCategorized ? "1" : "0");
  if (input.accountId) params.set("accountId", input.accountId);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));
  return apiFetch<HqVendorMatchesResponse>(`${base}/hq/vendor-matches?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
  });
}

export type HqTransactionsBulkApplyResult = {
  orgId: string;
  updated: number;
};

export async function applyHqTransactionsBulk(
  orgId: string,
  input: { dedupeHashes: string[]; categoryId?: string; type?: string }
): Promise<HqTransactionsBulkApplyResult> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqTransactionsBulkApplyResult>(`${base}/hq/transactions/apply?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
