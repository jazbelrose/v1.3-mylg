// SlidesPage - main container for Google Slides-style interface
import React, { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { notify } from "@/shared/ui/ToastNotifications";
import { SlidesSidebar } from "./components/SlidesSidebar";
import { SlideEditor } from "./components/SlideEditor";
import { SlideToolbar } from "./components/SlideToolbar";
import { useSlidePersistence } from "./hooks/useSlidePersistence";
import type { Slide } from "@/shared/utils/api";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import "./slides.css";

const SlidesPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { activeProject, updateProjectFields, fetchProjectDetails } = useData();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Initialize slides from project
  useEffect(() => {
    if (!projectId) return;

    // Fetch project if not loaded
    if (!activeProject || activeProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
      return;
    }

    // Initialize slides
    if (activeProject.slides && activeProject.slides.length > 0) {
      const sortedSlides = [...activeProject.slides].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      setSlides(sortedSlides);
      if (!activeSlideId && sortedSlides.length > 0) {
        setActiveSlideId(sortedSlides[0].id);
      }
    } else {
      // Create initial slide if none exist
      const initialSlide: Slide = {
        id: uuidv4(),
        title: "Slide 1",
        order: 0,
        content: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSlides([initialSlide]);
      setActiveSlideId(initialSlide.id);
      // Save initial slide to backend
      updateProjectFields(projectId, { slides: [initialSlide] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeProject, fetchProjectDetails, updateProjectFields]);

  const { debouncedSave } = useSlidePersistence({
    projectId: projectId || "",
    updateProjectFields,
    onSlidesUpdate: (updatedSlides) => {
      setSlides(updatedSlides);
      setHasUnsavedChanges(false);
    },
  });

  const handleSlideChange = useCallback(
    (slideId: string, content: string) => {
      setHasUnsavedChanges(true);
      debouncedSave(slideId, content, slides);
    },
    [debouncedSave, slides]
  );

  const handleSlideSelect = useCallback((slideId: string) => {
    setActiveSlideId(slideId);
  }, []);

  const handleNewSlide = useCallback(() => {
    const newSlide: Slide = {
      id: uuidv4(),
      title: `Slide ${slides.length + 1}`,
      order: slides.length,
      content: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedSlides = [...slides, newSlide];
    setSlides(updatedSlides);
    setActiveSlideId(newSlide.id);

    // Save to backend
    if (projectId) {
      updateProjectFields(projectId, { slides: updatedSlides });
    }

    notify("success", "New slide created");
  }, [slides, projectId, updateProjectFields]);

  const handleDuplicateSlide = useCallback(() => {
    if (!activeSlideId) return;

    const activeSlide = slides.find((s) => s.id === activeSlideId);
    if (!activeSlide) return;

    const duplicatedSlide: Slide = {
      ...activeSlide,
      id: uuidv4(),
      title: `${activeSlide.title || "Slide"} (Copy)`,
      order: slides.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedSlides = [...slides, duplicatedSlide];
    setSlides(updatedSlides);
    setActiveSlideId(duplicatedSlide.id);

    // Save to backend
    if (projectId) {
      updateProjectFields(projectId, { slides: updatedSlides });
    }

    notify("success", "Slide duplicated");
  }, [activeSlideId, slides, projectId, updateProjectFields]);

  const handleDeleteSlide = useCallback(() => {
    if (!activeSlideId || slides.length === 1) {
      notify("warning", "Cannot delete the last slide");
      return;
    }

    const slideIndex = slides.findIndex((s) => s.id === activeSlideId);
    const updatedSlides = slides.filter((s) => s.id !== activeSlideId);

    // Reorder remaining slides
    const reorderedSlides = updatedSlides.map((slide, idx) => ({
      ...slide,
      order: idx,
    }));

    setSlides(reorderedSlides);

    // Select next or previous slide
    const nextIndex = Math.min(slideIndex, reorderedSlides.length - 1);
    setActiveSlideId(reorderedSlides[nextIndex]?.id || null);

    // Save to backend
    if (projectId) {
      updateProjectFields(projectId, { slides: reorderedSlides });
    }

    notify("success", "Slide deleted");
  }, [activeSlideId, slides, projectId, updateProjectFields]);

  const handleReorderSlides = useCallback(
    (reorderedSlides: Slide[]) => {
      setSlides(reorderedSlides);

      // Save to backend
      if (projectId) {
        updateProjectFields(projectId, { slides: reorderedSlides });
      }
    },
    [projectId, updateProjectFields]
  );

  const generateThumbnail = useCallback(async (slideId: string) => {
    try {
      const slideElement = document.querySelector(
        `[data-slide-id="${slideId}"]`
      ) as HTMLElement;

      if (!slideElement) {
        console.warn("Slide element not found for thumbnail generation");
        return null;
      }

      const canvas = await html2canvas(slideElement, {
        logging: false,
      });

      return canvas.toDataURL("image/png");
    } catch (err) {
      console.error("Failed to generate thumbnail:", err);
      return null;
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      notify("info", "Generating PDF...");
      setIsSaving(true);

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [1920, 1080],
      });

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const thumbnail = await generateThumbnail(slide.id);

        if (thumbnail) {
          if (i > 0) {
            pdf.addPage();
          }
          pdf.addImage(thumbnail, "PNG", 0, 0, 1920, 1080);
        }
      }

      const filename = `${activeProject?.title || "slides"}.pdf`;
      pdf.save(filename);

      notify("success", "PDF exported successfully");
    } catch (err) {
      console.error("Failed to export PDF:", err);
      notify("error", "Failed to export PDF");
    } finally {
      setIsSaving(false);
    }
  }, [slides, generateThumbnail, activeProject?.title]);

  const activeSlide = slides.find((s) => s.id === activeSlideId);

  if (!projectId) {
    return <div>Loading...</div>;
  }

  if (!activeSlide) {
    return <div>No active slide</div>;
  }

  return (
    <div className="slides-page">
      <SlidesSidebar
        slides={slides}
        activeSlideId={activeSlideId || ""}
        onSlideSelect={handleSlideSelect}
        onNewSlide={handleNewSlide}
        onReorderSlides={handleReorderSlides}
      />

      <div className="slides-main">
        <SlideToolbar
          onNewSlide={handleNewSlide}
          onDuplicateSlide={handleDuplicateSlide}
          onDeleteSlide={handleDeleteSlide}
          onExport={handleExport}
          isSaving={isSaving}
          isSaved={!hasUnsavedChanges}
          canDelete={slides.length > 1}
        />

        <div className="slides-editor-container">
          <SlideEditor
            slide={activeSlide}
            onSlideChange={handleSlideChange}
          />
        </div>
      </div>
    </div>
  );
};

export default SlidesPage;
