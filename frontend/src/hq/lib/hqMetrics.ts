import type { HqAccount, HqCategoryId, HqTransaction } from "@/hq/types";

export type HqRangeId = "month" | "quarter" | "ytd";

export function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getRange(range: HqRangeId): { start: string; end: string } {
  const now = new Date();
  const end = todayIsoDate();

  if (range === "month") {
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return { start, end };
  }

  if (range === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`;
    return { start, end };
  }

  const start = `${now.getFullYear()}-01-01`;
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

export function computeCashOnHand(accounts: HqAccount[], transactions: HqTransaction[]): number | null {
  if (accounts.length === 0) return null;
  const accountsWithAnchors = accounts.filter(
    (a) => typeof a.anchorBalance === "number" && a.anchorDate
  );
  if (accountsWithAnchors.length === 0) return null;

  let total = 0;
  for (const account of accountsWithAnchors) {
    const anchorBalance = account.anchorBalance as number;
    const anchorDate = account.anchorDate as string;
    const netSinceAnchor = transactions
      .filter((t) => t.accountId === account.accountId && t.postedAt >= anchorDate)
      .reduce((acc, t) => acc + t.amount, 0);
    total += anchorBalance + netSinceAnchor;
  }
  return Math.round(total * 100) / 100;
}

export function computeTrailingBurn(
  transactions: HqTransaction[],
  months: number
): number | null {
  if (months <= 0) return null;
  const now = new Date();
  const keys: string[] = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
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
  end: string
): Array<{ categoryId: HqCategoryId; amount: number }> {
  const totals: Partial<Record<HqCategoryId, number>> = {};

  for (const txn of transactions) {
    if (!inRange(txn.postedAt, start, end)) continue;
    if (txn.isInternalTransfer) continue;
    if (txn.amount >= 0) continue;
    const category = txn.categoryId || "OTHER";
    if (category === "TRANSFERS") continue;
    totals[category] = (totals[category] || 0) + Math.abs(txn.amount);
  }

  return Object.entries(totals)
    .map(([categoryId, amount]) => ({ categoryId: categoryId as HqCategoryId, amount: Math.round((amount as number) * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
}

