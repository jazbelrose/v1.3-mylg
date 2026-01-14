import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("@/app/contexts/useUser", () => ({
  useUser: () => ({ userName: "Test", isAdmin: true }),
}));

vi.mock("@/app/contexts/useOrg", () => ({
  isOrgAdmin: () => true,
  useOrg: () => ({ activeOrgId: "org_1", activeOrgRole: "admin" }),
}));

vi.mock("../components/HQLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="hq-layout">{children}</div>,
}));

vi.mock("@/hq/components/HeroCashChart", () => ({
  default: () => <div data-testid="hero-cash-chart" />,
}));

vi.mock("@/hq/lib/useHqBootstrap", () => ({
  useHqBootstrap: () => {},
}));

vi.mock("@/hq/lib/hqStore", () => {
  const state = {
    accounts: [],
    transactions: [
      {
        dedupeHash: "dedupe_1",
        accountId: "checking",
        postedAt: "2026-01-10",
        amount: -25,
        direction: "out",
        vendor: "Acme",
        vendorKey: "acme",
        rawDescription: "Acme subscription",
        normalizedDescription: "acme subscription",
        categoryId: "OTHER",
        type: "card_purchase",
        isInternalTransfer: false,
      },
    ],
    importRuns: [],
    cashOnHandAggregate: 1000,
    missingAnchorAccountIds: [],
  };

  return {
    useHqStore: <T,>(_orgId: string, selector: (s: typeof state) => T): T => selector(state),
  };
});

vi.mock("@/hq/lib/hqApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/hqApi")>("@/hq/lib/hqApi");
  return {
    ...actual,
    fetchHqChartSeries: async () => ({
      scope: "aggregate",
      range: "ALL",
      currency: "USD",
      anchorDate: "2026-01-10",
      anchorBalance: 1000,
      points: [{ date: "2026-01-10", balance: 1000, inflow: 0, outflow: 0 }],
      totals: { inflow: 0, outflow: 0, net: 0 },
    }),
    fetchHqTopCategories: async () => ({
      orgId: "org_1",
      range: "ALL",
      direction: "out",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      items: [],
    }),
    fetchHqRecurringCommitments: async () => ({
      orgId: "org_1",
      months: 1,
      startDate: "2025-12-01",
      endDate: "2025-12-31",
      excludeInternalTransfers: true,
      mandatoryMonthlyBurn: 25,
      items: [
        {
          seriesKey: "rs:acme",
          vendorKey: "acme",
          label: "Acme",
          categoryId: "OTHER",
          amountMonthly: 25,
        },
      ],
    }),
  };
});

import HQOverview from "./HQOverview";

describe("HQOverview recurring preview", () => {
  it("opens a modal on row click instead of navigating", async () => {
    render(
      <MemoryRouter>
        <HQOverview />
      </MemoryRouter>
    );

    const recurringRow = await screen.findByRole("link", { name: /acme/i });
    fireEvent.click(recurringRow);

    expect(navigateSpy).not.toHaveBeenCalled();

    await screen.findByText("Series key");
    await waitFor(() => {
      const modalTitle = screen.getByTestId("recurring-series-title");
      expect(String(modalTitle.textContent || "")).toContain("Acme");
    });
  });
});
