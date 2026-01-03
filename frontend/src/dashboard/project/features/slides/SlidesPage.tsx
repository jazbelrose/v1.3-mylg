// SlidesPage.tsx - Main slides editor page
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import { Slide } from "@/app/contexts/DataProvider";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import SlidesSidebar from "./components/SlidesSidebar";
import SlideEditor from "./components/SlideEditor";
import SlidesEmptyToolbar from "./components/SlidesEmptyToolbar";
import DeckVersionDropdown from "./components/DeckVersionDropdown";
import DeckVersionsModal from "./components/DeckVersionsModal";
import { useDeckVersions } from "./hooks/useDeckVersions";
import { notify } from "@/shared/ui/ToastNotifications";
import { ConfirmModal, PromptModal } from "@/shared/ui";
import { v4 as uuidv4 } from "uuid";
import { disconnectAllSlideProviders } from "./lib/yjs";
import { saveSlideThumb } from "./lib/thumbnails";
import { isUiThumbsEnabled } from "./lib/featureFlags";
import { isLexicalContentEffectivelyEmpty } from "./lib/lexicalContent";
import { generateMagicLayoutContent } from "./lib/magicLayoutToLexical";
import type { LayoutVariant, TasteModeId } from "./lib/magicLayoutTypes";
import type { LayoutMode } from "./lib/pictureFrameLayoutGenerator";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { apiFetch, GALLERY_UPLOAD_URL, getFileUrl, patchSlideThumbnail } from "@/shared/utils/api";
import { DropdownProvider } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import "./slides.css";

const MAX_THUMBNAIL_ATTEMPTS = 5;

type PdfImportDetail = {
  stage: string;
  currentPage: number;
  totalPages: number;
  percent: number;
};

// Deduplication map for concurrent thumbnail ready checks
const inflightThumbChecks = new Map<string, Promise<string>>();

// Maximum time budget for thumbnail ready checks (seconds)
const MAX_THUMBNAIL_WAIT_SECONDS = 30;

async function waitForThumbnailReady(url: string, maxAttempts = MAX_THUMBNAIL_ATTEMPTS): Promise<string> {
  if (!url) {
    return url;
  }

  if (typeof window === "undefined" || typeof Image === "undefined") {
    return url;
  }

  // Normalize URL for deduplication (strip cache-busting params)
  const baseUrl = url.split("?")[0];
  
  // Check if there's already an inflight request for this URL
  const existing = inflightThumbChecks.get(baseUrl);
  if (existing) {
    console.log(`[Thumbnails] Deduping thumbnail ready check for ${baseUrl}`);
    return existing;
  }

  const startTime = Date.now();
  const maxWaitMs = MAX_THUMBNAIL_WAIT_SECONDS * 1000;

  const checkPromise = (async (): Promise<string> => {
    let lastError: unknown = null;
    const cacheKey = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check time budget
      if (Date.now() - startTime > maxWaitMs) {
        console.warn(`[Thumbnails] Timeout waiting for thumbnail ready: ${baseUrl}`);
        throw new Error("Thumbnail ready check timed out");
      }

      const attemptUrl =
        attempt === 0
          ? url
          : `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}-${attempt}`;

      try {
        // Try HEAD request first (lighter weight)
        const headOk = await checkThumbnailWithHead(attemptUrl);
        if (headOk) {
          console.log(`[Thumbnails] HEAD check passed for ${attemptUrl}`);
          return attemptUrl;
        }
        
        // Fall back to image load check
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";

          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Image load timeout: ${attemptUrl}`));
          }, 5000);

          const cleanup = () => {
            clearTimeout(timeout);
            img.onload = null;
            img.onerror = null;
          };

          img.onload = () => {
            cleanup();
            resolve();
          };

          img.onerror = () => {
            cleanup();
            reject(new Error(`Failed to load thumbnail: ${attemptUrl}`));
          };

          img.src = attemptUrl;
        });

        console.log(`[Thumbnails] Image load check passed for ${attemptUrl} in ${Date.now() - startTime}ms`);
        return attemptUrl;
      } catch (error) {
        lastError = error;
        const delay = Math.min(1500, 250 * Math.pow(2, attempt));
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error("Thumbnail did not become ready");
  })();

  // Store the inflight promise for deduplication
  inflightThumbChecks.set(baseUrl, checkPromise);

  try {
    return await checkPromise;
  } finally {
    // Clean up after resolution
    inflightThumbChecks.delete(baseUrl);
  }
}

/**
 * Check if a thumbnail URL is ready using HEAD request (lighter than full image load)
 * Falls back to Range-based GET if HEAD fails (some S3/CloudFront configs return 403/405 on HEAD)
 */
async function checkThumbnailWithHead(url: string): Promise<boolean> {
  try {
    // Try HEAD first
    const headResponse = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      cache: "no-cache",
    });
    if (headResponse.ok && headResponse.status === 200) {
      return true;
    }
    // If HEAD returned non-ok but didn't throw, try Range-based GET
    if (headResponse.status === 403 || headResponse.status === 405) {
      return await checkWithRangeGet(url);
    }
    return false;
  } catch {
    // Network error on HEAD, try Range-based GET as fallback
    return await checkWithRangeGet(url);
  }
}

/**
 * Check if URL exists using Range-based GET (fallback for HEAD)
 * Treats 200, 206, and 416 (range not satisfiable but file exists) as success
 */
async function checkWithRangeGet(url: string): Promise<boolean> {
  try {
    const rangeResponse = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-cache",
      headers: { Range: "bytes=0-0" },
    });
    // 200 = full content, 206 = partial content, 416 = range not satisfiable (file exists but range invalid)
    return rangeResponse.status === 200 || rangeResponse.status === 206 || rangeResponse.status === 416;
  } catch {
    return false;
  }
}

const SlidesPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeProject,
    fetchProjectDetails,
    updateProjectFields,
    userId,
    userName,
    isAdmin,
    isDesigner,
  } = useData();

  const { ws } = useSocket();

  // Deck versions management
  const {
    versions,
    activeVersion,
    isLoading: versionsLoading,
    createVersion,
    updateVersion,
    deleteVersion,
    duplicateVersion,
    setDefaultVersion,
    setClientDefaultVersion,
    canManageVersions,
    switchVersion,
    fetchVersions,
  } = useDeckVersions({ projectId: projectId || "" });

  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [renameVersionOpen, setRenameVersionOpen] = useState(false);
  const [versionToRename, setVersionToRename] = useState<{ versionId: string; name: string } | null>(null);
  const [deleteVersionConfirmOpen, setDeleteVersionConfirmOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<string | null>(null);

  // Computed active version ID for props
  const activeVersionId = activeVersion?.versionId ?? null;

  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [pendingDeleteSlideIds, setPendingDeleteSlideIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  // Zoom state: 0 = "fit to view", otherwise percentage (25-300)
  const [zoom, setZoom] = useState(0);
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const uiThumbsEnabled = isUiThumbsEnabled();
  const [toolbarPortalNode, setToolbarPortalNode] = useState<HTMLDivElement | null>(null);
  const pdfImportInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfImportStatus, setPdfImportStatus] = useState<"idle" | "uploading" | "processing">("idle");
  const [pdfImportProgress, setPdfImportProgress] = useState<number>(0);
  const [pdfImportDetail, setPdfImportDetail] = useState<PdfImportDetail | null>(null);
  const toolbarPortalRef = useCallback((node: HTMLDivElement | null) => {
    setToolbarPortalNode(node);
  }, []);
  // Flag indicating a thumbnail changed and needs persistence.
  // Note: thumbnails are intentionally *not* regenerated on every keystroke.
  // We mark the thumbnail as dirty and generate/persist it once after the autosave/save
  // window (debounced) to avoid excessive thumbnail churn.
  const dirtyThumbRef = useRef<boolean>(false);
  const emptySlidesInitializedRef = useRef(false);
  const backgroundColorSaveTimerRef = useRef<number | null>(null);
  const backgroundColorPersistTimerRef = useRef<number | null>(null);
  const pendingBackgroundColorSaveSlidesRef = useRef<Slide[] | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightThumbnailsRef = useRef<Set<string>>(new Set());
  const slidesRef = useRef<Slide[]>([]);
  const pendingThumbPersistRef = useRef<Map<string, number>>(new Map());
  const thumbPersistTimerRef = useRef<number | null>(null);
  // Track when slides were just imported to prevent sync effect from overwriting them
  const justImportedRef = useRef<boolean>(false);
  const pendingInitialSlideIdRef = useRef<string | null>(
    typeof (location.state as { activeSlideId?: unknown } | null | undefined)?.activeSlideId === "string"
      ? ((location.state as { activeSlideId?: unknown }).activeSlideId as string)
      : null
  );

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  // Helper to add a cache-busting query param for immediate UI refresh
  const makeUiThumbnail = useCallback((url: string) => {
    if (!url) {
      return url;
    }

    const resolved = getFileUrl(url);
    return `${resolved}${resolved.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }, []);

  // Helper to strip cache-bust query params before persisting to backend
  const sanitizeThumbnailForPersist = useCallback((thumb?: string) => {
    if (!thumb) return thumb;
    const idx = thumb.indexOf("?");
    if (idx === -1) return thumb;
    return thumb.substring(0, idx);
  }, []);

  const parseStatusToNumber = (statusString: string | number | undefined | null): number => {
    if (statusString === undefined || statusString === null) return 0;
    const str = typeof statusString === "string" ? statusString : String(statusString);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject: unknown) => {
    // setActiveProject is not available in useData, so we might need to handle this differently
    // For now, just log
    console.log("Active project change:", updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    const title = activeProject?.title ?? "";
    navigate(getProjectDashboardPath(deletedProjectId, title));
  };

  useEffect(() => {
    // Keep selection valid as slides change (import, delete, reorder, etc.)
    setSelectedSlideIds((prev) => prev.filter((id) => slides.some((s) => s.id === id)));
  }, [slides]);

  const handleImportPdfClick = useCallback(() => {
    if (pdfImportStatus !== "idle") return;
    pdfImportInputRef.current?.click();
  }, [pdfImportStatus]);

  const shouldSkipThumbnailForSlide = useCallback((slide?: Slide | null) => {
    if (!slide?.backgroundImage) {
      return false;
    }
    return isLexicalContentEffectivelyEmpty(slide.content);
  }, []);

  const flushPendingThumbnailPersists = useCallback(async () => {
    if (!projectId || uiThumbsEnabled) {
      pendingThumbPersistRef.current.clear();
      return;
    }

    const pending = pendingThumbPersistRef.current;
    if (pending.size === 0) return;
    pendingThumbPersistRef.current = new Map();

    const snapshot = slidesRef.current;
    
    // Use the new atomic thumbnail patch endpoint for each pending slide
    const patchPromises: Promise<void>[] = [];
    
    for (const [slideId, thumbRevision] of pending) {
      const slide = snapshot.find((s) => s.id === slideId);
      if (!slide || slide.thumbRevision !== thumbRevision) {
        // Skip if slide no longer exists or revision has changed
        continue;
      }
      
      if (shouldSkipThumbnailForSlide(slide)) {
        continue;
      }
      
      const thumbUrl = sanitizeThumbnailForPersist(slide.thumbnail);
      if (!thumbUrl) {
        continue;
      }
      
      const patchPromise = (async () => {
        try {
          console.log(`[Thumbnails] Patching thumbnail for slide ${slideId} with revision ${thumbRevision}`);
          const result = await patchSlideThumbnail(projectId, slideId, {
            thumbUrl,
            thumbRevision,
            versionId: activeVersionId || undefined,
            generatedAt: new Date().toISOString(),
          });
          
          if (result.updated) {
            console.log(`[Thumbnails] Successfully patched thumbnail for slide ${slideId}`);
          } else {
            console.log(`[Thumbnails] Thumbnail patch skipped for slide ${slideId}: ${result.reason}`);
          }
        } catch (error) {
          console.warn(`[Thumbnails] Failed to patch thumbnail for slide ${slideId}:`, error);
        }
      })();
      
      patchPromises.push(patchPromise);
    }
    
    // Wait for all patches to complete
    await Promise.allSettled(patchPromises);

    // Broadcast update via WebSocket for real-time sync
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send individual slide thumbnail updates instead of full slides array
        for (const [slideId, thumbRevision] of pending) {
          const slide = snapshot.find((s) => s.id === slideId);
          if (!slide || slide.thumbRevision !== thumbRevision) continue;
          
          ws.send(
            JSON.stringify({
              action: "slideThumbnailUpdated",
              projectId,
              slideId,
              thumbnail: sanitizeThumbnailForPersist(slide.thumbnail),
              thumbRevision,
              conversationId: `project#${projectId}`,
              username: userName || "Someone",
              senderId: userId,
              ...(activeVersionId && { versionId: activeVersionId }),
            })
          );
        }
      }
    } catch (error) {
      console.warn("Failed to broadcast thumbnail update:", error);
    }
  }, [
    projectId,
    uiThumbsEnabled,
    shouldSkipThumbnailForSlide,
    sanitizeThumbnailForPersist,
    activeVersionId,
    ws,
    userName,
    userId,
  ]);

  const queueThumbnailPersist = useCallback(
    (slideId: string, thumbRevision: number) => {
      pendingThumbPersistRef.current.set(slideId, thumbRevision);
      if (thumbPersistTimerRef.current) return;
      thumbPersistTimerRef.current = window.setTimeout(() => {
        thumbPersistTimerRef.current = null;
        void flushPendingThumbnailPersists();
      }, 250);
    },
    [flushPendingThumbnailPersists]
  );

  const applyThumbnailUpdate = useCallback(
    (slideId: string, readyUrl: string) => {
      const thumbRevision = Date.now();
      setSlides((prev) => {
        const next = prev.map((s) =>
          s.id === slideId
            ? { ...s, thumbnail: makeUiThumbnail(readyUrl), thumbRevision }
            : s
        );
        slidesRef.current = next;
        return next;
      });
      queueThumbnailPersist(slideId, thumbRevision);
    },
    [makeUiThumbnail, queueThumbnailPersist]
  );

  const handleBack = () => {
    const title = activeProject?.title ?? "";

    // Generate thumbnail for the current active slide before navigating back.
    // Only do this when using server thumbnails (not UI-only thumbs)
  if (projectId && activeSlideId && !uiThumbsEnabled) {
      // Best-effort: generate thumbnail and then navigate. Do not block UI
      // longer than necessary; thumbnail save failures are non-fatal.
      const width = 1920;
      const height = 1080;
      const slide = slides.find((s) => s.id === activeSlideId);
      if (shouldSkipThumbnailForSlide(slide)) {
        navigate(getProjectDashboardPath(projectId!, title));
        return;
      }
      saveSlideThumb(projectId, activeSlideId, undefined, { width, height, backgroundColor: slide?.backgroundColor, content: slide?.content, backgroundImage: slide?.backgroundImage })
        .catch((e) => console.warn("Failed to save thumbnail on exit:", e))
        .finally(() => {
          navigate(getProjectDashboardPath(projectId!, title));
        });
      return;
    }

    navigate(getProjectDashboardPath(projectId!, title));
  };

  // Initialize slides from project data
  useEffect(() => {
    if (!projectId) return;

    if (!activeProject || activeProject.projectId !== projectId || !activeProject.slides) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails]);

  // Handle slide imports via websocket broadcast (from create-gallery Lambda)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onWsMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail as unknown;
      if (!detail || typeof detail !== "object") return;

      const data = detail as {
        action?: string;
        projectId?: string;
        importId?: string;
        pageCount?: number;
        stage?: string;
        currentPage?: number;
        totalPages?: number;
        percent?: number;
        message?: string;
        slides?: Slide[];
        senderId?: string;
        versionId?: string;
        fields?: { slides?: Slide[] };
      };

      // Handle projectUpdated to sync thumbnails from other users
      if (data.action === "projectUpdated" && 
          projectId && 
          data.projectId === projectId && 
          data.senderId !== userId &&
          data.fields?.slides &&
          !uiThumbsEnabled &&
          ((activeVersionId && data.versionId === activeVersionId) || (!activeVersionId && !data.versionId))) {
        setSlides(prev => {
          const incoming = data.fields!.slides!;
          // Merge thumbnails while preserving local content edits
          return prev.map(local => {
            const remote = incoming.find(s => s.id === local.id);
            if (!remote) return local;
            
            // Only update thumbnail if remote is newer
            const remoteThumbBase = sanitizeThumbnailForPersist(remote.thumbnail);
            const localThumbBase = sanitizeThumbnailForPersist(local.thumbnail);
            const shouldUpdateThumb =
              !!remote.thumbnail &&
              (!local.thumbnail ||
                remote.thumbRevision !== local.thumbRevision ||
                remoteThumbBase !== localThumbBase);
             
            if (shouldUpdateThumb) {
              return {
                ...local,
                thumbnail: makeUiThumbnail(remote.thumbnail),
                thumbRevision: remote.thumbRevision,
              };
            }
            return local;
          });
        });
        return;
      }

      if (data.action === "slidesImportProgress" && projectId && data.projectId === projectId) {
        setPdfImportStatus("processing");
        const percent = Math.max(0, Math.min(99, Math.round(Number(data.percent ?? 0))));
        setPdfImportProgress(percent);
        setPdfImportDetail({
          stage: data.stage || "processing",
          currentPage: Math.max(0, Math.round(Number(data.currentPage ?? 0))),
          totalPages: Math.max(0, Math.round(Number(data.totalPages ?? 0))),
          percent,
        });
        return;
      }

      if (data.action === "slidesImportFailed" && projectId && data.projectId === projectId) {
        setPdfImportStatus("idle");
        setPdfImportProgress(0);
        setPdfImportDetail(null);
        notify("error", data.message ? `PDF import failed: ${data.message}` : "PDF import failed");
        return;
      }

      if (data.action !== "slidesImported" || !projectId || data.projectId !== projectId) {
        return;
      }

      // CRITICAL: Only apply import if it matches our active version context
      // If importing user was on a version and we're not on that version (or vice versa), skip
      const importVersionId = (data.versionId as string | undefined) ?? null;
      const ourVersionId = activeVersionId ?? null;
      if (importVersionId !== ourVersionId) {
        console.log(`[SlidesPage] Ignoring slidesImported for version ${importVersionId}, we are on ${ourVersionId}`);
        return;
      }

      if (Array.isArray(data.slides)) {
        const sortedSlides = [...data.slides].sort((a, b) => (a.order || 0) - (b.order || 0));
        const slidesWithDisplayThumbnails = sortedSlides.map((slide) => ({
          ...slide,
          thumbnail: (!uiThumbsEnabled && slide.thumbnail) ? makeUiThumbnail(slide.thumbnail) : slide.thumbnail,
        }));

        // Mark that we just imported slides to prevent sync effect from overwriting them
        justImportedRef.current = true;
        
        setSlides(slidesWithDisplayThumbnails);

        // If a version is active, persist the imported slides to that version too
        if (activeVersionId) {
          void updateVersion(activeVersionId, { slides: sortedSlides });
        }

        if (data.importId) {
          const firstImported = slidesWithDisplayThumbnails.find(
            (s) => (s as { importMeta?: { importId?: string } }).importMeta?.importId === data.importId
          );
          if (firstImported) {
            setActiveSlideId(firstImported.id);
          }
        }
      }

      setPdfImportStatus("idle");
      setPdfImportProgress(0);
      setPdfImportDetail(null);
      notify("success", `Imported ${data.pageCount || "PDF"} as slides`);
    };

    window.addEventListener("ws-message", onWsMessage as EventListener);
    return () => window.removeEventListener("ws-message", onWsMessage as EventListener);
  }, [projectId, makeUiThumbnail, uiThumbsEnabled, userId, activeVersionId, sanitizeThumbnailForPersist, updateVersion]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (pdfImportStatus !== "processing") {
      return;
    }

    // Fallback: if the backend doesn't emit progress events, keep UI responsive with a slow
    // "heartbeat" progress that caps below 100% until completion arrives.
    if (pdfImportDetail?.totalPages) {
      return;
    }

    const t = window.setInterval(() => {
      setPdfImportProgress((prev) => {
        const next = prev > 0 ? prev + 1 : 1;
        return Math.min(95, next);
      });
    }, 1100);

    return () => window.clearInterval(t);
  }, [pdfImportStatus, pdfImportDetail?.totalPages]);

  useEffect(() => {
    if (!projectId) return;

    // Skip syncing if we just imported slides - the import handler already set the correct state
    // and we need to wait for the version update to propagate
    if (justImportedRef.current) {
      justImportedRef.current = false;
      return;
    }

    // Use slides from active version if available, otherwise fall back to project slides
    const sourceSlides = activeVersion?.slides ?? activeProject?.slides;
    if (!Array.isArray(sourceSlides)) {
      emptySlidesInitializedRef.current = false;
      return;
    }

    if (sourceSlides.length > 0) {
      emptySlidesInitializedRef.current = false;
      const sortedSlides = [...(sourceSlides as Slide[])].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      // Transform thumbnails to display URLs with cache-busting
      const slidesWithDisplayThumbnails = sortedSlides.map(slide => ({
        ...slide,
        thumbnail: (!uiThumbsEnabled && slide.thumbnail)
          ? makeUiThumbnail(slide.thumbnail)
          : slide.thumbnail,
      }));

      setSlides((prevSlides) => {
        const sameLength = prevSlides.length === slidesWithDisplayThumbnails.length;
        const sameContent =
          sameLength &&
          prevSlides.every(
            (slide, index) =>
              JSON.stringify(slide) === JSON.stringify(slidesWithDisplayThumbnails[index])
          );
        return sameContent ? prevSlides : slidesWithDisplayThumbnails;
      });

      setActiveSlideId((current) => {
        const pending = pendingInitialSlideIdRef.current;
        if (pending && sortedSlides.some((slide) => slide.id === pending)) {
          pendingInitialSlideIdRef.current = null;
          return pending;
        }
        if (!current || !sortedSlides.some((slide) => slide.id === current)) {
          return sortedSlides[0].id;
        }
        return current;
      });
      return;
    }

    // Project explicitly has no slides (valid). Don't auto-create a slide — let the user add one.
    // Avoid stomping local edits while dirty.
    setSlides((prev) => (isDirty ? prev : []));
    setSelectedSlideIds((prev) => (isDirty ? prev : []));
    setActiveSlideId((current) => (isDirty ? current : null));
  }, [projectId, activeProject?.slides, activeVersion?.slides, uiThumbsEnabled, makeUiThumbnail, isDirty]);

  // Cleanup Yjs connections on unmount
  useEffect(() => {
    return () => {
      disconnectAllSlideProviders();
    };
  }, []);

  useEffect(
    () => () => {
      if (backgroundColorSaveTimerRef.current) {
        window.clearTimeout(backgroundColorSaveTimerRef.current);
        backgroundColorSaveTimerRef.current = null;
      }
      if (backgroundColorPersistTimerRef.current) {
        window.clearTimeout(backgroundColorPersistTimerRef.current);
        backgroundColorPersistTimerRef.current = null;
      }
      if (thumbPersistTimerRef.current) {
        window.clearTimeout(thumbPersistTimerRef.current);
        thumbPersistTimerRef.current = null;
      }
      pendingThumbPersistRef.current.clear();
      pendingBackgroundColorSaveSlidesRef.current = null;
    },
    []
  );

  // Best-effort save thumbnail when the user closes the tab or reloads.
  // This is a best-effort handler and should not block unload; it's here to
  // capture thumbnails when the page is exited instead of generating them on
  // every keystroke.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (projectId && activeSlideId && !uiThumbsEnabled) {
        try {
          // Fire-and-forget; browsers may not allow async work on unload
          const width = 1920;
          const height = 1080;
          const slide = slides.find((s) => s.id === activeSlideId);
          if (shouldSkipThumbnailForSlide(slide)) {
            return;
          }
          const bgColor = slide?.backgroundColor || '#101112';
          saveSlideThumb(projectId, activeSlideId, undefined, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch(() => {});
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [projectId, activeSlideId, uiThumbsEnabled]);

  // Generate thumbnails for the active slide if it doesn't have one yet
  // This ensures the first slide (and any newly created slides) get thumbnails
  useEffect(() => {
    if (!projectId || !activeSlideId || uiThumbsEnabled) {
      return;
    }

    const activeSlide = slides.find((s) => s.id === activeSlideId);
    if (!activeSlide) {
      return;
    }

    // Skip if slide already has a thumbnail or should skip thumbnail generation
    if (activeSlide.thumbnail || shouldSkipThumbnailForSlide(activeSlide)) {
      return;
    }

    // Skip if slide has no content yet
    if (!activeSlide.content || activeSlide.content.length === 0) {
      return;
    }

    // Delay slightly to allow the editor to fully render
    const timer = setTimeout(() => {
      const width = 1920;
      const height = 1080;
      const bgColor = activeSlide.backgroundColor || '#101112';

      saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
        if (!thumbnailUrl) {
          return;
        }

        void waitForThumbnailReady(thumbnailUrl)
          .then((readyUrl) => {
            applyThumbnailUpdate(activeSlideId, readyUrl);
          })
          .catch((error) => {
            console.warn("Initial thumbnail generation failed:", error);
          });
      }, {
        width,
        height,
        backgroundColor: bgColor,
        content: activeSlide.content,
        backgroundImage: activeSlide.backgroundImage,
      }).catch((e) => {
        console.warn("Failed to generate initial thumbnail:", e);
      });
    }, 1500); // Wait for editor to fully render

    return () => clearTimeout(timer);
  }, [projectId, activeSlideId, slides, uiThumbsEnabled, shouldSkipThumbnailForSlide, applyThumbnailUpdate]);

  const saveSlides = useCallback(
    async (slidesToSave: Slide[], options?: { skipThumbnail?: boolean }) => {
      if (!projectId) return;

      setIsSaving(true);
      try {
        const cleanedSlides = slidesToSave.map((slide) =>
          shouldSkipThumbnailForSlide(slide) ? { ...slide, thumbnail: undefined } : slide
        );

        // Save to active version if one exists, otherwise save to project
        if (activeVersionId && activeVersion) {
          await updateVersion(activeVersionId, { slides: cleanedSlides });
        } else {
          await updateProjectFields(projectId, {
            slides: cleanedSlides,
          });
        }

        // Broadcast the update to other users
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            action: "projectUpdated",
            projectId,
            fields: { slides: cleanedSlides },
            conversationId: `project#${projectId}`,
            username: userName || "Someone",
            senderId: userId,
            ...(activeVersionId && { versionId: activeVersionId }),
          }));
        }

        // Mark saved
        setIsDirty(false);

        // Only run post-save thumbnail generation when caller hasn't opted out
        // and UI-only thumbnails are not enabled
   if (!options?.skipThumbnail && !uiThumbsEnabled) {
          try {
            if (projectId && activeSlideId) {
              const width = 1920;
              const height = 1080;
              // Small delay to ensure DOM is updated before capturing thumbnail
              setTimeout(() => {
                // Generate and persist thumbnail; update local state and then persist
                const slide = slidesRef.current.find((s) => s.id === activeSlideId);
                if (shouldSkipThumbnailForSlide(slide)) {
                  return;
                }

                // Check if thumbnail generation is already in progress for this slide
                if (inflightThumbnailsRef.current.has(activeSlideId)) {
                  console.log('Thumbnail generation already in progress for', activeSlideId);
                  return;
                }

                inflightThumbnailsRef.current.add(activeSlideId);
                const bgColor = slide?.backgroundColor;
                saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                  if (!thumbnailUrl) {
                    return;
                  }

                  void waitForThumbnailReady(thumbnailUrl)
                    .then((readyUrl) => {
                      applyThumbnailUpdate(activeSlideId, readyUrl);
                    })
                    .catch((error) => {
                      console.warn("Thumbnail not ready after save:", error);
                    })
                    .finally(() => {
                      inflightThumbnailsRef.current.delete(activeSlideId);
                    });
                }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch((e) => {
                  console.warn('Failed to save thumbnail after save:', e);
                  inflightThumbnailsRef.current.delete(activeSlideId);
                });
              }, 100);
            }
          } catch (err) {
            console.warn('Thumbnail generation after save failed:', err);
          }
        }
      } catch (err) {
        console.error("Failed to save slides:", err);
        notify("error", "Failed to save slides");
      } finally {
        setIsSaving(false);
      }
    },
  [
    projectId,
    updateProjectFields,
    activeSlideId,
    ws,
    userId,
    userName,
    uiThumbsEnabled,
    makeUiThumbnail,
    applyThumbnailUpdate,
    shouldSkipThumbnailForSlide,
    activeVersionId,
    activeVersion,
    updateVersion,
  ]
  );

  const handleNewSlide = useCallback(() => {
    const newSlide: Slide = {
      id: uuidv4(),
      title: `Slide ${slides.length + 1}`,
      order: slides.length,
      backgroundColor: '#101112',
      content: JSON.stringify({
        root: {
          children: [
            {
              children: [],
              direction: null,
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      }),
    };

    const updatedSlides = [...slides, newSlide];
    setSlides(updatedSlides);
    setActiveSlideId(newSlide.id);
    setIsDirty(true);

    // Save to backend
    saveSlides(updatedSlides);
  }, [slides, saveSlides]);

  /**
   * Create multiple slides with Magic Layout content
   * Called from SlideEditor when multi-slide magic layout is applied
   */
  const handleCreateSlidesWithLayout = useCallback(
    async (
      variant: LayoutVariant,
      slideImages: string[][],
      options: {
        mode: LayoutMode;
        seed: string;
        tasteMode: TasteModeId;
      }
    ): Promise<void> => {
      if (!slideImages || slideImages.length === 0) {
        return;
      }

      const newSlides: Slide[] = slideImages.map((images, idx) => {
        const slideOrder = slides.length + idx;
        // Generate Lexical content with the magic layout and images
        const content = generateMagicLayoutContent(
          variant,
          images,
          options.tasteMode
        );

        return {
          id: uuidv4(),
          title: `Slide ${slideOrder + 1}`,
          order: slideOrder,
          backgroundColor: '#101112',
          content,
        };
      });

      const updatedSlides = [...slides, ...newSlides];
      setSlides(updatedSlides);
      // Select the first new slide
      if (newSlides.length > 0) {
        setActiveSlideId(newSlides[0].id);
      }
      setIsDirty(true);

      // Save to backend
      saveSlides(updatedSlides);

      notify("success", `Created ${newSlides.length} new slide${newSlides.length > 1 ? 's' : ''} with layout`);
    },
    [slides, saveSlides]
  );

  const handleSlideSelect = useCallback(
    (slideId: string) => {
      // Clear autosave timer to prevent race condition with thumbnail generation
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      // When switching away from the current slide, generate a thumbnail for
      // the slide being left. Fire-and-forget so navigation remains snappy.
    if (projectId && activeSlideId && activeSlideId !== slideId && !uiThumbsEnabled) {
        const width = 1920;
        const height = 1080;
        const slide = slides.find((s) => s.id === activeSlideId);
        if (shouldSkipThumbnailForSlide(slide)) {
          setActiveSlideId(slideId);
          return;
        }

        // Check if thumbnail generation is already in progress for this slide
        if (inflightThumbnailsRef.current.has(activeSlideId)) {
          console.log('Thumbnail generation already in progress for', activeSlideId);
          setActiveSlideId(slideId);
          return;
        }

        inflightThumbnailsRef.current.add(activeSlideId);
        const bgColor = slide?.backgroundColor;
        saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
          if (!thumbnailUrl) {
            return;
          }

          void waitForThumbnailReady(thumbnailUrl)
            .then((readyUrl) => {
              applyThumbnailUpdate(activeSlideId, readyUrl);
            })
            .catch((error) => {
              console.warn("Thumbnail not ready when switching slides:", error);
            })
            .finally(() => {
              inflightThumbnailsRef.current.delete(activeSlideId);
            });
        }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch((e) => {
          console.warn("Failed to save thumbnail on slide change:", e);
          inflightThumbnailsRef.current.delete(activeSlideId);
        });
      }

      setActiveSlideId(slideId);
    },
  [projectId, activeSlideId, uiThumbsEnabled, slides, shouldSkipThumbnailForSlide, applyThumbnailUpdate]
  );

  const handleReorderSlides = useCallback((reorderedSlides: Slide[]) => {
    setSlides(reorderedSlides);
    setIsDirty(true);
    saveSlides(reorderedSlides);
  }, [saveSlides]);

  const handleDuplicateSlide = useCallback((slideId?: string) => {
    const targetSlideId = slideId || activeSlideId;
    const targetSlide = slides.find((s) => s.id === targetSlideId);
    if (!targetSlide) return;

    const duplicatedSlide: Slide = {
      ...targetSlide,
      id: uuidv4(),
      title: `${targetSlide.title} (Copy)`,
      order: slides.length,
    };

    const updatedSlides = [...slides, duplicatedSlide];
    setSlides(updatedSlides);
    setActiveSlideId(duplicatedSlide.id);
    setIsDirty(true);

    saveSlides(updatedSlides);
    notify("success", "Slide duplicated");
  }, [slides, activeSlideId, saveSlides]);

  const performDeleteSlides = useCallback(
    (slideIds: string[]) => {
      const uniqueIds = Array.from(new Set(slideIds)).filter((id) => slides.some((s) => s.id === id));
      if (uniqueIds.length === 0) {
        return;
      }

      const deletedIndices = uniqueIds
        .map((id) => slides.findIndex((s) => s.id === id))
        .filter((idx) => idx >= 0);
      const anchorIndex = deletedIndices.length ? Math.min(...deletedIndices) : 0;

      const remainingSlides = slides.filter((s) => !uniqueIds.includes(s.id));
      const reorderedSlides = remainingSlides.map((slide, idx) => ({
        ...slide,
        order: idx,
      }));

      const activeStillExists =
        activeSlideId && !uniqueIds.includes(activeSlideId) && reorderedSlides.some((s) => s.id === activeSlideId);
      const nextActiveId = activeStillExists
        ? activeSlideId
        : reorderedSlides[Math.min(anchorIndex, reorderedSlides.length - 1)]?.id ?? reorderedSlides[0]?.id ?? null;

      setSlides(reorderedSlides);
      setSelectedSlideIds([]);
      setActiveSlideId(nextActiveId);
      setIsDirty(true);
      saveSlides(reorderedSlides);

      notify("success", uniqueIds.length === 1 ? "Slide deleted" : `Deleted ${uniqueIds.length} slides`);
    },
    [slides, activeSlideId, saveSlides]
  );

  const requestDeleteSlides = useCallback(
    (slideIds: string[]) => {
      const uniqueIds = Array.from(new Set(slideIds)).filter((id) => slides.some((s) => s.id === id));
      if (uniqueIds.length === 0) {
        return;
      }
      setPendingDeleteSlideIds(uniqueIds);
      setDeleteSelectedOpen(true);
    },
    [slides]
  );

  const handleDeleteSlide = useCallback(
    (slideId?: string) => {
      const targetSlideId = slideId || activeSlideId;
      if (!targetSlideId) {
        return;
      }

      const selectedIncludesTarget = selectedSlideIds.includes(targetSlideId);
      if (selectedIncludesTarget && selectedSlideIds.length > 1) {
        requestDeleteSlides(selectedSlideIds);
        return;
      }

      performDeleteSlides([targetSlideId]);
    },
    [activeSlideId, selectedSlideIds, performDeleteSlides, requestDeleteSlides]
  );

  const handleContentChange = useCallback((slideId: string, content: string) => {
    setSlides((prev) =>
      prev.map((slide) =>
        slide.id === slideId ? { ...slide, content } : slide
      )
    );
    setIsDirty(true);
    // Mark that a thumbnail will need updating — autosave will persist it.
    // We intentionally don't schedule a fixed timer here; thumbnail
    // generation/persistence is handled on autosave completion or on
    // slide-switch to avoid duplicate saves and timing races.
    if (!uiThumbsEnabled) {
      try {
        dirtyThumbRef.current = true;
      } catch (err) {
        console.warn('Failed to mark thumbnail dirty:', err);
      }
    }
  }, [uiThumbsEnabled]);

  const handleSlideBackgroundColorChange = useCallback((color: string) => {
    if (!activeSlideId) return;
    
    setSlides((prev) => {
      const updated = prev.map((slide) => 
        slide.id === activeSlideId ? { ...slide, backgroundColor: color } : slide
      );

      pendingBackgroundColorSaveSlidesRef.current = updated;
      return updated;
    });
    setIsDirty(true);

    // Debounced persist: avoid network churn while dragging the picker, but ensure changes save quickly.
    if (backgroundColorPersistTimerRef.current) {
      window.clearTimeout(backgroundColorPersistTimerRef.current);
    }
    backgroundColorPersistTimerRef.current = window.setTimeout(() => {
      const nextSlides = pendingBackgroundColorSaveSlidesRef.current;
      pendingBackgroundColorSaveSlidesRef.current = null;
      backgroundColorPersistTimerRef.current = null;
      if (nextSlides) {
        saveSlides(nextSlides, { skipThumbnail: true });
      }
    }, 650);
    
    // Regenerate thumbnail with new background color
    if (projectId && activeSlideId && !uiThumbsEnabled) {
      if (backgroundColorSaveTimerRef.current) {
        window.clearTimeout(backgroundColorSaveTimerRef.current);
      }

      backgroundColorSaveTimerRef.current = window.setTimeout(() => {
        const width = 1920;
        const height = 1080;
        // Get the updated slide to retrieve the new backgroundColor
        setSlides((currentSlides) => {
          const slide = currentSlides.find((s) => s.id === activeSlideId);
          const bgColor = slide?.backgroundColor || color;
          if (shouldSkipThumbnailForSlide(slide)) {
            return currentSlides;
          }

          // Check if thumbnail generation is already in progress for this slide
          if (inflightThumbnailsRef.current.has(activeSlideId)) {
            console.log('Thumbnail generation already in progress for', activeSlideId);
            return currentSlides;
          }

          inflightThumbnailsRef.current.add(activeSlideId);
          
          saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
            if (!thumbnailUrl) return;
            
            void waitForThumbnailReady(thumbnailUrl)
              .then((readyUrl) => {
                applyThumbnailUpdate(activeSlideId, readyUrl);
              })
              .catch((error) => console.warn("Thumbnail not ready after color change:", error))
              .finally(() => {
                inflightThumbnailsRef.current.delete(activeSlideId);
              });
          }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch((e) => {
            console.warn('Failed to save thumbnail after color change:', e);
            inflightThumbnailsRef.current.delete(activeSlideId);
          });
          
          return currentSlides;
        });

        backgroundColorSaveTimerRef.current = null;
      }, 450);
    }
  }, [activeSlideId, projectId, uiThumbsEnabled, shouldSkipThumbnailForSlide, saveSlides, applyThumbnailUpdate]);

  // Debounced auto-save of slide content to backend when edits occur.
  useEffect(() => {
    if (!isDirty) return;

    autosaveTimerRef.current = setTimeout(() => {
      // Persist the current slides array (including edited content), but
      // skip the post-save thumbnail generation — we'll handle thumbnail
      // persistence once here if a thumbnail changed during the edit period.
      (async () => {
        try {
          await saveSlides(slides, { skipThumbnail: true });

          // If a thumbnail was generated/changed during this edit window,
          // persist that change once now.
            if (!uiThumbsEnabled && dirtyThumbRef.current && projectId && activeSlideId) {
              try {
                const width = 1920;
                const height = 1080;
              // Generate a thumbnail for the active slide and persist the slide
              // update with the new thumbnail URL once.
              const slide = slides.find((s) => s.id === activeSlideId);
              if (shouldSkipThumbnailForSlide(slide)) {
                dirtyThumbRef.current = false;
                return;
              }
              const bgColor = slide?.backgroundColor || '#101112';
              let thumbnailUpdatePromise: Promise<void> | null = null;

              // Check if thumbnail generation is already in progress for this slide
              if (inflightThumbnailsRef.current.has(activeSlideId)) {
                console.log('Thumbnail generation already in progress for', activeSlideId);
                dirtyThumbRef.current = false;
                return;
              }

              inflightThumbnailsRef.current.add(activeSlideId);

              await saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                if (!thumbnailUrl) {
                  thumbnailUpdatePromise = null;
                  return;
                }

                thumbnailUpdatePromise = waitForThumbnailReady(thumbnailUrl)
                  .then((readyUrl) => {
                    applyThumbnailUpdate(activeSlideId, readyUrl);
                  })
                  .catch((error) => {
                    console.warn('Thumbnail not ready during autosave:', error);
                  })
                  .finally(() => {
                    inflightThumbnailsRef.current.delete(activeSlideId);
                  });
              }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage });

              if (thumbnailUpdatePromise) {
                await thumbnailUpdatePromise;
              }
            } catch (err) {
              console.warn('Autosave thumbnail persist failed:', err);
              if (activeSlideId) {
                inflightThumbnailsRef.current.delete(activeSlideId);
              }
            } finally {
              dirtyThumbRef.current = false;
            }
          }
        } catch (err) {
          console.warn('Autosave failed:', err);
        }
      })();
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    isDirty,
    slides,
    saveSlides,
    projectId,
    activeSlideId,
    uiThumbsEnabled,
    shouldSkipThumbnailForSlide,
    applyThumbnailUpdate,
  ]);

  const handleExport = useCallback(() => {
    notify("info", "Export feature coming soon");
    // TODO: Implement PDF export with jsPDF
  }, []);

  const uploadPdfForSlidesImport = useCallback(
    async (file: File) => {
      if (!projectId) return;

      try {
        setPdfImportStatus("uploading");
        setPdfImportProgress(0);
        setPdfImportDetail(null);

        const presignRes = await apiFetch<{ uploadUrl: string; key: string }>(GALLERY_UPLOAD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            fileName: file.name,
            contentType: "application/pdf",
            galleryName: file.name,
            importToSlides: true,
            // Pass the active version ID so the import targets the correct version
            versionId: activeVersionId || undefined,
          }),
        });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignRes.uploadUrl);
          xhr.setRequestHeader("Content-Type", "application/pdf");
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              setPdfImportProgress(Math.round((evt.loaded / evt.total) * 100));
            }
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed with status ${xhr.status}`));
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(file);
        });

        setPdfImportStatus("processing");
        setPdfImportProgress(0);
        setPdfImportDetail({
          stage: "processing",
          currentPage: 0,
          totalPages: 0,
          percent: 0,
        });
        notify("info", "PDF uploaded. Importing slides…");
      } catch (err) {
        console.error("PDF import upload failed:", err);
        setPdfImportStatus("idle");
        setPdfImportProgress(0);
        setPdfImportDetail(null);
        notify("error", "Failed to import PDF");
      }
    },
    [projectId, activeVersionId]
  );

  const handlePdfImportFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      e.target.value = "";
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        notify("error", "Please select a PDF file");
        return;
      }
      void uploadPdfForSlidesImport(file);
    },
    [uploadPdfForSlidesImport]
  );

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      // If in fit mode (0), jump to 50%, otherwise increment
      if (prev === 0) return 50;
      return Math.min(prev + 25, 300);
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      // If in fit mode (0), stay in fit mode
      if (prev === 0) return 0;
      // If at minimum percentage, go to fit mode
      if (prev <= 25) return 0;
      return Math.max(prev - 25, 25);
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    // 0 means "fit to view" mode
    setZoom(0);
  }, []);

  const handleSetZoom = useCallback((level: number) => {
    // Allow 0 for fit mode, otherwise clamp to valid percentage range
    if (level === 0) {
      setZoom(0);
    } else {
      setZoom(Math.max(25, Math.min(level, 300)));
    }
  }, []);

  const activeSlide = slides.find((s) => s.id === activeSlideId);
  const isImportingPdf = pdfImportStatus !== "idle";
  const importStatusText =
    pdfImportStatus === "uploading"
      ? `Uploading PDF… ${Math.max(0, Math.min(100, Math.round(pdfImportProgress)))}%`
      : pdfImportDetail?.totalPages
        ? `Importing slides… ${Math.min(pdfImportDetail.currentPage, pdfImportDetail.totalPages)}/${pdfImportDetail.totalPages}`
        : "Importing slides…";

  // Handlers for quick actions from version dropdown context menu
  const handleQuickRename = useCallback((version: { versionId: string; name: string }) => {
    setVersionToRename({ versionId: version.versionId, name: version.name });
    setRenameVersionOpen(true);
  }, []);

  const handleQuickDuplicate = useCallback(async (versionId: string) => {
    const version = versions.find((v) => v.versionId === versionId);
    const newVersion = await duplicateVersion(versionId, version ? `${version.name} (Copy)` : undefined);
    if (newVersion) {
      switchVersion(newVersion.versionId);
    }
  }, [versions, duplicateVersion, switchVersion]);

  const handleQuickDelete = useCallback((versionId: string) => {
    setVersionToDelete(versionId);
    setDeleteVersionConfirmOpen(true);
  }, []);

  const handleConfirmDeleteVersion = useCallback(async () => {
    if (!versionToDelete) return;
    await deleteVersion(versionToDelete);
    setDeleteVersionConfirmOpen(false);
    setVersionToDelete(null);
  }, [versionToDelete, deleteVersion]);

  const handleRenameSubmit = useCallback(async (newName: string) => {
    if (!versionToRename || !newName.trim()) return;
    await updateVersion(versionToRename.versionId, { name: newName.trim() });
    setRenameVersionOpen(false);
    setVersionToRename(null);
  }, [versionToRename, updateVersion]);

  // Version dropdown for the toolbar
  const versionDropdown = useMemo(() => (
    <DeckVersionDropdown
      versions={versions}
      activeVersion={activeVersion}
      onVersionSelect={switchVersion}
      onManageVersions={() => setVersionsModalOpen(true)}
      onCreateVersion={async () => {
        // Create an empty version - users can duplicate via Manage Versions if needed
        const newVersion = await createVersion({ name: `Version ${versions.length + 1}` });
        if (newVersion) {
          switchVersion(newVersion.versionId);
        }
      }}
      canManageVersions={canManageVersions}
      onRenameVersion={handleQuickRename}
      onDuplicateVersion={handleQuickDuplicate}
      onDeleteVersion={handleQuickDelete}
      onSetDefault={setDefaultVersion}
      onSetClientDefault={setClientDefaultVersion}
    />
  ), [versions, activeVersion, switchVersion, createVersion, canManageVersions, handleQuickRename, handleQuickDuplicate, handleQuickDelete, setDefaultVersion, setClientDefaultVersion]);

  if (!projectId) {
    return <div>No project ID provided</div>;
  }

  const handlePreview = () => {
    if (!activeSlideId) return;
    const title = activeProject?.title ?? "";
    const path = getProjectDashboardPath(projectId, title, "/slides/present");
    navigate(`${path}?slideId=${encodeURIComponent(activeSlideId)}`);
  };

  return (
    <ProjectPageLayout
      projectId={projectId}
      header={
        <ProjectHeader
          activeProject={activeProject}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      }
      mainClassName="slides-full-width-main"
    >
      <input
        ref={pdfImportInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handlePdfImportFileSelected}
        style={{ display: "none" }}
      />
      <ConfirmModal
        isOpen={deleteSelectedOpen}
        onRequestClose={() => {
          setDeleteSelectedOpen(false);
          setPendingDeleteSlideIds([]);
        }}
        onConfirm={() => {
          performDeleteSlides(pendingDeleteSlideIds);
          setDeleteSelectedOpen(false);
          setPendingDeleteSlideIds([]);
        }}
        message={
          pendingDeleteSlideIds.length === 1
            ? "Delete this slide? This cannot be undone."
            : `Delete ${pendingDeleteSlideIds.length} slides? This cannot be undone.`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
      <DeckVersionsModal
        isOpen={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        versions={versions}
        activeVersionId={activeVersionId}
        onSwitchVersion={switchVersion}
        onCreateVersion={async (options) => {
          // Do not pass slides - if user wants to duplicate, they select via "Duplicate from" dropdown
          // which sets duplicateFromVersionId and the backend handles cloning
          const newVersion = await createVersion(options);
          if (newVersion) {
            switchVersion(newVersion.versionId);
          }
          return newVersion;
        }}
        onUpdateVersion={updateVersion}
        onDeleteVersion={deleteVersion}
        onDuplicateVersion={duplicateVersion}
        onSetDefault={setDefaultVersion}
        onSetClientDefault={setClientDefaultVersion}
      />
      {/* Quick rename modal from dropdown context menu */}
      <PromptModal
        isOpen={renameVersionOpen}
        onRequestClose={() => {
          setRenameVersionOpen(false);
          setVersionToRename(null);
        }}
        onSubmit={handleRenameSubmit}
        message="Rename version"
        defaultValue={versionToRename?.name ?? ""}
        submitLabel="Rename"
        cancelLabel="Cancel"
      />
      {/* Quick delete confirm from dropdown context menu */}
      <ConfirmModal
        isOpen={deleteVersionConfirmOpen}
        onRequestClose={() => {
          setDeleteVersionConfirmOpen(false);
          setVersionToDelete(null);
        }}
        onConfirm={handleConfirmDeleteVersion}
        message="Delete this version? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
      {filesOpen && (
        <FileManagerComponent
          isOpen={filesOpen}
          onRequestClose={() => setFilesOpen(false)}
          showTrigger={false}
          folder="uploads"
        />
      )}
      <QuickLinksComponent ref={quickLinksRef} hideTrigger />
      
      <div className="slides-shell">
        {isImportingPdf && (
          <div className="slides-import-banner" role="status" aria-live="polite">
            <div className="slides-import-banner__text">{importStatusText}</div>
            <progress
              className="slides-import-banner__progress"
              max={100}
              value={
                pdfImportStatus === "uploading" || pdfImportDetail?.totalPages
                  ? Math.max(0, Math.min(100, Math.round(pdfImportProgress)))
                  : undefined
              }
            />
          </div>
        )}
        <div className="slides-toolbar-shell" ref={toolbarPortalRef}>
          {!activeSlide && (
            <SlidesEmptyToolbar
              onNewSlide={handleNewSlide}
              onImportPdf={handleImportPdfClick}
              isImportingPdf={isImportingPdf}
            />
          )}
        </div>
        <DropdownProvider>
          <div className="slides-workspace">
            <SlidesSidebar
              slides={slides}
              activeSlideId={activeSlideId}
              onSlideSelect={handleSlideSelect}
              onReorderSlides={handleReorderSlides}
              projectId={projectId || ""}
              onDuplicateSlide={handleDuplicateSlide}
              onDeleteSlide={handleDeleteSlide}
              selectedSlideIds={selectedSlideIds}
              onSelectedSlideIdsChange={setSelectedSlideIds}
              onRequestDeleteSelected={requestDeleteSlides}
              onRenameSlide={(slideId, title) => {
                setSlides((prev) => {
                  const updated = prev.map((s) => (s.id === slideId ? { ...s, title } : s));
                  setIsDirty(true);
                  saveSlides(updated, { skipThumbnail: true });
                  return updated;
                });
              }}
              onExportSlide={handleExport}
            />

            <section className="slides-main" aria-live="polite">
              <div className="slides-main__content">
                {activeSlide ? (
                <SlideEditor
                  projectId={projectId}
                  slide={activeSlide}
                  deckName={activeProject?.title}
                  slideNumber={activeSlide?.order}
                  onContentChange={(content) =>
                    handleContentChange(activeSlide.id, content)
                  }
                  onSlideBackgroundColorChange={handleSlideBackgroundColorChange}
                  isSaving={isSaving}
                  isDirty={isDirty}
                  onPreview={handlePreview}
                  onImportPdf={handleImportPdfClick}
                  isImportingPdf={isImportingPdf}
                  pdfImportStatus={pdfImportStatus}
                  importProgress={pdfImportProgress}
                  importCurrentPage={pdfImportDetail?.currentPage}
                  importTotalPages={pdfImportDetail?.totalPages}
                  zoom={zoom}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onResetZoom={handleResetZoom}
                  onSetZoom={handleSetZoom}
                  onNewSlide={handleNewSlide}
                  onCreateSlidesWithLayout={handleCreateSlidesWithLayout}
                  toolbarPortalContainer={toolbarPortalNode}
                  versionDropdown={versionDropdown}
                />
                ) : (
                  <div className="slides-main__empty">
                    {slides.length === 0 ? "No slides yet" : "No slide selected"}
                  </div>
                )}
              </div>
            </section>
          </div>
        </DropdownProvider>
      </div>
    </ProjectPageLayout>
  );
};

export default SlidesPage;
