import { apiFetch, API_BASE_URL } from "@/shared/utils/api";
import type { HqAccount, HqImportRun, HqTransaction } from "@/hq/types";

export type HqSummaryResponse = {
  orgId: string;
  orgRole: string;
  accounts: HqAccount[];
  importRuns: HqImportRun[];
};

export type HqTransactionsResponse = {
  orgId: string;
  transactions: HqTransaction[];
  cursor: string | null;
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

export async function deleteHqImportRun(orgId: string, importRunId: string): Promise<{ ok: boolean } & Record<string, unknown>> {
  const base = getHqServiceBaseUrl();
  return apiFetch(`${base}/hq/import-runs/${encodeURIComponent(importRunId)}?orgId=${encodeURIComponent(orgId)}`, {
    method: "DELETE",
  });
}
