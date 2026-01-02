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
import OffscreenSlideRenderer, {
  type OffscreenSlideCaptureOptions,
  type OffscreenSlideRendererRef,
} from "./components/OffscreenSlideRenderer";
import { useDeckVersions } from "./hooks/useDeckVersions";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { notify } from "@/shared/ui/ToastNotifications";
import { ConfirmModal } from "@/shared/ui";
import { v4 as uuidv4 } from "uuid";
import { disconnectAllSlideProviders } from "./lib/yjs";
import { saveSlideThumb } from "./lib/thumbnails";
import { isUiThumbsEnabled } from "./lib/featureFlags";
import { isLexicalContentEffectivelyEmpty } from "./lib/lexicalContent";
import { exportAndDownloadSlideSvg, exportAndDownloadSlidePng } from "./lib/slideExport";
import { generatePdfFromImages } from "./lib/slideExport";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { apiFetch, GALLERY_UPLOAD_URL, getFileUrl } from "@/shared/utils/api";
import { DropdownProvider } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import { saveAs } from "file-saver";
import "./slides.css";

const MAX_THUMBNAIL_ATTEMPTS = 5;

type PdfExportPreset = "screen" | "high" | "print";

const PDF_EXPORT_PRESETS: Record<PdfExportPreset, { label: string; captureOptions: OffscreenSlideCaptureOptions }> = {
  screen: {
    label: "PDF (Screen)",
    captureOptions: { imageFormat: "jpeg", pixelRatio: 1, jpegQuality: 0.82 },
  },
  high: {
    label: "PDF (High)",
    captureOptions: { imageFormat: "jpeg", pixelRatio: 2, jpegQuality: 0.9 },
  },
  print: {
    label: "PDF (Print)",
    captureOptions: { imageFormat: "jpeg", pixelRatio: 3, jpegQuality: 0.92 },
  },
};

type PdfImportDetail = {
  stage: string;
  currentPage: number;
  totalPages: number;
  percent: number;
};

async function waitForThumbnailReady(url: string, maxAttempts = MAX_THUMBNAIL_ATTEMPTS): Promise<string> {
  if (!url) {
    return url;
  }

  if (typeof window === "undefined" || typeof Image === "undefined") {
    return url;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptUrl =
      attempt === 0
        ? url
        : `${url}${url.includes("?") ? "&" : "?"}cache=${Date.now()}-${attempt}`;

    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        const cleanup = () => {
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

      return attemptUrl;
    } catch (error) {
      lastError = error;
      const delay = Math.min(1500, 250 * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Thumbnail did not become ready");
}

/**
 * Strip query parameters from a thumbnail URL to get the base path for comparison.
 * This allows comparing thumbnails ignoring cache-buster timestamps.
 */
function getBaseThumbnailUrl(thumb: string | undefined): string {
  if (!thumb) return "";
  const idx = thumb.indexOf("?");
  return idx === -1 ? thumb : thumb.substring(0, idx);
}

/**
 * Extract the timestamp from a thumbnail filename.
 * Thumbnail filenames follow the pattern: slides/{projectId}/{slideId}-{timestamp}.png
 * Returns 0 if no valid timestamp is found.
 */
function getThumbnailTimestamp(thumb: string | undefined): number {
  if (!thumb) return 0;
  const base = getBaseThumbnailUrl(thumb);
  // Match pattern like "slideId-1735689600000.png"
  const match = base.match(/-(\d{13,})\.png$/);
  if (match && match[1]) {
    const ts = parseInt(match[1], 10);
    return Number.isNaN(ts) ? 0 : ts;
  }
  return 0;
}

/**
 * Compare two slides to determine if they represent the same content.
 * Thumbnails are compared by timestamp - if the existing is newer, they're equivalent.
 * Returns true if they represent the same content (no update needed).
 */
function slidesAreEquivalent(a: Slide, b: Slide): boolean {
  // Compare all fields except thumbnail first
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { thumbnail: _aThumb, ...aRest } = a;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { thumbnail: _bThumb, ...bRest } = b;
  
  if (JSON.stringify(aRest) !== JSON.stringify(bRest)) {
    return false;
  }

  // If non-thumbnail content is the same, check thumbnails
  const aThumbBase = getBaseThumbnailUrl(a.thumbnail);
  const bThumbBase = getBaseThumbnailUrl(b.thumbnail);
  
  // Same base URL (or both empty) = equivalent
  if (aThumbBase === bThumbBase) return true;
  
  // Different base URLs - check timestamps
  // If 'a' (existing) has a newer timestamp than 'b' (incoming), 
  // consider them equivalent to avoid reverting to older thumbnail
  const aTs = getThumbnailTimestamp(a.thumbnail);
  const bTs = getThumbnailTimestamp(b.thumbnail);
  
  if (aTs > 0 && bTs > 0 && aTs >= bTs) {
    // Existing is same or newer - no update needed
    return true;
  }
  
  return false;
}

/**
 * Determine which thumbnail to keep when merging incoming slide data.
 * Prefers the thumbnail with the newer timestamp embedded in the filename,
 * to prevent older WS echoes from overwriting newer locally-generated thumbnails.
 */
function pickNewerThumbnail(existing: string | undefined, incoming: string | undefined): string | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  
  const existingTs = getThumbnailTimestamp(existing);
  const incomingTs = getThumbnailTimestamp(incoming);
  
  // If both have timestamps, pick the newer one
  if (existingTs > 0 && incomingTs > 0) {
    const chosen = existingTs >= incomingTs ? existing : incoming;
    if (existingTs !== incomingTs) {
      console.log(`[Thumbnail] Picking ${existingTs >= incomingTs ? 'existing' : 'incoming'} thumbnail (existing: ${existingTs}, incoming: ${incomingTs})`);
    }
    return chosen;
  }
  
  // If same base URL (ignoring query params), keep existing to avoid flicker
  const existingBase = getBaseThumbnailUrl(existing);
  const incomingBase = getBaseThumbnailUrl(incoming);
  if (existingBase === incomingBase) {
    return existing;
  }
  
  // Otherwise prefer incoming (it may be a genuinely new thumbnail)
  return incoming;
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
  } = useData();

  const { ws } = useSocket();

  // Project palette - derive accent color from project color/cover
  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color as string | undefined });

  // Deck versions management
  const {
    versions,
    activeVersion,
    createVersion,
    updateVersion,
    deleteVersion,
    duplicateVersion,
    setDefaultVersion,
    setClientDefaultVersion,
    canManageVersions,
    switchVersion,
  } = useDeckVersions({ projectId: projectId || "" });

  const [versionsModalOpen, setVersionsModalOpen] = useState(false);

  // Computed active version ID for props
  const activeVersionId = activeVersion?.versionId ?? null;

  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  const [scrollToSlideId, setScrollToSlideId] = useState<string | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [pendingDeleteSlideIds, setPendingDeleteSlideIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const offscreenRendererRef = useRef<OffscreenSlideRendererRef>(null);
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
  // Track recently updated thumbnails to prevent WS echoes from reverting them.
  // Maps slideId -> { url, timestamp } of locally-generated thumbnails.
  const recentThumbnailsRef = useRef<Map<string, { url: string; timestamp: number }>>(new Map());
  const dirtySlideIdsRef = useRef<Set<string>>(new Set());
  const slideRevisionRef = useRef<Map<string, number>>(new Map());
  const pendingInitialSlideIdRef = useRef<string | null>(
    typeof (location.state as { activeSlideId?: unknown } | null | undefined)?.activeSlideId === "string"
      ? ((location.state as { activeSlideId?: unknown }).activeSlideId as string)
      : null
  );

  const markSlidesDirty = useCallback((slideIds: string | string[]) => {
    const ids = Array.isArray(slideIds) ? slideIds : [slideIds];
    for (const id of ids) {
      if (id) dirtySlideIdsRef.current.add(id);
    }
  }, []);

  const nextSlideRevision = useCallback((slideId: string, atLeast?: number) => {
    const now = Date.now();
    const prev = slideRevisionRef.current.get(slideId) ?? 0;
    const min = typeof atLeast === "number" && Number.isFinite(atLeast) ? atLeast : 0;
    const next = Math.max(now, prev + 1, min);
    slideRevisionRef.current.set(slideId, next);
    return next;
  }, []);

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

  // Register a recently generated thumbnail to prevent WS echoes from reverting it
  const registerRecentThumbnail = useCallback((slideId: string, thumbnailUrl: string) => {
    recentThumbnailsRef.current.set(slideId, { url: thumbnailUrl, timestamp: Date.now() });
    // Clean up old entries after the window expires
    setTimeout(() => {
      const entry = recentThumbnailsRef.current.get(slideId);
      if (entry && Date.now() - entry.timestamp >= 10000) {
        recentThumbnailsRef.current.delete(slideId);
      }
    }, 11000);
  }, []);

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

  useEffect(() => {
    for (const slide of slides) {
      const rev = slide?.revision;
      if (typeof rev === "number" && Number.isFinite(rev)) {
        const prev = slideRevisionRef.current.get(slide.id) ?? 0;
        if (rev > prev) slideRevisionRef.current.set(slide.id, rev);
      }
    }
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
      };

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

      if (Array.isArray(data.slides)) {
        const sortedSlides = [...data.slides].sort((a, b) => (a.order || 0) - (b.order || 0));
        const slidesWithDisplayThumbnails = sortedSlides.map((slide) => ({
          ...slide,
          thumbnail: (!uiThumbsEnabled && slide.thumbnail) ? makeUiThumbnail(slide.thumbnail) : slide.thumbnail,
        }));

        setSlides(slidesWithDisplayThumbnails);

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
  }, [projectId, makeUiThumbnail, uiThumbsEnabled]);

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
        
        // Use improved comparison that ignores thumbnail differences
        const sameContent =
          sameLength &&
          prevSlides.every((slide, index) => {
            const incoming = slidesWithDisplayThumbnails[index];
            // Slides must have same ID at same position
            if (slide.id !== incoming.id) return false;
            return slidesAreEquivalent(slide, incoming);
          });
        
        if (sameContent) {
          return prevSlides;
        }

        // Merge incoming slides while preserving newer local thumbnails.
        // This prevents older WS echoes from reverting thumbnails that were
        // generated locally after the broadcast.
        const now = Date.now();
        const RECENT_THUMBNAIL_WINDOW_MS = 10000; // 10 seconds
        
        const mergedSlides = slidesWithDisplayThumbnails.map((incoming) => {
          const existing = prevSlides.find((s) => s.id === incoming.id);
          if (!existing) return incoming;

          const existingRev =
            typeof existing.revision === "number" && Number.isFinite(existing.revision) ? existing.revision : null;
          const incomingRev =
            typeof incoming.revision === "number" && Number.isFinite(incoming.revision) ? incoming.revision : null;

          const base =
            incomingRev !== null && (existingRev === null || incomingRev >= existingRev) ? incoming : existing;

          const existingThumbRev =
            typeof existing.thumbRevision === "number" && Number.isFinite(existing.thumbRevision)
              ? existing.thumbRevision
              : null;
          const incomingThumbRev =
            typeof incoming.thumbRevision === "number" && Number.isFinite(incoming.thumbRevision)
              ? incoming.thumbRevision
              : null;

          if (incomingThumbRev !== null || existingThumbRev !== null) {
            if (incomingThumbRev !== null && (existingThumbRev === null || incomingThumbRev >= existingThumbRev)) {
              return base === incoming
                ? incoming
                : { ...base, thumbnail: incoming.thumbnail, thumbRevision: incoming.thumbRevision };
            }
            return base === existing
              ? existing
              : { ...base, thumbnail: existing.thumbnail, thumbRevision: existing.thumbRevision };
          }

          // Legacy fallback: preserve locally-generated thumbnails for a short window,
          // then pick by filename timestamp to avoid WS echoes reverting thumbnails.
          const recentThumb = recentThumbnailsRef.current.get(incoming.id);
          if (recentThumb && now - recentThumb.timestamp < RECENT_THUMBNAIL_WINDOW_MS) {
            const incomingBase = getBaseThumbnailUrl(incoming.thumbnail);
            const recentBase = getBaseThumbnailUrl(recentThumb.url);
            if (incomingBase !== recentBase) {
              console.log(
                `[Thumbnail] Preserving recent thumbnail for slide ${incoming.id} (generated ${now - recentThumb.timestamp}ms ago)`
              );
              return { ...base, thumbnail: recentThumb.url };
            }
          }

          const chosenThumbnail = pickNewerThumbnail(existing.thumbnail, incoming.thumbnail);
          return { ...base, thumbnail: chosenThumbnail };
        });
        
        return mergedSlides;
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
  }, [projectId, activeSlideId, uiThumbsEnabled, slides, shouldSkipThumbnailForSlide]);

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

    // Delay to allow the editor to fully render AND images to load from CDN.
    // For slides with picture frames containing remote images, we need extra time
    // to ensure images are fully loaded before thumbnail capture.
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
            const displayUrl = makeUiThumbnail(readyUrl);
            registerRecentThumbnail(activeSlideId, displayUrl);
            setSlides((prev) => {
              const updated = prev.map((s) =>
                s.id === activeSlideId
                  ? { ...s, thumbnail: displayUrl }
                  : s
              );
              return updated;
            });
            dirtyThumbRef.current = true;
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
    }, 2500); // Wait for editor + CDN images to fully render

    return () => clearTimeout(timer);
  }, [projectId, activeSlideId, slides, uiThumbsEnabled, shouldSkipThumbnailForSlide, makeUiThumbnail, registerRecentThumbnail]);

  const persistSlidesArray = useCallback(
    async (slidesToPersist: Slide[]) => {
      if (!projectId) return;
      if (activeVersionId && activeVersion) {
        await updateVersion(activeVersionId, { slides: slidesToPersist });
        return;
      }
      await updateProjectFields(projectId, { slides: slidesToPersist });
    },
    [projectId, activeVersionId, activeVersion, updateVersion, updateProjectFields]
  );

  const broadcastSlidesArray = useCallback(
    (slidesToBroadcast: Slide[]) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !projectId) return;
      ws.send(
        JSON.stringify({
          action: "projectUpdated",
          projectId,
          fields: { slides: slidesToBroadcast },
          conversationId: `project#${projectId}`,
          username: userName || "Someone",
          senderId: userId,
          ...(activeVersionId && { versionId: activeVersionId }),
        })
      );
    },
    [ws, projectId, userName, userId, activeVersionId]
  );

  const persistThumbnailForSlide = useCallback(
    (slideId: string, expectedRevision: number, displayUrl: string) => {
      const latest = slideRevisionRef.current.get(slideId);
      if (latest !== expectedRevision) {
        return;
      }

      setSlides((prev) => {
        const current = prev.find((s) => s.id === slideId);
        if (!current) return prev;
        if (typeof current.revision === "number" && current.revision !== expectedRevision) {
          return prev;
        }

        const updated = prev.map((s) =>
          s.id === slideId ? { ...s, thumbnail: displayUrl, thumbRevision: expectedRevision } : s
        );
        const persisted = updated.map((s) => ({
          ...s,
          thumbnail: sanitizeThumbnailForPersist(s.thumbnail),
        }));

        persistSlidesArray(persisted)
          .then(() => broadcastSlidesArray(persisted))
          .catch((e) => console.warn("Failed to persist thumbnail update:", e));

        return updated;
      });
    },
    [persistSlidesArray, broadcastSlidesArray, sanitizeThumbnailForPersist]
  );

  const saveSlides = useCallback(
    async (slidesToSave: Slide[], options?: { skipThumbnail?: boolean }) => {
      if (!projectId) return;

      setIsSaving(true);
      try {
        const dirtyIds = dirtySlideIdsRef.current;
        let didBumpRevision = false;
        const slidesWithRevisions = slidesToSave.map((slide) => {
          if (!slide?.id || !dirtyIds.has(slide.id)) {
            return slide;
          }
          didBumpRevision = true;
          return { ...slide, revision: nextSlideRevision(slide.id, slide.revision) };
        });
        if (didBumpRevision) {
          setSlides(slidesWithRevisions);
        }

        const cleanedSlides = slidesWithRevisions.map((slide) =>
          shouldSkipThumbnailForSlide(slide) ? { ...slide, thumbnail: undefined } : slide
        );

        const persistedSlides = cleanedSlides.map((slide) => ({
          ...slide,
          thumbnail: sanitizeThumbnailForPersist(slide.thumbnail),
        }));

        await persistSlidesArray(persistedSlides);
        broadcastSlidesArray(persistedSlides);

        for (const slide of slidesWithRevisions) {
          if (slide?.id) dirtyIds.delete(slide.id);
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
              const expectedRevision =
                slidesWithRevisions.find((s) => s.id === activeSlideId)?.revision ??
                slideRevisionRef.current.get(activeSlideId);
              if (typeof expectedRevision !== "number" || !Number.isFinite(expectedRevision)) {
                return;
              }
              // Small delay to ensure DOM is updated before capturing thumbnail
              setTimeout(() => {
                // Generate and persist thumbnail; update local state and then persist
                const slide = slides.find((s) => s.id === activeSlideId);
                if (shouldSkipThumbnailForSlide(slide)) {
                  return;
                }
                const bgColor = slide?.backgroundColor;
                saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                  if (!thumbnailUrl) {
                    return;
                  }

                  void waitForThumbnailReady(thumbnailUrl)
                    .then((readyUrl) => {
                      const displayUrl = makeUiThumbnail(readyUrl);
                      registerRecentThumbnail(activeSlideId, displayUrl);
                      persistThumbnailForSlide(activeSlideId, expectedRevision, displayUrl);
                    })
                    .catch((error) => {
                      console.warn("Thumbnail not ready after save:", error);
                    });
                }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch((e) => {
                  console.warn('Failed to save thumbnail after save:', e);
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
    activeSlideId,
    uiThumbsEnabled,
    makeUiThumbnail,
    sanitizeThumbnailForPersist,
    shouldSkipThumbnailForSlide,
    persistSlidesArray,
    broadcastSlidesArray,
    persistThumbnailForSlide,
    registerRecentThumbnail,
    nextSlideRevision,
    slides,
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
    setScrollToSlideId(newSlide.id);
    setIsDirty(true);
    markSlidesDirty(newSlide.id);

    // Clear scrollToSlideId after a short delay to allow re-triggering
    setTimeout(() => setScrollToSlideId(null), 500);

    // Save to backend
    saveSlides(updatedSlides);
  }, [slides, saveSlides, markSlidesDirty]);

  const handleSlideSelect = useCallback(
    (slideId: string) => {
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
        const bgColor = slide?.backgroundColor;
        saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
          if (!thumbnailUrl) {
            return;
          }

          void waitForThumbnailReady(thumbnailUrl)
            .then((readyUrl) => {
              const displayUrl = makeUiThumbnail(readyUrl);
              registerRecentThumbnail(activeSlideId, displayUrl);
              setSlides((prev) => {
                const updated = prev.map((slide) =>
                  slide.id === activeSlideId
                    ? { ...slide, thumbnail: displayUrl }
                    : slide
                );
                return updated;
              });
              dirtyThumbRef.current = true;
            })
            .catch((error) => {
              console.warn("Thumbnail not ready when switching slides:", error);
            });
        }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch((e) => console.warn("Failed to save thumbnail on slide change:", e));
      }

      setActiveSlideId(slideId);
    },
  [projectId, activeSlideId, uiThumbsEnabled, makeUiThumbnail, slides, shouldSkipThumbnailForSlide, registerRecentThumbnail]
  );

  const handleReorderSlides = useCallback((reorderedSlides: Slide[]) => {
    setSlides(reorderedSlides);
    setIsDirty(true);
    markSlidesDirty(reorderedSlides.map((s) => s.id));
    saveSlides(reorderedSlides);
  }, [saveSlides, markSlidesDirty]);

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
    markSlidesDirty(duplicatedSlide.id);

    saveSlides(updatedSlides);
    notify("success", "Slide duplicated");
  }, [slides, activeSlideId, saveSlides, markSlidesDirty]);

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
      markSlidesDirty(reorderedSlides.map((s) => s.id));
      saveSlides(reorderedSlides);

      notify("success", uniqueIds.length === 1 ? "Slide deleted" : `Deleted ${uniqueIds.length} slides`);
    },
    [slides, activeSlideId, saveSlides, markSlidesDirty]
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
    markSlidesDirty(slideId);
    // Mark that a thumbnail will need updating - autosave will persist it.
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
  }, [uiThumbsEnabled, markSlidesDirty]);

  const handleSlideBackgroundColorChange = useCallback((color: string) => {
    if (!activeSlideId) return;
    markSlidesDirty(activeSlideId);
    
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
        const slideId = activeSlideId;
        const projId = projectId;
        const bgColorFallback = color;
        (async () => {
          await saveSlides(nextSlides, { skipThumbnail: true });

          if (!projId || !slideId || uiThumbsEnabled) return;
          const expectedRevision = slideRevisionRef.current.get(slideId);
          if (typeof expectedRevision !== "number" || !Number.isFinite(expectedRevision)) {
            return;
          }

          const slide = nextSlides.find((s) => s.id === slideId);
          if (shouldSkipThumbnailForSlide(slide)) {
            return;
          }

          const width = 1920;
          const height = 1080;
          const bgColor = slide?.backgroundColor || bgColorFallback || "#101112";

          setTimeout(() => {
            saveSlideThumb(
              projId,
              slideId,
              (thumbnailUrl) => {
                if (!thumbnailUrl) return;
                void waitForThumbnailReady(thumbnailUrl)
                  .then((readyUrl) => {
                    const displayUrl = makeUiThumbnail(readyUrl);
                    registerRecentThumbnail(slideId, displayUrl);
                    persistThumbnailForSlide(slideId, expectedRevision, displayUrl);
                  })
                  .catch((error) => console.warn("Thumbnail not ready after color change:", error));
              },
              { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }
            ).catch((e) => console.warn("Failed to save thumbnail after color change:", e));
          }, 100);
        })().catch((e) => console.warn("Background color persist failed:", e));
      }
    }, 650);
  }, [activeSlideId, projectId, uiThumbsEnabled, makeUiThumbnail, shouldSkipThumbnailForSlide, saveSlides, markSlidesDirty, persistThumbnailForSlide, registerRecentThumbnail]);

  // Debounced auto-save of slide content to backend when edits occur.
  useEffect(() => {
    if (!isDirty) return;

    const t = setTimeout(() => {
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
              const expectedRevision = slideRevisionRef.current.get(activeSlideId);
              if (typeof expectedRevision !== "number" || !Number.isFinite(expectedRevision)) {
                dirtyThumbRef.current = false;
                return;
              }
              const bgColor = slide?.backgroundColor || '#101112';
              let thumbnailUpdatePromise: Promise<void> | null = null;

              await saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                if (!thumbnailUrl) {
                  thumbnailUpdatePromise = null;
                  return;
                }

                thumbnailUpdatePromise = waitForThumbnailReady(thumbnailUrl)
                  .then((readyUrl) => {
                    const displayUrl = makeUiThumbnail(readyUrl);
                    registerRecentThumbnail(activeSlideId, displayUrl);
                    persistThumbnailForSlide(activeSlideId, expectedRevision, displayUrl);
                  })
                  .catch((error) => {
                    console.warn('Thumbnail not ready during autosave:', error);
                  });
              }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage });

              if (thumbnailUpdatePromise) {
                await thumbnailUpdatePromise;
              }
            } catch (err) {
              console.warn('Autosave thumbnail persist failed:', err);
            } finally {
              dirtyThumbRef.current = false;
            }
          }
        } catch (err) {
          console.warn('Autosave failed:', err);
        }
      })();
    }, 1500);

    return () => clearTimeout(t);
  }, [
    isDirty,
    slides,
    saveSlides,
    projectId,
    activeSlideId,
    uiThumbsEnabled,
    makeUiThumbnail,
    shouldSkipThumbnailForSlide,
    registerRecentThumbnail,
    persistThumbnailForSlide,
  ]);

  // State for PDF export progress
  const [pdfExportStatus, setPdfExportStatus] = useState<"idle" | "exporting">("idle");
  const [pdfExportProgress, setPdfExportProgress] = useState<{ current: number; total: number } | null>(null);

  // Export single slide as SVG (Affinity-compatible; rasterized, no editable layers)
  const handleExportSlideSvg = useCallback(async (slideId: string) => {
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) {
      notify("error", "Slide not found");
      return;
    }

    notify("info", "Exporting slide as SVG (Affinity-compatible)...");
     
    const success = await exportAndDownloadSlideSvg(
      slideId,
      slide.title || `Slide ${slide.order + 1}`,
      slide.backgroundColor,
      true
    );

    if (success) {
      notify("success", "Slide exported as SVG");
    } else {
      notify("error", "Failed to export slide");
    }
  }, [slides]);

  // Export single slide as high-resolution PNG (universally compatible)
  const handleExportSlidePng = useCallback(async (slideId: string) => {
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) {
      notify("error", "Slide not found");
      return;
    }

    notify("info", "Exporting slide as PNG...");
    
    const success = await exportAndDownloadSlidePng(
      slideId,
      slide.title || `Slide ${slide.order + 1}`,
      slide.backgroundColor
    );

    if (success) {
      notify("success", "Slide exported as PNG");
    } else {
      notify("error", "Failed to export slide");
    }
  }, [slides]);

  // Export all slides as PDF using offscreen rendering
  const handleExportAllSlidesPdf = useCallback(async (preset: PdfExportPreset = "high") => {
    if (slides.length === 0) {
      notify("warning", "No slides to export");
      return;
    }

    if (!offscreenRendererRef.current) {
      notify("error", "Export renderer not ready");
      return;
    }

    setPdfExportStatus("exporting");
    setPdfExportProgress({ current: 0, total: slides.length });
    notify("info", `Exporting ${slides.length} slides as ${PDF_EXPORT_PRESETS[preset].label}...`);

    try {
      // Capture all slides using the offscreen renderer (no visible navigation)
      const slideImages = await offscreenRendererRef.current.captureAllSlides(
        slides,
        (current, total) => {
          setPdfExportProgress({ current, total });
        },
        PDF_EXPORT_PRESETS[preset].captureOptions
      );

      if (slideImages.length === 0) {
        notify("error", "No slides could be captured");
        return;
      }

      // Generate PDF from the captured images
      const projectName = (activeProject?.name as string) || "Presentation";
      const pdfBlob = await generatePdfFromImages(slideImages, projectName);

      if (pdfBlob) {
        const sanitizedName = projectName
          .replace(/[^a-zA-Z0-9-_ ]/g, '')
          .trim() || "Presentation";
        saveAs(pdfBlob, `${sanitizedName}.pdf`);
        notify("success", "Slides exported as PDF");
      } else {
        notify("error", "Failed to generate PDF");
      }
    } catch (error) {
      console.error("[SlidesPage] PDF export failed:", error);
      notify("error", "Failed to export slides");
    } finally {
      setPdfExportStatus("idle");
      setPdfExportProgress(null);
    }
  }, [slides, activeProject?.name]);

  // Handler for sidebar context menu "Export" - exports single slide as SVG
  const handleExport = useCallback((slideId?: string) => {
    const targetSlideId = slideId || activeSlideId;
    if (!targetSlideId) {
      notify("warning", "No slide selected");
      return;
    }
    handleExportSlideSvg(targetSlideId);
  }, [activeSlideId, handleExportSlideSvg]);

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
    [projectId]
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
    setZoom(prev => Math.min(prev + 25, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  const handleSetZoom = useCallback((level: number) => {
    setZoom(Math.max(25, Math.min(level, 200)));
  }, []);

  const activeSlide = slides.find((s) => s.id === activeSlideId);
  const isImportingPdf = pdfImportStatus !== "idle";
  const isExportingPdfActive = pdfExportStatus === "exporting";
  const importStatusText =
    pdfImportStatus === "uploading"
      ? `Uploading PDF… ${Math.max(0, Math.min(100, Math.round(pdfImportProgress)))}%`
      : pdfImportDetail?.totalPages
        ? `Importing slides… ${Math.min(pdfImportDetail.currentPage, pdfImportDetail.totalPages)}/${pdfImportDetail.totalPages}`
        : "Importing slides…";
  const exportStatusText = pdfExportProgress
    ? `Exporting slide ${pdfExportProgress.current} of ${pdfExportProgress.total}…`
    : "Preparing export…";
  const exportProgressPercent = pdfExportProgress
    ? Math.round((pdfExportProgress.current / pdfExportProgress.total) * 100)
    : 0;

  // Version dropdown for the toolbar
  const versionDropdown = useMemo(() => (
    <DeckVersionDropdown
      versions={versions}
      activeVersion={activeVersion}
      onVersionSelect={switchVersion}
      onManageVersions={() => setVersionsModalOpen(true)}
      onCreateVersion={async () => {
        // Create new version with NO slides - user can duplicate from modal if needed
        const newVersion = await createVersion({ name: `Version ${versions.length + 1}` });
        if (newVersion) {
          switchVersion(newVersion.versionId);
        }
      }}
      canManageVersions={canManageVersions}
      accentColor={projectPalette.accent}
    />
  ), [versions, activeVersion, switchVersion, createVersion, canManageVersions, projectPalette.accent]);

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
          // Create new version - only includes slides if duplicating from another version
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
        accentColor={projectPalette.accent}
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
      
      {/* Offscreen renderer for PDF export - renders slides invisibly */}
      <OffscreenSlideRenderer ref={offscreenRendererRef} />
      
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
        {isExportingPdfActive && (
          <div className="slides-export-banner" role="status" aria-live="polite">
            <div className="slides-export-banner__text">{exportStatusText}</div>
            <progress
              className="slides-export-banner__progress"
              max={100}
              value={exportProgressPercent}
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
                  markSlidesDirty(slideId);
                  saveSlides(updated, { skipThumbnail: true });
                  return updated;
                });
              }}
              onExportSlide={handleExport}
              onExportSlidePng={handleExportSlidePng}
              scrollToSlideId={scrollToSlideId}
            />

            <section className="slides-main" aria-live="polite">
              <div className="slides-main__content">
                {activeSlide ? (
                <SlideEditor
                  projectId={projectId}
                  slide={activeSlide}
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
                  onExport={() => handleExport(activeSlide.id)}
                  onExportAllPdf={handleExportAllSlidesPdf}
                  isExportingPdf={pdfExportStatus === "exporting"}
                  pdfExportProgress={pdfExportProgress}
                  zoom={zoom}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onResetZoom={handleResetZoom}
                  onSetZoom={handleSetZoom}
                  onNewSlide={handleNewSlide}
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
