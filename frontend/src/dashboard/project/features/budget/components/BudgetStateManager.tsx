import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { updateBudgetItem } from "@/shared/utils/api";
import { parseBudget } from "@/shared/utils/budgetUtils";
import type { BudgetItem, Project } from "@/shared/utils/api";

type BudgetSnapshot = {
  items: Record<string, unknown>[];
  header: Record<string, unknown> | null;
};


interface BudgetStateManagerProps {
  activeProject: Project | null;
  children: (state: BudgetStateManagerState) => React.ReactNode;
}

interface BudgetStateManagerState extends Record<string, unknown> {
  // Undo/Redo state
  undoStack: BudgetSnapshot[];
  redoStack: BudgetSnapshot[];
  pushHistory: () => void;
  handleUndo: () => Promise<void>;
  handleRedo: () => Promise<void>;
  
  // Modal states
  isBudgetModalOpen: boolean;
  isRevisionModalOpen: boolean;
  isCreateModalOpen: boolean;
  isEventModalOpen: boolean;
  isConfirmingDelete: boolean;
  
  // Modal controls
  setBudgetModalOpen: (open: boolean) => void;
  setRevisionModalOpen: (open: boolean) => void;
  setCreateModalOpen: (open: boolean) => void;
  setEventModalOpen: (open: boolean) => void;
  setIsConfirmingDelete: (open: boolean) => void;
  
  // Table configuration
  groupBy: string;
  setGroupBy: (group: string) => void;
  sortField: string | null;
  sortOrder: string | null;
  setSortField: (field: string | null) => void;
  setSortOrder: (order: string | null) => void;
  filterQuery: string;
  setFilterQuery: (query: string) => void;
  selectedRowKeys: string[];
  setSelectedRowKeys: React.Dispatch<React.SetStateAction<string[]>>;
  isSelectMode: boolean;
  setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Edit/Create state
  editItem: BudgetItem | null;
  prefillItem: Partial<BudgetItem> | null;
  setEditItem: (item: BudgetItem | null) => void;
  setPrefillItem: (item: Partial<BudgetItem> | null) => void;
  nextElementKey: string;
  setNextElementKey: (key: string) => void;
  
  // Delete state
  deleteTargets: string[];
  setDeleteTargets: (targets: string[]) => void;
  
  // Event editing
  eventItem: BudgetItem | null;
  eventList: BudgetItem[];
  setEventItem: (item: BudgetItem | null) => void;
  setEventList: (events: BudgetItem[]) => void;
  
  // Pagination
  pageSize: number;
  currentPage: number;
  setPageSize: (size: number) => void;
  setCurrentPage: (page: number) => void;
  
  // Line locking
  lockedLines: string[];
  setLockedLines: React.Dispatch<React.SetStateAction<string[]>>;
  editingLineId: string | null;
  setEditingLineId: (id: string | null) => void;
  
  // Helper functions
  computeGroupsAndClients: (items: Record<string, unknown>[], header: Record<string, unknown> | null) => void;
  syncHeaderTotals: (items: Record<string, unknown>[]) => Promise<void>;
  calculateHeaderTotals: (items: Record<string, unknown>[]) => Record<string, unknown>;
}

const BudgetStateManager: React.FC<BudgetStateManagerProps> = ({
  activeProject,
  children,
}) => {
  const { budgetHeader, budgetItems, setBudgetHeader, setBudgetItems } = useBudget();
  
  // Undo/Redo state
  const [undoStack, setUndoStack] = useState<BudgetSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<BudgetSnapshot[]>([]);
  
  // Modal states
  const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
  const [isRevisionModalOpen, setRevisionModalOpen] = useState(false);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isEventModalOpen, setEventModalOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  
  // Table configuration
  const [groupBy, setGroupBy] = useState("none");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  
  // Edit/Create state
  const [editItem, setEditItem] = useState<BudgetItem | null>(null);
  const [prefillItem, setPrefillItem] = useState<Partial<BudgetItem> | null>(null);
  const [nextElementKey, setNextElementKey] = useState('');
  
  // Delete state
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  
  // Event editing
  const [eventItem, setEventItem] = useState<BudgetItem | null>(null);
  const [eventList, setEventList] = useState<BudgetItem[]>([]);
  
  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterQuery]);

  useEffect(() => {
    if (!isSelectMode && selectedRowKeys.length > 0) {
      setSelectedRowKeys([]);
    }
  }, [isSelectMode, selectedRowKeys.length]);

  // Line locking
  const [lockedLines, setLockedLines] = useState<string[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  
  const pushHistory = useCallback(() => {
    setUndoStack((prev) => {
      const snapshot = {
        items: JSON.parse(JSON.stringify(budgetItems)),
        header: budgetHeader ? JSON.parse(JSON.stringify(budgetHeader)) : null,
      };
      const stack = [...prev, snapshot];
      return stack.slice(-20);
    });
    setRedoStack([]);
  }, [budgetItems, budgetHeader]);

  const toMoney = useCallback((value: unknown): number => {
    if (typeof value === "number" || typeof value === "string") {
      return parseBudget(value);
    }
    return 0;
  }, []);

  const calculateHeaderTotals = useCallback((items: Record<string, unknown>[]) => {
    let budgeted = 0;
    let final = 0;
    let actual = 0;
    items.forEach((it) => {
      const qty = parseFloat(String(it.quantity)) || 0;
      const budget = toMoney(it.itemBudgetedCost);
      const markup = parseFloat(String(it.itemMarkUp)) || 0;
      const actualCost = toMoney(it.itemActualCost);

      const hasFinal =
        it.itemFinalCost !== undefined &&
        it.itemFinalCost !== null &&
        String(it.itemFinalCost).trim() !== "";

      budgeted += qty * budget;
      actual += qty * actualCost;

      if (hasFinal) {
        final += toMoney(it.itemFinalCost);
      } else {
        const baseForFinal = toMoney(
          it.itemReconciledCost ?? it.itemActualCost ?? it.itemBudgetedCost
        );
        final += qty * baseForFinal * (1 + markup);
      }
    });
    const effectiveMarkup = budgeted ? (final - budgeted) / budgeted : 0;
    return { budgeted, final, actual, effectiveMarkup };
  }, [toMoney]);

  const syncHeaderTotals = useCallback(
    async (items: Record<string, unknown>[]) => {
      if (!activeProject?.projectId || !budgetHeader) return;
      const totals = calculateHeaderTotals(items);
    try {
      const headerId = String((budgetHeader as Record<string, unknown>)?.budgetItemId || "");
      const revision = Number((budgetHeader as Record<string, unknown>)?.revision ?? 1);
      await updateBudgetItem(
        activeProject.projectId,
        headerId,
        {
          headerBudgetedTotalCost: totals.budgeted,
          headerFinalTotalCost: totals.final,
          headerActualTotalCost: totals.actual,
          headerEffectiveMarkup: totals.effectiveMarkup,
          revision,
        }
      );
        setBudgetHeader((prev: Record<string, unknown>) =>
          prev
            ? {
                ...prev,
                headerBudgetedTotalCost: totals.budgeted,
                headerFinalTotalCost: totals.final,
                headerActualTotalCost: totals.actual,
                headerEffectiveMarkup: totals.effectiveMarkup,
              }
            : prev
        );
      } catch (err) {
        console.error('Error updating budget header:', err);
      }
    },
    [activeProject?.projectId, budgetHeader, calculateHeaderTotals, setBudgetHeader]
  );

  const computeGroupsAndClients = useCallback(
    (_items: Record<string, unknown>[], _header: Record<string, unknown> | null) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      // This function will be moved to a separate state management component
      // For now, it's a no-op since the parent components handle this
    },
    []
  );

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, s.length - 1));
    setRedoStack((s) => [
      ...s,
      {
        items: JSON.parse(JSON.stringify(budgetItems)),
        header: budgetHeader ? JSON.parse(JSON.stringify(budgetHeader)) : null,
      },
    ]);
    setBudgetItems(prev.items);
    setBudgetHeader(prev.header);
    computeGroupsAndClients(prev.items, prev.header);
    setSelectedRowKeys([]);
    await syncHeaderTotals(prev.items);
  }, [undoStack, budgetItems, budgetHeader, setBudgetItems, setBudgetHeader, computeGroupsAndClients, syncHeaderTotals]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, s.length - 1));
    setUndoStack((s) => [
      ...s,
      {
        items: JSON.parse(JSON.stringify(budgetItems)),
        header: budgetHeader ? JSON.parse(JSON.stringify(budgetHeader)) : null,
      },
    ]);
    setBudgetItems(next.items);
    setBudgetHeader(next.header);
    computeGroupsAndClients(next.items, next.header);
    setSelectedRowKeys([]);
    await syncHeaderTotals(next.items);
  }, [redoStack, budgetItems, budgetHeader, setBudgetItems, setBudgetHeader, computeGroupsAndClients, syncHeaderTotals]);

  useEffect(() => {
    const isEditableElement = (element: EventTarget | null): boolean => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      if (element.isContentEditable) {
        return true;
      }

      const tagName = element.tagName;
      return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      if (isEditableElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void handleRedo();
        } else {
          void handleUndo();
        }
        return;
      }

      if (key === "y" && !event.shiftKey) {
        event.preventDefault();
        void handleRedo();
      }
    };

    if (typeof window === "undefined") {
      return undefined;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleUndo, handleRedo]);

  const state: BudgetStateManagerState = useMemo(() => ({
    // Undo/Redo state
    undoStack,
    redoStack,
    pushHistory,
    handleUndo,
    handleRedo,
    
    // Modal states
    isBudgetModalOpen,
    isRevisionModalOpen,
    isCreateModalOpen,
    isEventModalOpen,
    isConfirmingDelete,
    
    // Modal controls
    setBudgetModalOpen,
    setRevisionModalOpen,
    setCreateModalOpen,
    setEventModalOpen,
    setIsConfirmingDelete,
    
    // Table configuration
    groupBy,
    setGroupBy,
    sortField,
    sortOrder,
    setSortField,
    setSortOrder,
    filterQuery,
    setFilterQuery,
    selectedRowKeys,
    setSelectedRowKeys,
    isSelectMode,
    setIsSelectMode,
    
    // Edit/Create state
    editItem,
    prefillItem,
    setEditItem,
    setPrefillItem,
    nextElementKey,
    setNextElementKey,
    
    // Delete state
    deleteTargets,
    setDeleteTargets,
    
    // Event editing
    eventItem,
    eventList,
    setEventItem,
    setEventList,
    
    // Pagination
    pageSize,
    currentPage,
    setPageSize,
    setCurrentPage,
    
    // Line locking
    lockedLines,
    setLockedLines,
    editingLineId,
    setEditingLineId,
    
    // Helper functions
    computeGroupsAndClients,
    syncHeaderTotals,
    calculateHeaderTotals,
  }), [
    undoStack, redoStack, pushHistory, handleUndo, handleRedo,
    isBudgetModalOpen, isRevisionModalOpen, isCreateModalOpen, isEventModalOpen, isConfirmingDelete,
    groupBy, sortField, sortOrder, filterQuery, selectedRowKeys, isSelectMode,
    editItem, prefillItem, nextElementKey,
    deleteTargets,
    eventItem, eventList,
    pageSize, currentPage,
    lockedLines, editingLineId,
    computeGroupsAndClients, syncHeaderTotals, calculateHeaderTotals
  ]);

  return <>{children(state)}</>;
};

export default BudgetStateManager;











