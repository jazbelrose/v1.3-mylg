import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/utils/api", () => ({
  API_BASE_URL: "http://example.test",
  apiFetch: apiFetchMock,
}));

const fetchHqChartSeriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/hq/lib/hqApi", async () => {
  const actual = await vi.importActual<typeof import("@/hq/lib/hqApi")>("@/hq/lib/hqApi");
  return {
    ...actual,
    fetchHqChartSeries: fetchHqChartSeriesMock,
  };
});

vi.mock("@/app/contexts/useUser", () => ({
  useUser: () => null,
}));

vi.mock("@/app/contexts/useOrg", () => ({
  useOrg: () => ({ activeOrgId: "org_1", activeOrgRole: "admin" }),
  isOrgAdmin: () => true,
}));

vi.mock("@/hq/lib/useHqBootstrap", () => ({
  useHqBootstrap: () => null,
}));

const storeState = {
  accounts: [],
  importRuns: [],
  transactions: [
    {
      dedupeHash: "dedupe_1",
      accountId: "checking",
      postedAt: "2025-12-31",
      amount: -12.34,
      direction: "out",
      vendor: "Acme",
      vendorKey: "acme",
      rawDescription: "Acme purchase",
      normalizedDescription: "acme purchase",
      categoryId: "OTHER",
      type: "card_purchase",
    },
  ],
  cashOnHandAggregate: 0,
  missingAnchorAccountIds: [],
};

vi.mock("@/hq/lib/hqStore", () => ({
  useHqStore: (_orgId: string, selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock("../components/HQLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/HQCard", () => ({
  default: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  ),
}));

vi.mock("@/hq/components/HeroCashChart", () => ({
  default: () => <div data-testid="hero-cash-chart" />,
}));

vi.mock("@/hq/components/AddAccountModal", () => ({
  default: () => null,
}));

vi.mock("@/hq/components/ImportCsvModal", () => ({
  default: () => null,
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import HQOverview from "./HQOverview";

describe("HQOverview Similar Transactions range", () => {
  it("does not include from/to in Similar vendor-matches request URL", async () => {
    fetchHqChartSeriesMock.mockResolvedValue({
      scope: "aggregate",
      range: "ALL",
      currency: "USD",
      anchorDate: "2026-01-01",
      anchorBalance: 0,
      points: [],
      totals: { inflow: 0, outflow: 0, net: 0 },
    });

    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/hq/vendor-matches?")) {
        return { orgId: "org_1", vendorKey: "acme", matches: [], cursor: null };
      }
      return {};
    });

    render(
      <MemoryRouter>
        <HQOverview />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText("Acme"));

    const vendorUrl = await waitFor(() => {
      const urls = apiFetchMock.mock.calls.map((c) => String(c[0]));
      const match = urls.find((u) => u.includes("/hq/vendor-matches?"));
      expect(match).toBeTruthy();
      return match as string;
    });

    expect(vendorUrl).not.toContain("from=");
    expect(vendorUrl).not.toContain("to=");
  });
});
