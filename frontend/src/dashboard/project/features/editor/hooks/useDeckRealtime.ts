import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useSocket } from "@/app/contexts/useSocket";

export interface DeckPage {
  id: string;
  name: string;
  canvasJson: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
  position?: number;
}

export interface DeckState {
  version: number;
  pages: DeckPage[];
  updatedAt?: string;
}

export interface DeckExportStatus {
  action: "deck.export.ack" | "deck.export.ready";
  format: "pdf" | "site" | string;
  status: string;
  jobId?: string;
  requestId?: string;
  url?: string;
  timestamp: string;
}

export interface UseDeckRealtimeOptions {
  projectId?: string;
  userId?: string | null;
}

export interface UseDeckRealtimeResult {
  deck: DeckState;
  pages: DeckPage[];
  activePageId: string | null;
  selectPage: (pageId: string) => void;
  addPage: (options?: { name?: string; cloneFromId?: string }) => void;
  duplicatePage: (pageId: string) => void;
  movePage: (pageId: string, direction: "up" | "down") => void;
  renamePage: (pageId: string, name: string) => void;
  updatePageCanvas: (pageId: string, canvasJson: string) => void;
  requestExport: (format: "pdf" | "site", pageId?: string) => void;
  isReady: boolean;
  isSynced: boolean;
  lastSyncedAt: string | null;
  exportStatus: DeckExportStatus | null;
}

const toJsonString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn("Failed to stringify deck payload", error);
    return null;
  }
};

const sanitizeIncomingPage = (input: Partial<DeckPage>): DeckPage => {
  const id =
    typeof input.id === "string" && input.id.trim() ? input.id.trim() : `page-${uuid()}`;
  const name =
    typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Untitled";
  return {
    id,
    name,
    canvasJson: toJsonString(input.canvasJson) ?? null,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
    updatedBy:
      typeof input.updatedBy === "string"
        ? input.updatedBy
        : input.updatedBy === null
        ? null
        : undefined,
    position: typeof input.position === "number" ? input.position : undefined,
  };
};

const assignPositions = (pages: DeckPage[]): DeckPage[] =>
  pages.map((page, index) => ({ ...page, position: index }));

export const useDeckRealtime = (
  { projectId, userId }: UseDeckRealtimeOptions
): UseDeckRealtimeResult => {
  const { ws } = useSocket();
  const clientIdRef = useRef<string>(uuid());
  const deckRef = useRef<DeckState>({ version: 0, pages: [] });
  const [deck, setDeck] = useState<DeckState>(deckRef.current);
  const [activePageIdState, setActivePageIdState] = useState<string | null>(null);
  const activePageIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSynced, setIsSynced] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<DeckExportStatus | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());

  const ensureActivePage = useCallback((nextDeck: DeckState) => {
    const currentActive = activePageIdRef.current;
    if (currentActive && nextDeck.pages.some((page) => page.id === currentActive)) {
      return;
    }
    const fallback = nextDeck.pages[0]?.id ?? null;
    if (fallback !== currentActive) {
      activePageIdRef.current = fallback;
      setActivePageIdState(fallback);
    }
  }, []);

  const commitDeck = useCallback(
    (nextDeck: DeckState) => {
      const normalizedPages = assignPositions(nextDeck.pages ?? []);
      const normalized: DeckState = {
        version: typeof nextDeck.version === "number" ? nextDeck.version : Number(nextDeck.version) || 0,
        pages: normalizedPages,
        updatedAt: nextDeck.updatedAt,
      };
      deckRef.current = normalized;
      setDeck(normalized);
      ensureActivePage(normalized);
    },
    [ensureActivePage]
  );

  const registerPending = useCallback((requestId: string) => {
    pendingRef.current.add(requestId);
    setIsSynced(false);
  }, []);

  const resolvePending = useCallback(
    (requestId?: string, syncedAt?: string) => {
      if (requestId) {
        pendingRef.current.delete(requestId);
      }
      if (syncedAt) {
        setLastSyncedAt(syncedAt);
      }
      setIsSynced(pendingRef.current.size === 0);
    },
    []
  );

  const sendMessage = useCallback(
    (payload: Record<string, unknown>) => {
      if (!ws || !projectId) {
        return false;
      }
      const message = { ...payload, projectId, clientId: clientIdRef.current };
      const json = JSON.stringify(message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
        return true;
      }
      if (ws.readyState === WebSocket.CONNECTING) {
        const onOpen = () => {
          try {
            ws.send(json);
          } finally {
            ws.removeEventListener("open", onOpen);
          }
        };
        ws.addEventListener("open", onOpen);
        return true;
      }
      console.warn("WebSocket not connected; unable to send deck message");
      return false;
    },
    [projectId, ws]
  );

  const selectPage = useCallback((pageId: string) => {
    activePageIdRef.current = pageId;
    setActivePageIdState(pageId);
  }, []);

  const commitPagesChange = useCallback(
    (
      mutator: (pages: DeckPage[]) => DeckPage[] | null,
      after?: (pages: DeckPage[], deck: DeckState) => void
    ) => {
      const current = deckRef.current;
      const nextPages = mutator(current.pages);
      if (!nextPages) return;
      const normalizedPages = assignPositions(nextPages);
      const now = new Date().toISOString();
      const nextDeck: DeckState = {
        version: current.version + 1,
        pages: normalizedPages,
        updatedAt: now,
      };
      commitDeck(nextDeck);
      if (after) {
        after(normalizedPages, nextDeck);
      }
      const requestId = uuid();
      registerPending(requestId);
      const sent = sendMessage({
        action: "deck.meta",
        pages: normalizedPages,
        version: nextDeck.version,
        requestId,
      });
      if (!sent) {
        resolvePending(requestId);
      }
    },
    [commitDeck, registerPending, resolvePending, sendMessage]
  );

  const addPage = useCallback(
    (options?: { name?: string; cloneFromId?: string }) => {
      let createdId: string | null = null;
      commitPagesChange((pages) => {
        const now = new Date().toISOString();
        const clone = options?.cloneFromId ? pages.find((page) => page.id === options.cloneFromId) : undefined;
        const baseName = options?.name?.trim() || `Page ${pages.length + 1}`;
        const id = uuid();
        createdId = id;
        const newPage: DeckPage = {
          id,
          name: baseName,
          canvasJson: clone?.canvasJson ?? null,
          updatedAt: now,
          updatedBy: userId ?? clone?.updatedBy ?? null,
        };
        return [...pages, newPage];
      }, () => {
        if (createdId) {
          activePageIdRef.current = createdId;
          setActivePageIdState(createdId);
        }
      });
    },
    [commitPagesChange, userId]
  );

  const duplicatePage = useCallback(
    (pageId: string) => {
      let createdId: string | null = null;
      commitPagesChange((pages) => {
        const index = pages.findIndex((page) => page.id === pageId);
        if (index === -1) return pages;
        const cloneSource = pages[index];
        const now = new Date().toISOString();
        const id = uuid();
        createdId = id;
        const duplicate: DeckPage = {
          id,
          name: `${cloneSource.name} Copy`,
          canvasJson: cloneSource.canvasJson,
          updatedAt: now,
          updatedBy: userId ?? cloneSource.updatedBy ?? null,
        };
        const next = [...pages];
        next.splice(index + 1, 0, duplicate);
        return next;
      }, () => {
        if (createdId) {
          activePageIdRef.current = createdId;
          setActivePageIdState(createdId);
        }
      });
    },
    [commitPagesChange, userId]
  );

  const movePage = useCallback(
    (pageId: string, direction: "up" | "down") => {
      commitPagesChange((pages) => {
        const index = pages.findIndex((page) => page.id === pageId);
        if (index === -1) return pages;
        const targetIndex =
          direction === "up"
            ? Math.max(0, index - 1)
            : Math.min(pages.length - 1, index + 1);
        if (targetIndex === index) return pages;
        const reordered = [...pages];
        const [moved] = reordered.splice(index, 1);
        reordered.splice(targetIndex, 0, moved);
        return reordered;
      });
    },
    [commitPagesChange]
  );

  const renamePage = useCallback(
    (pageId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      commitPagesChange((pages) =>
        pages.map((page) => (page.id === pageId ? { ...page, name: trimmed } : page))
      );
    },
    [commitPagesChange]
  );

  const updatePageCanvas = useCallback(
    (pageId: string, canvasJson: string) => {
      const current = deckRef.current;
      const target = current.pages.find((page) => page.id === pageId);
      if (!target) return;
      if (target.canvasJson === canvasJson) return;
      const now = new Date().toISOString();
      const updatedPage: DeckPage = {
        ...target,
        canvasJson,
        updatedAt: now,
        updatedBy: userId ?? target.updatedBy ?? null,
      };
      const pages = assignPositions(
        current.pages.map((page) => (page.id === pageId ? updatedPage : page))
      );
      const nextDeck: DeckState = {
        version: current.version + 1,
        pages,
        updatedAt: now,
      };
      commitDeck(nextDeck);
      const requestId = uuid();
      registerPending(requestId);
      const sent = sendMessage({
        action: "deck.patch",
        pageId,
        page: updatedPage,
        canvasJson,
        version: nextDeck.version,
        requestId,
      });
      if (!sent) {
        resolvePending(requestId);
      }
    },
    [commitDeck, registerPending, resolvePending, sendMessage, userId]
  );

  const requestExport = useCallback(
    (format: "pdf" | "site", pageId?: string) => {
      const requestId = uuid();
      registerPending(requestId);
      const sent = sendMessage({
        action: "deck.export",
        format,
        pageId,
        requestId,
      });
      if (!sent) {
        resolvePending(requestId);
      }
    },
    [registerPending, resolvePending, sendMessage]
  );

  useEffect(() => {
    if (!ws || !projectId) return;
    const message = JSON.stringify({
      action: "deck.join",
      projectId,
      clientId: clientIdRef.current,
    });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      const onOpen = () => {
        try {
          ws.send(message);
        } finally {
          ws.removeEventListener("open", onOpen);
        }
      };
      ws.addEventListener("open", onOpen);
      return () => ws.removeEventListener("open", onOpen);
    }
  }, [projectId, ws]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail.action !== "string") return;
      if (!detail.action.startsWith("deck.")) return;
      if (projectId && detail.projectId && detail.projectId !== projectId) return;

      switch (detail.action) {
        case "deck.snapshot": {
          const deckPayload = detail.deck ?? {};
          const pages = Array.isArray(deckPayload.pages)
            ? assignPositions(deckPayload.pages.map((page: DeckPage) => sanitizeIncomingPage(page)))
            : [];
          const nextDeck: DeckState = {
            version: typeof deckPayload.version === "number"
              ? deckPayload.version
              : Number(deckPayload.version) || 0,
            pages,
            updatedAt: deckPayload.updatedAt,
          };
          commitDeck(nextDeck);
          setIsReady(true);
          if (detail.syncedAt) {
            setLastSyncedAt(detail.syncedAt);
          }
          setIsSynced(pendingRef.current.size === 0);
          break;
        }
        case "deck.patch": {
          const pagePayload = sanitizeIncomingPage(detail.page ?? {});
          const current = deckRef.current;
          const pages = assignPositions(
            current.pages.map((page) => (page.id === pagePayload.id ? { ...page, ...pagePayload } : page))
          );
          const nextDeck: DeckState = {
            version:
              typeof detail.version === "number" ? detail.version : current.version + 1,
            pages,
            updatedAt: detail.syncedAt ?? current.updatedAt,
          };
          commitDeck(nextDeck);
          if (detail.sourceClientId === clientIdRef.current) {
            resolvePending(detail.requestId, detail.syncedAt ?? nextDeck.updatedAt);
          } else if (detail.syncedAt) {
            setLastSyncedAt(detail.syncedAt);
          }
          break;
        }
        case "deck.meta": {
          const pages = Array.isArray(detail.pages)
            ? assignPositions(detail.pages.map((page: DeckPage) => sanitizeIncomingPage(page)))
            : deckRef.current.pages;
          const nextDeck: DeckState = {
            version:
              typeof detail.version === "number" ? detail.version : deckRef.current.version + 1,
            pages,
            updatedAt: detail.syncedAt ?? deckRef.current.updatedAt,
          };
          commitDeck(nextDeck);
          if (detail.sourceClientId === clientIdRef.current) {
            resolvePending(detail.requestId, detail.syncedAt ?? nextDeck.updatedAt);
          } else if (detail.syncedAt) {
            setLastSyncedAt(detail.syncedAt);
          }
          break;
        }
        case "deck.export.ack":
        case "deck.export.ready": {
          const status: DeckExportStatus = {
            action: detail.action,
            format: typeof detail.format === "string" ? detail.format : "pdf",
            status: typeof detail.status === "string"
              ? detail.status
              : detail.action === "deck.export.ready"
              ? "ready"
              : "queued",
            jobId: detail.jobId,
            requestId: detail.requestId,
            url: typeof detail.url === "string" ? detail.url : undefined,
            timestamp:
              typeof detail.readyAt === "string"
                ? detail.readyAt
                : typeof detail.queuedAt === "string"
                ? detail.queuedAt
                : new Date().toISOString(),
          };
          setExportStatus(status);
          if (detail.sourceClientId === clientIdRef.current) {
            resolvePending(detail.requestId, status.timestamp);
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("ws-message", handler as EventListener);
    return () => window.removeEventListener("ws-message", handler as EventListener);
  }, [commitDeck, projectId, resolvePending]);

  const pages = useMemo(() => deck.pages, [deck.pages]);

  return {
    deck,
    pages,
    activePageId: activePageIdState,
    selectPage,
    addPage,
    duplicatePage,
    movePage,
    renamePage,
    updatePageCanvas,
    requestExport,
    isReady,
    isSynced,
    lastSyncedAt,
    exportStatus,
  };
};

export default useDeckRealtime;
