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
});
