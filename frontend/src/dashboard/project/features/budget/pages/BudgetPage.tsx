import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
} from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import * as ExcelJS from "exceljs";
import styles from "./budget-page.module.css";

import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import { useFilesNavigation } from "@/dashboard/project/components/Shared/hooks/useFilesNavigation";
import BudgetHeader from "@/dashboard/project/features/budget/components/HeaderStats";
import BudgetFileModal from "@/dashboard/project/features/budget/components/BudgetFileModal";
import CreateLineItemModal from "@/dashboard/project/features/budget/components/CreateLineItemModal";
import RevisionModal from "@/dashboard/project/features/budget/components/RevisionModal";
// import BudgetChart from "@/dashboard/project/features/budget/components/BudgetChart";
import BudgetToolbar from "@/dashboard/project/features/budget/components/BudgetToolbar";
import BudgetItemsTable from "@/dashboard/project/features/budget/components/BudgetTable";
import BudgetStateManager from "@/dashboard/project/features/budget/components/BudgetStateManager";
import BudgetEventManager from "@/dashboard/project/features/budget/components/BudgetEventManager";
import BudgetTableLogic from "@/dashboard/project/features/budget/components/BudgetTableLogic";
import BudgetSpellbookModal, {
  type BudgetSpellbookApplyRequest,
} from "@/dashboard/project/features/budget/components/BudgetSpellbookModal";
import BudgetWorkPanelModal from "@/dashboard/project/features/budget/components/BudgetWorkPanelModal";
import { BudgetProvider} from "@/dashboard/project/features/budget/context/BudgetProvider";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { slugify } from "@/shared/utils/slug";
import { parseBudget } from "@/shared/utils/budgetUtils";
import {
  fetchBudgetHeaders,
  updateBudgetItem,
  fetchBudgetItems,
  createBudgetItem,
  deleteBudgetItem,
  fetchTasks,
  createTask,
  createTasksBulk,
  updateTask,
  type Task,
} from "@/shared/utils/api";
import {
  BUDGET_TASK_LINK_TYPES,
  getPrimaryBudgetLineItemId,
  getSecondaryBudgetLinks,
  getTaskLinkTypeForBudgetItem,
  inferBudgetTaskLinkTypeFromTitle,
  type BudgetTaskLinkType,
} from "@/shared/utils/budgetTaskLinks";
import { buildPlanDraft, type PlanDraftAssumptions, type PlanDraftOutputs } from "../lib/planDraft";
import { blockMinutesFromWindow } from "@/shared/utils/focusBlockWindows";
import { v4 as uuid } from "uuid";
import type { InvoiceDetailsPayload } from "@/dashboard/project/features/budget/components/invoicePreviewTypes";
import { notify } from "@/shared/ui/ToastNotifications";


const TABLE_BOTTOM_MARGIN = 20;

type WorkPanelLineItem = {
  budgetItemId: string;
  elementKey?: string;
  elementId?: string;
  description?: string;
};

// Inner component that uses the budget context
const BudgetPageContent = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeProject: initialActiveProject,
    fetchProjectDetails,
    user,
    userId,
    setProjects,
    setSelectedProjects,
    isAdmin: isAdminCtx,
    isBuilder,
    isDesigner,
  } = useData();
  const isAdmin = !!isAdminCtx;
  const canEdit = isAdmin || isBuilder || isDesigner;
  const [activeProject, setActiveProject] = useState(initialActiveProject);
  const quickLinksRef = useRef(null);
  const tableRef = useRef(null);

  // Use files navigation hook for V2 overlay
  const { openFiles } = useFilesNavigation({
    projectId,
    projectTitle: activeProject?.title,
  });

  const [tableHeight, setTableHeight] = useState(0);
  const [saving] = useState(false);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [workPanelItem, setWorkPanelItem] = useState<WorkPanelLineItem | null>(null);
  const [workPanelInitialFocusGroup, setWorkPanelInitialFocusGroup] = useState<BudgetTaskLinkType | null>(null);
  const openSpellbookModalRef = useRef<(() => void) | null>(null);

  const [spellbookContext, setSpellbookContext] = useState<{
    entryPoint: "budget" | "overview";
    initialTab: "budget" | "plan" | "assumptions";
    initialOutputs?: Partial<PlanDraftOutputs>;
  }>({ entryPoint: "budget", initialTab: "budget" });
  
  // Budget data from context
  const {
    budgetHeader,
    budgetItems,
    setBudgetHeader,
    setBudgetItems,
    wsOps,
  } = useBudget();
  const { emitBudgetUpdate, emitClientRevisionUpdate } = wsOps;

  // Simplified state for remaining functionality
  const [error, setError] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [areaGroups, setAreaGroups] = useState([]);
  const [invoiceGroups, setInvoiceGroups] = useState([]);
  const [clients, setClients] = useState([]);

  const activeRevisionNumber = useMemo(
    () => Number((budgetHeader as Record<string, unknown> | null)?.revision ?? NaN),
    [budgetHeader]
  );

  const hasBudgetHeader = useMemo(() => {
    const budgetId = (budgetHeader as { budgetId?: string | number } | null)?.budgetId;
    return budgetId !== undefined && budgetId !== null && String(budgetId).trim() !== "";
  }, [budgetHeader]);

  const createDisabledReason = useMemo(
    () => (hasBudgetHeader ? undefined : "Create a budget before adding line items."),
    [hasBudgetHeader],
  );

  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });

  useLayoutEffect(() => {
    const updateTableHeight = () => {
      if (tableRef.current) {
        const top = tableRef.current.getBoundingClientRect().top;
        setTableHeight(window.innerHeight - top - TABLE_BOTTOM_MARGIN);
      }
    };

    updateTableHeight();
    window.addEventListener("resize", updateTableHeight);

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateTableHeight);
      resizeObserver.observe(document.body);
    }

    return () => {
      window.removeEventListener("resize", updateTableHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    setActiveProject(initialActiveProject);
  }, [initialActiveProject]);

  useEffect(() => {
    const resolvedProjectId = activeProject?.projectId;
    if (!resolvedProjectId) {
      setProjectTasks([]);
      return;
    }

    let canceled = false;
    fetchTasks(resolvedProjectId)
      .then((tasks) => {
        if (canceled) return;
        setProjectTasks(tasks);
      })
      .catch(() => {
        if (canceled) return;
        setProjectTasks([]);
      });

    return () => {
      canceled = true;
    };
  }, [activeProject?.projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (!initialActiveProject || initialActiveProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, initialActiveProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title ?? initialActiveProject?.title;
    if (!title) return;

    const locationState = location.state as { fromGlobalSearch?: boolean } | undefined;
    if (locationState?.fromGlobalSearch) {
      return;
    }

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/budget")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/budget");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject?.title,
    initialActiveProject?.title,
    location.pathname,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    const state = location.state as
      | {
          conjurePlan?: boolean;
        }
      | undefined;

    if (!state?.conjurePlan) return;

    // Open the spellbook in Project Plan mode, then clear state to avoid re-opening.
    setSpellbookContext({
      entryPoint: "overview",
      initialTab: "plan",
      initialOutputs: { budget: true, calendarPlan: true, links: true },
    });

    // Defer until after BudgetStateManager mounts.
    setTimeout(() => openSpellbookModalRef.current?.(), 0);

    // BudgetStateManager owns the open flag; we use a small polling tick to ensure it exists.
    // The actual open occurs where the modal is rendered (see below).
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const handleBack = () => {
    if (!projectId) {
      navigate("/dashboard/projects");
      return;
    }

    const title = activeProject?.title ?? initialActiveProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

  const parseStatusToNumber = (statusString) => {
    if (statusString === undefined || statusString === null) {
      return 0;
    }
    const str =
      typeof statusString === "string" ? statusString : String(statusString);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject) => {
    setActiveProject(updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId) => {
    setProjects((prev) => prev.filter((p) => p.projectId !== deletedProjectId));
    setSelectedProjects((prev) => prev.filter((id) => id !== deletedProjectId));
    navigate("/dashboard/projects");
  };

  const workCountByLineItemId = useMemo(() => {
    const counts: Record<string, number> = {};

    projectTasks.forEach((task) => {
      const ids = new Set<string>();

      const primaryId = getPrimaryBudgetLineItemId(task);
      if (primaryId) ids.add(primaryId);

      getSecondaryBudgetLinks(task).forEach((link) => {
        if (link.budgetLineItemId) ids.add(link.budgetLineItemId);
      });

      ids.forEach((id) => {
        counts[id] = (counts[id] ?? 0) + 1;
      });
    });

    return counts;
  }, [projectTasks]);

  const handleOpenWorkPanel = useCallback((record: Record<string, unknown>) => {
    const budgetItemId = typeof record.budgetItemId === "string" ? record.budgetItemId : "";
    if (!budgetItemId) return;
    setWorkPanelInitialFocusGroup(null);
    setWorkPanelItem({
      budgetItemId,
      elementKey: typeof record.elementKey === "string" ? record.elementKey : undefined,
      elementId: typeof record.elementId === "string" ? record.elementId : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
    });
  }, []);

  const buildCoverageMap = useMemo(() => {
    const out: Record<string, Partial<Record<BudgetTaskLinkType, "missing" | "pending" | "done">>> = {};

    const lineIds = budgetItems
      .filter((it) => typeof (it as any)?.budgetItemId === "string" && String((it as any).budgetItemId).startsWith("LINE-"))
      .map((it) => String((it as any).budgetItemId));

    lineIds.forEach((id) => {
      out[id] = {};
      BUDGET_TASK_LINK_TYPES.forEach((t) => {
        out[id]![t.id] = "missing";
      });
    });

    projectTasks.forEach((task) => {
      const linkedIds = new Set<string>();
      const primary = getPrimaryBudgetLineItemId(task);
      if (primary) linkedIds.add(primary);
      getSecondaryBudgetLinks(task).forEach((l) => {
        if (l.budgetLineItemId) linkedIds.add(l.budgetLineItemId);
      });

      const isDone = task.status === "done";

      linkedIds.forEach((budgetItemId) => {
        if (!out[budgetItemId]) return;
        const linkType =
          getTaskLinkTypeForBudgetItem(task as any, budgetItemId) ??
          inferBudgetTaskLinkTypeFromTitle(task.title ?? "");

        const prev = out[budgetItemId]![linkType];
        if (prev === "done") return;
        out[budgetItemId]![linkType] = isDone ? "done" : "pending";
      });
    });

    return out;
  }, [budgetItems, projectTasks]);

  const riskAndReadiness = useMemo(() => {
    const lineItems = budgetItems
      .filter((it) => typeof (it as any)?.budgetItemId === "string" && String((it as any).budgetItemId).startsWith("LINE-"))
      .map((it) => it as any);

    const atRisk: string[] = [];
    const ready: string[] = [];

    lineItems.forEach((line) => {
      const id = String(line.budgetItemId);
      const coverage = buildCoverageMap[id];
      if (!coverage) return;

      const category = String(line.category ?? "").toUpperCase();
      const requiresQuote = category === "RENTALS" || category === "AUDIO-VISUAL" || category === "LIGHTING" || category === "GRAPHICS";
      if (requiresQuote) {
        if (coverage.quote !== "done") atRisk.push(id);
      }

      if (coverage.install === "done" && coverage.invoice !== "done") {
        ready.push(id);
      }
    });

    return { atRiskQuoteIds: atRisk, readyToInvoiceIds: ready };
  }, [budgetItems, buildCoverageMap]);

  const openWorkPanelForLine = useCallback(
    (budgetItemId: string, focusGroup: BudgetTaskLinkType | null) => {
      const line = budgetItems.find((it: any) => String(it?.budgetItemId ?? "") === budgetItemId) as any;
      if (!line) return;
      setWorkPanelInitialFocusGroup(focusGroup);
      setWorkPanelItem({
        budgetItemId,
        elementKey: typeof line.elementKey === "string" ? line.elementKey : undefined,
        elementId: typeof line.elementId === "string" ? line.elementId : undefined,
        description: typeof line.description === "string" ? line.description : undefined,
      });
    },
    [budgetItems],
  );

  const handleCreateMissingWorkStage = useCallback(
    async (record: Record<string, unknown>, stage: BudgetTaskLinkType) => {
      const projectId = activeProject?.projectId;
      if (!projectId) return;
      const budgetItemId = typeof record.budgetItemId === "string" ? record.budgetItemId : "";
      if (!budgetItemId) return;

      const desc = typeof record.description === "string" ? record.description.trim() : "";
      const title = `${stage.toUpperCase()}: ${desc || "Budget item"}`;

      try {
        const created = await createTask({
          projectId,
          title,
          status: "todo",
          primaryBudgetLineItemId: budgetItemId,
          budgetLinkType: stage,
        });
        setProjectTasks((prev) => [created, ...prev]);
        notify("success", "Task created.");
      } catch (err) {
        console.error("Failed to create task", err);
        notify("error", "Failed to create task.");
      }
    },
    [activeProject?.projectId],
  );

  const handleUnlinkWorkTask = useCallback(
    async (budgetItemId: string, task: Task) => {
      const projectId = activeProject?.projectId;
      if (!projectId) return;
      if (!budgetItemId || !task?.taskId) return;

      const primaryId = getPrimaryBudgetLineItemId(task);
      const existingSecondary = getSecondaryBudgetLinks(task);
      const nextSecondary = existingSecondary.filter((l) => l && l.budgetLineItemId !== budgetItemId);

      const updates: Partial<Task> = {};
      if (primaryId === budgetItemId) {
        updates.primaryBudgetLineItemId = null;
        updates.budgetLinkType = null;
      }
      if (existingSecondary.length !== nextSecondary.length) {
        updates.budgetLinks = nextSecondary as any;
      }

      if (Object.keys(updates).length === 0) return;

      try {
        const updated = await updateTask({
          projectId,
          taskId: task.taskId,
          title: task.title ?? "",
          ...updates,
        });

        setProjectTasks((prev) =>
          prev.map((t) => (t.taskId && updated.taskId && t.taskId === updated.taskId ? { ...t, ...updated } : t)),
        );
      } catch (err) {
        console.error("Failed to unlink task", err);
        notify("error", "Failed to unlink task.");
      }
    },
    [activeProject?.projectId],
  );

  const isCreatingHeaderRef = useRef(false);

  const handleBallparkChange = async (val: number) => {
    if (!activeProject?.projectId) return;

    try {
      // If no header yet, create one once (guard against double taps)
      let header = budgetHeader;
      if (!header && !isCreatingHeaderRef.current) {
        isCreatingHeaderRef.current = true;
        header = await handleCreateInitialBudget(val);
        isCreatingHeaderRef.current = false;

        // Local optimistic state already set by handleCreateInitialBudget,
        // so we can stop here or continue to ensure the latest val is saved.
        return;
      }
      if (!header) return; // safety

      const headerId = String((header as Record<string, unknown>)?.budgetItemId || "");
      const revision = Number((header as Record<string, unknown>)?.revision ?? 1);

      // Persist new ballpark
      await updateBudgetItem(activeProject.projectId, headerId, {
        headerBallPark: val,
        revision,
      });

      // Optimistic local update
      setBudgetHeader(prev => prev ? { ...prev, headerBallPark: val } : prev);

      emitBudgetUpdate();
    } catch (err) {
      console.error('Error updating ballpark', err);
      isCreatingHeaderRef.current = false;
    }
  };

  const handleCreateInitialBudget = async (initialBallpark = 0) => {
    if (!activeProject?.projectId) return;
    try {
      // Create a budgetId for the project - follow existing preview naming convention
      const budgetId = `budget-${activeProject.projectId}`;

      const headerFields = {
        projectId: activeProject.projectId,
        projectTitle: activeProject.title || undefined,
        revision: 1,
        headerBallPark: initialBallpark,
        headerBudgetedTotalCost: 0,
        headerActualTotalCost: 0,
        headerFinalTotalCost: 0,
        headerEffectiveMarkup: 0,
        isHeader: true,
      };

  const newHeader = await createBudgetItem(activeProject.projectId, budgetId, headerFields);

      // Update local context/state so UI can reflect new header immediately
  setBudgetHeader(newHeader as unknown as Record<string, unknown>);
  setBudgetItems([]);
      computeGroupsAndClients([], newHeader);

      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);
      emitBudgetUpdate();
  return newHeader as unknown as Record<string, unknown>;
    } catch (err) {
      console.error('Error creating initial budget header', err);
    }
  };

  const computeGroupsAndClients = useCallback(
    (items, header) => {
      const aSet = new Set();
      const iSet = new Set();
      const cSet = new Set(Array.isArray(header?.clients) ? header.clients : []);
      items.forEach((it) => {
        if (it.areaGroup) aSet.add(String(it.areaGroup).trim().toUpperCase());
        if (it.invoiceGroup)
          iSet.add(String(it.invoiceGroup).trim().toUpperCase());
        if (it.client) cSet.add(it.client);
      });
      setAreaGroups(Array.from(aSet));
      setInvoiceGroups(Array.from(iSet));
      setClients(Array.from(cSet));
    },
    []
  );

  const normalizeMatchText = (value: unknown) =>
    String(value ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();

  const toLineFinalCost = (quantity: unknown, unitCost: unknown, markup: unknown) => {
    const qty = Number(quantity) || 0;
    const cost = Number(unitCost) || 0;
    const mark = Number(markup) || 0;
    const total = qty * cost * (1 + mark);
    return Math.round(total * 100) / 100;
  };

  const resolveBaseCostForExistingLine = (existing: Record<string, unknown>, fallbackUnitCost: unknown) => {
    const reconciled = parseBudget(existing.itemReconciledCost as unknown as any);
    if (reconciled) return reconciled;
    const actual = parseBudget(existing.itemActualCost as unknown as any);
    if (actual) return actual;
    const budgeted = Number(fallbackUnitCost) || 0;
    return budgeted;
  };

  const tokenSet = (value: string) =>
    new Set(value.split(/\s+/g).filter((token) => token.length >= 3));

  const jaccardSimilarity = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection += 1;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  };

  /**
   * Process API calls in batches to avoid rate limiting.
   * Each batch runs in parallel, batches run sequentially with a small delay.
   */
  const processBatched = async <T, R>(
    items: T[],
    processor: (item: T, idx: number) => Promise<R>,
    batchSize = 5,
    delayMs = 100,
  ): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item, batchIdx) => processor(item, i + batchIdx))
      );
      results.push(...batchResults);
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return results;
  };

  const allocateElementKeySequence = useCallback(
    (count: number) => {
      const slug = slugify((activeProject?.title as string) || "");
      let max = 0;
      budgetItems.forEach((it) => {
        if (typeof it.elementKey === "string") {
          const match = it.elementKey.match(/-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > max) max = num;
          }
        }
      });
      return Array.from({ length: count }, (_, idx) => `${slug}-${String(max + idx + 1).padStart(4, "0")}`);
    },
    [activeProject?.title, budgetItems],
  );

  const allocateElementIds = useCallback(
    (categories: string[]) => {
      const maxByCategory = new Map<string, number>();
      budgetItems.forEach((it) => {
        const cat = String((it as Record<string, unknown>)?.category ?? "");
        const elementId = String((it as Record<string, unknown>)?.elementId ?? "");
        if (!cat || !elementId) return;
        const match = elementId.match(/-(\d+)$/);
        if (!match) return;
        const num = parseInt(match[1], 10);
        if (Number.isNaN(num)) return;
        maxByCategory.set(cat, Math.max(maxByCategory.get(cat) ?? 0, num));
      });

      const counters = new Map<string, number>();
      return categories.map((cat) => {
        const current = counters.get(cat) ?? (maxByCategory.get(cat) ?? 0);
        const next = current + 1;
        counters.set(cat, next);
        return `${cat}-${String(next).padStart(4, "0")}`;
      });
    },
    [budgetItems],
  );

  const handleApplyBudgetSpellbook = useCallback(
    async (request: BudgetSpellbookApplyRequest, stateManager: Record<string, unknown>) => {
      if (!activeProject?.projectId) return;
      const projectId = activeProject.projectId;

      const envelope = request.draft;
      const outputs = envelope?.outputs ?? request.outputs;
      const shouldApplyBudget = Boolean(outputs?.budget ?? true);
      const shouldApplyCalendar = Boolean(outputs?.calendarPlan);
      const shouldApplyLinks = Boolean(outputs?.links) && shouldApplyBudget;

      const selectedVariant =
        envelope?.variants.find((v) => v.id === envelope.selectedVariantId) ?? envelope?.variants[0] ?? request.variant;
      const draftLines = selectedVariant.lines;

      const draftIdToBudgetItemId = new Map<string, string>();

      // Conjure Plan can be invoked before a budget header exists (only needed if writing budget/links).
      let effectiveHeader = budgetHeader as any;
      if ((shouldApplyBudget || shouldApplyLinks) && !effectiveHeader?.budgetId) {
        const createdHeader = await handleCreateInitialBudget(0);
        if (!createdHeader) {
          notify("error", "Create a budget before conjuring a plan.");
          return;
        }
        effectiveHeader = createdHeader as any;
      }

      const budgetId = effectiveHeader?.budgetId ? String(effectiveHeader.budgetId) : "";
      const revision = Number(effectiveHeader?.revision ?? 1);

      const linesOnly = shouldApplyBudget
        ? budgetItems.filter((it) => typeof it?.budgetItemId === "string" && String(it.budgetItemId).startsWith("LINE-"))
        : [];

      (stateManager as { pushHistory?: () => void }).pushHistory?.();

      try {
        let createdItems: unknown[] = [];
        let updatedItems: unknown[] = [];

        if (shouldApplyBudget) {
          if (request.applyMode === "replace") {
            // Use batched processing to avoid rate limits when deleting many items
            await processBatched(
              linesOnly,
              async (it) => deleteBudgetItem(projectId, String(it.budgetItemId)),
              5,
              100,
            );
          }

          const remaining = request.applyMode === "replace" ? [] : [...linesOnly];
          const toUpdate: Array<{ existing: Record<string, unknown>; draft: Record<string, unknown>; draftId: string }> = [];
          const toCreate: Array<{ draftId: string; payload: Record<string, unknown> }> = [];

        const normalizedExisting = remaining.map((item) => ({
          item,
          category: String((item as Record<string, unknown>)?.category ?? ""),
          descTokens: tokenSet(normalizeMatchText((item as Record<string, unknown>)?.description ?? "")),
        }));

          draftLines.forEach((draft) => {
            const normalizedDraftDesc = normalizeMatchText(draft.description);
            const draftTokens = tokenSet(normalizedDraftDesc);
            const draftCategory = String(draft.category);

          if (request.applyMode === "merge") {
            let bestIdx = -1;
            let bestScore = 0;

            normalizedExisting.forEach((candidate, idx) => {
              if (candidate.category !== draftCategory) return;
              const score = jaccardSimilarity(candidate.descTokens, draftTokens);
              if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
              }
            });

            if (bestIdx >= 0 && bestScore >= 0.72) {
              const matched = normalizedExisting.splice(bestIdx, 1)[0];
              toUpdate.push({
                existing: matched.item as unknown as Record<string, unknown>,
                draftId: draft.id,
                draft: {
                  category: draft.category,
                  description: normalizedDraftDesc,
                  quantity: draft.quantity,
                  unit: draft.unit,
                  itemBudgetedCost: draft.itemBudgetedCost,
                  itemMarkUp: draft.itemMarkUp,
                  areaGroup: String(draft.areaGroup).trim().toUpperCase(),
                  invoiceGroup: String(draft.invoiceGroup).trim().toUpperCase(),
                },
              });
              return;
            }
          }

          toCreate.push({
            draftId: draft.id,
            payload: {
              category: draft.category,
              description: normalizedDraftDesc,
              quantity: draft.quantity,
              unit: draft.unit,
              itemBudgetedCost: draft.itemBudgetedCost,
              itemMarkUp: draft.itemMarkUp,
              itemFinalCost: toLineFinalCost(draft.quantity, draft.itemBudgetedCost, draft.itemMarkUp),
              itemActualCost: "",
              itemReconciledCost: "",
              paymentStatus: "UNPAID",
              paymentTerms: "NET 30",
              areaGroup: String(draft.areaGroup).trim().toUpperCase(),
              invoiceGroup: String(draft.invoiceGroup).trim().toUpperCase(),
            },
          });
        });

          const elementKeys = allocateElementKeySequence(toCreate.length);
          const elementIds = allocateElementIds(toCreate.map((d) => String(d.payload.category)));

          // Use batched processing to avoid API rate limits
          createdItems = await processBatched(
            toCreate,
            async (entry, idx) => createBudgetItem(projectId, budgetId, {
              ...entry.payload,
              elementKey: elementKeys[idx],
              elementId: elementIds[idx],
              budgetItemId: `LINE-${uuid()}`,
              revision,
            }),
            5, // batch size
            150, // delay between batches
          );

        createdItems.forEach((item, idx) => {
          const draftId = toCreate[idx]?.draftId;
          const budgetItemId = String((item as any)?.budgetItemId ?? "");
          if (draftId && budgetItemId) draftIdToBudgetItemId.set(draftId, budgetItemId);
        });

          // Use batched processing for updates too
          updatedItems = await processBatched(
            toUpdate,
            async ({ existing, draft, draftId }) => {
              const existingId = String((existing as any)?.budgetItemId ?? "");
              if (draftId && existingId) draftIdToBudgetItemId.set(draftId, existingId);
              return updateBudgetItem(projectId, String(existing.budgetItemId), {
                ...draft,
                itemFinalCost: toLineFinalCost(
                  draft.quantity,
                  resolveBaseCostForExistingLine(existing, draft.itemBudgetedCost),
                  draft.itemMarkUp,
                ),
                revision,
              });
            },
            5,
            150,
          );

        const nextLines = (() => {
          const byId = new Map<string, Record<string, unknown>>();
          const base = request.applyMode === "replace" ? [] : [...linesOnly];
          base.forEach((it) => byId.set(String((it as Record<string, unknown>)?.budgetItemId ?? ""), it as any));
          updatedItems.forEach((it) => byId.set(String((it as Record<string, unknown>)?.budgetItemId ?? ""), it as any));
          createdItems.forEach((it) => byId.set(String((it as Record<string, unknown>)?.budgetItemId ?? ""), it as any));
          return Array.from(byId.values());
        })();

          setBudgetItems(nextLines as any);
          computeGroupsAndClients(nextLines as any, budgetHeader as any);
          await (stateManager as { syncHeaderTotals?: (items: unknown[]) => Promise<void> }).syncHeaderTotals?.(nextLines);
          emitBudgetUpdate();
        }

        // Calendar Plan + Links (PlanDraft apply)
        if (shouldApplyCalendar) {
          const plan =
            envelope?.planDraft ??
            buildPlanDraft({
              budgetLines: draftLines,
              assumptions: request.planAssumptions as PlanDraftAssumptions,
            });

          const buildIsoLocal = (dateIso: string, timeHHMM: string) => `${dateIso}T${timeHHMM}:00`;

          const blocksByDraftId = new Map<string, { taskId: string; dateIso: string }>();

          for (const block of plan.focusBlocks) {
            const durationMinutes = blockMinutesFromWindow(block.startLocalTime, block.endLocalTime);
            const focus = await createTask({
              projectId,
              title: block.title,
              status: "todo",
              kind: "focus_block",
              cluster: "Plan",
              durationMinutes,
              startAt: buildIsoLocal(block.dateIso, block.startLocalTime),
              endAt: buildIsoLocal(block.dateIso, block.endLocalTime),
              dueDate: block.dateIso,
              dueAt: block.dateIso,
              focusChildTaskIds: [],
              focusChecklist: [],
            });

            if (focus.taskId) {
              blocksByDraftId.set(block.draftId, { taskId: focus.taskId, dateIso: block.dateIso });
            }
          }

          // Create tasks; attach to focus blocks (container-first).
          const childPayloadsByFocusId = new Map<string, Task[]>();
          const standalonePayloads: Task[] = [];

          plan.tasks.forEach((t) => {
            const budgetItemId = draftIdToBudgetItemId.get(t.budgetLineDraftId) ?? null;
            const shouldLink = shouldApplyLinks && Boolean(budgetItemId);

            const focus = blocksByDraftId.get(t.focusBlockDraftId) ?? null;

            const base: Task = {
              projectId,
              title: t.title,
              status: "todo",
              kind: "task",
              dueDate: focus?.dateIso ?? t.dateIso,
              dueAt: focus?.dateIso ?? t.dateIso,
              plannedMinutes: typeof t.plannedMinutes === "number" ? t.plannedMinutes : undefined,
              order: typeof t.order === "number" ? t.order : undefined,
              ...(shouldLink ? { primaryBudgetLineItemId: budgetItemId, budgetLinkType: t.linkType } : {}),
            };

            if (focus?.taskId) {
              const list = childPayloadsByFocusId.get(focus.taskId) ?? [];
              list.push({ ...base, focusBlockId: focus.taskId });
              childPayloadsByFocusId.set(focus.taskId, list);
              return;
            }

            // Fallback: still create as a non-overlapping task (no start/end).
            standalonePayloads.push(base);
          });

          for (const [focusId, children] of childPayloadsByFocusId.entries()) {
            const createdChildrenRaw = children.length > 0 ? await createTasksBulk(projectId, children) : [];
            const createdChildren = [...createdChildrenRaw].sort(
              (a, b) => (Number((a as any)?.order ?? 0) - Number((b as any)?.order ?? 0)) || String(a.title ?? "").localeCompare(String(b.title ?? "")),
            );
            const childIds = createdChildren
              .map((task) => task.taskId)
              .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

            await updateTask({
              projectId,
              taskId: focusId,
              focusChildTaskIds: childIds,
              focusChecklist: createdChildren
                .filter((child) => typeof child.taskId === "string" && child.taskId.trim().length > 0)
                .map((child) => ({ taskId: child.taskId as string, title: child.title })),
            } as any);
          }

          if (standalonePayloads.length > 0) {
            await createTasksBulk(projectId, standalonePayloads);
          }

          const refreshed = await fetchTasks(projectId);
          setProjectTasks(refreshed);
        }

        notify(
          "success",
          shouldApplyBudget
            ? `Spellbook applied (${createdItems.length} added${updatedItems.length ? `, ${updatedItems.length} updated` : ""}).`
            : "Spellbook applied (plan only).",
        );
      } catch (err) {
        console.error("Failed to apply budget spellbook", err);
        notify("error", "Failed to apply Spellbook.");
      }
    },
    [
      activeProject?.projectId,
      allocateElementIds,
      allocateElementKeySequence,
      budgetHeader,
      budgetItems,
      computeGroupsAndClients,
      emitBudgetUpdate,
      handleCreateInitialBudget,
      setBudgetItems,
      setProjectTasks,
    ],
  );

  const refresh = useCallback(async () => {
    if (!activeProject?.projectId) return;
    try {
      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);

      const header =
        revs.find((h) => Number(h.revision) === activeRevisionNumber) ||
        revs.find((h) => h.revision === h.clientRevisionId) ||
        revs[0] ||
        null;

      if (header?.budgetId) {
        const items = await fetchBudgetItems(header.budgetId, header.revision);
        computeGroupsAndClients(items, header);
      } else {
        setClients([]);
      }
    } catch (err) {
      console.error("Error fetching budget header", err);
    }
  }, [activeProject?.projectId, computeGroupsAndClients, activeRevisionNumber]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleClientRevisionEvent = () => {
      refresh();
    };

    window.addEventListener("clientRevisionUpdated", handleClientRevisionEvent);
    return () => {
      window.removeEventListener("clientRevisionUpdated", handleClientRevisionEvent);
    };
  }, [refresh]);

  const handleNewRevision = async (duplicate = false, fromRevision = null) => {
    if (!activeProject?.projectId || !budgetHeader) return;

    const targetRev = fromRevision != null ? fromRevision : budgetHeader.revision;

    let newRev;
    if (duplicate) {
      const base = Math.floor(targetRev);
      const decimals = revisions
        .filter((r) => Math.floor(r.revision) === base && r.revision !== base)
        .map((r) => parseInt(String(r.revision).split('.')[1] || '0', 10))
        .filter((n) => !Number.isNaN(n));
      const nextDec = decimals.length ? Math.max(...decimals) + 1 : 1;
      newRev = parseFloat(`${base}.${nextDec}`);
    } else {
      const bases = revisions.map((r) => Math.floor(r.revision));
      const nextBase = bases.length ? Math.max(...bases) + 1 : 1;
      newRev = nextBase;
    }

    while (revisions.some((r) => r.revision === newRev)) {
      if (duplicate) {
        const base = Math.floor(targetRev);
        const decimals = revisions
          .filter((r) => Math.floor(r.revision) === base && r.revision !== base)
          .map((r) => parseInt(String(r.revision).split('.')[1] || '0', 10))
          .filter((n) => !Number.isNaN(n));
        const nextDec = decimals.length ? Math.max(...decimals) + 1 : 1;
        newRev = parseFloat(`${base}.${nextDec}`);
      } else {
        newRev += 1;
      }
    }

    try {
      const sourceHeader =
        revisions.find((h) => h.revision === targetRev) || budgetHeader;
      const headerFields = duplicate
        ? {
            ...sourceHeader,
            revision: newRev,
            isHeader: true,
          }
        : {
            title: budgetHeader.title,
            startDate: budgetHeader.startDate,
            endDate: budgetHeader.endDate,
            clients: budgetHeader.clients,
            headerBallPark: 0,
            headerBudgetedTotalCost: 0,
            headerActualTotalCost: 0,
            headerEffectiveMarkup: 0,
            headerFinalTotalCost: 0,
            revision: newRev,
            isHeader: true,
          };
      delete headerFields.budgetItemId;
      delete headerFields.createdAt;
      delete headerFields.updatedAt;

      const newHeader = await createBudgetItem(
        activeProject.projectId,
        budgetHeader.budgetId as string,
        headerFields
      );

      let newItems = [];
      if (duplicate) {
        let items = budgetItems;
        if (sourceHeader.revision !== budgetHeader.revision) {
          items = await fetchBudgetItems(
            sourceHeader.budgetId,
            sourceHeader.revision
          );
        }
        if (items.length > 0) {
          newItems = await Promise.all(
            items.map((it) => {
              const { ...rest } = it;
              return createBudgetItem(
                activeProject.projectId,
                budgetHeader.budgetId as string,
                {
                  ...rest,
                  budgetItemId: `LINE-${uuid()}`,
                  revision: newRev,
                }
              );
            })
          );
        }
      }

      setBudgetHeader(newHeader);
      setBudgetItems(newItems);
      computeGroupsAndClients(newItems, newHeader);
      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);
      emitBudgetUpdate();
    } catch (err) {
      console.error('Error creating new revision', err);
    }
  };

  const handleSwitchRevision = async (rev) => {
    if (!activeProject?.projectId) return;
    const header = revisions.find((h) => h.revision === rev);
    if (!header) return;
    try {
      const items = await fetchBudgetItems(header.budgetId, rev);
      setBudgetHeader((prev) => (prev ? { ...prev, ...header } : header));
      setBudgetItems(items);
      computeGroupsAndClients(items, header);
    } catch (err) {
      console.error('Error switching revision', err);
    }
  };

  const handleDeleteRevision = async (rev) => {
    if (!activeProject?.projectId) return;
    const header = revisions.find((h) => h.revision === rev);
    if (!header) return;
    try {
      const items = await fetchBudgetItems(header.budgetId, rev);
      await Promise.all(
        items.map((it) =>
          deleteBudgetItem(activeProject.projectId, it.budgetItemId)
        )
      );
      await deleteBudgetItem(activeProject.projectId, header.budgetItemId);
      const revs = await fetchBudgetHeaders(activeProject.projectId);
      setRevisions(revs);
      if (budgetHeader?.revision === rev) {
        const nextHeader = revs[0] || null;
        if (nextHeader) {
          const nextItems = await fetchBudgetItems(
            nextHeader.budgetId,
            nextHeader.revision
          );
          setBudgetHeader(nextHeader);
          setBudgetItems(nextItems);
          computeGroupsAndClients(nextItems, nextHeader);
        } else {
          setBudgetHeader(null);
          setBudgetItems([]);
          setAreaGroups([]);
          setInvoiceGroups([]);
          setClients([]);
        }
      }
      emitBudgetUpdate();
    } catch (err) {
      console.error('Error deleting revision', err);
    }
  };

  const handleSetClientRevision = async (revisionNumber: number) => {
    if (!activeProject?.projectId) return;

    const targetEntry = revisions.find(
      (h) => Number(h.revision) === Number(revisionNumber) && h.budgetItemId
    );
    if (!targetEntry?.budgetItemId) {
      console.warn("No matching revision header found for client revision update", revisionNumber);
      return;
    }

    const targetRevision = Number(targetEntry.revision ?? null);
    if (!Number.isFinite(targetRevision)) return;

    try {
      const projectId = activeProject.projectId;
      const updates: Promise<unknown>[] = [
        updateBudgetItem(projectId, targetEntry.budgetItemId, {
          clientRevisionId: targetRevision,
          revision: targetEntry.revision,
        }),
      ];

      revisions
        .filter((h) => h.budgetItemId && h.budgetItemId !== targetEntry.budgetItemId)
        .forEach((h) => {
          updates.push(
            updateBudgetItem(projectId, h.budgetItemId!, {
              clientRevisionId: targetRevision,
              revision: h.revision,
            })
          );
        });

      await Promise.all(updates);

      setRevisions((prev) =>
        prev.map((h) => ({ ...h, clientRevisionId: targetRevision }))
      );
      setBudgetHeader((prev) =>
        prev
          ? { ...prev, clientRevisionId: targetRevision }
          : prev
      );

      await refresh();

      emitBudgetUpdate();
      emitClientRevisionUpdate(targetRevision);
    } catch (err) {
      console.error("Failed to set client revision", err);
    }
  };

  const handleRenameRevision = async (
    revision: { budgetItemId?: string; revision: number },
    nextName: string,
  ) => {
    if (!activeProject?.projectId || !revision?.budgetItemId) return;

    const normalized = nextName.trim();
    try {
      await updateBudgetItem(activeProject.projectId, revision.budgetItemId, {
        revisionName: normalized || null,
        revision: revision.revision,
      });

      setRevisions((prev) =>
        prev.map((item) =>
          item.budgetItemId === revision.budgetItemId
            ? { ...item, revisionName: normalized || null }
            : item,
        ),
      );

      setBudgetHeader((prev) =>
        prev && prev.budgetItemId === revision.budgetItemId
          ? { ...prev, revisionName: normalized || null }
          : prev,
      );

      emitBudgetUpdate();
    } catch (error) {
      console.error("Failed to rename revision", error);
    }
  };

  const handleRevisionNoteChange = async (
    revision: { budgetItemId?: string; revision: number },
    nextNote: string,
  ) => {
    if (!activeProject?.projectId || !revision?.budgetItemId) return;

    const normalized = nextNote.trim();
    try {
      await updateBudgetItem(activeProject.projectId, revision.budgetItemId, {
        revisionNote: normalized || null,
        revision: revision.revision,
      });

      setRevisions((prev) =>
        prev.map((item) =>
          item.budgetItemId === revision.budgetItemId
            ? { ...item, revisionNote: normalized || null }
            : item,
        ),
      );

      setBudgetHeader((prev) =>
        prev && prev.budgetItemId === revision.budgetItemId
          ? { ...prev, revisionNote: normalized || null }
          : prev,
      );

      emitBudgetUpdate();
    } catch (error) {
      console.error("Failed to update revision note", error);
    }
  };

  const handleRevisionInvoiceSaved = (
    revision: { budgetItemId?: string; revision: number },
    invoice: { invoiceDetails: InvoiceDetailsPayload },
  ) => {
    if (!revision?.budgetItemId) return;

    const nextDetails = invoice.invoiceDetails;

    setRevisions((prev) =>
      prev.map((item) =>
        item.budgetItemId === revision.budgetItemId
          ? {
              ...item,
              invoiceDetails: nextDetails,
              invoiceFileKey: null,
              invoiceFileUrl: null,
            }
          : item,
      ),
    );

    setBudgetHeader((prev) =>
      prev && prev.budgetItemId === revision.budgetItemId
        ? {
            ...prev,
            invoiceDetails: nextDetails,
            invoiceFileKey: null,
            invoiceFileUrl: null,
          }
        : prev,
    );

    emitBudgetUpdate();
  };

  const parseFile = async (file) => {
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      
      const worksheet = workbook.worksheets[0];
      const json = [];
      
      // Convert worksheet to JSON starting from row 12 (index 11)
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 12) { // Skip first 11 rows
          const rowData = [];
          row.eachCell((cell, colNumber) => {
            rowData[colNumber - 1] = cell.value || "";
          });
          json.push(rowData);
        }
      });
      
      const [headers, ...rows] = json;
      const idxCategory = headers.findIndex(
        (h) => /element description/i.test(h) || /category/i.test(h)
      );
      const idxAmount = headers.findIndex(
        (h) =>
          /final total/i.test(h) || /amount/i.test(h) || /value|cost/i.test(h)
      );
      if (idxCategory < 0 || idxAmount < 0) {
        throw new Error(
          'Could not find "Element Description" (or "Category") and "Final Total" (or "Amount") columns.'
        );
      }
      rows
        .map((row) => ({
          category: row[idxCategory],
          amount: parseFloat(row[idxAmount]) || 0,
        }))
        .filter((r) => r.category && r.amount > 0);

      setError(null);
    } catch (err) {
      console.error(err);
      setError(
        'Failed to parse Excel file. Ensure it includes headers like "Element Description" and "Final Total" at row 12.'
      );
    }
  };

  if (!isAdmin) {
    return <div>Access Denied</div>;
  }

  return (
    <>
      <style>{`
        :where(.ant-table-wrapper) .ant-table {
          font-size: 11px !important;
        }
      `}</style>
      <ProjectPageLayout
        projectId={projectId}
        theme={projectPalette}
        header={
          <ProjectHeader
            activeProject={activeProject as Project}
            parseStatusToNumber={parseStatusToNumber}
            userId={userId}
            onProjectDeleted={handleProjectDeleted}
            showWelcomeScreen={handleBack}
            onActiveProjectChange={handleActiveProjectChange}
            onOpenFiles={openFiles}
            onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
          />
        }
      >
        {saving && (
          <div style={{ color: '#FA3356', marginBottom: '10px' }}>Saving...</div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="budget-layout-motion"
          >
            <div className="budget-layout">
              <QuickLinksComponent ref={quickLinksRef} hideTrigger={true} />

              {/* Use the new component structure */}
              <BudgetStateManager activeProject={activeProject}>
                {(stateManager) => {
                  openSpellbookModalRef.current = () => stateManager.setSpellbookModalOpen(true);
                  return (
                    <BudgetEventManager
                      activeProject={activeProject}
                      userId={userId}
                      user={user}
                      stateManager={stateManager}
                    >
                      {(eventHandlers) => (
                          <BudgetTableLogic
                            groupBy={stateManager.groupBy}
                            sortField={stateManager.sortField}
                            sortOrder={stateManager.sortOrder}
                            filterQuery={stateManager.filterQuery as string}
                            selectedRowKeys={stateManager.selectedRowKeys}
                            setSelectedRowKeys={stateManager.setSelectedRowKeys}
                            openDeleteModal={eventHandlers.openDeleteModal}
                          openDuplicateModal={eventHandlers.openDuplicateModal}
                      >
                        {(tableConfig) => (
                          <>
                            <div className="budget-layout__scroll">
                              <BudgetHeader
                                activeProject={activeProject as Project}
                                budgetHeader={budgetHeader as { budgetItemId: string; revision: number; [key: string]: unknown } | null}
                                budgetItems={budgetItems as { [key: string]: unknown }[]}
                                groupBy={stateManager.groupBy as "none" | "areaGroup" | "invoiceGroup" | "category"}
                                setGroupBy={(g) =>
                                  stateManager.setGroupBy(
                                    g as "none" | "areaGroup" | "invoiceGroup" | "category"
                                  )
                                }
                                onOpenRevisionModal={() => stateManager.setRevisionModalOpen(true)}
                                onSwitchRevision={handleSwitchRevision}
                                revisions={revisions}
                                onBallparkChange={handleBallparkChange}
                                onCreateBudget={handleCreateInitialBudget}
                              />
                              <div style={{ padding: "0" }}>
                                <div>
                                  {error && (
                                    <div style={{ marginTop: "10px", color: "#ff6b6b" }}>
                                      Error: {error}
                                    </div>
                                  )}
                                  {/* BudgetChart removed (component unavailable) */}
                                  <div
                                    style={{
                                      width: "100%",
                                      marginTop: "10px",
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "flex-start",
                                    }}
                                  >
                                    {(() => {
                                      const groupedData =
                                        budgetItems.length > 0
                                          ? (tableConfig.groupedTableData as (Record<string, unknown> & {
                                              budgetItemId: string;
                                              key: string;
                                            })[])
                                          : [];
                                      const availableRowIds = groupedData.map((item) =>
                                        String(item.budgetItemId)
                                      );
                                      const availableRowIdSet = new Set(availableRowIds);
                                      const selectedInScope = stateManager.selectedRowKeys.filter((id) =>
                                        availableRowIdSet.has(id)
                                      );
                                      const isSelectAllChecked =
                                        stateManager.isSelectMode &&
                                        availableRowIds.length > 0 &&
                                        selectedInScope.length === availableRowIds.length;
                                      const handleSelectAllChange = (checked: boolean) => {
                                        if (!stateManager.isSelectMode) return;
                                        stateManager.setSelectedRowKeys((prevKeys) => {
                                          if (checked) {
                                            const next = new Set(prevKeys);
                                            availableRowIds.forEach((id) => next.add(id));
                                            return Array.from(next);
                                          }
                                          return prevKeys.filter((id) => !availableRowIdSet.has(id));
                                        });
                                      };
                                      const handleClearSelection = () => {
                                        stateManager.setSelectedRowKeys((prevKeys) =>
                                          prevKeys.filter((id) => !availableRowIdSet.has(id))
                                        );
                                      };
                                      return (
                                        <>
                                          <BudgetToolbar
                                            selectedRowKeys={stateManager.selectedRowKeys}
                                            handleDuplicateSelected={eventHandlers.handleDuplicateSelected}
                                            openDeleteModal={eventHandlers.openDeleteModal}
                                            openCreateModal={eventHandlers.openCreateModal}
                                            openSpellbookModal={() => {
                                              setSpellbookContext({ entryPoint: "budget", initialTab: "budget" });
                                              stateManager.setSpellbookModalOpen(true);
                                            }}
                                            canCreateLineItems={hasBudgetHeader}
                                            createDisabledReason={createDisabledReason}
                                            canUseSpellbook={canEdit}
                                            spellbookDisabledReason={canEdit ? undefined : "Read-only"}
                                            readinessBadge={
                                              riskAndReadiness.readyToInvoiceIds.length
                                                ? {
                                                    label: "Ready to invoice",
                                                    count: riskAndReadiness.readyToInvoiceIds.length,
                                                    onClick: () =>
                                                      openWorkPanelForLine(
                                                        riskAndReadiness.readyToInvoiceIds[0],
                                                        "invoice",
                                                      ),
                                                  }
                                                : undefined
                                            }
                                            filterQuery={stateManager.filterQuery as string}
                                            onFilterQueryChange={
                                              stateManager.setFilterQuery as (query: string) => void
                                            }
                                            sortField={stateManager.sortField as string | null}
                                            sortOrder={
                                              stateManager.sortOrder as "ascend" | "descend" | null
                                            }
                                            onSortChange={(field, order) => {
                                              stateManager.setSortField(field);
                                              stateManager.setSortOrder(order);
                                            }}
                                            groupBy={
                                              stateManager.groupBy as
                                                | "none"
                                                | "areaGroup"
                                                | "invoiceGroup"
                                                | "category"
                                            }
                                            onGroupChange={(group) => stateManager.setGroupBy(group)}
                                            isSelectAllChecked={isSelectAllChecked}
                                            onSelectAllChange={handleSelectAllChange}
                                            selectionCount={
                                              stateManager.isSelectMode ? selectedInScope.length : 0
                                            }
                                            totalCount={availableRowIds.length}
                                            onClearSelection={handleClearSelection}
                                            isSelectMode={stateManager.isSelectMode}
                                            onToggleSelectMode={(next) =>
                                              stateManager.setIsSelectMode(next)
                                            }
                                            currentPage={stateManager.currentPage}
                                            pageSize={stateManager.pageSize}
                                            onPaginationChange={(page, size) => {
                                              stateManager.setCurrentPage(page);
                                              if (size !== stateManager.pageSize) {
                                                stateManager.setPageSize(size);
                                              }
                                            }}
                                          />
                                          <BudgetItemsTable
                                            dataSource={groupedData}
                                            selectedRowKeys={stateManager.selectedRowKeys}
                                            setSelectedRowKeys={stateManager.setSelectedRowKeys}
                                            lockedLines={stateManager.lockedLines}
                                            openEditModal={eventHandlers.openEditModal}
                                            openDuplicateModal={eventHandlers.openDuplicateModal}
                                            openDeleteModal={eventHandlers.openDeleteModal}
                                            openWorkModal={handleOpenWorkPanel}
                                            tasks={projectTasks}
                                            workCountByLineItemId={workCountByLineItemId}
                                            workCoverageByLineItemId={buildCoverageMap}
                                            onCreateMissingWorkStage={handleCreateMissingWorkStage}
                                            onUnlinkWorkTask={handleUnlinkWorkTask}
                                            tableRef={tableRef}
                                            tableHeight={tableHeight}
                                            pageSize={stateManager.pageSize}
                                            currentPage={stateManager.currentPage}
                                            setCurrentPage={stateManager.setCurrentPage}
                                            isSelectMode={stateManager.isSelectMode}
                                          />
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <BudgetFileModal
                              isOpen={stateManager.isBudgetModalOpen}
                              onRequestClose={() => stateManager.setBudgetModalOpen(false)}
                              onFileSelected={parseFile}
                            />
                            <RevisionModal
                              isOpen={stateManager.isRevisionModalOpen}
                              onRequestClose={() => stateManager.setRevisionModalOpen(false)}
                              revisions={revisions}
                              activeRevision={Number((budgetHeader as Record<string, unknown>)?.revision ?? 1)}
                              onSwitch={handleSwitchRevision}
                              onDuplicate={(rev) => handleNewRevision(true, rev)}
                              onCreateNew={() => handleNewRevision(false)}
                              onDelete={(rev) => handleDeleteRevision(rev.revision)}
                              onSetClient={(rev) => handleSetClientRevision(rev)}
                              onRename={handleRenameRevision}
                              onRevisionNoteChange={handleRevisionNoteChange}
                              onInvoiceSaved={handleRevisionInvoiceSaved}
                              isAdmin={canEdit}
                              activeProject={activeProject}
                            />
                            <BudgetSpellbookModal
                              isOpen={stateManager.isSpellbookModalOpen}
                              onRequestClose={() => stateManager.setSpellbookModalOpen(false)}
                              revisionLabel={`REV.${Number((budgetHeader as Record<string, unknown>)?.revision ?? 1)}`}
                              canApply={canEdit}
                              applyDisabledReason={canEdit ? undefined : "Read-only"}
                              entryPoint={spellbookContext.entryPoint}
                              initialTab={spellbookContext.initialTab}
                              initialOutputs={spellbookContext.initialOutputs}
                              onApply={(request) => handleApplyBudgetSpellbook(request, stateManager as any)}
                            />
                            <CreateLineItemModal
                              isOpen={stateManager.isCreateModalOpen}
                              onRequestClose={eventHandlers.closeCreateModal}
                              onSubmit={(d, isAutoSave) =>
                                stateManager.editItem
                                  ? eventHandlers.handleEditLineItem(d, isAutoSave)
                                  : eventHandlers.handleCreateLineItem(d, isAutoSave)
                              }
                              defaultElementKey={stateManager.nextElementKey}
                              budgetItems={budgetItems}
                              areaGroupOptions={areaGroups}
                              invoiceGroupOptions={invoiceGroups}
                              clientOptions={clients}
                              defaultStartDate={String((budgetHeader as Record<string, unknown>)?.startDate || '')}
                              defaultEndDate={String((budgetHeader as Record<string, unknown>)?.endDate || '')}
                              initialData={stateManager.prefillItem || stateManager.editItem}
                              title={stateManager.editItem ? 'Edit Item' : 'Create Line Item'}
                              revision={Number((budgetHeader as Record<string, unknown>)?.revision ?? 1)}
                            />
                            <BudgetWorkPanelModal
                              isOpen={Boolean(workPanelItem)}
                              onRequestClose={() => setWorkPanelItem(null)}
                              projectId={activeProject?.projectId || ""}
                              lineItem={workPanelItem}
                              tasks={projectTasks}
                              onTasksChange={setProjectTasks}
                              initialFocusGroup={workPanelInitialFocusGroup}
                            />
                            <ConfirmModal
                              isOpen={stateManager.isConfirmingDelete}
                              onRequestClose={() => stateManager.setIsConfirmingDelete(false)}
                              onConfirm={eventHandlers.confirmDelete}
                              message="Delete selected line item(s)?"
                              className={{
                                base: styles.modalContent,
                                afterOpen: styles.modalContentAfterOpen,
                                beforeClose: styles.modalContentBeforeClose,
                              }}
                              overlayClassName={{
                                base: styles.modalOverlay,
                                afterOpen: styles.modalOverlayAfterOpen,
                                beforeClose: styles.modalOverlayBeforeClose,
                              }}
                            />
                          </>
                        )}
                      </BudgetTableLogic>
                      )}
                    </BudgetEventManager>
                  );
                }}
              </BudgetStateManager>
            </div>
          </motion.div>
        </AnimatePresence>
      </ProjectPageLayout>
    </>
  );
};

// Main component that provides the budget context
const BudgetPage = () => {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <BudgetProvider projectId={projectId}>
      <BudgetPageContent />
    </BudgetProvider>
  );
};

export default BudgetPage;









