import { useState, useEffect, useCallback } from "react";
import { fetchBudgetHeader, fetchBudgetItems } from "@/shared/utils/api";

function shallowEqualObjects(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function shallowEqualArrays(a: unknown[], b: unknown[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

type BudgetHeader = Record<string, unknown>;
type BudgetItem = Record<string, unknown>;

interface BudgetData {
  header: BudgetHeader | null;
  items: BudgetItem[];
}

// In-memory cache and in-flight trackers keyed by projectId
const budgetCache = new Map<string, BudgetData>();
const inflight = new Map<string, Promise<BudgetData>>();

async function fetchData(projectId: string, force = false): Promise<BudgetData> {
  if (!projectId) return { header: null, items: [] };

  if (!force && budgetCache.has(projectId)) {
    return budgetCache.get(projectId)!;
  }

  if (inflight.has(projectId)) {
    return inflight.get(projectId)!;
  }

  const promise = (async () => {
    const maxAttempts = 3;
    let attempt = 0;
    let delay = 500;
    // Simple exponential backoff for 429 errors
    while (true) {
      try {
        const header = await fetchBudgetHeader(projectId);
        let items: BudgetItem[] = [];
        if (header?.budgetId) {
          items = await fetchBudgetItems(header.budgetId, header.revision);
        }
        const result: BudgetData = { header, items };
        budgetCache.set(projectId, result);
        return result;
      } catch (err: unknown) {
        const msg = String((err as { message?: string })?.message || "");
        if (msg.includes("429") && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt += 1;
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
  })();

  inflight.set(projectId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(projectId);
  }
}

/**
 * Pre-load budget data for a project into the cache without updating any
 * component state. This allows subsequent calls to the hook to render
 * immediately with cached data.
 */
export async function prefetchBudgetData(projectId: string): Promise<void> {
  if (!projectId || budgetCache.has(projectId)) return;
  try {
    await fetchData(projectId);
  } catch (err) {
    console.error("Error prefetching budget data", err);
  }
}

export default function useBudgetData(projectId: string | undefined) {
  const cached = projectId ? budgetCache.get(projectId) : null;
  const [budgetHeader, setBudgetHeader] = useState<BudgetHeader | null>(
    cached ? cached.header : null,
  );
  const [budgetItems, setBudgetItemsState] = useState<BudgetItem[]>(
    cached ? cached.items : [],
  );
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!projectId) {
        setBudgetHeader(null);
        setBudgetItemsState([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { header, items } = await fetchData(projectId);
        if (!ignore) {
          setBudgetHeader((prev) =>
            shallowEqualObjects(prev, header) ? prev : header,
          );
          setBudgetItemsState((prev) =>
            shallowEqualArrays(prev, items) ? prev : items,
          );
        }
      } catch (err) {
        console.error("Error fetching budget data", err);
        if (!ignore) {
          setBudgetHeader(null);
          setBudgetItemsState([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return null;
    setLoading(true);
    try {
      const data = await fetchData(projectId, true);
      setBudgetHeader((prev) =>
        shallowEqualObjects(prev, data.header) ? prev : data.header,
      );
      setBudgetItemsState((prev) =>
        shallowEqualArrays(prev, data.items) ? prev : data.items,
      );
      return data;
    } catch (err) {
      console.error("Error refreshing budget data", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const setBudgetItems = useCallback(
    (items: BudgetItem[]) => {
      if (!projectId) return;
      setBudgetItemsState((prev) =>
        shallowEqualArrays(prev, items) ? prev : items,
      );
      const cached = budgetCache.get(projectId) || {
        header: null,
        items: [] as BudgetItem[],
      };
      budgetCache.set(projectId, { header: cached.header, items });
    },
    [projectId],
  );

  const updateBudgetHeader = useCallback(
    (headerOrUpdater: BudgetHeader | ((prev: BudgetHeader | null) => BudgetHeader)) => {
      if (!projectId) return;
      setBudgetHeader((prev) => {
        const next =
          typeof headerOrUpdater === "function"
            ? (headerOrUpdater as (p: BudgetHeader | null) => BudgetHeader)(prev)
            : headerOrUpdater;
        if (shallowEqualObjects(prev, next)) return prev;
        const cached = budgetCache.get(projectId) || {
          header: null,
          items: [] as BudgetItem[],
        };
        budgetCache.set(projectId, { header: next, items: cached.items });
        return next;
      });
    },
    [projectId],
  );

  return {
    budgetHeader,
    budgetItems,
    setBudgetHeader: updateBudgetHeader,
    setBudgetItems,
    refresh,
    loading,
  };
}










