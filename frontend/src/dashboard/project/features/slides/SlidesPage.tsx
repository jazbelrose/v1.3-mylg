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
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

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
  // Flag indicating a thumbnail changed and needs persistence.
  // Note: thumbnails are intentionally *not* regenerated on every keystroke.
  // We mark the thumbnail as dirty and generate/persist it once after the autosave/save
  // window (debounced) to avoid excessive thumbnail churn.
  const dirtyThumbRef = useRef<boolean>(false);

  // Helper to add a cache-busting query param for immediate UI refresh
  const makeUiThumbnail = (url: string) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

  // Helper to strip cache-bust query params before persisting to backend
  const sanitizeThumbnailForPersist = (thumb?: string) => {
    if (!thumb) return thumb;
    const idx = thumb.indexOf("?t=");
    if (idx === -1) return thumb;
    return thumb.substring(0, idx);
  };

  const parseStatusToNumber = (statusString: string | number | undefined | null): number => {
    if (statusString === undefined || statusString === null) return 0;
    const str = typeof statusString === "string" ? statusString : String(statusString);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject: any) => {
    // setActiveProject is not available in useData, so we might need to handle this differently
    // For now, just log
    console.log("Active project change:", updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    const title = activeProject?.title ?? "";
    navigate(getProjectDashboardPath(deletedProjectId, title));
  };

  const handleBack = () => {
    const title = activeProject?.title ?? "";

    // Generate thumbnail for the current active slide before navigating back.
    if (projectId && activeSlideId) {
      // Best-effort: generate thumbnail and then navigate. Do not block UI
      // longer than necessary; thumbnail save failures are non-fatal.
      const width = 1920;
      const height = 1080;
      saveSlideThumb(projectId, activeSlideId, undefined, { width, height })
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

  useEffect(() => {
    if (!projectId) return;

    const projectSlides = activeProject?.slides;
    if (!Array.isArray(projectSlides)) {
      return;
    }

    if (projectSlides.length > 0) {
      const sortedSlides = [...(projectSlides as Slide[])].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      // Transform thumbnails to display URLs with cache-busting
      const slidesWithDisplayThumbnails = sortedSlides.map(slide => ({
        ...slide,
        thumbnail: slide.thumbnail ? makeUiThumbnail(slide.thumbnail) : slide.thumbnail
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
  }, [projectId, activeProject?.slides]);

  // Cleanup Yjs connections on unmount
  useEffect(() => {
    return () => {
      disconnectAllSlideProviders();
    };
  }, []);

  // Best-effort save thumbnail when the user closes the tab or reloads.
  // This is a best-effort handler and should not block unload; it's here to
  // capture thumbnails when the page is exited instead of generating them on
  // every keystroke.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (projectId && activeSlideId) {
        try {
          // Fire-and-forget; browsers may not allow async work on unload
          const width = 1920;
          const height = 1080;
          saveSlideThumb(projectId, activeSlideId, undefined, { width, height }).catch(() => {});
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [projectId, activeSlideId]);

  const saveSlides = useCallback(
    async (slidesToSave: Slide[], options?: { skipThumbnail?: boolean }) => {
      if (!projectId) return;

      setIsSaving(true);
      try {
        await updateProjectFields(projectId, {
          slides: slidesToSave,
        });

        // Broadcast the update to other users
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            action: "projectUpdated",
            projectId,
            fields: { slides: slidesToSave },
            conversationId: `project#${projectId}`,
            username: userName || "Someone",
            senderId: userId,
          }));
        }

        // Mark saved
        setIsDirty(false);

        // Only run post-save thumbnail generation when caller hasn't opted out
        if (!options?.skipThumbnail) {
          try {
            if (projectId && activeSlideId) {
              const width = 1920;
              const height = 1080;
              // Small delay to ensure DOM is updated before capturing thumbnail
              setTimeout(() => {
                // Generate and persist thumbnail; update local state and then persist
                saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                  setSlides((prev) => {
                    const updated = prev.map((s) =>
                      s.id === activeSlideId ? { ...s, thumbnail: makeUiThumbnail(thumbnailUrl || "") } : s
                    );
                    // Persist the updated slides to backend (best-effort) without cache buster
                    const persisted = updated.map((s) => ({
                      ...s,
                      thumbnail: sanitizeThumbnailForPersist(s.thumbnail as string),
                    }));
                    updateProjectFields(projectId, { slides: persisted }).then(() => {
                      // Broadcast the thumbnail update to other users
                      ws.send(JSON.stringify({
                        action: "projectUpdated",
                        fields: { slides: persisted },
                        conversationId: `project#${projectId}`,
                        username: userName || "Someone",
                        senderId: userId,
                      }));
                    }).catch((e) =>
                      console.warn("Failed to persist thumbnail after save:", e)
                    );
                    return updated;
                  });
                }, { width, height }).catch((e) => {
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
    [projectId, updateProjectFields, activeSlideId, ws, userId, userName]
  );

  const handleNewSlide = useCallback(() => {
    const newSlide: Slide = {
      id: uuidv4(),
      title: `Slide ${slides.length + 1}`,
      order: slides.length,
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
      if (projectId && activeSlideId && activeSlideId !== slideId) {
        const width = 1920;
        const height = 1080;
        saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
          setSlides((prev) => {
            const updated = prev.map((slide) =>
              slide.id === activeSlideId ? { ...slide, thumbnail: makeUiThumbnail(thumbnailUrl || "") } : slide
            );
            // Mark that a thumbnail changed and needs persistence by the autosave
            dirtyThumbRef.current = true;
            return updated;
          });
        }, { width, height }).catch((e) => console.warn("Failed to save thumbnail on slide change:", e));
      }

      setActiveSlideId(slideId);
    },
    [projectId, activeSlideId]
  );

  const handleReorderSlides = useCallback((reorderedSlides: Slide[]) => {
    setSlides(reorderedSlides);
    setIsDirty(true);
    saveSlides(reorderedSlides);
  }, [saveSlides]);

  const handleDuplicateSlide = useCallback(() => {
    const activeSlide = slides.find((s) => s.id === activeSlideId);
    if (!activeSlide) return;

    const duplicatedSlide: Slide = {
      ...activeSlide,
      id: uuidv4(),
      title: `${activeSlide.title} (Copy)`,
      order: slides.length,
    };

    const updatedSlides = [...slides, duplicatedSlide];
    setSlides(updatedSlides);
    setActiveSlideId(duplicatedSlide.id);
    setIsDirty(true);

    saveSlides(updatedSlides);
    notify("success", "Slide duplicated");
  }, [slides, activeSlideId, saveSlides]);

  const handleDeleteSlide = useCallback(() => {
    if (slides.length === 1) {
      notify("warning", "Cannot delete the last slide");
      return;
    }

    const updatedSlides = slides.filter((s) => s.id !== activeSlideId);
    
    // Reorder remaining slides
    const reorderedSlides = updatedSlides.map((slide, idx) => ({
      ...slide,
      order: idx,
    }));

    setSlides(reorderedSlides);
    
    // Select the previous slide or the first one
    const deletedIndex = slides.findIndex((s) => s.id === activeSlideId);
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
    try {
      dirtyThumbRef.current = true;
    } catch (err) {
      console.warn('Failed to mark thumbnail dirty:', err);
    }
  }, []);

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
          if (dirtyThumbRef.current && projectId && activeSlideId) {
            try {
              const width = 1920;
              const height = 1080;
              // Generate a thumbnail for the active slide and persist the slide
              // update with the new thumbnail URL once.
              await saveSlideThumb(projectId, activeSlideId, (thumbnailUrl) => {
                setSlides((prev) => {
                  const updated = prev.map((s) =>
                    s.id === activeSlideId ? { ...s, thumbnail: makeUiThumbnail(thumbnailUrl || "") } : s
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
              }, { width, height });
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
  }, [isDirty, slides, saveSlides, projectId, activeSlideId, updateProjectFields]);

  const handleExport = useCallback(() => {
    notify("info", "Export feature coming soon");
    // TODO: Implement PDF export with jsPDF
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  const activeSlide = slides.find((s) => s.id === activeSlideId);

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
    >
      {filesOpen && (
        <FileManagerComponent
          isOpen={filesOpen}
          onRequestClose={() => setFilesOpen(false)}
          showTrigger={false}
          folder="uploads"
        />
      )}
      <QuickLinksComponent ref={quickLinksRef} hideTrigger />
      
      <div style={{ display: "flex", height: "calc(100vh - 64px)" }}>
        {/* Sidebar */}
        <div style={{ flexShrink: 0 }}>
          <SlidesSidebar
            slides={slides}
            activeSlideId={activeSlideId}
            onSlideSelect={handleSlideSelect}
            onNewSlide={handleNewSlide}
            onReorderSlides={handleReorderSlides}
          />
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Editor */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {activeSlide ? (
              <SlideEditor
                projectId={projectId}
                slide={activeSlide}
                // Provide the numeric width/height for the editor canvas so the
                // editor can constrain its visible canvas to the chosen preset.
                width={1920}
                height={1080}
                onContentChange={(content) =>
                  handleContentChange(activeSlide.id, content)
                }
                onDuplicate={handleDuplicateSlide}
                onDelete={handleDeleteSlide}
                onExport={handleExport}
                isSaving={isSaving}
                isDirty={isDirty}
                // Zoom controls (local to user, not saved or broadcasted)
                zoom={zoom}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onResetZoom={handleResetZoom}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#999",
                }}
              >
                No slide selected
              </div>
            )}
          </div>
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default SlidesPage;
