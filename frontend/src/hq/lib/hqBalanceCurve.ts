import type { HqAccount, HqTransaction } from "@/hq/types";
import { HQ_DEFAULT_TIME_ZONE, todayIsoDateInTimeZone } from "@/hq/lib/hqDate";

export type BalancePoint = {
  date: string; // YYYY-MM-DD
  balance: number;
};

function parseIsoDateToUtcMs(isoDate: string): number {
  // Date-only ISO parses as UTC midnight in JS.
  return new Date(isoDate).getTime();
}

function formatUtcMsToIsoDate(utcMs: number): string {
  const d = new Date(utcMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const ms = parseIsoDateToUtcMs(isoDate);
  const next = ms + days * 24 * 60 * 60 * 1000;
  return formatUtcMsToIsoDate(next);
}

function buildDateWindow(endDate: string, days: number): string[] {
  const startDate = addDaysIso(endDate, -(days - 1));
  const out: string[] = [];
  for (let i = 0; i < days; i += 1) {
    out.push(addDaysIso(startDate, i));
  }
  return out;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function netByDateForAccount(accountId: string, transactions: HqTransaction[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const t of transactions) {
    if (t.accountId !== accountId) continue;
    const key = t.postedAt;
    net.set(key, (net.get(key) ?? 0) + t.amount);
  }
  return net;
}

export function computeTotalBalanceCurveLast365Days(
  accounts: HqAccount[],
  transactions: HqTransaction[],
  opts?: { timeZone?: string; endDate?: string }
): BalancePoint[] {
  const timeZone = opts?.timeZone ?? HQ_DEFAULT_TIME_ZONE;
  const endDate = opts?.endDate ?? todayIsoDateInTimeZone(timeZone);
  const dates = buildDateWindow(endDate, 365);

  const totals = new Array<number>(dates.length).fill(0);

  const anchoredAccounts = accounts.filter(
    (a) => a.anchorDate && typeof a.anchorBalance === "number"
  );

  for (const account of anchoredAccounts) {
    const anchorDate = String(account.anchorDate);
    const anchorBalance = account.anchorBalance as number;

    // If the stored anchor date isn’t “today” for the curve window, skip it.
    if (anchorDate !== endDate) continue;

    const netByDate = netByDateForAccount(account.accountId, transactions);

    // Work backwards from anchorDate (endDate), where anchorBalance is end-of-day.
    let current = anchorBalance;
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      const date = dates[i];
      totals[i] += current;

      // Move to previous day’s end-of-day balance.
      const nextDate = date;
      const prevDate = i > 0 ? dates[i - 1] : null;
      if (!prevDate) break;

      const netNextDay = netByDate.get(nextDate) ?? 0;
      current = current - netNextDay;
    }
  }

  return dates.map((date, idx) => ({ date, balance: roundCents(totals[idx]) }));
}
