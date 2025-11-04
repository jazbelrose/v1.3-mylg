// SlidesPage.tsx - Main slides editor page
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { Slide } from "@/app/contexts/DataProvider";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import SlidesSidebar from "./components/SlidesSidebar";
import SlideEditor from "./components/SlideEditor";
import SlideToolbar from "./components/SlideToolbar";
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
  } = useData();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef>(null);

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
    navigate(getProjectDashboardPath(projectId!, title));
  };

  // Initialize slides from project data
  useEffect(() => {
    if (!projectId) return;

    if (!activeProject || activeProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails]);

  useEffect(() => {
    if (activeProject?.slides && Array.isArray(activeProject.slides) && activeProject.slides.length > 0) {
      const sortedSlides = [...(activeProject.slides as Slide[])].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );
      setSlides(sortedSlides);
      
      // Set first slide as active if none is selected
      if (!activeSlideId && sortedSlides.length > 0) {
        setActiveSlideId(sortedSlides[0].id);
      }
    } else {
      // Create initial slide if none exist
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
      setSlides([initialSlide]);
      setActiveSlideId(initialSlide.id);
    }
  }, [activeProject?.slides, activeSlideId]);

  // Cleanup Yjs connections on unmount
  useEffect(() => {
    return () => {
      disconnectAllSlideProviders();
    };
  }, []);

  const saveSlides = useCallback(
    async (slidesToSave: Slide[]) => {
      if (!projectId) return;

      setIsSaving(true);
      try {
        await updateProjectFields(projectId, {
          slides: slidesToSave,
        });
        setIsDirty(false);
      } catch (err) {
        console.error("Failed to save slides:", err);
        notify("error", "Failed to save slides");
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, updateProjectFields]
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

  const handleSlideSelect = useCallback((slideId: string) => {
    setActiveSlideId(slideId);
  }, []);

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

    // Generate thumbnail after content changes (debounced by saveSlideThumb)
    if (projectId) {
      setTimeout(() => {
        saveSlideThumb(projectId, slideId, (thumbnailUrl) => {
          setSlides((prev) =>
            prev.map((slide) =>
              slide.id === slideId ? { ...slide, thumbnail: thumbnailUrl } : slide
            )
          );
        });
      }, 3000); // Wait 3 seconds after content change
    }
  }, [projectId]);

  const handleSave = useCallback(() => {
    saveSlides(slides);
    notify("success", "All slides saved");
  }, [slides, saveSlides]);

  const handleExport = useCallback(() => {
    notify("info", "Export feature coming soon");
    // TODO: Implement PDF export with jsPDF
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
        <SlidesSidebar
          slides={slides}
          activeSlideId={activeSlideId}
          onSlideSelect={handleSlideSelect}
          onNewSlide={handleNewSlide}
          onReorderSlides={handleReorderSlides}
        />

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Toolbar */}
          <SlideToolbar
            onDuplicate={handleDuplicateSlide}
            onDelete={handleDeleteSlide}
            onExport={handleExport}
            onSave={handleSave}
            isSaving={isSaving}
            isDirty={isDirty}
          />

          {/* Editor */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {activeSlide ? (
              <SlideEditor
                projectId={projectId}
                slide={activeSlide}
                onContentChange={(content) =>
                  handleContentChange(activeSlide.id, content)
                }
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
