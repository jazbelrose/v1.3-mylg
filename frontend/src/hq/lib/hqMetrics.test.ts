import { describe, expect, it } from "vitest";
import { computeCashOnHand, computeTopCategories } from "@/hq/lib/hqMetrics";
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

describe("computeTopCategories", () => {
  it("aggregates outflows using canonical signed amount semantics", () => {
    const transactions: HqTransaction[] = [
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-07T10:00:00Z",
        amount: 100, // positive raw amount, but still an outflow
        currency: "USD",
        rawDescription: "Owner draw",
        normalizedDescription: "owner draw",
        type: "unknown",
        direction: "out",
        categoryId: "OWNER_DRAW",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "h1",
        createdAt: "2026-01-07T10:00:00Z",
      },
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-06",
        amount: -50,
        currency: "USD",
        rawDescription: "Owner draw 2",
        normalizedDescription: "owner draw 2",
        type: "unknown",
        direction: "out",
        categoryId: "OWNER_DRAW",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "h2",
        createdAt: "2026-01-06T00:00:00Z",
      },
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-06",
        amount: -999,
        currency: "USD",
        rawDescription: "Internal transfer",
        normalizedDescription: "internal transfer",
        type: "unknown",
        direction: "out",
        categoryId: "OWNER_DRAW",
        isInternalTransfer: true,
        importRunId: "import-1",
        dedupeHash: "h3",
        createdAt: "2026-01-06T00:00:00Z",
      },
    ];

    const res = computeTopCategories(transactions, "2026-01-06", "2026-01-07", { direction: "out", limit: 8 });
    const ownerDraw = res.find((x) => x.categoryId === "OWNER_DRAW");
    // Includes Owner Draw rows even if marked as internal transfer.
    expect(ownerDraw?.amount).toBe(1149);
  });

  it("in net mode, ranks categories by absolute magnitude (so large outflows like Owner Draw can appear)", () => {
    const transactions: HqTransaction[] = [
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-07",
        amount: 200, // inflow
        currency: "USD",
        rawDescription: "Client payment",
        normalizedDescription: "client payment",
        type: "deposit",
        direction: "in",
        categoryId: "CLIENT_PAYMENT",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "n1",
        createdAt: "2026-01-07T00:00:00Z",
      },
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-07",
        amount: 5000, // raw positive but outflow (canonicalSignedAmount will sign it)
        currency: "USD",
        rawDescription: "Owner draw",
        normalizedDescription: "owner draw",
        type: "unknown",
        direction: "out",
        categoryId: "OWNER_DRAW",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "n2",
        createdAt: "2026-01-07T00:00:00Z",
      },
      {
        orgId: "ORG#1",
        accountId: "acct-1",
        postedAt: "2026-01-07",
        amount: -99,
        currency: "USD",
        rawDescription: "Small expense",
        normalizedDescription: "small expense",
        type: "unknown",
        direction: "out",
        categoryId: "OFFICE_SUPPLIES",
        isInternalTransfer: false,
        importRunId: "import-1",
        dedupeHash: "n3",
        createdAt: "2026-01-07T00:00:00Z",
      },
    ];

    const res = computeTopCategories(transactions, "2026-01-07", "2026-01-07", { direction: "net", limit: 2 });
    expect(res.map((x) => x.categoryId)).toContain("OWNER_DRAW");
  });
});
