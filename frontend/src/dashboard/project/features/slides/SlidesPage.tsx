// SlidesPage.tsx - Main slides editor page
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { notify } from "@/shared/ui/ToastNotifications";
import { v4 as uuidv4 } from "uuid";
import { disconnectAllSlideProviders } from "./lib/yjs";
import { saveSlideThumb } from "./lib/thumbnails";
import { isUiThumbsEnabled } from "./lib/featureFlags";
import { isLexicalContentEffectivelyEmpty } from "./lib/lexicalContent";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { apiFetch, GALLERY_UPLOAD_URL, getFileUrl } from "@/shared/utils/api";
import { DropdownProvider } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import "./slides.css";

const MAX_THUMBNAIL_ATTEMPTS = 5;

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

const SlidesPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    activeProject,
    fetchProjectDetails,
    updateProjectFields,
    userId,
    userName,
  } = useData();

  const { ws } = useSocket();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
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

    const projectSlides = activeProject?.slides;
    if (!Array.isArray(projectSlides)) {
      emptySlidesInitializedRef.current = false;
      return;
    }

    if (projectSlides.length > 0) {
      emptySlidesInitializedRef.current = false;
      const sortedSlides = [...(projectSlides as Slide[])].sort(
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
        if (!current || !sortedSlides.some((slide) => slide.id === current)) {
          return sortedSlides[0].id;
        }
        return current;
      });
      return;
    }

    if (emptySlidesInitializedRef.current) {
      return;
    }
    emptySlidesInitializedRef.current = true;

    setSlides((prevSlides) => {
      if (prevSlides.length > 0) {
        setActiveSlideId((current) => {
          if (current && prevSlides.some((slide) => slide.id === current)) {
            return current;
          }
          return prevSlides[0].id;
        });
        return prevSlides;
      }

      const initialSlide: Slide = {
        id: uuidv4(),
        title: "Slide 1",
        order: 0,
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
      setActiveSlideId(initialSlide.id);
      return [initialSlide];
    });
  }, [projectId, activeProject?.slides, uiThumbsEnabled, makeUiThumbnail]);

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
  }, [projectId, activeSlideId, uiThumbsEnabled]);

  const saveSlides = useCallback(
    async (slidesToSave: Slide[], options?: { skipThumbnail?: boolean }) => {
      if (!projectId) return;

      setIsSaving(true);
      try {
        const cleanedSlides = slidesToSave.map((slide) =>
          shouldSkipThumbnailForSlide(slide) ? { ...slide, thumbnail: undefined } : slide
        );

        await updateProjectFields(projectId, {
          slides: cleanedSlides,
        });

        // Broadcast the update to other users
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            action: "projectUpdated",
            projectId,
            fields: { slides: cleanedSlides },
            conversationId: `project#${projectId}`,
            username: userName || "Someone",
            senderId: userId,
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
                      setSlides((prev) => {
                        const updated = prev.map((s) =>
                          s.id === activeSlideId
                            ? { ...s, thumbnail: makeUiThumbnail(readyUrl) }
                            : s
                        );
                        // Persist the updated slides to backend (best-effort) without cache buster
                        const persisted = updated.map((s) => ({
                          ...s,
                          thumbnail: sanitizeThumbnailForPersist(s.thumbnail as string),
                        }));
                        updateProjectFields(projectId, { slides: persisted })
                          .then(() => {
                            // Broadcast the thumbnail update to other users
                            ws.send(
                              JSON.stringify({
                                action: "projectUpdated",
                                fields: { slides: persisted },
                                conversationId: `project#${projectId}`,
                                username: userName || "Someone",
                                senderId: userId,
                              })
                            );
                          })
                          .catch((e) =>
                            console.warn("Failed to persist thumbnail after save:", e)
                          );
                        return updated;
                      });
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
    updateProjectFields,
    activeSlideId,
    ws,
    userId,
    userName,
    uiThumbsEnabled,
    makeUiThumbnail,
    sanitizeThumbnailForPersist,
    shouldSkipThumbnailForSlide,
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
              setSlides((prev) => {
                const updated = prev.map((slide) =>
                  slide.id === activeSlideId
                    ? { ...slide, thumbnail: makeUiThumbnail(readyUrl) }
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
  [projectId, activeSlideId, uiThumbsEnabled, makeUiThumbnail, slides, shouldSkipThumbnailForSlide]
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

  const handleDeleteSlide = useCallback((slideId?: string) => {
    const targetSlideId = slideId || activeSlideId;
    if (slides.length === 1) {
      notify("warning", "Cannot delete the last slide");
      return;
    }

    const updatedSlides = slides.filter((s) => s.id !== targetSlideId);

    // Reorder remaining slides
    const reorderedSlides = updatedSlides.map((slide, idx) => ({
      ...slide,
      order: idx,
    }));

    setSlides(reorderedSlides);

    // Select the previous slide or the first one
    const deletedIndex = slides.findIndex((s) => s.id === targetSlideId);
    const newActiveIndex = Math.max(0, deletedIndex - 1);
    setActiveSlideId(reorderedSlides[newActiveIndex]?.id || null);

    setIsDirty(true);
    saveSlides(reorderedSlides);
    notify("success", "Slide deleted");
  }, [slides, activeSlideId, saveSlides]);

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
          
          saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
            if (!thumbnailUrl) return;
            
            void waitForThumbnailReady(thumbnailUrl)
              .then((readyUrl) => {
                setSlides((prev) => {
                  const updated = prev.map((s) =>
                    s.id === activeSlideId
                      ? { ...s, thumbnail: makeUiThumbnail(readyUrl) }
                      : s
                  );
                  const persisted = updated.map((s) => ({
                    ...s,
                    thumbnail: sanitizeThumbnailForPersist(s.thumbnail as string),
                  }));
                  updateProjectFields(projectId, { slides: persisted })
                    .catch((e) => console.warn("Failed to persist thumbnail after color change:", e));
                  return updated;
                });
              })
              .catch((error) => console.warn("Thumbnail not ready after color change:", error));
          }, { width, height, backgroundColor: bgColor, content: slide?.content, backgroundImage: slide?.backgroundImage }).catch((e) => console.warn('Failed to save thumbnail after color change:', e));
          
          return currentSlides;
        });

        backgroundColorSaveTimerRef.current = null;
      }, 450);
    }
  }, [activeSlideId, projectId, uiThumbsEnabled, makeUiThumbnail, sanitizeThumbnailForPersist, updateProjectFields, shouldSkipThumbnailForSlide, saveSlides]);

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
              const bgColor = slide?.backgroundColor || '#101112';
              let thumbnailUpdatePromise: Promise<void> | null = null;

              await saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                if (!thumbnailUrl) {
                  thumbnailUpdatePromise = null;
                  return;
                }

                thumbnailUpdatePromise = waitForThumbnailReady(thumbnailUrl)
                  .then((readyUrl) => {
                    setSlides((prev) => {
                      const updated = prev.map((s) =>
                        s.id === activeSlideId
                          ? { ...s, thumbnail: makeUiThumbnail(readyUrl) }
                          : s
                      );
                      const persisted = updated.map((s) => ({
                        ...s,
                        thumbnail: sanitizeThumbnailForPersist(s.thumbnail as string),
                      }));
                      updateProjectFields(projectId, { slides: persisted }).catch((e) =>
                        console.warn('Failed to persist thumbnail after autosave:', e)
                      );
                      return updated;
                    });
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
    updateProjectFields,
    uiThumbsEnabled,
    makeUiThumbnail,
    sanitizeThumbnailForPersist,
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
  const importStatusText =
    pdfImportStatus === "uploading"
      ? `Uploading PDF… ${Math.max(0, Math.min(100, Math.round(pdfImportProgress)))}%`
      : pdfImportDetail?.totalPages
        ? `Importing slides… ${Math.min(pdfImportDetail.currentPage, pdfImportDetail.totalPages)}/${pdfImportDetail.totalPages}`
        : "Importing slides…";

  if (!projectId) {
    return <div>No project ID provided</div>;
  }

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
        <div className="slides-toolbar-shell" ref={toolbarPortalRef} />
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
              onExportSlide={handleExport}
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
                  toolbarPortalContainer={toolbarPortalNode}
                />
                ) : (
                  <div className="slides-main__empty">No slide selected</div>
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
