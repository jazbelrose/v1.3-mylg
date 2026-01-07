import { describe, expect, it } from "vitest";
import { computeCashOnHand } from "@/hq/lib/hqMetrics";
import type { HqAccount, HqTransaction } from "@/hq/types";

describe("computeCashOnHand", () => {
  it("excludes transactions on the anchor date even if postedAt includes a timestamp", () => {
    const accounts: HqAccount[] = [
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        name: "Checking",
        accountName: "Checking",
        institution: "Bank",
        currency: "USD",
        includeInCashOnHand: true,
        archivedAt: null,
        anchorDate: "2026-01-06",
        anchorBalance: 100,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const transactions: HqTransaction[] = [
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-06T10:00:00Z",
        amount: -10,
        currency: "USD",
        rawDescription: "Test",
        normalizedDescription: "test",
        type: "unknown",
        direction: "out",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "h1",
        createdAt: "2026-01-06T10:00:00Z",
      },
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-07T10:00:00Z",
        amount: -5,
        currency: "USD",
        rawDescription: "Test",
        normalizedDescription: "test",
        type: "unknown",
        direction: "out",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "h2",
        createdAt: "2026-01-07T10:00:00Z",
      },
    ];

    // Anchor is end-of-day on 2026-01-06; only the 2026-01-07 txn counts.
    expect(computeCashOnHand(accounts, transactions)).toBe(95);
  });

  it("handles anchorDate values that include a timestamp by treating them as date-only", () => {
    const accounts: HqAccount[] = [
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        name: "Checking",
        accountName: "Checking",
        institution: "Bank",
        currency: "USD",
        includeInCashOnHand: true,
        archivedAt: null,
        anchorDate: "2026-01-06T00:00:00Z",
        anchorBalance: 100,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const transactions: HqTransaction[] = [
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-06T23:00:00Z",
        amount: 20,
        currency: "USD",
        rawDescription: "Test",
        normalizedDescription: "test",
        type: "unknown",
        direction: "in",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "h1",
        createdAt: "2026-01-06T23:00:00Z",
      },
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-07",
        amount: 5,
        currency: "USD",
        rawDescription: "Test",
        normalizedDescription: "test",
        type: "unknown",
        direction: "in",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "h2",
        createdAt: "2026-01-07T00:00:00Z",
      },
    ];

    // Only the 2026-01-07 txn counts.
    expect(computeCashOnHand(accounts, transactions)).toBe(105);
  });
});
