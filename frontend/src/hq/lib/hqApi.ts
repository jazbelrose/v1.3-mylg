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

export type HqChartSeriesRange = "1W" | "1M" | "3M" | "1Y" | "ALL";

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

export async function applyHqCategoryRules(
  orgId: string,
  input: { importRunId?: string; ruleIds?: string[] }
): Promise<{ orgId: string; updated: number }> {
  const base = getHqServiceBaseUrl();
  return apiFetch<{ orgId: string; updated: number }>(`${base}/hq/category-rules/apply?orgId=${encodeURIComponent(orgId)}`, {
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
  mode: "all" | "keepRules" = "all"
): Promise<{ ok: boolean } & Record<string, unknown>> {
  const base = getHqServiceBaseUrl();
  const params = new URLSearchParams({ orgId, mode });
  return apiFetch(`${base}/hq/reset?${params.toString()}`, {
    method: "DELETE",
  });
}
