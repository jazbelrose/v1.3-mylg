import React, { useCallback, useEffect, useMemo } from "react";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { slugify } from "@/shared/utils/slug";
import { v4 as uuid } from "uuid";
import {
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
} from "@/shared/utils/api";
import type { BudgetLine, Project, UserProfile, TimelineEvent, BudgetItem } from "@/shared/utils/api";
// Frontend no longer persists events directly; backend handles persistence


interface BudgetEventManagerProps {
  activeProject: Project;
  eventsByLineItem: Record<string, TimelineEvent[]>;
  userId: string;
  user: UserProfile;
  stateManager: Record<string, unknown> & {
    setNextElementKey: (key: string) => void;
    setEditItem: (item: unknown) => void;
    setPrefillItem: (item: unknown) => void;
    setCreateModalOpen: (open: boolean) => void;
    setEditingLineId: (id: string) => void;
    setEventItem: (item: unknown) => void;
    setEventList: (events: unknown[]) => void;
    setEventModalOpen: (open: boolean) => void;
    setDeleteTargets: (targets: string[]) => void;
    setIsConfirmingDelete: (confirming: boolean) => void;
    setSelectedRowKeys: (keys: string[] | ((prev: string[]) => string[])) => void;
    setLockedLines: React.Dispatch<React.SetStateAction<string[]>>;
    pushHistory: () => void;
    syncHeaderTotals: (list: unknown[]) => Promise<void>;
    editingLineId: string;
    eventItem: unknown;
    deleteTargets: string[];
    selectedRowKeys: string[];
    editItem: unknown;
  };
  children: (handlers: BudgetEventHandlers) => React.ReactNode;
  shouldOpenCreateModal?: boolean;
  onConsumeShouldOpenCreateModal?: () => void;
}

interface BudgetEventHandlers {
  // Line item operations
  handleCreateLineItem: (data: Record<string, unknown>, isAutoSave?: boolean) => Promise<BudgetItem | null>;
  handleEditLineItem: (data: Record<string, unknown>, isAutoSave?: boolean) => Promise<BudgetItem | null>;
  confirmDelete: () => Promise<void>;
  handleDuplicateSelected: () => Promise<void>;
  
  // Modal operations
  openCreateModal: () => void;
  openEditModal: (item: Record<string, unknown>) => void;
  openEventModal: (item: Record<string, unknown>) => void;
  openDuplicateModal: (item: Record<string, unknown>) => void;
  openDeleteModal: (ids: string[]) => void;
  closeCreateModal: () => void;
  closeEventModal: () => void;
  
  // Event operations
  handleSaveEvents: (events: TimelineEvent[]) => Promise<void>;
  
  // Helper functions
  getNextElementKey: () => string;
  getNextElementId: (category: string) => string;
}

const IMMUTABLE_FIELD_NAMES = new Set([
  "projectid",
  "budgetid",
  "budgetitemid",
]);

const IMMUTABLE_FIELD_ALIASES = new Set(["pk", "sk"]);

const GSI_KEY_PATTERN = /^gsi\d*(pk|sk)$/i;

const sanitizeMutableBudgetFields = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (
      IMMUTABLE_FIELD_NAMES.has(normalizedKey) ||
      IMMUTABLE_FIELD_ALIASES.has(normalizedKey) ||
      GSI_KEY_PATTERN.test(normalizedKey)
    ) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

const BudgetEventManager: React.FC<BudgetEventManagerProps> = ({
  activeProject,
  eventsByLineItem,
  userId,
  stateManager,
  children,
  shouldOpenCreateModal = false,
  onConsumeShouldOpenCreateModal,
}) => {
  const { budgetHeader, budgetItems, setBudgetItems, getLocks, wsOps } = useBudget();
  
  // Get WebSocket operations from context
  const { emitBudgetUpdate, emitLineLock, emitLineUnlock, emitTimelineUpdate } = wsOps;

  const getNextElementKey = useCallback(() => {
    const slug = slugify((activeProject?.title as string) || '');
    let max = 0;
    budgetItems.forEach((it) => {
      if (typeof it.elementKey === 'string') {
        const match = it.elementKey.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      }
    });
    const nextNum = String(max + 1).padStart(4, '0');
    return `${slug}-${nextNum}`;
  }, [activeProject?.title, budgetItems]);

  const getNextElementId = useCallback(
    (category: string) => {
      if (!category) return '';
      let max = 0;
      budgetItems.forEach((it) => {
        if (it.category === category && typeof it.elementId === 'string') {
          const match = it.elementId.match(/-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > max) max = num;
          }
        }
      });
      return `${category}-${String(max + 1).padStart(4, '0')}`;
    },
    [budgetItems]
  );

  const openCreateModal = useCallback(() => {
    const nextKey = getNextElementKey();
    stateManager.setNextElementKey(nextKey);
    stateManager.setEditItem(null);
    stateManager.setPrefillItem(null);
    stateManager.setCreateModalOpen(true);
  }, [getNextElementKey, stateManager]);

  useEffect(() => {
    if (shouldOpenCreateModal) {
      openCreateModal();
      onConsumeShouldOpenCreateModal?.();
    }
  }, [shouldOpenCreateModal, openCreateModal, onConsumeShouldOpenCreateModal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (isEditableElement(event.target)) return;

      const isPlusKey =
        event.key === "+" ||
        event.key === "=" ||
        event.code === "Equal" ||
        event.code === "NumpadAdd";
      const hasRequiredModifiers = event.shiftKey || event.code === "NumpadAdd";

      if (isPlusKey && hasRequiredModifiers) {
        event.preventDefault();
        openCreateModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openCreateModal]);

  const openEditModal = useCallback((item: Record<string, unknown>) => {
    const lockedLines = getLocks();
    const budgetItemId = String(item.budgetItemId);
    if (lockedLines.includes(budgetItemId)) return;
    stateManager.setEditItem(item);
    stateManager.setEditingLineId(budgetItemId);
    emitLineLock(budgetItemId);
    stateManager.setPrefillItem(null);
    stateManager.setCreateModalOpen(true);
  }, [stateManager, emitLineLock, getLocks]);

  const openEventModal = useCallback((item: Record<string, unknown>) => {
    const lockedLines = getLocks();
    const budgetItemId = String(item.budgetItemId);
    if (lockedLines.includes(budgetItemId)) return;
    const evs = eventsByLineItem[budgetItemId] || [];
    stateManager.setEventItem(item);
    stateManager.setEventList(evs.map((ev) => ({ ...ev })));
    stateManager.setEventModalOpen(true);
  }, [stateManager, eventsByLineItem, getLocks]);

  const openDuplicateModal = useCallback((item: Record<string, unknown>) => {
    const nextKey = getNextElementKey();
    const nextId = getNextElementId(String(item.category));
    const clone = { ...item, elementKey: nextKey } as Record<string, unknown>;
    if (nextId) clone.elementId = nextId;
    delete clone.budgetItemId;
    stateManager.setNextElementKey(nextKey);
    stateManager.setPrefillItem(clone);
    stateManager.setEditItem(null);
    stateManager.setCreateModalOpen(true);
  }, [getNextElementKey, getNextElementId, stateManager]);

  const openDeleteModal = useCallback((ids: string[]) => {
    stateManager.setDeleteTargets(ids);
    stateManager.setIsConfirmingDelete(true);
  }, [stateManager]);

  const closeCreateModal = useCallback(() => {
    stateManager.setCreateModalOpen(false);
    if (stateManager.editingLineId) {
      emitLineUnlock(stateManager.editingLineId);
    }
    stateManager.setEditingLineId(null);
    stateManager.setEditItem(null);
    stateManager.setPrefillItem(null);
  }, [stateManager, emitLineUnlock]);

  const closeEventModal = useCallback(() => {
    stateManager.setEventModalOpen(false);
    stateManager.setEventItem(null);
    stateManager.setEventList([]);
  }, [stateManager]);

  const handleSaveEvents = useCallback(async (events: TimelineEvent[]) => {
    if (!activeProject?.projectId || !stateManager.eventItem) {
      closeEventModal();
      return;
    }
    const eventItem = stateManager.eventItem as Record<string, unknown>;
    const others = Array.isArray(activeProject?.timelineEvents)
      ? activeProject.timelineEvents.filter((ev) => ev.budgetItemId !== String(eventItem.budgetItemId))
      : [];
    const nowIso = new Date().toISOString();
    const withIds = events.map((ev) => {
      const id = ev.id || uuid();
      return {
        id,
        eventId: id,
        date: ev.date,
        hours: ev.hours,
        description: ev.description || '',
        budgetItemId: String(eventItem.budgetItemId),
        createdAt: ev.createdAt || nowIso,
        ...(ev.payload !== undefined ? { payload: ev.payload } : {}),
      } as TimelineEvent;
    });
    const updated = [...others, ...withIds];
    try {
      // Emit only; backend persists and then broadcasts
      emitTimelineUpdate(updated);
    } catch (err) {
      console.error('Error saving events', err);
    }
    closeEventModal();
  }, [activeProject, stateManager.eventItem, closeEventModal, emitTimelineUpdate]);

  const confirmDelete = useCallback(async () => {
    if (!activeProject?.projectId || stateManager.deleteTargets.length === 0) {
      stateManager.setIsConfirmingDelete(false);
      stateManager.setDeleteTargets([]);
      return;
    }
    stateManager.pushHistory();
    try {
      await Promise.all(
        stateManager.deleteTargets.map((id) => deleteBudgetItem(activeProject.projectId, id))
      );
      const updatedList = budgetItems.filter(
        (it) => !stateManager.deleteTargets.includes((it as { budgetItemId: string }).budgetItemId)
      );
      setBudgetItems(updatedList);
      stateManager.setSelectedRowKeys((prev) =>
        prev.filter((key) => !stateManager.deleteTargets.includes(key))
      );
      if (stateManager.deleteTargets.includes((stateManager.editItem as { budgetItemId: string })?.budgetItemId)) {
        closeCreateModal();
      }
      if (Array.isArray(activeProject?.timelineEvents)) {
        const remainingEvents = activeProject.timelineEvents.filter(
          (ev) => !stateManager.deleteTargets.includes(ev.budgetItemId)
        );
        if (remainingEvents.length !== activeProject.timelineEvents.length) {
          // Emit only; backend persists and then broadcasts
          const normalized = remainingEvents.map((ev) => {
            const id = ev.id || uuid();
            return {
              ...ev,
              id,
              eventId: ev.eventId || id,
              createdAt: ev.createdAt || new Date().toISOString(),
            } as TimelineEvent;
          });
          emitTimelineUpdate(normalized);
        }
      }
      await stateManager.syncHeaderTotals(updatedList);
      emitBudgetUpdate();
      // Update locks using context (locks are now managed internally by the context)
    } catch (err) {
      console.error('Error deleting line items:', err);
    } finally {
      stateManager.setIsConfirmingDelete(false);
      stateManager.setDeleteTargets([]);
    }
  }, [activeProject, stateManager, budgetItems, setBudgetItems, closeCreateModal, emitTimelineUpdate, emitBudgetUpdate]);

  const handleDuplicateSelected = useCallback(async () => {
    if (!activeProject?.projectId || !budgetHeader || stateManager.selectedRowKeys.length === 0)
      return;
    stateManager.pushHistory();
    try {
      const toClone = budgetItems.filter((it) =>
        stateManager.selectedRowKeys.includes((it as { budgetItemId: string }).budgetItemId)
      );
      const tempItems = [...budgetItems];
      const clones = [];
      for (const item of toClone) {
        const slug = slugify((activeProject?.title as string) || "");
        let maxKey = 0;
        tempItems.forEach((it) => {
          if (typeof it.elementKey === "string") {
            const match = it.elementKey.match(/-(\d+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxKey) maxKey = num;
            }
          }
        });
        const nextKey = `${slug}-${String(maxKey + 1).padStart(4, "0")}`;

        let maxId = 0;
        if (item.category) {
          tempItems.forEach((it) => {
            if (it.category === item.category && typeof it.elementId === "string") {
              const match = it.elementId.match(/-(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxId) maxId = num;
              }
            }
          });
        }
        const nextId = item.category
          ? `${item.category}-${String(maxId + 1).padStart(4, "0")}`
          : "";

        const { ...rest } = item;
        const revision = Number(budgetHeader?.revision ?? 1);
        const payload: Partial<BudgetLine> & Record<string, unknown> = {
          ...rest,
          elementKey: nextKey,
          revision,
          budgetItemId: `LINE-${uuid()}` as `LINE-${string}`,
        };
        if (nextId) (payload as Record<string, unknown>).elementId = nextId;
        const budgetId = String(budgetHeader?.budgetId || "");
        const newItem = (await createBudgetItem(
          activeProject.projectId,
          budgetId,
          payload
        )) as BudgetLine;
        tempItems.push(newItem);
        clones.push(newItem);
      }
      const updated = [...budgetItems, ...clones];
      setBudgetItems(updated);
      stateManager.setSelectedRowKeys([]);
      const lineItemsOnly = updated.filter((it) =>
        typeof it?.budgetItemId === "string" && it.budgetItemId.startsWith("LINE-")
      );
      await stateManager.syncHeaderTotals(lineItemsOnly);
      emitBudgetUpdate();
    } catch (err) {
      console.error("Error duplicating line items:", err);
    }
  }, [activeProject, budgetHeader, stateManager, budgetItems, setBudgetItems, emitBudgetUpdate]);

  const handleEditLineItem = useCallback(async (data: Record<string, unknown>, isAutoSave = false) => {
    if (!activeProject?.projectId || !data.budgetItemId) return;
    if (!isAutoSave) {
      // Close the modal immediately so the user doesn't wait for the request
      closeCreateModal();
    }
    stateManager.pushHistory();
    try {
      const sanitized = sanitizeMutableBudgetFields(data);
      const normalized = {
        ...sanitized,
        areaGroup: sanitized["areaGroup"]
          ? String(sanitized["areaGroup"]).trim().toUpperCase()
          : '',
        invoiceGroup: sanitized["invoiceGroup"]
          ? String(sanitized["invoiceGroup"]).trim().toUpperCase()
          : '',
        description: sanitized["description"]
          ? String(sanitized["description"]).trim().toUpperCase()
          : '',
      } as Partial<BudgetItem>;
      const updatedItem = await updateBudgetItem(
        activeProject.projectId,
        String(data.budgetItemId),
        { ...normalized, revision: budgetHeader.revision as number }
      );
      const updatedList = budgetItems.map((it) =>
        it.budgetItemId === updatedItem.budgetItemId ? updatedItem : it
      );
      setBudgetItems(updatedList);
      await stateManager.syncHeaderTotals(updatedList);
      emitBudgetUpdate();
      return updatedItem;
    } catch (err) {
      console.error('Error updating line item:', err);
    }
    return null;
  }, [activeProject, budgetHeader, budgetItems, setBudgetItems, closeCreateModal, stateManager, emitBudgetUpdate]);

  const handleCreateLineItem = useCallback(async (data: Record<string, unknown>, isAutoSave = false) => {
    if (data.budgetItemId) {
      return await handleEditLineItem(data, isAutoSave);
    }
    if (!activeProject?.projectId || !budgetHeader?.budgetId) return;
    if (!isAutoSave) {
      // Close the modal immediately so the UI feels responsive
      closeCreateModal();
    }
    stateManager.pushHistory();
    try {
      const sanitized = sanitizeMutableBudgetFields(data);
      const normalized = {
        ...sanitized,
        areaGroup: sanitized["areaGroup"]
          ? String(sanitized["areaGroup"]).trim().toUpperCase()
          : '',
        invoiceGroup: sanitized["invoiceGroup"]
          ? String(sanitized["invoiceGroup"]).trim().toUpperCase()
          : '',
        description: sanitized["description"]
          ? String(sanitized["description"]).trim().toUpperCase()
          : '',
      };
      const budgetId = String(budgetHeader?.budgetId || "");
      const revision = Number(budgetHeader?.revision ?? 1);
      const item = (await createBudgetItem(
        activeProject.projectId,
        budgetId,
        ({
          ...normalized,
          budgetItemId: `LINE-${uuid()}` as `LINE-${string}`,
          revision,
        } as Partial<BudgetLine>)
      )) as BudgetLine;
      if (!item) {
        return;
      }
      const updated = [...budgetItems, item];
      setBudgetItems(updated);
      const lineItemsOnly = updated.filter((it) =>
        typeof it?.budgetItemId === "string" && it.budgetItemId.startsWith("LINE-")
      );
      await stateManager.syncHeaderTotals(lineItemsOnly);
      emitBudgetUpdate();
      
      return item;
    } catch (err) {
      console.error('Error creating line item:', err);
    }
    return null;
  }, [activeProject, budgetHeader, budgetItems, setBudgetItems, closeCreateModal, stateManager, emitBudgetUpdate, handleEditLineItem]);

  // WebSocket event handling via window events from BudgetProvider
  useEffect(() => {
    const handleLineLocked = (event: CustomEvent) => {
      const data = event.detail;
      if (
        data.projectId === activeProject?.projectId &&
        data.revision === budgetHeader?.revision &&
        data.senderId !== userId
      ) {
        // Lock state is now managed by the context, so we just need to update the stateManager's copy
        stateManager.setLockedLines((prev) => (prev.includes(data.lineId) ? prev : [...prev, data.lineId]));
      }
    };

    const handleLineUnlocked = (event: CustomEvent) => {
      const data = event.detail;
      if (
        data.projectId === activeProject?.projectId &&
        data.revision === budgetHeader?.revision &&
        data.senderId !== userId
      ) {
        // Lock state is now managed by the context, so we just need to update the stateManager's copy
        stateManager.setLockedLines((prev) => prev.filter((id) => id !== data.lineId));
      }
    };

    window.addEventListener('lineLocked', handleLineLocked as EventListener);
    window.addEventListener('lineUnlocked', handleLineUnlocked as EventListener);
    
    return () => {
      window.removeEventListener('lineLocked', handleLineLocked as EventListener);
      window.removeEventListener('lineUnlocked', handleLineUnlocked as EventListener);
    };
  }, [activeProject?.projectId, budgetHeader?.revision, userId, stateManager]);

  // Cleanup line locks on unmount
  useEffect(() => {
    return () => {
      if (stateManager.editingLineId) {
        emitLineUnlock(stateManager.editingLineId);
      }
    };
  }, [stateManager.editingLineId, emitLineUnlock]);

  const handlers: BudgetEventHandlers = useMemo(() => ({
    // Line item operations
    handleCreateLineItem,
    handleEditLineItem,
    confirmDelete,
    handleDuplicateSelected,
    
    // Modal operations
    openCreateModal,
    openEditModal,
    openEventModal,
    openDuplicateModal,
    openDeleteModal,
    closeCreateModal,
    closeEventModal,
    
    // Event operations
    handleSaveEvents,
    
    // Helper functions
    getNextElementKey,
    getNextElementId,
  }), [
    handleCreateLineItem, handleEditLineItem, confirmDelete, handleDuplicateSelected,
    openCreateModal, openEditModal, openEventModal, openDuplicateModal, openDeleteModal,
    closeCreateModal, closeEventModal,
    handleSaveEvents,
    getNextElementKey, getNextElementId
  ]);

  return <>{children(handlers)}</>;
};

export default BudgetEventManager;











