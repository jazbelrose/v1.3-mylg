// components/SlidesSidebar.tsx - Sidebar with slide thumbnails
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { GripVertical } from "lucide-react";
import { Copy, Download, Trash2 } from "lucide-react";
import { Slide } from "@/app/contexts/DataProvider";
import { useThumbnail } from "../hooks/useThumbnail";
import { isUiThumbsEnabled } from "../lib/featureFlags";
import { warmThumbsForVisibleRange } from "../lib/thumbnails";
import { useDropdown } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
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

  const bgColor = slide.backgroundColor || '#101112';
  const getContrastingColor = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };
  const textColor = getContrastingColor(bgColor);

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
    <div className="slides-sidebar__thumbnail" aria-busy={isLoading} style={{ backgroundColor: bgColor }}>
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
        <div className="slides-sidebar__thumbnail-fallback" style={{ color: textColor }}>
          <div className="slides-sidebar__thumbnail-title" style={{ opacity: 0.85 }}>
            {slide.title || `Slide ${slide.order || 0}`}
          </div>
          <div className="slides-sidebar__thumbnail-subtitle" style={{ opacity: 0.5 }}>
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
  onReorderSlides?: (slides: Slide[]) => void;
  projectId: string;
  onDuplicateSlide?: (slideId: string) => void;
  onDeleteSlide?: (slideId: string) => void;
  onExportSlide?: (slideId: string) => void;
}

const SlidesSidebar: React.FC<SlidesSidebarProps> = ({
  slides,
  activeSlideId,
  onSlideSelect,
  onReorderSlides,
  projectId,
  onDuplicateSlide,
  onDeleteSlide,
  onExportSlide,
}) => {
  const uiThumbsEnabled = isUiThumbsEnabled();
  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const contextMenuDropdownId = "slide-context-menu";

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
      <div className="slides-sidebar__list" role="list">
        {slides.map((slide, index) => {
          const isActive = activeSlideId === slide.id;

          const handleKeySelect = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSlideSelect(slide.id);
            }
          };

          const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            // Set this slide as active first
            onSlideSelect(slide.id);
            // Open context menu at mouse coordinates
            openDropdown(contextMenuDropdownId, event.currentTarget, { x: event.clientX, y: event.clientY });
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
              onContextMenu={handleContextMenu}
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

      {activeDropdown === contextMenuDropdownId &&
        ReactDOM.createPortal(
          <div className="dropdown dropdown--context-menu" data-slide-dropdown ref={dropdownRef}>
            {onDuplicateSlide && (
              <button
                type="button"
                className="item"
                onClick={() => {
                  if (activeSlideId) onDuplicateSlide(activeSlideId);
                  closeDropdown();
                }}
              >
                <Copy size={24} className="dropdown-icon" />
                <span className="text">Duplicate</span>
              </button>
            )}
            {onExportSlide && (
              <button
                type="button"
                className="item"
                onClick={() => {
                  if (activeSlideId) onExportSlide(activeSlideId);
                  closeDropdown();
                }}
              >
                <Download size={24} className="dropdown-icon" />
                <span className="text">Export</span>
              </button>
            )}
            {onDeleteSlide && (
              <>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="item item--danger"
                  onClick={() => {
                    if (activeSlideId) onDeleteSlide(activeSlideId);
                    closeDropdown();
                  }}
                >
                  <Trash2 size={24} className="dropdown-icon" />
                  <span className="text">Delete</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </aside>
  );
};

export default SlidesSidebar;
