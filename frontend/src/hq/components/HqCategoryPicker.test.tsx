import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HqCategoryPicker from "./HqCategoryPicker";

// Minimal store mock: only what HqCategoryPicker reads.
vi.mock("@/hq/lib/hqStore", () => ({
  useHqStore: (_orgId: string, selector: (s: { transactions: any[] }) => unknown) => selector({ transactions: [] }),
}));

describe("HqCategoryPicker", () => {
  it("autofocuses search, filters, arrows, and Enter selects", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(<HqCategoryPicker orgId="org_1" value="" onValueChange={onValueChange} placeholder="Select" />);

    await user.click(screen.getByRole("button", { name: /select/i }));

    const input = await screen.findByPlaceholderText("Search categories…");
    expect(input).toHaveFocus();

    await user.type(input, "client");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onValueChange).toHaveBeenCalled();
    const selected = String(onValueChange.mock.calls[0][0] ?? "");
    expect(selected.length).toBeGreaterThan(0);
  });
});
