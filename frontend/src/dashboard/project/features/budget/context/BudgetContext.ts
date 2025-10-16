import { createContext, useContext } from "react";
import type { BudgetStats, PieDataItem, BudgetWebSocketOperations } from "./types";

type BudgetHeaderShape = Record<string, unknown> | null;
type BudgetLineShape = Record<string, unknown>;

interface BudgetContextValue {
  budgetHeader: BudgetHeaderShape;
  budgetItems: BudgetLineShape[];
  setBudgetHeader: (
    header: BudgetHeaderShape | ((prev: BudgetHeaderShape) => BudgetHeaderShape)
  ) => void;
  setBudgetItems: (items: BudgetLineShape[]) => void;
  refresh: () => Promise<{ header: BudgetHeaderShape; items: BudgetLineShape[] } | null>;
  loading: boolean;
  clientBudgetHeader: BudgetHeaderShape;
  clientBudgetItems: BudgetLineShape[];
  clientLoading: boolean;

  // Memoized selectors
  getStats: () => BudgetStats;
  getPie: (groupBy?: string) => PieDataItem[];
  getClientStats: () => BudgetStats;
  getClientPie: (groupBy?: string) => PieDataItem[];
  getRows: () => BudgetLineShape[];
  getLocks: () => string[];

  // WebSocket operations
  wsOps: BudgetWebSocketOperations;
}

export const BudgetContext = createContext<BudgetContextValue | undefined>(undefined);

export const useBudget = (): BudgetContextValue => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudget must be used within BudgetProvider");
  return ctx;
};









