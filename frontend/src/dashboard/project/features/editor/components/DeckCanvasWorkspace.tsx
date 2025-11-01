import React, { useCallback, useEffect, useMemo, useState } from "react";
import DesignerComponent from "./canvas/designercomponent";
import styles from "./DeckCanvasWorkspace.module.css";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import {
  EDIT_PROJECT_URL,
  apiFetch,
  type DeckCanvasDocument,
  type DeckCanvasPage,
} from "@/shared/utils/api";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import { notify } from "@/shared/ui/ToastNotifications";

const normalizeDeck = (input?: DeckCanvasDocument | null): DeckCanvasDocument => {
  if (!input || typeof input !== "object") {
    return { pages: [] };
  }

  const pages = Array.isArray(input.pages)
    ? input.pages.filter(
        (page): page is DeckCanvasPage =>
          Boolean(page) && typeof page.pageId === "string"
      )
    : [];

  return {
    ...input,
    pages,
  };
};

const EMPTY_CANVAS_JSON = JSON.stringify({ objects: [] });

type DeckCanvasWorkspaceProps = {
  projectId?: string;
};

const DeckCanvasWorkspace: React.FC<DeckCanvasWorkspaceProps> = ({ projectId }) => {
  const { activeProject, setActiveProject } = useData();
  const { ws } = useSocket();

  const resolvedProjectId = projectId ?? activeProject?.projectId ?? null;
  const initialDeck = useMemo(
    () => normalizeDeck(activeProject?.deckCanvas),
    [activeProject?.deckCanvas]
  );

  const [document, setDocument] = useState<DeckCanvasDocument>(initialDeck);
  const [activePageId, setActivePageId] = useState<string | null>(
    initialDeck.pages[0]?.pageId ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  const deckApiUrl = useMemo(() => {
    if (!resolvedProjectId) return null;
    return `${EDIT_PROJECT_URL}/${encodeURIComponent(resolvedProjectId)}/deck`;
  }, [resolvedProjectId]);

  const deckExportUrl = useMemo(() => {
    if (!resolvedProjectId) return null;
    return `${EDIT_PROJECT_URL}/${encodeURIComponent(resolvedProjectId)}/deck/export`;
  }, [resolvedProjectId]);

  const exportStatus = useMemo(() => {
    const info = document.lastExport;
    if (!info) return "No exports yet";
    const formattedTime = info.requestedAt
      ? new Date(info.requestedAt).toLocaleString()
      : "recently";
    return `Last ${info.format.toUpperCase()} export ${info.status} • ${formattedTime}`;
  }, [document.lastExport]);

  const updateState = useCallback(
    (next: DeckCanvasDocument) => {
      const normalized = normalizeDeck(next);
      setDocument(normalized);
      setHasPendingChanges(false);
      if (!resolvedProjectId) return;
      setActiveProject((prev) => {
        if (!prev || prev.projectId !== resolvedProjectId) return prev;
        return { ...prev, deckCanvas: normalized };
      });
    },
    [resolvedProjectId, setActiveProject]
  );

  useEffect(() => {
    const next = normalizeDeck(activeProject?.deckCanvas);
    setDocument(next);
    if (next.pages.length && !next.pages.find((page) => page.pageId === activePageId)) {
      setActivePageId(next.pages[0]?.pageId ?? null);
    }
  }, [activeProject?.deckCanvas]);

  useEffect(() => {
    if (!deckApiUrl) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await apiFetch<{ deckCanvas?: DeckCanvasDocument }>(deckApiUrl);
        if (cancelled) return;
        if (data?.deckCanvas) {
          updateState(data.deckCanvas);
          const normalized = normalizeDeck(data.deckCanvas);
          if (
            normalized.pages.length &&
            !normalized.pages.find((page) => page.pageId === activePageId)
          ) {
            setActivePageId(normalized.pages[0]?.pageId ?? null);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load deck canvas", error);
          notify("error", "Unable to load the deck canvas right now.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [deckApiUrl, activePageId, updateState]);

  const broadcastUpdate = useCallback(
    (payload: { pageId?: string | null; deckCanvas?: DeckCanvasDocument }) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !resolvedProjectId) return;
      ws.send(
        JSON.stringify({
          action: "deckCanvasUpdate",
          projectId: resolvedProjectId,
          conversationId: `project#${resolvedProjectId}`,
          ...payload,
        })
      );
    },
    [resolvedProjectId, ws]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !resolvedProjectId) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.action !== "deckCanvasUpdate") return;
      if (detail.projectId !== resolvedProjectId) return;

      if (detail.deckCanvas) {
        updateState(detail.deckCanvas as DeckCanvasDocument);
        const normalized = normalizeDeck(detail.deckCanvas as DeckCanvasDocument);
        if (
          detail.pageId &&
          normalized.pages.some((page) => page.pageId === detail.pageId)
        ) {
          setActivePageId((prev) => prev ?? detail.pageId);
        }
      }
    };

    window.addEventListener("ws-message", handler as EventListener);
    return () => window.removeEventListener("ws-message", handler as EventListener);
  }, [resolvedProjectId, updateState]);

  const persistAdapter = useMemo(() => {
    if (!resolvedProjectId || !deckApiUrl || !activePageId) return undefined;

    return {
      load: async () => {
        const current = document.pages.find((page) => page.pageId === activePageId);
        return current?.canvasJson ?? null;
      },
      save: async (canvasJson: string) => {
        const payload = {
          pageId: activePageId,
          name:
            document.pages.find((page) => page.pageId === activePageId)?.name ??
            undefined,
          canvasJson,
        };

        try {
          const response = await apiFetch<{
            deckCanvas?: DeckCanvasDocument;
            page?: DeckCanvasPage;
          }>(deckApiUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (response?.deckCanvas) {
            updateState(response.deckCanvas);
            const latestPageId =
              response.page?.pageId || response.deckCanvas.lastModifiedPageId || activePageId;
            setActivePageId((prev) => prev ?? latestPageId ?? activePageId);
            broadcastUpdate({
              pageId: latestPageId ?? activePageId,
              deckCanvas: response.deckCanvas,
            });
          }
        } catch (error) {
          console.error("Failed to persist deck canvas", error);
          throw error;
        }
      },
      onDirtyChange: (dirty: boolean) => setHasPendingChanges(dirty),
    };
  }, [
    activePageId,
    deckApiUrl,
    document.pages,
    broadcastUpdate,
    resolvedProjectId,
    updateState,
  ]);

  const handleAddPage = useCallback(async () => {
    if (!deckApiUrl) return;

    const name = `Page ${document.pages.length + 1}`;
    try {
      const response = await apiFetch<{
        deckCanvas?: DeckCanvasDocument;
        page?: DeckCanvasPage;
      }>(deckApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, canvasJson: EMPTY_CANVAS_JSON }),
      });

      if (response?.deckCanvas) {
        updateState(response.deckCanvas);
        const newPageId = response.page?.pageId;
        if (newPageId) setActivePageId(newPageId);
        broadcastUpdate({ pageId: newPageId, deckCanvas: response.deckCanvas });
        notify("success", `Added ${name}`);
      }
    } catch (error) {
      console.error("Failed to add page", error);
      notify("error", "Couldn’t add a new page. Please try again.");
    }
  }, [deckApiUrl, document.pages.length, updateState, broadcastUpdate]);

  const handleDuplicatePage = useCallback(async () => {
    if (!deckApiUrl || !activePageId) return;
    const current = document.pages.find((page) => page.pageId === activePageId);
    if (!current) return;

    const name = `${current.name || "Page"} copy`;

    try {
      const response = await apiFetch<{
        deckCanvas?: DeckCanvasDocument;
        page?: DeckCanvasPage;
      }>(deckApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, canvasJson: current.canvasJson ?? EMPTY_CANVAS_JSON }),
      });

      if (response?.deckCanvas) {
        updateState(response.deckCanvas);
        const newPageId = response.page?.pageId;
        if (newPageId) setActivePageId(newPageId);
        broadcastUpdate({ pageId: newPageId, deckCanvas: response.deckCanvas });
        notify("success", "Duplicated page");
      }
    } catch (error) {
      console.error("Failed to duplicate page", error);
      notify("error", "Unable to duplicate the page right now.");
    }
  }, [deckApiUrl, activePageId, document.pages, updateState, broadcastUpdate]);

  const handleRenamePage = useCallback(async () => {
    if (!deckApiUrl || !activePageId) return;
    const current = document.pages.find((page) => page.pageId === activePageId);
    if (!current) return;

    const nextName = window.prompt("Rename page", current.name || "Untitled");
    if (!nextName || !nextName.trim()) return;

    try {
      const response = await apiFetch<{
        deckCanvas?: DeckCanvasDocument;
        page?: DeckCanvasPage;
      }>(deckApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: activePageId, name: nextName.trim() }),
      });

      if (response?.deckCanvas) {
        updateState(response.deckCanvas);
        broadcastUpdate({ pageId: activePageId, deckCanvas: response.deckCanvas });
      }
    } catch (error) {
      console.error("Failed to rename page", error);
      notify("error", "We couldn’t rename that page. Try again.");
    }
  }, [deckApiUrl, activePageId, document.pages, updateState, broadcastUpdate]);

  const handleDeletePage = useCallback(async () => {
    if (!deckApiUrl || !activePageId) return;
    if (document.pages.length <= 1) {
      notify("info", "You need at least one page in your deck.");
      return;
    }

    try {
      const url = `${deckApiUrl}/${encodeURIComponent(activePageId)}`;
      const response = await apiFetch<{
        deckCanvas?: DeckCanvasDocument;
      }>(url, {
        method: "DELETE",
      });

      if (response?.deckCanvas) {
        const normalized = normalizeDeck(response.deckCanvas);
        updateState(normalized);
        const fallbackPageId = normalized.pages[0]?.pageId ?? null;
        setActivePageId(fallbackPageId);
        broadcastUpdate({ pageId: fallbackPageId, deckCanvas: response.deckCanvas });
        notify("success", "Page deleted");
      }
    } catch (error) {
      console.error("Failed to delete page", error);
      notify("error", "Deleting that page failed. Please retry.");
    }
  }, [deckApiUrl, activePageId, document.pages.length, updateState, broadcastUpdate]);

  const handleExport = useCallback(
    async (format: "pdf" | "site") => {
      if (!deckExportUrl) return;
      if (hasPendingChanges) {
        notify("info", "Save your changes before exporting.");
        return;
      }

      setIsExporting(true);
      try {
        const response = await apiFetch<{
          export?: DeckCanvasDocument["lastExport"];
        }>(deckExportUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format }),
        });

        if (response?.export) {
          const nextDoc: DeckCanvasDocument = {
            ...document,
            lastExport: response.export,
          };
          updateState(nextDoc);
          broadcastUpdate({ deckCanvas: nextDoc });
          notify(
            "success",
            format === "pdf"
              ? "PDF export queued. We’ll email you when it’s ready."
              : "Site export queued. You’ll get a link shortly."
          );
        }
      } catch (error) {
        console.error("Failed to export deck", error);
        notify("error", "Export failed to start. Try again in a moment.");
      } finally {
        setIsExporting(false);
      }
    },
    [deckExportUrl, document, hasPendingChanges, updateState, broadcastUpdate]
  );

  const currentPages = document.pages;
  const currentPageName = currentPages.find((page) => page.pageId === activePageId)?.name;

  useEffect(() => {
    if (!deckApiUrl) return;
    if (!currentPages.length && !isLoading) {
      void handleAddPage();
    }
  }, [deckApiUrl, currentPages.length, isLoading, handleAddPage]);

  return (
    <section className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.pageList} role="tablist" aria-label="Deck pages">
          {currentPages.map((page) => {
            const isActive = page.pageId === activePageId;
            return (
              <button
                key={page.pageId}
                type="button"
                className={isActive ? `${styles.pageButton} ${styles.pageButtonActive}` : styles.pageButton}
                onClick={() => setActivePageId(page.pageId)}
                aria-pressed={isActive}
              >
                {page.name || "Untitled"}
              </button>
            );
          })}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={handleAddPage}>
            New Page
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleDuplicatePage}
            disabled={!activePageId}
          >
            Duplicate
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleRenamePage}
            disabled={!activePageId}
          >
            Rename
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleDeletePage}
            disabled={!activePageId || currentPages.length <= 1}
          >
            Delete
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => handleExport("pdf")}
            disabled={isExporting}
          >
            Export PDF
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => handleExport("site")}
            disabled={isExporting}
          >
            Publish Site
          </button>
        </div>
      </div>

      <div className={styles.statusRow}>
        <span className={styles.status}>{exportStatus}</span>
        {hasPendingChanges && <span className={styles.status}>• Unsaved changes</span>}
        {currentPageName && (
          <span className={styles.status}>• Editing {currentPageName}</span>
        )}
      </div>

      <div className={styles.canvasContainer}>
        {isLoading && <SpinnerOverlay message="Loading canvas" />}
        <DesignerComponent
          key={activePageId ?? "deck-default"}
          style={{ width: "100%", height: "100%" }}
          persistAdapter={persistAdapter}
        />
      </div>
    </section>
  );
};

export default DeckCanvasWorkspace;
