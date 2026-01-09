import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import TxnModalApply from "./TxnModalApply";
import * as api from "@/shared/utils/api";

describe("TxnModalApply Similar Transactions range", () => {
  it("omits from/to query params when opened without a view range (HQOverview)", async () => {
    const apiFetchSpy = vi.spyOn(api, "apiFetch").mockImplementation(async (url: string) => {
      if (String(url).includes("/hq/vendor-matches?")) {
        return { orgId: "org_1", vendorKey: "acme", matches: [], cursor: null } as any;
      }
      return {} as any;
    });

    render(
      <TxnModalApply
        orgId="org_1"
        isOpen
        txn={{
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
        } as any}
        onRequestClose={() => {}}
      />
    );

    const vendorUrl = await waitFor(() => {
      const urls = apiFetchSpy.mock.calls.map((c) => String(c[0]));
      const match = urls.find((u) => u.includes("/hq/vendor-matches?"));
      expect(match).toBeTruthy();
      return match as string;
    });

    expect(vendorUrl).not.toContain("from=");
    expect(vendorUrl).not.toContain("to=");
  });
});
