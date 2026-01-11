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
  const type = String((t.paymentType || t.type || "") as string).trim().toLowerCase();
  const normalized = typeof t?.normalizedDescription === "string" ? t.normalizedDescription : "";

  if (type === "deposit") return "in";
  if (type === "card_purchase" || type === "fee") return "out";

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
  items: Array<{ seriesKey: string; vendorKey: string; label: string; categoryId: string; amountMonthly: number }>;
};

function extractRecurringSeriesDiscriminator(txn: HqTransaction): string {
  const cardLast4 = typeof txn.cardLast4 === "string" ? txn.cardLast4.trim() : "";
  if (/^\d{4}$/.test(cardLast4)) return cardLast4;

  const ref = typeof txn.referenceId === "string" ? txn.referenceId.trim() : "";
  if (ref && ref.length <= 12) {
    const refDigits = /\b(\d{4})\b/.exec(ref)?.[1];
    if (refDigits && !/^19\d{2}$|^20\d{2}$/.test(refDigits)) return refDigits;
  }

  const text = String(txn.normalizedDescription || txn.rawDescription || "").toUpperCase();
  const matches = [...text.matchAll(/\b(\d{4})\b/g)].map((m) => m?.[1]).filter(Boolean);
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const token = matches[i];
    if (!token) continue;
    if (/^19\d{2}$|^20\d{2}$/.test(token)) continue;
    return token;
  }

  return "";
}

function medianNonZero(values: number[]): number {
  const nums = values
    .map((v) => (Number.isFinite(v) ? v : 0))
    .filter((v) => v > 0)
    .slice()
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid] as number;
  return ((nums[mid - 1] as number) + (nums[mid] as number)) / 2;
}

export function buildRecurringSeriesKeyIndex(transactions: HqTransaction[]): Map<string, string> {
  const out = new Map<string, string>();

  type Candidate = { txn: HqTransaction; dedupeHash: string; derivedKey: string; date: string };
  const candidatesByDerivedKey = new Map<string, Candidate[]>();
  const ambiguousDerivedKeys = new Set<string>();
  const countsByDerivedDate = new Map<string, number>();

  for (const txn of transactions) {
    const dh = String(txn.dedupeHash || "").trim();
    if (!dh) continue;

    const recurringSeriesId = typeof txn.recurringSeriesId === "string" ? txn.recurringSeriesId.trim() : "";
    if (recurringSeriesId) {
      out.set(dh, `rs:${recurringSeriesId}`);
      continue;
    }

    const signed = canonicalSignedAmount(txn);
    if (typeof signed !== "number" || !Number.isFinite(signed)) continue;
    const direction = signed < 0 ? "out" : "in";
    const amountBucket = Math.round(Math.abs(signed));
    const { vendorKey } = getVendorKeyForTxn(txn);
    const accountId = txn.accountId || "unknown";
    const baseKey = `${vendorKey}:${accountId}:${direction}:${amountBucket}`;

    const discriminator = extractRecurringSeriesDiscriminator(txn);
    const derivedKey = discriminator ? `${baseKey}:${discriminator}` : baseKey;
    const date = String(txn.postedAt || "").slice(0, 10);
    const candidate: Candidate = { txn, dedupeHash: dh, derivedKey, date };
    const arr = candidatesByDerivedKey.get(derivedKey) || [];
    arr.push(candidate);
    candidatesByDerivedKey.set(derivedKey, arr);

    // Mark ambiguous only if we see multiple occurrences on the SAME posted date
    // for the same derived key (which may include discriminator).
    const countKey = `${derivedKey}|||${date}`;
    const nextCount = (countsByDerivedDate.get(countKey) || 0) + 1;
    countsByDerivedDate.set(countKey, nextCount);
    if (nextCount > 1) ambiguousDerivedKeys.add(derivedKey);
  }

  for (const [derivedKey, items] of candidatesByDerivedKey.entries()) {
    // Stable ordering so slot assignment is deterministic.
    items.sort((a, b) => {
      const dateCmp = String(a.txn.postedAt).localeCompare(String(b.txn.postedAt));
      if (dateCmp) return dateCmp;
      return String(a.dedupeHash).localeCompare(String(b.dedupeHash));
    });

    if (!ambiguousDerivedKeys.has(derivedKey)) {
      for (const it of items) out.set(it.dedupeHash, derivedKey);
      continue;
    }

    const byDate = new Map<string, Candidate[]>();
    for (const it of items) {
      const arr = byDate.get(it.date) || [];
      arr.push(it);
      byDate.set(it.date, arr);
    }

    for (const arr of byDate.values()) {
      arr.sort((a, b) => {
        const dateCmp = String(a.txn.postedAt).localeCompare(String(b.txn.postedAt));
        if (dateCmp) return dateCmp;
        return String(a.dedupeHash).localeCompare(String(b.dedupeHash));
      });

      // Slot within the same posted date. Do not include the date in the key so
      // series identity stays stable across months.
      for (let i = 0; i < arr.length; i += 1) {
        const it = arr[i];
        if (!it) continue;
        out.set(it.dedupeHash, `${derivedKey}:slot${i + 1}`);
      }
    }
  }

  return out;
}

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

  const seriesKeyIndex = buildRecurringSeriesKeyIndex(transactions);
  const bySeriesKey = new Map<
    string,
    {
      seriesKey: string;
      vendorKey: string;
      labelCounts: Map<string, number>;
      categoryCounts: Map<string, number>;
      byMonth: Record<string, number>;
    }
  >();

  for (const txn of transactions) {
    if (excludeInternalTransfers) {
      const categoryId = String(txn.categoryId || "OTHER");
      // Exclude only true transfer categories; do not drop user-categorized Owner Draw/etc
      // just because an upstream heuristic flagged the txn as an internal transfer.
      if (categoryId === "TRANSFERS" || categoryId === "TRANSFER_INTERNAL") continue;
    }
    const isRecurring = txn.isRecurring === true;
    if (!isRecurring) continue;

    const signed = canonicalSignedAmount(txn);
    if (typeof signed !== "number" || !Number.isFinite(signed) || signed >= 0) continue;

    const key = monthKey(txn.postedAt);
    if (!monthKeys.includes(key)) continue;

    const { vendorKey, vendorLabel } = getVendorKeyForTxn(txn);
    const seriesKey = seriesKeyIndex.get(String(txn.dedupeHash)) || null;
    if (!seriesKey) continue;

    const entry =
      bySeriesKey.get(seriesKey) ??
      (() => {
        const next = {
          seriesKey,
          vendorKey,
          labelCounts: new Map<string, number>(),
          categoryCounts: new Map<string, number>(),
          byMonth: {} as Record<string, number>,
        };
        bySeriesKey.set(seriesKey, next);
        return next;
      })();

    entry.byMonth[key] = Math.round(((entry.byMonth[key] || 0) + Math.abs(signed)) * 100) / 100;
    entry.labelCounts.set(vendorLabel, (entry.labelCounts.get(vendorLabel) || 0) + 1);
    const categoryId = String(txn.categoryId || "OTHER");
    entry.categoryCounts.set(categoryId, (entry.categoryCounts.get(categoryId) || 0) + 1);
  }

  const allItems = [...bySeriesKey.values()].map((entry) => {
    const amountMonthly = Math.round(medianNonZero(monthKeys.map((m) => entry.byMonth[m] || 0)) * 100) / 100;
    const label =
      [...entry.labelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
        .find(Boolean) || "Unknown";
    const categoryId =
      [...entry.categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .find(Boolean) || "OTHER";
    return { seriesKey: entry.seriesKey, vendorKey: entry.vendorKey, label, categoryId, amountMonthly };
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
