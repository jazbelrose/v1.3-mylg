// Types for budget context and selectors
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








