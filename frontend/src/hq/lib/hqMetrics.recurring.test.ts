import { describe, expect, it, vi } from "vitest";

vi.mock("@/hq/lib/hqDate", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hq/lib/hqDate");
  return {
    ...actual,
    todayIsoDateInTimeZone: () => "2026-01-09",
  };
});

import type { HqTransaction } from "../types";

function txn(partial: Partial<HqTransaction> & Pick<HqTransaction, "postedAt" | "amount">): HqTransaction {
  return {
    orgId: "ORG#test",
    accountId: "ACCOUNT#1",
    postedAt: partial.postedAt,
    amount: partial.amount,
    currency: "USD",
    rawDescription: partial.rawDescription || "RECURRING PAYMENT AUTHORIZED ON 12/15 ACME",
    normalizedDescription: partial.normalizedDescription || "RECURRING PAYMENT AUTHORIZED ON 12/15 ACME",
    paymentType: partial.paymentType || "card_purchase",
    type: partial.type || "card_purchase",
    direction: partial.amount < 0 ? "out" : "in",
    vendor: partial.vendor || "ACME",
    counterparty: partial.counterparty,
    cardLast4: partial.cardLast4,
    referenceId: partial.referenceId,
    categoryId: partial.categoryId,
    isInternalTransfer: partial.isInternalTransfer,
    isRecurring: partial.isRecurring,
    recurringCandidate: partial.recurringCandidate,
    recurringSeriesId: partial.recurringSeriesId,
    importRunId: "pending",
    dedupeHash: partial.dedupeHash || `${partial.postedAt}-${partial.amount}`,
    createdAt: "2026-01-09T00:00:00.000Z",
  };
}

describe("computeRecurringCommitments", () => {
  it("uses confirmed isRecurring (not legacy type='recurring')", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const transactions: HqTransaction[] = [
      txn({ postedAt: "2025-10-15", amount: -100, isRecurring: true }),
      txn({ postedAt: "2025-11-15", amount: -100, isRecurring: true }),
      txn({ postedAt: "2025-12-15", amount: -100, isRecurring: true }),
      // Legacy record that would have matched old logic; should NOT count without user confirmation.
      txn({ postedAt: "2025-12-20", amount: -999, type: "recurring", isRecurring: false }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.months).toBe(3);
    expect(res.mandatoryMonthlyBurn).toBe(100);
    expect(res.items.length).toBe(1);
    expect(res.items[0]?.amountMonthly).toBe(100);
  });
  
  it("includes Owner Draw even if transfer-flagged when excluding internal transfers", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const transactions: HqTransaction[] = [
      txn({ postedAt: "2025-10-05", amount: -250, isRecurring: true, categoryId: "OWNER_DRAW", isInternalTransfer: true }),
      txn({ postedAt: "2025-11-05", amount: -250, isRecurring: true, categoryId: "OWNER_DRAW", isInternalTransfer: true }),
      txn({ postedAt: "2025-12-05", amount: -250, isRecurring: true, categoryId: "OWNER_DRAW", isInternalTransfer: true }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.items.length).toBe(1);
    expect(res.items[0]?.amountMonthly).toBe(250);
  });

  it("excludes true transfer categories when excluding internal transfers", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const transactions: HqTransaction[] = [
      txn({ postedAt: "2025-10-10", amount: -100, isRecurring: true, categoryId: "TRANSFER_INTERNAL", isInternalTransfer: true }),
      txn({ postedAt: "2025-11-10", amount: -100, isRecurring: true, categoryId: "TRANSFER_INTERNAL", isInternalTransfer: true }),
      txn({ postedAt: "2025-12-10", amount: -100, isRecurring: true, categoryId: "TRANSFER_INTERNAL", isInternalTransfer: true }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.items.length).toBe(0);
    expect(res.mandatoryMonthlyBurn).toBe(0);
  });

  it("splits lookalike duplicates into distinct series via seriesKey discriminator", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const baseA = {
      rawDescription: "ONLINE TRANSFER TO OWNER DRAW 1111",
      normalizedDescription: "ONLINE TRANSFER TO OWNER DRAW 1111",
      vendor: "ONLINE TRANSFER TO OWNER DRAW 1111",
      isRecurring: true,
      categoryId: "OWNER_DRAW",
      isInternalTransfer: true,
    } as const;

    const baseB = {
      rawDescription: "ONLINE TRANSFER TO OWNER DRAW 2222",
      normalizedDescription: "ONLINE TRANSFER TO OWNER DRAW 2222",
      vendor: "ONLINE TRANSFER TO OWNER DRAW 2222",
      isRecurring: true,
      categoryId: "OWNER_DRAW",
      isInternalTransfer: true,
    } as const;

    const transactions: HqTransaction[] = [
      // Oct
      txn({ postedAt: "2025-10-15", amount: -100, dedupeHash: "oct-a", ...baseA }),
      txn({ postedAt: "2025-10-15", amount: -100, dedupeHash: "oct-b", ...baseB }),
      // Nov
      txn({ postedAt: "2025-11-15", amount: -100, dedupeHash: "nov-a", ...baseA }),
      txn({ postedAt: "2025-11-15", amount: -100, dedupeHash: "nov-b", ...baseB }),
      // Dec
      txn({ postedAt: "2025-12-15", amount: -100, dedupeHash: "dec-a", ...baseA }),
      txn({ postedAt: "2025-12-15", amount: -100, dedupeHash: "dec-b", ...baseB }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.items.length).toBe(2);
    expect(res.items.map((x) => x.amountMonthly).sort()).toEqual([100, 100]);
    expect(new Set(res.items.map((x) => x.seriesKey)).size).toBe(2);
  });

  it("computes '/mo' as typical month (not diluted by missing months)", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const transactions: HqTransaction[] = [
      // Only one of the trailing 3 full months has an occurrence.
      txn({ postedAt: "2025-12-20", amount: -2000, isRecurring: true, categoryId: "OWNER_DRAW" }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.items.length).toBe(1);
    expect(res.items[0]?.amountMonthly).toBe(2000);
  });

  it("splits identical same-day duplicates without digits via slot fallback", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const base = {
      rawDescription: "Owner Draw",
      normalizedDescription: "Owner Draw",
      vendor: "Owner Draw",
      isRecurring: true,
      categoryId: "OWNER_DRAW",
      isInternalTransfer: true,
    } as const;

    const transactions: HqTransaction[] = [
      txn({ postedAt: "2025-10-15", amount: -2000, dedupeHash: "a", ...base }),
      txn({ postedAt: "2025-10-15", amount: -2000, dedupeHash: "b", ...base }),
      txn({ postedAt: "2025-11-15", amount: -2000, dedupeHash: "c", ...base }),
      txn({ postedAt: "2025-11-15", amount: -2000, dedupeHash: "d", ...base }),
      txn({ postedAt: "2025-12-15", amount: -2000, dedupeHash: "e", ...base }),
      txn({ postedAt: "2025-12-15", amount: -2000, dedupeHash: "f", ...base }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.items.length).toBe(2);
    expect(res.items.map((x) => x.amountMonthly).sort()).toEqual([2000, 2000]);
  });

  it("splits same-day duplicates even when a discriminator exists (e.g. same cardLast4)", async () => {
    const { computeRecurringCommitments } = await import("./hqMetrics");

    const base = {
      rawDescription: "Owner Draw",
      normalizedDescription: "Owner Draw",
      vendor: "Owner Draw",
      isRecurring: true,
      categoryId: "OWNER_DRAW",
      isInternalTransfer: true,
      cardLast4: "2299",
    } as const;

    const transactions: HqTransaction[] = [
      txn({ postedAt: "2025-10-12", amount: -2000, dedupeHash: "oct-a", ...base }),
      txn({ postedAt: "2025-10-12", amount: -2000, dedupeHash: "oct-b", ...base }),
      txn({ postedAt: "2025-11-12", amount: -2000, dedupeHash: "nov-a", ...base }),
      txn({ postedAt: "2025-11-12", amount: -2000, dedupeHash: "nov-b", ...base }),
      txn({ postedAt: "2025-12-12", amount: -2000, dedupeHash: "dec-a", ...base }),
      txn({ postedAt: "2025-12-12", amount: -2000, dedupeHash: "dec-b", ...base }),
    ];

    const res = computeRecurringCommitments(transactions, 3, { excludeInternalTransfers: true, limit: 8 });
    expect(res.items.length).toBe(2);
    expect(res.items.map((x) => x.amountMonthly).sort()).toEqual([2000, 2000]);
    expect(res.mandatoryMonthlyBurn).toBe(4000);
  });
});
