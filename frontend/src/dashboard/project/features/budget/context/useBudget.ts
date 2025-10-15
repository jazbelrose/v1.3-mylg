import { useState, useEffect, useCallback, useRef } from "react";
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

const budgetCache = new Map<string, BudgetData>();
const inflight = new Map<string, Promise<BudgetData>>();

const makeCacheKey = (projectId: string, revision: number | null | undefined) =>
  `${projectId}::${revision != null ? String(revision) : "client"}`;

const normalizeRevision = (value: number | string | null | undefined): number | null => {
  if (value === undefined || value === null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

async function fetchData(
  projectId: string,
  preferredRevision: number | null,
  force = false,
): Promise<BudgetData> {
  const requestKey = makeCacheKey(projectId, preferredRevision);

  if (!force && budgetCache.has(requestKey)) {
    return budgetCache.get(requestKey)!;
  }

  if (inflight.has(requestKey)) {
    return inflight.get(requestKey)!;
  }

  const promise = (async () => {
    const header = await fetchBudgetHeader(projectId, preferredRevision ?? undefined);
    const effectiveRevision = normalizeRevision(
      (header?.revision as number | string | null | undefined) ?? preferredRevision,
    );

    let items: BudgetItem[] = [];
    if (header?.budgetId) {
      const revisionForItems = effectiveRevision ?? null;
      items = await fetchBudgetItems(
        header.budgetId,
        revisionForItems !== null ? revisionForItems : undefined,
      );
    }

    const result: BudgetData = { header, items };
    const effectiveKey = makeCacheKey(projectId, effectiveRevision);
    budgetCache.set(effectiveKey, result);
    if (effectiveKey !== requestKey) {
      budgetCache.set(requestKey, result);
    }
    return result;
  })();

  inflight.set(requestKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(requestKey);
  }
}

export async function prefetchBudgetData(
  projectId: string,
  preferredRevision?: number | null,
): Promise<void> {
  if (!projectId) return;
  const normalized = normalizeRevision(preferredRevision);
  try {
    await fetchData(projectId, normalized, false);
  } catch (err) {
    console.error("Error prefetching budget data", err);
  }
}

export default function useBudgetData(
  projectId: string | undefined,
  preferredRevision?: number | null,
) {
  const normalizedPreferred = normalizeRevision(preferredRevision);
  const cacheKey = projectId ? makeCacheKey(projectId, normalizedPreferred) : null;
  const cached = cacheKey ? budgetCache.get(cacheKey) : null;

  const [budgetHeader, setBudgetHeader] = useState<BudgetHeader | null>(
    cached ? cached.header : null,
  );
  const [budgetItems, setBudgetItemsState] = useState<BudgetItem[]>(
    cached ? cached.items : [],
  );
  const [loading, setLoading] = useState(!cached);

  const headerRef = useRef<BudgetHeader | null>(cached ? cached.header : null);
  const itemsRef = useRef<BudgetItem[]>(cached ? cached.items : []);
  const currentKeyRef = useRef<string | null>(cacheKey);

  useEffect(() => {
    headerRef.current = budgetHeader;
  }, [budgetHeader]);

  useEffect(() => {
    itemsRef.current = budgetItems;
  }, [budgetItems]);

  useEffect(() => {
    currentKeyRef.current = cacheKey;
  }, [cacheKey]);

  const commitToCache = useCallback(
    (headerValue: BudgetHeader | null, itemsValue: BudgetItem[]) => {
      if (!projectId) return;
      const revisionHint = normalizeRevision(
        (headerValue?.revision as number | string | null | undefined) ?? normalizedPreferred,
      );
      const primaryKey = makeCacheKey(projectId, revisionHint);
      const data: BudgetData = { header: headerValue, items: itemsValue };

      budgetCache.set(primaryKey, data);
      currentKeyRef.current = primaryKey;

      const requestKey = makeCacheKey(projectId, normalizedPreferred);
      if (requestKey !== primaryKey) {
        budgetCache.set(requestKey, data);
      }
    },
    [projectId, normalizedPreferred],
  );

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      if (!projectId) {
        currentKeyRef.current = null;
        setBudgetHeader(null);
        setBudgetItemsState([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchData(projectId, normalizedPreferred, false);
        if (ignore) return;

        commitToCache(data.header, data.items);

        setBudgetHeader((prev) =>
          shallowEqualObjects(prev, data.header) ? prev : data.header,
        );
        setBudgetItemsState((prev) =>
          shallowEqualArrays(prev, data.items) ? prev : data.items,
        );
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
  }, [projectId, normalizedPreferred, commitToCache]);

  const refresh = useCallback(async () => {
    if (!projectId) return null;
    setLoading(true);
    try {
      const data = await fetchData(projectId, normalizedPreferred, true);
      commitToCache(data.header, data.items);
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
  }, [projectId, normalizedPreferred, commitToCache]);

  const setBudgetItems = useCallback(
    (items: BudgetItem[]) => {
      if (!projectId) return;
      itemsRef.current = items;
      setBudgetItemsState((prev) =>
        shallowEqualArrays(prev, items) ? prev : items,
      );
      commitToCache(headerRef.current, items);
    },
    [projectId, commitToCache],
  );

  const updateBudgetHeader = useCallback(
    (
      headerOrUpdater:
        | BudgetHeader
        | ((prev: BudgetHeader | null) => BudgetHeader | null)
        | null,
    ) => {
      if (!projectId) return;
      setBudgetHeader((prev) => {
        const next =
          typeof headerOrUpdater === "function"
            ? (headerOrUpdater as (p: BudgetHeader | null) => BudgetHeader | null)(prev)
            : headerOrUpdater;

        if (shallowEqualObjects(prev, next)) return prev;
        headerRef.current = next;
        commitToCache(next, itemsRef.current);
        return next;
      });
    },
    [projectId, commitToCache],
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

