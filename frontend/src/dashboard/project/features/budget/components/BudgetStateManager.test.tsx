import React from "react";
import { render, act } from "@testing-library/react";
import { vi } from "vitest";
import BudgetStateManager from "./BudgetStateManager";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { updateBudgetItem } from "@/shared/utils/api";

vi.mock("@/dashboard/project/features/budget/context/BudgetContext", () => ({
  useBudget: vi.fn(),
}));

vi.mock("@/shared/utils/api", () => ({
  updateBudgetItem: vi.fn(),
}));

type TestBudgetState = {
  calculateHeaderTotals: (items: Record<string, unknown>[]) => {
    budgeted: number;
    final: number;
    actual: number;
    effectiveMarkup: number;
  };
  syncHeaderTotals: (items: Record<string, unknown>[]) => Promise<void>;
};

describe("BudgetStateManager header totals", () => {
  const mockedUseBudget = vi.mocked(useBudget);
  const mockedUpdateBudgetItem = vi.mocked(updateBudgetItem);

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("syncHeaderTotals multiplies costs by quantity when calculating totals", async () => {
    type Header = {
      budgetItemId: string;
      revision: number;
      headerBudgetedTotalCost: number;
      headerActualTotalCost: number;
      headerFinalTotalCost: number;
      headerEffectiveMarkup: number;
    };

    let header: Header = {
      budgetItemId: "header-1",
      revision: 3,
      headerBudgetedTotalCost: 0,
      headerActualTotalCost: 0,
      headerFinalTotalCost: 0,
      headerEffectiveMarkup: 0,
    };

    const setBudgetHeader = vi.fn(
      (update: Header | ((prev: Header) => Header)) => {
        if (typeof update === "function") {
          header = (update as (prev: Header) => Header)(header);
        } else {
          header = update;
        }
        return header;
      }
    );

    mockedUseBudget.mockReturnValue({
      budgetHeader: header,
      budgetItems: [],
      setBudgetHeader,
      setBudgetItems: vi.fn(),
    } as unknown as ReturnType<typeof useBudget>);

    mockedUpdateBudgetItem.mockResolvedValue(undefined);

    let capturedState: unknown;

    render(
      <BudgetStateManager activeProject={{ projectId: "proj-1" } as { projectId: string }}>
        {(state) => {
          capturedState = state;
          return null;
        }}
      </BudgetStateManager>
    );

    expect(capturedState).toBeDefined();

    const items = [
      {
        quantity: 5,
        itemBudgetedCost: "20",
        itemActualCost: "$18.50",
        itemReconciledCost: "19",
        itemMarkUp: "0.1",
      },
      {
        quantity: 3,
        itemBudgetedCost: 40,
        itemActualCost: 50,
        itemFinalCost: "225",
      },
      {
        quantity: 2,
        itemBudgetedCost: 30,
        itemReconciledCost: 75,
      },
    ];

    const totals = (capturedState as TestBudgetState).calculateHeaderTotals(items);
    expect(totals.budgeted).toBeCloseTo(280);
    expect(totals.actual).toBeCloseTo(242.5);
    expect(totals.final).toBeCloseTo(479.5);
    expect(totals.effectiveMarkup).toBeCloseTo(0.7125, 5);

    await act(async () => {
      await (capturedState as TestBudgetState).syncHeaderTotals(items);
    });

    expect(mockedUpdateBudgetItem).toHaveBeenCalledTimes(1);
    const [projectId, headerId, payload] = mockedUpdateBudgetItem.mock.calls[0];
    expect(projectId).toBe("proj-1");
    expect(headerId).toBe("header-1");
    expect(payload.headerBudgetedTotalCost).toBeCloseTo(280);
    expect(payload.headerActualTotalCost).toBeCloseTo(242.5);
    expect(payload.headerFinalTotalCost).toBeCloseTo(479.5);
    expect(payload.headerEffectiveMarkup).toBeCloseTo(0.7125, 5);

    expect(header.headerBudgetedTotalCost).toBeCloseTo(280);
    expect(header.headerActualTotalCost).toBeCloseTo(242.5);
    expect(header.headerFinalTotalCost).toBeCloseTo(479.5);
    expect(header.headerEffectiveMarkup).toBeCloseTo(0.7125, 5);
    expect(setBudgetHeader).toHaveBeenCalled();
  });
});
