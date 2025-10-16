import React, { PropsWithChildren, useEffect, useMemo, useRef, useCallback, useState } from "react";
import useBudgetData from "@/dashboard/project/features/budget/context/useBudget";
import { useSocket } from "@/app/contexts/useSocket";
import { useData } from "@/app/contexts/useData";
import { normalizeMessage } from "@/shared/utils/websocketUtils";
import { fetchBudgetHeader, fetchBudgetItems } from "@/shared/utils/api";
import { BudgetContext } from "./BudgetContext";
import type { BudgetStats, PieDataItem, BudgetWebSocketOperations } from "./types";

const REVISION_STORAGE_PREFIX = "budget:workingRevision";

const normalizeRevision = (value: number | string | null | undefined): number | null => {
  if (value === undefined || value === null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

interface ProviderProps extends PropsWithChildren {
  projectId?: string;
}

export const BudgetProvider: React.FC<ProviderProps> = ({ projectId, children }) => {
  const [preferredRevision, setPreferredRevision] = useState<number | null>(null);
  const { ws } = useSocket();
  const { user, userId } = useData();
  const { budgetHeader, budgetItems, setBudgetHeader, setBudgetItems, refresh, loading } =
    useBudgetData(projectId, preferredRevision);
  
  const [clientBudgetHeader, setClientBudgetHeader] = useState<Record<string, unknown> | null>(null);
  const [clientBudgetItems, setClientBudgetItems] = useState<Record<string, unknown>[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const clientFetchIdRef = useRef(0);
  const clientRevisionRef = useRef<number | null>(null);

  const refreshRef = useRef(refresh);
  const lockedLinesRef = useRef<string[]>([]);
  const revisionReadyRef = useRef(false);
  const lastStoredRevisionRef = useRef<number | null>(null);
  const lastRevisionSentRef = useRef<number | null>(null);
  const lastRevisionProjectRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!projectId || !userId || typeof window === "undefined") {
      revisionReadyRef.current = true;
      setPreferredRevision(null);
      lastStoredRevisionRef.current = null;
      return;
    }

    revisionReadyRef.current = false;
    const storageKey = `${REVISION_STORAGE_PREFIX}:${userId}:${projectId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw != null ? Number(raw) : null;
      const normalized = Number.isFinite(parsed) ? parsed : null;
      setPreferredRevision((prev) => (prev === normalized ? prev : normalized));
      lastStoredRevisionRef.current = normalized;
    } catch (err) {
      console.error("Failed to read stored revision preference", err);
    } finally {
      revisionReadyRef.current = true;
    }
  }, [projectId, userId]);

  useEffect(() => {
    if (!revisionReadyRef.current || !projectId || !userId || typeof window === "undefined") {
      return;
    }
    const revision = normalizeRevision(budgetHeader?.revision as number | string | null | undefined);
    if (revision === null) return;
    if (lastStoredRevisionRef.current === revision) return;

    const storageKey = `${REVISION_STORAGE_PREFIX}:${userId}:${projectId}`;
    try {
      window.localStorage.setItem(storageKey, String(revision));
      lastStoredRevisionRef.current = revision;
    } catch (err) {
      console.error("Failed to persist revision preference", err);
    }
    setPreferredRevision((prev) => (prev === revision ? prev : revision));
  }, [budgetHeader?.revision, projectId, userId]);

  useEffect(() => {
    lastRevisionSentRef.current = null;
    lastRevisionProjectRef.current = undefined;
  }, [projectId]);

  const sendActiveRevision = useCallback(
    (revision: number | null) => {
      if (!ws || !projectId) return;
      const normalized = normalizeRevision(revision);
      if (normalized === null) return;

      const alreadySentForProject =
        lastRevisionProjectRef.current === projectId && lastRevisionSentRef.current === normalized;

      const payload = JSON.stringify({
        action: "setActiveRevision",
        projectId,
        conversationId: `project#${projectId}`,
        revision: normalized,
      });

      if (ws.readyState === WebSocket.OPEN) {
        if (alreadySentForProject) return;
        ws.send(payload);
        lastRevisionSentRef.current = normalized;
        lastRevisionProjectRef.current = projectId;
      } else {
        const handleOpen = () => {
          ws.send(payload);
          lastRevisionSentRef.current = normalized;
          lastRevisionProjectRef.current = projectId;
          ws.removeEventListener("open", handleOpen);
        };
        ws.addEventListener("open", handleOpen);
      }
    },
    [ws, projectId],
  );

  useEffect(() => {
    const revision = normalizeRevision(budgetHeader?.revision as number | string | null | undefined);
    if (revision === null) return;
    sendActiveRevision(revision);
  }, [budgetHeader?.revision, sendActiveRevision]);

  useEffect(() => {
    if (!projectId) {
      clientRevisionRef.current = null;
      setClientBudgetHeader(null);
      setClientBudgetItems([]);
      setClientLoading(false);
      return;
    }

    if (!budgetHeader) {
      clientRevisionRef.current = null;
      setClientBudgetHeader(null);
      setClientBudgetItems([]);
      setClientLoading(loading);
      return;
    }

    const clientRevision = normalizeRevision(
      (budgetHeader as { clientRevisionId?: number | string | null })?.clientRevisionId
    );
    const workingRevision = normalizeRevision(
      (budgetHeader as { revision?: number | string | null })?.revision
    );

    if (clientRevision === null || clientRevision === workingRevision) {
      clientRevisionRef.current = workingRevision;
      setClientBudgetHeader(budgetHeader);
      setClientBudgetItems(budgetItems);
      setClientLoading(false);
      return;
    }

    if (clientRevisionRef.current === clientRevision) {
      setClientLoading(false);
      return;
    }

    const fetchId = ++clientFetchIdRef.current;
    setClientLoading(true);

    (async () => {
      try {
        const header = await fetchBudgetHeader(projectId, clientRevision);
        if (!header) {
          throw new Error("Client revision header not found");
        }
        const headerRevision = normalizeRevision(
          (header as { revision?: number | string | null })?.revision
        );
        const budgetId = (header as { budgetId?: string | number | null })?.budgetId;
        let items: Record<string, unknown>[] = [];
        if (budgetId) {
          items = (await fetchBudgetItems(
            String(budgetId),
            headerRevision ?? undefined
          )) as unknown as Record<string, unknown>[];
        }

        if (clientFetchIdRef.current !== fetchId) return;
        clientRevisionRef.current = headerRevision;
        setClientBudgetHeader(header as Record<string, unknown>);
        setClientBudgetItems(items);
        setClientLoading(false);
      } catch (err) {
        if (clientFetchIdRef.current === fetchId) {
          console.error("Failed to load client revision data", err);
          clientRevisionRef.current = null;
          setClientBudgetHeader(null);
          setClientBudgetItems([]);
          setClientLoading(false);
        }
      }
    })();
  }, [projectId, budgetHeader, budgetItems, loading]);

  // WebSocket operations - centralized here
  const emitBudgetUpdate = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !projectId || !budgetHeader) return;
    ws.send(
      JSON.stringify({
        action: 'budgetUpdated',
        projectId,
        title: budgetHeader.projectTitle || 'Budget Updated',
        revision: budgetHeader.revision,
        total: budgetHeader.headerFinalTotalCost,
        conversationId: `project#${projectId}`,
        username: user?.firstName || 'Someone',
        senderId: userId,
      })
    );
  }, [ws, projectId, budgetHeader, user, userId]);

  const emitClientRevisionUpdate = useCallback((clientRevisionId: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !projectId) return;
    ws.send(
      JSON.stringify({
        action: "clientRevisionUpdated",
        projectId,
        clientRevisionId,
        conversationId: `project#${projectId}`,
        username: user?.firstName || "Someone",
        senderId: userId,
      }),
    );
  }, [ws, projectId, user, userId]);

  const emitLineLock = useCallback((lineId: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !projectId || !budgetHeader) return;
    ws.send(
      JSON.stringify({
        action: 'lineLocked',
        projectId,
        lineId,
        revision: budgetHeader.revision,
        conversationId: `project#${projectId}`,
        username: user?.firstName || 'Someone',
        senderId: userId,
      })
    );
  }, [ws, projectId, budgetHeader, user, userId]);

  const emitLineUnlock = useCallback((lineId: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !projectId || !budgetHeader) return;
    ws.send(
      JSON.stringify({
        action: 'lineUnlocked',
        projectId,
        lineId,
        revision: budgetHeader.revision,
        conversationId: `project#${projectId}`,
        username: user?.firstName || 'Someone',
        senderId: userId,
      })
    );
  }, [ws, projectId, budgetHeader, user, userId]);

  const emitTimelineUpdate = useCallback((events: unknown[]) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !projectId) return;
    ws.send(
      JSON.stringify(
        normalizeMessage(
          {
            action: 'timelineUpdated',
            projectId,
            title: budgetHeader?.projectTitle || 'Timeline Updated',
            events,
            conversationId: `project#${projectId}`,
            username: user?.firstName || 'Someone',
            senderId: userId,
          },
          'timelineUpdated'
        )
      )
    );
  }, [ws, projectId, budgetHeader, user, userId]);

  // Memoized selectors with deep equality
  const buildStats = useCallback(
    (header: Record<string, unknown> | null, items: Record<string, unknown>[]): BudgetStats => {
      if (!header) {
        return {
          ballpark: 0,
          budgetedCost: 0,
          actualCost: 0,
          finalCost: 0,
          effectiveMarkup: 0,
        };
      }

      const hasFinalCost = items.some(
        (item) =>
          (item as { itemFinalCost?: unknown }).itemFinalCost !== undefined &&
          (item as { itemFinalCost?: unknown }).itemFinalCost !== null
      );

      const toNumber = (value: unknown) => Number(value ?? 0);
      const headerData = header as {
        headerBallPark?: unknown;
        headerBudgetedTotalCost?: unknown;
        headerActualTotalCost?: unknown;
        headerFinalTotalCost?: unknown;
        headerEffectiveMarkup?: unknown;
      };

      return {
        ballpark: hasFinalCost
          ? toNumber(headerData.headerFinalTotalCost)
          : toNumber(headerData.headerBallPark),
        budgetedCost: toNumber(headerData.headerBudgetedTotalCost),
        actualCost: toNumber(headerData.headerActualTotalCost),
        finalCost: toNumber(headerData.headerFinalTotalCost),
        effectiveMarkup: Number(headerData.headerEffectiveMarkup ?? 0),
      };
    },
    []
  );

  const buildPie = useCallback(
    (
      header: Record<string, unknown> | null,
      items: Record<string, unknown>[],
      groupBy: string = "invoiceGroup"
    ): PieDataItem[] => {
      if (!header) return [];

      const stats = buildStats(header, items);

      if (groupBy === "none") {
        return [
          { name: "Ballpark", value: stats.ballpark },
          { name: "Budgeted Cost", value: stats.budgetedCost },
          { name: "Actual Cost", value: stats.actualCost },
          { name: "Effective Markup", value: stats.effectiveMarkup * 100 },
          { name: "Final Cost", value: stats.finalCost },
        ].filter((item) => item.value > 0);
      }

      const hasFinalCost = items.some(
        (item) =>
          (item as { itemFinalCost?: unknown }).itemFinalCost !== undefined &&
          (item as { itemFinalCost?: unknown }).itemFinalCost !== null
      );

      if (!hasFinalCost) {
        return [{ name: "Ballpark", value: stats.ballpark }];
      }

      const totals: Record<string, number> = {};
      for (const item of items) {
        const rawKey = (item as Record<string, unknown>)[groupBy];
        const key =
          rawKey && String(rawKey).trim() !== "" ? String(rawKey) : "Unspecified";
        const val = Number((item as { itemFinalCost?: unknown }).itemFinalCost ?? 0) || 0;
        totals[key] = (totals[key] ?? 0) + val;
      }

      const entries = Object.entries(totals);
      if (entries.length === 1 && entries[0][0] === "Unspecified") {
        return [{ name: "Final Cost", value: entries[0][1] }];
      }

      return entries
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
    [buildStats]
  );

  const getStats = useCallback(
    (): BudgetStats => buildStats(budgetHeader as Record<string, unknown> | null, budgetItems),
    [buildStats, budgetHeader, budgetItems]
  );

  const getClientStats = useCallback((): BudgetStats => {
    if (clientBudgetHeader) {
      return buildStats(clientBudgetHeader, clientBudgetItems);
    }
    return buildStats(budgetHeader as Record<string, unknown> | null, budgetItems);
  }, [buildStats, clientBudgetHeader, clientBudgetItems, budgetHeader, budgetItems]);

  const getPie = useCallback(
    (groupBy: string = "invoiceGroup"): PieDataItem[] =>
      buildPie(budgetHeader as Record<string, unknown> | null, budgetItems, groupBy),
    [buildPie, budgetHeader, budgetItems]
  );

  const getClientPie = useCallback(
    (groupBy: string = "invoiceGroup"): PieDataItem[] => {
      if (clientBudgetHeader) {
        return buildPie(clientBudgetHeader, clientBudgetItems, groupBy);
      }
      return buildPie(budgetHeader as Record<string, unknown> | null, budgetItems, groupBy);
    },
    [buildPie, clientBudgetHeader, clientBudgetItems, budgetHeader, budgetItems]
  );

  const getRows = useCallback((): Record<string, unknown>[] => {
    return budgetItems as unknown as Record<string, unknown>[];
  }, [budgetItems]);

  const getLocks = useCallback((): string[] => {
    return lockedLinesRef.current;
  }, []);

  // WebSocket operations object
  const wsOps = useMemo((): BudgetWebSocketOperations => ({
    emitBudgetUpdate,
    emitLineLock,
    emitLineUnlock,
    emitTimelineUpdate,
    emitClientRevisionUpdate,
  }), [emitBudgetUpdate, emitLineLock, emitLineUnlock, emitTimelineUpdate, emitClientRevisionUpdate]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
        return;
      }

      // Early return for non-budget messages to prevent unnecessary processing
      if (!data || typeof data !== "object" || !projectId) {
        return;
      }

      const messageData = data as Record<string, unknown>;
      
      // Gate messages: only process budget-related actions for the current project
      if (messageData.projectId !== projectId) {
        return;
      }
      
      // Handle budgetUpdated messages
      if (messageData.action === "budgetUpdated") {
        clientRevisionRef.current = null;
        refreshRef.current();
        return;
      }
      if (messageData.action === "clientRevisionUpdated") {
        clientRevisionRef.current = null;
        refreshRef.current();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("clientRevisionUpdated", { detail: messageData })
          );
        }
        return;
      }
      
      // Handle lineLocked messages - update internal state and dispatch window events
      if (messageData.action === "lineLocked" || messageData.action === "lockLineUpdated") {
        if (messageData.senderId !== userId) {
          const lineId = messageData.lineId as string;
          if (lineId) {
            lockedLinesRef.current = lockedLinesRef.current.includes(lineId) 
              ? lockedLinesRef.current 
              : [...lockedLinesRef.current, lineId];
          }
        }
        window.dispatchEvent(new CustomEvent("lineLocked", { detail: data }));
        return;
      }
      
      // Handle lineUnlocked messages - update internal state and dispatch window events  
      if (messageData.action === "lineUnlocked") {
        if (messageData.senderId !== userId) {
          const lineId = messageData.lineId as string;
          if (lineId) {
            lockedLinesRef.current = lockedLinesRef.current.filter(id => id !== lineId);
          }
        }
        window.dispatchEvent(new CustomEvent("lineUnlocked", { detail: data }));
        return;
      }
    };

    ws.addEventListener("message", handleMessage);
    
    const handleWindow = (e: Event) => {
      const detail = (e as CustomEvent).detail as { projectId?: string } | undefined;
      if (detail?.projectId === projectId) {
        refreshRef.current();
      }
    };
    
    window.addEventListener("budgetUpdated", handleWindow as EventListener);
    return () => {
      ws.removeEventListener("message", handleMessage);
      window.removeEventListener("budgetUpdated", handleWindow as EventListener);
    };
  }, [ws, projectId, userId]);

  const value = useMemo(
    () => ({ 
      budgetHeader,
      budgetItems,
      setBudgetHeader,
      setBudgetItems,
      refresh,
      loading,
      clientBudgetHeader,
      clientBudgetItems,
      clientLoading,
      getStats,
      getPie,
      getClientStats,
      getClientPie,
      getRows,
      getLocks,
      wsOps,
    }),
    [
      budgetHeader,
      budgetItems,
      setBudgetHeader,
      setBudgetItems,
      refresh,
      loading,
      clientBudgetHeader,
      clientBudgetItems,
      clientLoading,
      getStats,
      getPie,
      getClientStats,
      getClientPie,
      getRows,
      getLocks,
      wsOps,
    ]
  );

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
};

export default BudgetProvider;












