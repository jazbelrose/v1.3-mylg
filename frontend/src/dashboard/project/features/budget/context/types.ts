// Types for budget context and selectors

/**
 * CostType determines how profit is calculated for a budget line item.
 *
 * - vendor: External cost with markup applied (profit = cost × markup)
 * - internal: Internal labor — the entire billed rate is profit
 * - at-cost: No profit, just tracking (reimbursables, client-paid)
 */
export type CostType = "vendor" | "internal" | "at-cost";

export const COST_TYPE_CONFIG: Record<
  CostType,
  {
    label: string;
    description: string;
    showMarkup: boolean;
  }
> = {
  vendor: {
    label: "Vendor",
    description: "External cost — markup creates profit",
    showMarkup: true,
  },
  internal: {
    label: "Internal",
    description: "Your labor — entire rate is profit",
    showMarkup: false,
  },
  "at-cost": {
    label: "At Cost",
    description: "No profit — pass-through",
    showMarkup: false,
  },
};

export const COST_TYPE_OPTIONS = [
  { value: "vendor" as CostType, label: "Vendor" },
  { value: "internal" as CostType, label: "Internal" },
  { value: "at-cost" as CostType, label: "At Cost" },
] as const;

export type BudgetStats = {
  ballpark: number;
  budgetedCost: number;
  actualCost: number;
  finalCost: number;
  effectiveMarkup: number;
  /** Total amount allocated from HQ transactions (derived) */
  allocatedCost?: number;
  /** Variance = budgetedCost - allocatedCost (positive = under budget) */
  variance?: number;
  /** Variance as percentage of budgetedCost */
  variancePercent?: number;
  /** Profit from vendor markups */
  vendorProfit?: number;
  /** Profit from internal labor (entire billed rate) */
  internalProfit?: number;
  /** Combined total profit */
  totalProfit?: number;
};

export type BudgetLineAllocationSummary = {
  budgetItemId: string;
  allocatedAmount: number;
  transactionCount: number;
  variance: number; // budgeted - allocated
  variancePercent: number;
};

export type PieDataItem = {
  name: string;
  value: number;
};

export type BudgetWebSocketOperations = {
  emitBudgetUpdate: () => void;
  emitLineLock: (lineId: string) => void;
  emitLineUnlock: (lineId: string) => void;
  emitTimelineUpdate: (events: unknown[]) => void;
  emitClientRevisionUpdate: (clientRevisionId: number) => void;
};








