import { apiFetch, API_BASE_URL } from "@/shared/utils/api";
import type { HqAccount, HqCategoryRule, HqImportRun, HqTransaction } from "@/hq/types";

export type HqSummaryResponse = {
  orgId: string;
  orgRole: string;
  accounts: HqAccount[];
  importRuns: HqImportRun[];
  importWarnings: string[];
  categoryRules: HqCategoryRule[];
  cashOnHandAggregate: number | null;
  missingAnchorAccountIds: string[];
};

export type HqTransactionsResponse = {
  orgId: string;
  /** Backward-compat: legacy clients use these fields. */
  transactions: HqTransaction[];
  cursor: string | null;
  /** New list shape (preferred by newer UIs). */
  items?: HqTransaction[];
  nextCursor?: string | null;
  totals?: { count: number; inCents: number; outCents: number; netCents: number };
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

export type HqRecurringCommitmentsResponse = {
  orgId: string;
  months: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  excludeInternalTransfers: boolean;
  mandatoryMonthlyBurn: number;
  items: Array<{ seriesKey: string; vendorKey: string; label: string; categoryId: string; amountMonthly: number }>;
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
  q?: string;
  dir?: "in" | "out" | "all";
  paymentType?: string;
  recurringOnly?: boolean;
  seriesKey?: string;
  categoryId?: string;
  amountMinCents?: number | null;
  amountMaxCents?: number | null;
  amountMode?: "ABS" | "SIGNED";
  sortKey?: "date" | "amount" | "category" | "vendor";
  sortDir?: "asc" | "desc";
  includeTotals?: boolean;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<HqTransactionsResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId: input.orgId });
  if (input.accountId) params.set("accountId", input.accountId);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.q) params.set("q", input.q);
  if (input.dir && input.dir !== "all") params.set("dir", input.dir);
  if (input.paymentType && input.paymentType !== "all") params.set("paymentType", input.paymentType);
  if (input.recurringOnly) params.set("recurringOnly", "1");
  if (input.seriesKey) params.set("seriesKey", input.seriesKey);
  if (input.categoryId && input.categoryId !== "all") params.set("categoryId", input.categoryId);
  if (typeof input.amountMinCents === "number") params.set("amount_min_cents", String(input.amountMinCents));
  if (typeof input.amountMaxCents === "number") params.set("amount_max_cents", String(input.amountMaxCents));
  if (input.amountMode) params.set("amount_mode", input.amountMode);
  if (input.sortKey) params.set("sort_key", input.sortKey);
  if (input.sortDir) params.set("sort_dir", input.sortDir);
  if (input.includeTotals) params.set("include_totals", "1");
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));

  return apiFetch<HqTransactionsResponse>(`${base}/hq/transactions?${params.toString()}`, {
    method: "GET",
    suppressErrorLog: true,
    signal: input.signal,
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

export async function fetchHqRecurringCommitments(input: {
  orgId: string;
  months?: number;
  limit?: number;
  excludeInternalTransfers?: boolean;
}): Promise<HqRecurringCommitmentsResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId: input.orgId });
  if (typeof input.months === "number") params.set("months", String(input.months));
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  if (input.excludeInternalTransfers === false) params.set("excludeInternalTransfers", "0");
  return apiFetch<HqRecurringCommitmentsResponse>(`${base}/hq/recurring-commitments?${params.toString()}`, {
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
  input: {
    dedupeHashes: string[];
    categoryId?: string;
    /** Legacy field name (server accepts). Prefer paymentType going forward. */
    type?: string;
    paymentType?: string;
    isRecurring?: boolean;
    recurringSeriesId?: string;
  }
): Promise<HqTransactionsBulkApplyResult> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqTransactionsBulkApplyResult>(`${base}/hq/transactions/apply?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/* ------------ Transaction Allocation API ------------ */

export type HqAllocationInput = {
  budgetItemId: string;
  projectId: string;
  amount: number;
};

export type HqTransactionAllocationResponse = {
  ok: boolean;
  orgId: string;
  dedupeHash: string;
  allocations: Array<{
    budgetItemId: string;
    projectId: string;
    amount: number;
    allocatedAt: string;
    allocatedBy?: string;
  }>;
};

/**
 * POST /hq/transactions/:dedupeHash/allocations
 * Add an allocation linking a transaction to a budget line item.
 */
export async function addHqTransactionAllocation(
  orgId: string,
  dedupeHash: string,
  allocation: HqAllocationInput
): Promise<HqTransactionAllocationResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqTransactionAllocationResponse>(
    `${base}/hq/transactions/${encodeURIComponent(dedupeHash)}/allocations?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allocation),
    }
  );
}

/**
 * DELETE /hq/transactions/:dedupeHash/allocations/:budgetItemId
 * Remove an allocation from a transaction.
 */
export async function removeHqTransactionAllocation(
  orgId: string,
  dedupeHash: string,
  budgetItemId: string
): Promise<HqTransactionAllocationResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqTransactionAllocationResponse>(
    `${base}/hq/transactions/${encodeURIComponent(dedupeHash)}/allocations/${encodeURIComponent(budgetItemId)}?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "DELETE",
    }
  );
}

/**
 * PUT /hq/transactions/:dedupeHash/allocations
 * Replace all allocations for a transaction (bulk update).
 */
export async function updateHqTransactionAllocations(
  orgId: string,
  dedupeHash: string,
  allocations: HqAllocationInput[]
): Promise<HqTransactionAllocationResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqTransactionAllocationResponse>(
    `${base}/hq/transactions/${encodeURIComponent(dedupeHash)}/allocations?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations }),
    }
  );
}

export type HqAllocationSummaryResponse = {
  orgId: string;
  totalAllocated: number;
  totalUnallocated: number;
  byProject: Array<{
    projectId: string;
    allocated: number;
    transactionCount: number;
  }>;
};

/**
 * GET /hq/allocations/summary
 * Get org-wide allocation summary (for KPI cards).
 */
export async function fetchHqAllocationSummary(orgId: string): Promise<HqAllocationSummaryResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqAllocationSummaryResponse>(
    `${base}/hq/allocations/summary?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "GET",
      suppressErrorLog: true,
    }
  );
}

export type HqBudgetLineAllocationsResponse = {
  projectId: string;
  budgetItemId: string;
  totalAllocated: number;
  transactions: Array<{
    dedupeHash: string;
    accountId: string;
    postedAt: string;
    amount: number;
    allocatedAmount: number;
    vendor?: string;
    rawDescription: string;
    categoryId?: string;
  }>;
};

/**
 * GET /hq/allocations/by-budget-item
 * Get all transactions allocated to a specific budget line item.
 */
export async function fetchHqBudgetLineAllocations(
  orgId: string,
  projectId: string,
  budgetItemId: string
): Promise<HqBudgetLineAllocationsResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId, projectId, budgetItemId });
  return apiFetch<HqBudgetLineAllocationsResponse>(
    `${base}/hq/allocations/by-budget-item?${params.toString()}`,
    {
      method: "GET",
      suppressErrorLog: true,
    }
  );
}

export type HqAllocationsByProjectResponse = {
  projectId: string;
  /** Map of budgetItemId -> allocated amount (absolute value in dollars) */
  allocations: Record<string, number>;
};

/**
 * POST /hq/allocations/by-project
 * Get allocation totals for multiple budget items in a project (batch endpoint).
 */
export async function fetchHqAllocationsByProject(
  orgId: string,
  projectId: string,
  budgetItemIds?: string[]
): Promise<HqAllocationsByProjectResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId, projectId });
  return apiFetch<HqAllocationsByProjectResponse>(
    `${base}/hq/allocations/by-project?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetItemIds: budgetItemIds ?? [] }),
      suppressErrorLog: true,
    }
  );
}

/* ------------ Org Files API ------------ */

export type HqFileDeleteResponse = {
  ok: boolean;
  orgId: string;
  deleted: string[];
  errors: Array<{ key: string; code: string; message: string }>;
};

/**
 * POST /hq/files/delete
 * Deletes org-scoped files from S3.
 */
export async function deleteHqFiles(
  orgId: string,
  fileKeys: string[]
): Promise<HqFileDeleteResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<HqFileDeleteResponse>(`${base}/hq/files/delete?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileKeys }),
  });
}

export type HqFileViewResponse = {
  key: string;
  orgId: string;
  downloadUrl: string;
  rangeSupported: boolean;
  sizeBytes: number | null;
  contentType: string | null;
  lastModified: string | null;
  etag: string | null;
  isTextLike: boolean;
};

/**
 * GET /hq/files/view
 * Returns metadata + a signed GET URL for an org-scoped file.
 */
export function orgFileViewUrl(orgId: string): string {
  const base = getHqServiceBaseUrl();
  return `${base}/hq/files/view?orgId=${encodeURIComponent(orgId)}`;
}

export type HqFilePutUrlResponse = {
  orgId: string;
  key: string;
  uploadUrl: string;
  requiresIfMatch: boolean;
};

/**
 * POST /hq/files/put-url
 * Returns a signed PUT URL for updating text-like org-scoped files in S3.
 */
export function orgFilePutUrl(orgId: string): string {
  const base = getHqServiceBaseUrl();
  return `${base}/hq/files/put-url?orgId=${encodeURIComponent(orgId)}`;
}

/* ------------ Export/Import Bundle (Memry Ledger Backup) ------------ */

export type MemryBundleTransaction = {
  dedupeHash: string;
  accountId: string;
  postedAt: string;
  authorizedAt?: string;
  amount: number;
  currency: string;
  rawDescription: string;
  normalizedDescription: string;
  vendor?: string;
  vendorKey?: string;
  counterparty?: string;
  paymentType?: string;
  type?: string;
  direction: "in" | "out";
  categoryId?: string;
  categoryConfidence?: number;
  isInternalTransfer?: boolean;
  isRecurring?: boolean;
  recurringCandidate?: boolean;
  recurringSeriesId?: string;
  projectId?: string;
  locationCity?: string;
  locationState?: string;
  cardLast4?: string;
  referenceId?: string;
  importRunId?: string;
  createdAt?: string;
};

export type MemryBundleAccount = {
  accountId: string;
  name: string;
  institution?: string;
  currency?: string;
  accountMask?: string;
  notes?: string;
  includeInCashOnHand?: boolean;
  anchorDate?: string;
  anchorBalance?: number;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MemryBundleCategoryRule = {
  ruleId: string;
  priority: number;
  matchType: "vendor" | "regex";
  pattern: string;
  categoryId: string;
  projectId?: string;
  scope?: string;
  accountId?: string;
  cardLast4?: string;
  direction?: "in" | "out";
  method?: string;
  applyMode?: string;
  amountMin?: number;
  amountMax?: number;
  frequencyHint?: string;
  enabled: boolean;
  createdAt?: string;
};

export type MemryBundle = {
  _format: "memry-ledger-bundle";
  _version: number;
  exportedAt: string;
  sourceOrgId: string;
  dateRange: { from: string | null; to: string | null };
  stats: {
    transactionCount: number;
    accountCount: number;
    categoryRuleCount: number;
    importRunCount: number;
  };
  accounts: MemryBundleAccount[];
  categoryRules: MemryBundleCategoryRule[];
  importRuns: Array<{
    importRunId: string;
    accountId: string;
    filename: string;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    status: string;
    warnings?: string[];
    createdAt: string;
  }>;
  transactions: MemryBundleTransaction[];
};

export type ExportBundleResponse = MemryBundle;

/**
 * GET /hq/export-bundle
 * Exports all categorization data as a .memry.json backup for lossless round-trip import.
 */
export async function exportHqBundle(
  orgId: string,
  options?: { from?: string; to?: string }
): Promise<ExportBundleResponse> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId });
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);
  return apiFetch<ExportBundleResponse>(`${base}/hq/export-bundle?${params.toString()}`, {
    method: "GET",
  });
}

/**
 * Downloads the bundle as a .memry.json file.
 */
export async function downloadHqBundle(
  orgId: string,
  options?: { from?: string; to?: string }
): Promise<void> {
  const bundle = await exportHqBundle(orgId, options);
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `memry-ledger-${orgId.slice(0, 8)}-${date}.memry.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ImportBundleConflictResolution = "skip" | "overwrite" | "merge";
export type ImportBundleMode = "categorization" | "full";

export type ImportBundleOptions = {
  mode?: ImportBundleMode;
  conflictResolution?: ImportBundleConflictResolution;
  createMissingAccounts?: boolean;
  createCategoryRules?: boolean;
  dryRun?: boolean;
};

export type ImportBundleConflict = {
  dedupeHash: string;
  existingCategory: string;
  bundleCategory: string;
  postedAt: string;
  vendor?: string;
};

export type ImportBundleResponse = {
  ok: boolean;
  orgId: string;
  sourceOrgId: string;
  results: {
    mode: string;
    conflictResolution: string;
    dryRun: boolean;
    transactions: {
      matched: number;
      updated: number;
      skipped: number;
      notFound: number;
      conflicts: ImportBundleConflict[];
    };
    accounts: {
      created: number;
      skipped: number;
      mapped: Record<string, string | null>;
    };
    categoryRules: {
      created: number;
      skipped: number;
    };
  };
};

/**
 * POST /hq/import-bundle
 * Imports categorization data from a .memry.json backup.
 */
export async function importHqBundle(
  orgId: string,
  bundle: MemryBundle,
  options?: ImportBundleOptions
): Promise<ImportBundleResponse> {
  const base = getHqServiceBaseUrl();
  return apiFetch<ImportBundleResponse>(`${base}/hq/import-bundle?orgId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bundle,
      mode: options?.mode ?? "categorization",
      conflictResolution: options?.conflictResolution ?? "merge",
      createMissingAccounts: options?.createMissingAccounts,
      createCategoryRules: options?.createCategoryRules,
      dryRun: options?.dryRun,
    }),
  });
}

/**
 * GET /hq/export-csv
 * Downloads transactions as a simple CSV file for spreadsheet use.
 */
export async function downloadHqCsv(
  orgId: string,
  options?: { from?: string; to?: string }
): Promise<void> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId });
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);

  const response = await fetch(`${base}/hq/export-csv?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `memry-ledger-${orgId.slice(0, 8)}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
