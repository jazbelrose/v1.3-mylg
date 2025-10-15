// Types for budget context and selectors
export type BudgetStats = {
  ballpark: number;
  budgetedCost: number;
  actualCost: number;
  finalCost: number;
  effectiveMarkup: number;
};

export type PieDataItem = {
  name: string;
  value: number;
};

export type BudgetUpdateOverrides = {
  revision?: number | null;
  total?: number | null;
  clientRevisionId?: number | null;
};

export type BudgetWebSocketOperations = {
  emitBudgetUpdate: (overrides?: BudgetUpdateOverrides) => void;
  emitLineLock: (lineId: string) => void;
  emitLineUnlock: (lineId: string) => void;
  emitTimelineUpdate: (events: unknown[]) => void;
};








