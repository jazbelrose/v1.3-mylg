import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/utils/api", () => ({
  API_BASE_URL: "https://example.test",
  apiFetch: vi.fn().mockResolvedValue({ orgId: "org", transactions: [], cursor: null }),
}));

describe("fetchHqTransactions projectFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds projectFilter when provided", async () => {
    const { fetchHqTransactions } = await import("./hqApi");
    const { apiFetch } = await import("@/shared/utils/api");

    await fetchHqTransactions({ orgId: "org", projectFilter: "linked", includeTotals: true });

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(apiFetch).mock.calls[0];
    expect(url).toContain("/hq/transactions?");
    expect(url).toContain("orgId=org");
    expect(url).toContain("projectFilter=linked");
  });

  it("omits projectFilter when not provided", async () => {
    const { fetchHqTransactions } = await import("./hqApi");
    const { apiFetch } = await import("@/shared/utils/api");

    await fetchHqTransactions({ orgId: "org", includeTotals: true });

    const [url] = vi.mocked(apiFetch).mock.calls[0];
    expect(url).not.toContain("projectFilter=");
  });
});

