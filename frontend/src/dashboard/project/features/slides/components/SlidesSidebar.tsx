// components/SlidesSidebar.tsx - Sidebar with slide thumbnails
import React, { useEffect, useRef, useState } from "react";
import { Plus, GripVertical } from "lucide-react";
import { Slide } from "@/app/contexts/DataProvider";
import { useThumbnail } from "../hooks/useThumbnail";
import { isUiThumbsEnabled } from "../lib/featureFlags";
import { warmThumbsForVisibleRange } from "../lib/thumbnails";

interface SlideThumbnailProps {
  slide: Slide;
  projectId: string;
}

const SlideThumbnail: React.FC<SlideThumbnailProps> = ({ slide, projectId }) => {
  const { thumbnailUrl, isLoading, error } = useThumbnail({
    projectId,
    slideId: slide.id,
    content: slide.content,
  });

  const uiThumbsEnabled = isUiThumbsEnabled();
  const resolvedSrc = uiThumbsEnabled ? thumbnailUrl : slide.thumbnail ?? null;

  const [activeSrc, setActiveSrc] = useState<string | null>(resolvedSrc);
  const [previousSrc, setPreviousSrc] = useState<string | null>(null);
  const [activeVisible, setActiveVisible] = useState(false);
  const fadeTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resolvedSrc) {
      setPreviousSrc(null);
      setActiveSrc(null);
      setActiveVisible(false);
      return;
    }

    if (resolvedSrc === activeSrc) {
      return;
    }

    setPreviousSrc(activeSrc);
    setActiveSrc(resolvedSrc);
  }, [resolvedSrc, activeSrc]);

  useEffect(() => {
    if (!activeSrc) {
      setActiveVisible(false);
      return;
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    setActiveVisible(false);
    rafRef.current = requestAnimationFrame(() => {
      setActiveVisible(true);
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [activeSrc]);

  useEffect(() => {
    if (!activeVisible) {
      return;
    }

    if (fadeTimeoutRef.current) {
      window.clearTimeout(fadeTimeoutRef.current);
    }

    fadeTimeoutRef.current = window.setTimeout(() => {
      setPreviousSrc(null);
      fadeTimeoutRef.current = null;
    }, 180);

    return () => {
      if (fadeTimeoutRef.current) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
    };
  }, [activeVisible, activeSrc]);

  useEffect(() => () => {
    if (fadeTimeoutRef.current) {
      window.clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const showFallback = (!!error || (!activeSrc && !previousSrc && !isLoading));

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "120px",
        backgroundColor: "#f9f9f9",
        border: "1px solid #e0e0e0",
        borderRadius: "4px",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {previousSrc && (
        <img
          src={previousSrc}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: activeVisible ? 0 : 1,
            transition: "opacity 120ms ease-out",
          }}
        />
      )}
      {activeSrc && (
        <img
          src={activeSrc}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: activeVisible ? 1 : 0,
            transition: "opacity 120ms ease-out",
          }}
        />
      )}
      {showFallback && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            textAlign: "center",
            padding: "8px",
            position: "relative",
            zIndex: 1,
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              color: "#666",
              fontWeight: "bold",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {slide.title || `Slide ${slide.order || 0}`}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "#999",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {error ? "Preview unavailable" : "No preview"}
          </div>
        </div>
      )}
      {isLoading && uiThumbsEnabled && (
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            background: "rgba(255,255,255,0.8)",
            borderRadius: "12px",
            padding: "2px 8px",
            fontSize: "10px",
            color: "#555",
          }}
        >
          Updating…
        </div>
      )}
    </div>
  );
};

interface SlidesSidebarProps {
  slides: Slide[];
  activeSlideId: string | null;
  onSlideSelect: (slideId: string) => void;
  onNewSlide: () => void;
  onReorderSlides?: (slides: Slide[]) => void;
  projectId: string;
}

const SlidesSidebar: React.FC<SlidesSidebarProps> = ({
  slides,
  activeSlideId,
  onSlideSelect,
  onNewSlide,
  onReorderSlides,
  projectId,
}) => {
  // Warm thumbnails for visible slides and nearby slides for performance
  const uiThumbsEnabled = isUiThumbsEnabled();

  useEffect(() => {
    if (!uiThumbsEnabled || !projectId || slides.length === 0) {
      return;
    }

    warmThumbsForVisibleRange(projectId, slides, 0, slides.length).catch((err) => {
      console.warn("Failed to warm thumbnails:", err);
    });
  }, [slides, projectId, uiThumbsEnabled]);
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    
    if (dragIndex === dropIndex || !onReorderSlides) {
      return;
    }

    const newSlides = [...slides];
    const [draggedSlide] = newSlides.splice(dragIndex, 1);
    newSlides.splice(dropIndex, 0, draggedSlide);

    // Update order property
    const reorderedSlides = newSlides.map((slide, idx) => ({
      ...slide,
      order: idx,
    }));

    onReorderSlides(reorderedSlides);
  };

  return (
    <div
      style={{
        width: "240px",
        height: "100%",
        backgroundColor: "#f5f5f5",
        borderRight: "1px solid #ddd",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "12px",
      }}
    >
      {/* New Slide Button */}
      <button
        onClick={onNewSlide}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "10px",
          marginBottom: "12px",
          backgroundColor: "#007bff",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: "500",
          fontSize: "14px",
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#0056b3")}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#007bff")}
      >
        <Plus size={18} />
        New Slide
      </button>

      {/* Slide Thumbnails */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => onSlideSelect(slide.id)}
            style={{
              position: "relative",
              padding: "8px",
              backgroundColor: activeSlideId === slide.id ? "#e3f2fd" : "white",
              border: activeSlideId === slide.id ? "2px solid #007bff" : "1px solid #ddd",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              if (activeSlideId !== slide.id) {
                e.currentTarget.style.backgroundColor = "#f0f0f0";
              }
            }}
            onMouseOut={(e) => {
              if (activeSlideId !== slide.id) {
                e.currentTarget.style.backgroundColor = "white";
              }
            }}
          >
            {/* Drag Handle */}
            <div
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                cursor: "grab",
              }}
            >
              <GripVertical size={16} color="#999" />
            </div>

            {/* Slide Number */}
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#666" }}>
              Slide {index + 1}
            </div>

            {/* Thumbnail */}
            <SlideThumbnail slide={slide} projectId={projectId} />

            {/* Slide Title */}
            {slide.title && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#333",
                  fontWeight: "500",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {slide.title}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SlidesSidebar;
