import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const budgetDonutCalls: Array<{
  data: Array<{ id: string; label: string; value: number }>;
  total: number;
}> = [];

vi.mock("./BudgetDonut", () => {
  return {
    __esModule: true,
    default: (props: {
      data: Array<{ id: string; label: string; value: number }>;
      total: number;
    }) => {
      budgetDonutCalls.push({ data: props.data, total: props.total });
      return (
        <div data-testid="budget-donut-props">
          {JSON.stringify({ data: props.data, total: props.total })}
        </div>
      );
    },
  };
});

vi.mock("@/dashboard/project/features/budget/components/EditBallparkModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/dashboard/project/features/budget/ClientInvoicePreviewModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/app/contexts/useSocket", () => ({
  useSocket: () => ({ ws: null }),
}));

import BudgetHeader from "./HeaderStats";

const createMatchMedia = (matches: boolean) => {
  return () => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    media: "",
    onchange: null,
  });
};

describe("BudgetHeader computeChartState", () => {
  beforeEach(() => {
    budgetDonutCalls.length = 0;
    vi.stubGlobal("matchMedia", createMatchMedia(false));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const getLatestChart = () => {
    const last = budgetDonutCalls[budgetDonutCalls.length - 1];
    if (!last) {
      throw new Error("No chart render captured");
    }
    return last;
  };

  it("multiplies grouped totals by quantity for budgeted and actual modes", async () => {
    render(
      <BudgetHeader
        activeProject={{ projectId: "p1", color: "#123456" }}
        budgetHeader={{
          budgetItemId: "b1",
          revision: 1,
          headerBudgetedTotalCost: 450,
          headerActualTotalCost: 425,
          headerFinalTotalCost: 640,
        }}
        groupBy="category"
        setGroupBy={() => {}}
        budgetItems={[
          {
            category: "Design",
            quantity: 2,
            itemBudgetedCost: 150,
            itemActualCost: 100,
            itemFinalCost: 400,
          },
          {
            category: "Labor",
            quantity: 3,
            itemBudgetedCost: 50,
            itemActualCost: 75,
            itemFinalCost: 240,
          },
        ]}
        onOpenRevisionModal={() => {}}
      />
    );

    await waitFor(() => expect(budgetDonutCalls.length).toBeGreaterThan(0));

    const finalChart = getLatestChart();
    expect(finalChart.data).toEqual([
      { id: "category-Design", label: "Design", value: 400 },
      { id: "category-Labor", label: "Labor", value: 240 },
    ]);
    expect(finalChart.total).toBe(640);

    const budgetedButton = screen.getByRole("button", { name: /view budgeted totals/i });
    fireEvent.click(budgetedButton);

    await waitFor(() => {
      const { data, total } = getLatestChart();
      expect(data).toEqual([
        { id: "category-Design", label: "Design", value: 300 },
        { id: "category-Labor", label: "Labor", value: 150 },
      ]);
      expect(total).toBe(450);
    });

    const actualButton = screen.getByRole("button", { name: /view actual totals/i });
    fireEvent.click(actualButton);

    await waitFor(() => {
      const { data, total } = getLatestChart();
      expect(data).toEqual([
        { id: "category-Labor", label: "Labor", value: 225 },
        { id: "category-Design", label: "Design", value: 200 },
      ]);
      expect(total).toBe(425);
    });
  });

  it("computes grouped markup totals without reapplying quantity to final cost", async () => {
    render(
      <BudgetHeader
        activeProject={{ projectId: "p1", color: "#123456" }}
        budgetHeader={{
          budgetItemId: "b1",
          revision: 1,
          headerBudgetedTotalCost: 450,
          headerActualTotalCost: 425,
          headerFinalTotalCost: 640,
        }}
        groupBy="category"
        setGroupBy={() => {}}
        budgetItems={[
          {
            category: "Design",
            quantity: 2,
            itemBudgetedCost: 150,
            itemActualCost: 100,
            itemFinalCost: 400,
          },
          {
            category: "Labor",
            quantity: 3,
            itemBudgetedCost: 50,
            itemActualCost: 75,
            itemFinalCost: 240,
          },
        ]}
        onOpenRevisionModal={() => {}}
        initialMetric="Effective Markup"
      />
    );

    await waitFor(() => expect(budgetDonutCalls.length).toBeGreaterThan(0));

    const { data, total } = getLatestChart();
    expect(data).toEqual([
      { id: "category-Design", label: "Design", value: 100 },
      { id: "category-Labor", label: "Labor", value: 90 },
    ]);
    expect(total).toBe(190);
  });
});
