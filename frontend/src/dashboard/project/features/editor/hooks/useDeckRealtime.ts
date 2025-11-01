import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useSocket } from "@/app/contexts/useSocket";
import { notify } from "@/shared/ui/ToastNotifications";
import {
  DeckPageRecord,
  DeckExportResponse,
  listDeckPages,
  upsertDeckPage,
  deleteDeckPage,
  exportDeckPage,
} from "../api/deckPages";

export interface UseDeckRealtimeOptions {
  projectId?: string;
}

export interface UseDeckRealtimeResult {
  pages: DeckPageRecord[];
  activePageId: string | null;
  setActivePageId: (pageId: string | null) => void;
  loading: boolean;
  error: Error | null;
  createPage: (name?: string) => Promise<DeckPageRecord | null>;
  duplicatePage: (pageId: string) => Promise<DeckPageRecord | null>;
  removePage: (pageId: string) => Promise<void>;
  renamePage: (pageId: string, name: string) => Promise<void>;
  syncCanvas: (pageId: string, canvasJson: string) => void;
  exportPage: (pageId: string) => Promise<DeckExportResponse | null>;
  refresh: () => Promise<void>;
}

const DEFAULT_CANVAS = "";

export function useDeckRealtime({ projectId }: UseDeckRealtimeOptions): UseDeckRealtimeResult {
  const { ws } = useSocket();
  const [pages, setPages] = useState<DeckPageRecord[]>([]);
  const [activePageId, setActivePageIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const projectIdRef = useRef<string | undefined>(projectId);
  const pagesMapRef = useRef<Map<string, DeckPageRecord>>(new Map());

  const applyPages = useCallback((next: DeckPageRecord[]) => {
    const sorted = [...next].sort((a, b) => a.name.localeCompare(b.name));
    pagesMapRef.current = new Map(sorted.map((page) => [page.pageId, page]));
    setPages(sorted);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listDeckPages(projectId);
      if (!items.length) {
        const created = await upsertDeckPage(projectId, uuid(), {
          name: "Page 1",
          canvasJson: DEFAULT_CANVAS,
        });
        applyPages([created]);
        setActivePageIdState(created.pageId);
      } else {
        applyPages(items);
        if (!activePageId || !items.some((item) => item.pageId === activePageId)) {
          setActivePageIdState(items[0].pageId);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      notify("error", `Failed to load deck pages: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, applyPages, activePageId]);

  useEffect(() => {
    if (projectId === projectIdRef.current) return;
    projectIdRef.current = projectId;
    applyPages([]);
    setActivePageIdState(null);
  }, [projectId, applyPages]);

  useEffect(() => {
    if (!projectId) return;
    void refresh();
  }, [projectId, refresh]);

  useEffect(() => {
    if (!ws || !projectId) return;

    const handleMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.action !== "deckSyncUpdate" || detail.projectId !== projectId) return;
      const incoming: DeckPageRecord = {
        projectId: detail.projectId,
        pageId: detail.pageId,
        name: detail.name || "Untitled page",
        canvasJson: typeof detail.canvasJson === "string" ? detail.canvasJson : JSON.stringify(detail.canvasJson ?? {}),
        revision: Number(detail.revision) || 0,
        updatedAt: detail.updatedAt ?? null,
        updatedBy: detail.updatedBy ?? null,
        createdAt: detail.createdAt ?? null,
      };

      const map = new Map(pagesMapRef.current);
      map.set(incoming.pageId, incoming);
      applyPages(Array.from(map.values()));
    };

    window.addEventListener("ws-message", handleMessage as EventListener);
    return () => window.removeEventListener("ws-message", handleMessage as EventListener);
  }, [ws, projectId, applyPages]);

  const setActivePageId = useCallback((pageId: string | null) => {
    setActivePageIdState(pageId);
    if (!ws || !projectId) return;
    const payload = {
      action: "setActiveDeck",
      projectId,
      pageId,
    };
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to update deck context", err);
    }
  }, [ws, projectId]);

  useEffect(() => {
    if (!ws || !projectId || !activePageId) return;
    const payload = {
      action: "setActiveDeck",
      projectId,
      pageId: activePageId,
    };
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to register deck context", err);
    }
  }, [ws, projectId, activePageId]);

  const createPage = useCallback(
    async (name = "Untitled page") => {
      if (!projectId) return null;
      try {
        const page = await upsertDeckPage(projectId, uuid(), {
          name,
          canvasJson: DEFAULT_CANVAS,
        });
        applyPages([...pagesMapRef.current.values(), page]);
        setActivePageIdState(page.pageId);
        return page;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify("error", `Unable to create page: ${error.message}`);
        return null;
      }
    },
    [projectId, applyPages]
  );

  const duplicatePage = useCallback(
    async (pageId: string) => {
      if (!projectId) return null;
      const original = pagesMapRef.current.get(pageId);
      if (!original) return null;
      try {
        const page = await upsertDeckPage(projectId, uuid(), {
          name: `${original.name} Copy`,
          canvasJson: original.canvasJson,
        });
        applyPages([...pagesMapRef.current.values(), page]);
        setActivePageIdState(page.pageId);
        return page;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify("error", `Unable to duplicate page: ${error.message}`);
        return null;
      }
    },
    [projectId, applyPages]
  );

  const removePage = useCallback(
    async (pageId: string) => {
      if (!projectId) return;
      try {
        await deleteDeckPage(projectId, pageId);
        const next = [...pagesMapRef.current.values()].filter((page) => page.pageId !== pageId);
        applyPages(next);
        if (activePageId === pageId) {
          setActivePageIdState(next[0]?.pageId ?? null);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify("error", `Unable to delete page: ${error.message}`);
      }
    },
    [projectId, applyPages, activePageId]
  );

  const renamePage = useCallback(
    async (pageId: string, name: string) => {
      if (!projectId) return;
      try {
        const updated = await upsertDeckPage(projectId, pageId, {
          name: name.trim() || "Untitled page",
        });
        applyPages(
          [...pagesMapRef.current.values()].map((page) =>
            page.pageId === pageId ? updated : page
          )
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify("error", `Unable to rename page: ${error.message}`);
      }
    },
    [projectId, applyPages]
  );

  const syncCanvas = useCallback(
    (pageId: string, canvasJson: string) => {
      if (!projectId) return;
      const current = pagesMapRef.current.get(pageId);
      applyPages(
        [...pagesMapRef.current.values()].map((page) =>
          page.pageId === pageId ? { ...page, canvasJson } : page
        )
      );
      const payload = {
        action: "deckSync",
        projectId,
        pageId,
        canvasJson,
        revision: current?.revision ?? 0,
        name: current?.name,
      };
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
        } else {
          void upsertDeckPage(projectId, pageId, {
            canvasJson,
            revision: current?.revision ?? 0,
            name: current?.name,
          });
        }
      } catch (err) {
        console.error("Failed to sync canvas", err);
      }
    },
    [projectId, applyPages, ws]
  );

  const exportPage = useCallback(
    async (pageId: string) => {
      if (!projectId) return null;
      try {
        return await exportDeckPage(projectId, pageId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify("error", `Unable to export page: ${error.message}`);
        return null;
      }
    },
    [projectId]
  );

  return {
    pages,
    activePageId,
    setActivePageId,
    loading,
    error,
    createPage,
    duplicatePage,
    removePage,
    renamePage,
    syncCanvas,
    exportPage,
    refresh,
  };
}
