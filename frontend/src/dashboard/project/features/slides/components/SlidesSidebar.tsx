// components/SlidesSidebar.tsx - Sidebar with slide thumbnails
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, GripVertical } from "lucide-react";
import { Slide } from "@/app/contexts/DataProvider";
import { useThumbnail } from "../hooks/useThumbnail";
import { isUiThumbsEnabled } from "../lib/featureFlags";
import { warmThumbsForVisibleRange } from "../lib/thumbnails";
import "./SlidesSidebar.css";

interface SlideThumbnailProps {
  slide: Slide;
  projectId: string;
}

const SlideThumbnail: React.FC<SlideThumbnailProps> = ({ slide, projectId }) => {
  const { thumbnailUrl, isLoading, error, invalidate } = useThumbnail({
    projectId,
    slideId: slide.id,
    content: slide.content,
    backgroundColor: slide.backgroundColor || '#101112',
  });

  const uiThumbsEnabled = isUiThumbsEnabled();
  const resolvedSrc = uiThumbsEnabled ? thumbnailUrl : slide.thumbnail ?? null;

  const [activeSrc, setActiveSrc] = useState<string | null>(resolvedSrc);
  const [previousSrc, setPreviousSrc] = useState<string | null>(null);
  const [activeVisible, setActiveVisible] = useState(false);
  const fadeTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const attemptedSrcRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedSrc) {
      setPreviousSrc(null);
      setActiveSrc(null);
      setActiveVisible(false);
      attemptedSrcRef.current = null;
      return;
    }

    if (resolvedSrc === activeSrc) {
      attemptedSrcRef.current = null;
      return;
    }

    attemptedSrcRef.current = null;
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

  useEffect(
    () => () => {
      if (fadeTimeoutRef.current) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  const showFallback = !!error || (!activeSrc && !previousSrc && !isLoading);

  const handleImageError = useCallback(() => {
    if (!uiThumbsEnabled || !resolvedSrc) {
      return;
    }

    if (attemptedSrcRef.current === resolvedSrc) {
      setActiveVisible(false);
      setPreviousSrc(null);
      setActiveSrc(null);
      return;
    }

    attemptedSrcRef.current = resolvedSrc;
    setActiveVisible(false);
    setPreviousSrc(null);
    setActiveSrc(null);
    invalidate();
  }, [invalidate, resolvedSrc, uiThumbsEnabled]);

  return (
    <div className="slides-sidebar__thumbnail" aria-busy={isLoading}>
      {previousSrc && (
        <img
          src={previousSrc}
          aria-hidden
          className={`slides-sidebar__thumbnail-image slides-sidebar__thumbnail-image--previous ${activeVisible ? "is-hidden" : "is-visible"}`}
        />
      )}
      {activeSrc && (
        <img
          src={activeSrc}
          onError={handleImageError}
          className={`slides-sidebar__thumbnail-image slides-sidebar__thumbnail-image--current ${activeVisible ? "is-visible" : "is-hidden"}`}
        />
      )}
      {showFallback && (
        <div className="slides-sidebar__thumbnail-fallback">
          <div className="slides-sidebar__thumbnail-title">
            {slide.title || `Slide ${slide.order || 0}`}
          </div>
          <div className="slides-sidebar__thumbnail-subtitle">
            {error ? "Preview unavailable" : "No preview"}
          </div>
        </div>
      )}
      {isLoading && uiThumbsEnabled && (
        <div className="slides-sidebar__thumbnail-status">Updating…</div>
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

    if (Number.isNaN(dragIndex) || dragIndex === dropIndex || !onReorderSlides) {
      return;
    }

    const newSlides = [...slides];
    const [draggedSlide] = newSlides.splice(dragIndex, 1);
    newSlides.splice(dropIndex, 0, draggedSlide);

    const reorderedSlides = newSlides.map((slideItem, idx) => ({
      ...slideItem,
      order: idx,
    }));

    onReorderSlides(reorderedSlides);
  };

  return (
    <aside className="slides-sidebar">
      <button type="button" onClick={onNewSlide} className="slides-sidebar__new">
        <Plus size={18} />
        New Slide
      </button>

      <div className="slides-sidebar__list" role="list">
        {slides.map((slide, index) => {
          const isActive = activeSlideId === slide.id;

          const handleKeySelect = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSlideSelect(slide.id);
            }
          };

          return (
            <div
              key={slide.id}
              role="listitem"
              className={`slides-sidebar__item${isActive ? " is-active" : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => onSlideSelect(slide.id)}
              onKeyDown={handleKeySelect}
              tabIndex={0}
            >
              <div className="slides-sidebar__item-header">
                <span className="slides-sidebar__index">Slide {index + 1}</span>
                <span className="slides-sidebar__drag-handle" aria-hidden>
                  <GripVertical size={16} />
                </span>
              </div>

              <SlideThumbnail slide={slide} projectId={projectId} />

              {slide.title && (
                <div className="slides-sidebar__title" title={slide.title}>
                  {slide.title}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default SlidesSidebar;
