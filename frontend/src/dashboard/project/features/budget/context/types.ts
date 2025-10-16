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

export type BudgetWebSocketOperations = {
  emitBudgetUpdate: () => void;
  emitLineLock: (lineId: string) => void;
  emitLineUnlock: (lineId: string) => void;
  emitTimelineUpdate: (events: unknown[]) => void;
  emitClientRevisionUpdate: (clientRevisionId: number) => void;
};








