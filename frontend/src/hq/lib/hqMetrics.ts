import type { HqAccount, HqCategoryId, HqTransaction } from "@/hq/types";
import { HQ_DEFAULT_TIME_ZONE, todayIsoDateInTimeZone } from "@/hq/lib/hqDate";
import { getVendorKeyForTxn } from "@/hq/lib/vendorNormalization";

export type HqRangeId = "month" | "quarter" | "ytd";

export function todayIsoDate(): string {
  return todayIsoDateInTimeZone(HQ_DEFAULT_TIME_ZONE);
}

export function getRange(range: HqRangeId): { start: string; end: string } {
  const end = todayIsoDate();
  const [yyyy, mm] = end.split("-");
  const year = Number(yyyy);
  const monthIndex = Number(mm) - 1;

  if (range === "month") {
    const start = `${yyyy}-${mm}-01`;
    return { start, end };
  }

  if (range === "quarter") {
    const quarterStartMonthIndex = Math.floor(monthIndex / 3) * 3;
    const startMm = String(quarterStartMonthIndex + 1).padStart(2, "0");
    const start = `${yyyy}-${startMm}-01`;
    return { start, end };
  }

  const start = `${String(year)}-01-01`;
  return { start, end };
}

export function inRange(postedAt: string, start: string, end: string): boolean {
  return postedAt >= start && postedAt <= end;
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthLabel(yyyyMm: string): string {
  const [yyyy, mm] = yyyyMm.split("-");
  const monthIndex = Number(mm) - 1;
  const date = new Date(Number(yyyy), Math.max(0, monthIndex), 1);
  return date.toLocaleString(undefined, { month: "short" });
}

function inferTxnDirection(t: HqTransaction): "in" | "out" | undefined {
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
}

export function canonicalSignedAmount(t: HqTransaction): number | null {
  const amt = typeof t?.amount === "number" ? t.amount : Number(t?.amount);
  if (!Number.isFinite(amt)) return null;
  if (amt < 0) return amt;
  const dir = inferTxnDirection(t);
  if (dir === "in") return Math.abs(amt);
  if (dir === "out") return -Math.abs(amt);
  return amt;
}

export function computeCashOnHand(accounts: HqAccount[], transactions: HqTransaction[]): number | null {
  if (accounts.length === 0) return null;
  const accountsWithAnchors = accounts
    .filter((a) => !a.archivedAt && a.includeInCashOnHand !== false)
    .filter((a) => typeof a.anchorBalance === "number" && a.anchorDate);
  if (accountsWithAnchors.length === 0) return null;

  let total = 0;
  for (const account of accountsWithAnchors) {
    const anchorBalance = account.anchorBalance as number;
    const anchorDate = String(account.anchorDate || "").slice(0, 10);
    const netSinceAnchor = transactions
      // Anchor balance is treated as end-of-day for anchorDate.
      // To reach today's cash-on-hand, include only txns AFTER the anchor date.
      .filter((t) => {
        if (t.accountId !== account.accountId) return false;
        const postedAt = String(t.postedAt || "").slice(0, 10);
        if (!postedAt || !anchorDate) return false;
        return postedAt > anchorDate;
      })
      .reduce((acc, t) => {
        const signed = canonicalSignedAmount(t);
        if (typeof signed !== "number") return acc;
        return acc + signed;
      }, 0);
    total += anchorBalance + netSinceAnchor;
  }
  return Math.round(total * 100) / 100;
}

function parseYyyyMm(yyyyMm: string): { year: number; monthIndex: number } {
  const [y, m] = yyyyMm.split("-");
  return { year: Number(y), monthIndex: Number(m) - 1 };
}

function addMonths(yyyyMm: string, deltaMonths: number): string {
  const { year, monthIndex } = parseYyyyMm(yyyyMm);
  const total = year * 12 + monthIndex + deltaMonths;
  const nextYear = Math.floor(total / 12);
  const nextMonthIndex = total % 12;
  return `${String(nextYear)}-${String(nextMonthIndex + 1).padStart(2, "0")}`;
}

export function computeTrailingBurn(
  transactions: HqTransaction[],
  months: number
): number | null {
  if (months <= 0) return null;
  // Trailing N FULL months (not partial): months prior to the current month.
  // Example: if today is 2026-01-05, the 3 full months are 2025-10, 2025-11, 2025-12.
  const today = todayIsoDate();
  const currentMonthKey = monthKey(today);
  const keys: string[] = [];
  for (let i = 1; i <= months; i += 1) {
    keys.push(addMonths(currentMonthKey, -i));
  }

  const outflowsByMonth: Record<string, number> = {};
  for (const key of keys) outflowsByMonth[key] = 0;

  for (const txn of transactions) {
    if (txn.isInternalTransfer) continue;
    if (txn.amount >= 0) continue;
    const key = monthKey(txn.postedAt);
    if (!(key in outflowsByMonth)) continue;
    outflowsByMonth[key] += Math.abs(txn.amount);
  }

  const values = Object.values(outflowsByMonth);
  if (values.every((v) => v === 0)) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 100) / 100;
}

type RecurringSummary = {
  months: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  mandatoryMonthlyBurn: number;
  items: Array<{ vendorKey: string; label: string; amountMonthly: number }>;
};

function lastDayOfMonth(yyyyMm: string): string | null {
  const { year, monthIndex } = parseYyyyMm(yyyyMm);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  return d.toISOString().slice(0, 10);
}

export function computeRecurringCommitments(
  transactions: HqTransaction[],
  months: number,
  opts?: { excludeInternalTransfers?: boolean; limit?: number }
): RecurringSummary {
  const safeMonths = Math.max(1, Math.min(12, Math.floor(months || 0) || 3));
  const limit = typeof opts?.limit === "number" ? Math.max(1, Math.min(12, Math.floor(opts.limit))) : 8;
  const excludeInternalTransfers = opts?.excludeInternalTransfers !== false;

  const today = todayIsoDate();
  const currentMonthKey = monthKey(today);
  const monthKeys: string[] = [];
  for (let i = 1; i <= safeMonths; i += 1) monthKeys.push(addMonths(currentMonthKey, -i));
  monthKeys.sort();

  const earliest = monthKeys[0] || currentMonthKey;
  const latest = monthKeys[monthKeys.length - 1] || currentMonthKey;
  const startDate = `${earliest}-01`;
  const endDate = lastDayOfMonth(latest) || today;

  const byVendorKey = new Map<
    string,
    { vendorKey: string; labelCounts: Map<string, number>; byMonth: Record<string, number> }
  >();

  for (const txn of transactions) {
    if (excludeInternalTransfers && txn.isInternalTransfer) continue;
    const type = String(txn.type || "").trim().toLowerCase();
    if (type !== "recurring") continue;

    const signed = canonicalSignedAmount(txn);
    if (typeof signed !== "number" || !Number.isFinite(signed) || signed >= 0) continue;

    const key = monthKey(txn.postedAt);
    if (!monthKeys.includes(key)) continue;

    const { vendorKey, vendorLabel } = getVendorKeyForTxn(txn);
    const entry =
      byVendorKey.get(vendorKey) ??
      (() => {
        const next = { vendorKey, labelCounts: new Map<string, number>(), byMonth: {} as Record<string, number> };
        byVendorKey.set(vendorKey, next);
        return next;
      })();

    entry.byMonth[key] = Math.round(((entry.byMonth[key] || 0) + Math.abs(signed)) * 100) / 100;
    entry.labelCounts.set(vendorLabel, (entry.labelCounts.get(vendorLabel) || 0) + 1);
  }

  const allItems = [...byVendorKey.values()].map((entry) => {
    const monthTotal = monthKeys.reduce((acc, m) => acc + (entry.byMonth[m] || 0), 0);
    const amountMonthly = Math.round((monthTotal / Math.max(1, monthKeys.length)) * 100) / 100;
    const label =
      [...entry.labelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
        .find(Boolean) || "Unknown";
    return { vendorKey: entry.vendorKey, label, amountMonthly };
  });

  const mandatoryMonthlyBurn = Math.round(allItems.reduce((acc, x) => acc + (x.amountMonthly || 0), 0) * 100) / 100;
  const items = allItems
    .filter((x) => Number.isFinite(x.amountMonthly) && x.amountMonthly > 0)
    .sort((a, b) => b.amountMonthly - a.amountMonthly)
    .slice(0, limit);

  return { months: safeMonths, startDate, endDate, mandatoryMonthlyBurn, items };
}

export function computeMonthlyFlow(transactions: HqTransaction[], start: string, end: string) {
  const buckets: Record<string, { inflow: number; outflow: number }> = {};
  for (const txn of transactions) {
    if (!inRange(txn.postedAt, start, end)) continue;
    if (txn.isInternalTransfer) continue;
    const key = monthKey(txn.postedAt);
    if (!buckets[key]) buckets[key] = { inflow: 0, outflow: 0 };
    if (txn.amount >= 0) buckets[key].inflow += txn.amount;
    else buckets[key].outflow += Math.abs(txn.amount);
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      month: monthLabel(key),
      inflow: Math.round(value.inflow * 100) / 100,
      outflow: Math.round(value.outflow * 100) / 100,
    }));
}

export function computeTopCategories(
  transactions: HqTransaction[],
  start: string,
  end: string,
  options?: { direction?: "out" | "in" | "net"; limit?: number }
): Array<{ categoryId: string; amount: number }> {
  const direction = options?.direction === "in" ? "in" : options?.direction === "net" ? "net" : "out";
  const limit = typeof options?.limit === "number" ? options.limit : 8;

  const totals: Record<string, number> = {};

  for (const txn of transactions) {
    const postedAt = String(txn.postedAt || "").slice(0, 10);
    if (!postedAt || postedAt < start || postedAt > end) continue;
    const signed = canonicalSignedAmount(txn);
    if (typeof signed !== "number" || !Number.isFinite(signed) || signed === 0) continue;

    if (direction === "out" && signed >= 0) continue;
    if (direction === "in" && signed <= 0) continue;

    const categoryId = txn.categoryId ? String(txn.categoryId) : "OTHER";
    // Keep parity with backend: only exclude true transfer categories.
    // We still want to count Owner Draw/etc even if a txn is flagged as internal transfer.
    if (categoryId === "TRANSFERS" || categoryId === "TRANSFER_INTERNAL") continue;

    const add = direction === "out" ? Math.abs(signed) : direction === "in" ? signed : signed;
    totals[categoryId] = Math.round(((totals[categoryId] || 0) + add) * 100) / 100;
  }

  return Object.entries(totals)
    .map(([categoryId, amount]) => ({ categoryId, amount: Math.round((amount as number) * 100) / 100 }))
    .filter((x) => Number.isFinite(x.amount) && x.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Math.max(1, limit));
}
