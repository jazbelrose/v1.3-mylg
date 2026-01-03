// components/SlidesSidebar.tsx - Sidebar with slide thumbnails
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { GripVertical } from "lucide-react";
import { Copy, Download, Trash2 } from "lucide-react";
import { Pencil } from "lucide-react";
import { Slide } from "@/app/contexts/DataProvider";
import { useThumbnail } from "../hooks/useThumbnail";
import { isUiThumbsEnabled } from "../lib/featureFlags";
import { isLexicalContentEffectivelyEmpty } from "../lib/lexicalContent";
import { warmThumbsForVisibleRange } from "../lib/thumbnails";
import { getFileUrl } from "@/shared/utils/api";
import { useDropdown } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import "./SlidesSidebar.css";

interface SlideThumbnailProps {
  slide: Slide;
  projectId: string;
}

const SlideThumbnail: React.FC<SlideThumbnailProps> = ({ slide, projectId }) => {
  const hasBackgroundImage = Boolean(slide.backgroundImage);
  const isContentEmpty = isLexicalContentEffectivelyEmpty(slide.content);
  const shouldPreferBackgroundImageThumb = hasBackgroundImage && isContentEmpty;

  const { thumbnailUrl, isLoading, error, invalidate } = useThumbnail({
    projectId,
    slideId: slide.id,
    content: shouldPreferBackgroundImageThumb ? "" : slide.content,
    backgroundColor: slide.backgroundColor || '#101112',
  });

  const uiThumbsEnabled = isUiThumbsEnabled();
  const resolvedSrcRaw = shouldPreferBackgroundImageThumb
    ? slide.backgroundImage ?? null
    : uiThumbsEnabled
      ? thumbnailUrl ?? slide.thumbnail ?? slide.backgroundImage ?? null
      : slide.thumbnail ?? slide.backgroundImage ?? null;
  const resolvedSrc = resolvedSrcRaw ? getFileUrl(resolvedSrcRaw) : null;

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
        <div className="slides-sidebar__thumbnail-status">
          <span className="slides-sidebar__thumbnail-loader">
            <span className="slides-sidebar__thumbnail-loader-dot" />
            <span className="slides-sidebar__thumbnail-loader-dot" />
            <span className="slides-sidebar__thumbnail-loader-dot" />
          </span>
          <span>Updating</span>
        </div>
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
  onExportSlidePng?: (slideId: string) => void;
  selectedSlideIds?: string[];
  onSelectedSlideIdsChange?: (ids: string[]) => void;
  onRequestDeleteSelected?: (ids: string[]) => void;
  onRenameSlide?: (slideId: string, title: string) => void;
  scrollToSlideId?: string | null;
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
  onExportSlidePng,
  selectedSlideIds = [],
  onSelectedSlideIdsChange,
  onRequestDeleteSelected,
  onRenameSlide,
  scrollToSlideId,
}) => {
  const uiThumbsEnabled = isUiThumbsEnabled();
  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const contextMenuDropdownId = "slide-context-menu";
  const anchorIndexRef = useRef<number | null>(null);
  const selectedIdSet = useMemo(() => new Set(selectedSlideIds), [selectedSlideIds]);
  const [renamingSlideId, setRenamingSlideId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const slideItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to the specified slide when scrollToSlideId changes
  useEffect(() => {
    if (!scrollToSlideId) return;
    
    const slideElement = slideItemRefs.current.get(scrollToSlideId);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [scrollToSlideId]);

  const setSelected = useCallback(
    (ids: string[]) => {
      onSelectedSlideIdsChange?.(ids);
    },
    [onSelectedSlideIdsChange]
  );

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
          const isSelected = selectedIdSet.has(slide.id);
          const isMultiSelecting = selectedSlideIds.length >= 2;
          const displayIndex = String(index + 1).padStart(2, "0");
          const isRenaming = renamingSlideId === slide.id;
          const displayTitle = (slide.title || "").trim() || "Untitled";

          const handleKeySelect = (event: React.KeyboardEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement | null;
            if (target) {
              const tag = target.tagName;
              if (tag === "INPUT" || tag === "TEXTAREA" || (target as HTMLElement).isContentEditable) {
                return;
              }
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSlideSelect(slide.id);
              if (selectedSlideIds.length) {
                setSelected([slide.id]);
              }
              anchorIndexRef.current = index;
            }
          };

          const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            // If multi-select is active but right-clicking a non-selected slide,
            // exit multi-select (file-manager style).
            if (isMultiSelecting && !selectedIdSet.has(slide.id)) {
              setSelected([]);
            }

            // Set this slide as active first.
            onSlideSelect(slide.id);
            anchorIndexRef.current = index;
            // Open context menu at mouse coordinates
            openDropdown(contextMenuDropdownId, event.currentTarget, { x: event.clientX, y: event.clientY });
          };

          const handleItemClick = (event: React.MouseEvent<HTMLDivElement>) => {
            if (isRenaming) {
              return;
            }
            const isToggle = event.metaKey || event.ctrlKey;
            const isRange = event.shiftKey;

            if (isRange) {
              const activeIndex = activeSlideId ? slides.findIndex((s) => s.id === activeSlideId) : -1;
              const anchor = anchorIndexRef.current ?? (activeIndex >= 0 ? activeIndex : index);
              const start = Math.min(anchor, index);
              const end = Math.max(anchor, index);
              const rangeIds = slides.slice(start, end + 1).map((s) => s.id);
              setSelected(rangeIds);
              onSlideSelect(slide.id);
              return;
            }

            if (isToggle) {
              const next = new Set(selectedIdSet);
              if (next.has(slide.id)) {
                next.delete(slide.id);
              } else {
                next.add(slide.id);
              }
              const ids = Array.from(next);
              // Only keep selection state when multi-selecting (2+), to avoid UI clutter.
              setSelected(ids.length >= 2 ? ids : []);
              anchorIndexRef.current = index;
              onSlideSelect(slide.id);
              return;
            }

            anchorIndexRef.current = index;
            onSlideSelect(slide.id);
            if (isMultiSelecting) {
              setSelected([]);
            }
          };

          return (
            <div
              key={slide.id}
              ref={(el) => {
                if (el) {
                  slideItemRefs.current.set(slide.id, el);
                } else {
                  slideItemRefs.current.delete(slide.id);
                }
              }}
              role="listitem"
              aria-selected={isSelected}
              className={`slides-sidebar__item${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={handleItemClick}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeySelect}
              tabIndex={0}
            >
              <div className="slides-sidebar__item-header">
                <span className="slides-sidebar__index" aria-label={`Slide ${index + 1}`}>
                  {displayIndex}
                </span>
                <span className="slides-sidebar__drag-handle" aria-hidden>
                  <GripVertical size={16} />
                </span>
              </div>

              <SlideThumbnail slide={slide} projectId={projectId} />

              <div className="slides-sidebar__title" title={displayTitle}>
                {isRenaming ? (
                  <input
                    className="slides-sidebar__title-input"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setRenamingSlideId(null);
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = renameDraft.trim();
                        onRenameSlide?.(slide.id, next);
                        setRenamingSlideId(null);
                      }
                    }}
                    onBlur={() => {
                      const next = renameDraft.trim();
                      onRenameSlide?.(slide.id, next);
                      setRenamingSlideId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="slides-sidebar__title-button"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={() => {
                      if (!onRenameSlide) {
                        return;
                      }
                      setRenamingSlideId(slide.id);
                      setRenameDraft(displayTitle === "Untitled" ? "" : displayTitle);
                    }}
                    title="Double-click to rename"
                  >
                    {displayTitle}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedSlideIds.length >= 2 && (
        <div className="slides-sidebar__selection-bar" role="region" aria-label="Slide selection">
          <div className="slides-sidebar__selection-count">{selectedSlideIds.length} selected</div>
          <div className="slides-sidebar__selection-actions">
            <button
              type="button"
              className="slides-sidebar__selection-button"
              onClick={() => setSelected(slides.map((s) => s.id))}
            >
              Select all
            </button>
            {onDeleteSlide && onRequestDeleteSelected && (
              <button
                type="button"
                className="slides-sidebar__selection-button slides-sidebar__selection-button--danger"
                onClick={() => onRequestDeleteSelected?.(selectedSlideIds)}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="slides-sidebar__selection-button"
              onClick={() => setSelected([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {activeDropdown === contextMenuDropdownId &&
        ReactDOM.createPortal(
          <div className="dropdown dropdown--context-menu" data-slide-dropdown ref={dropdownRef}>
            {onRenameSlide && selectedSlideIds.length < 2 && activeSlideId && (
              <button
                type="button"
                className="item"
                onClick={() => {
                  const slide = slides.find((s) => s.id === activeSlideId);
                  if (!slide) {
                    closeDropdown();
                    return;
                  }
                  setRenamingSlideId(activeSlideId);
                  const nextTitle = (slide.title || "").trim() || "Untitled";
                  setRenameDraft(nextTitle === "Untitled" ? "" : nextTitle);
                  closeDropdown();
                }}
              >
                <Pencil size={24} className="dropdown-icon" />
                <span className="text">Rename</span>
              </button>
            )}
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
                <span className="text">Export as SVG (Affinity)</span>
              </button>
            )}
            {onExportSlidePng && (
              <button
                type="button"
                className="item"
                onClick={() => {
                  if (activeSlideId) onExportSlidePng(activeSlideId);
                  closeDropdown();
                }}
              >
                <Download size={24} className="dropdown-icon" />
                <span className="text">Export as PNG</span>
              </button>
            )}
            {onDeleteSlide && (
              <>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="item item--danger"
                  onClick={() => {
                    const activeId = activeSlideId;
                    if (!activeId) return;
                    const idsToDelete =
                      selectedIdSet.has(activeId) && selectedIdSet.size > 1
                        ? Array.from(selectedIdSet)
                        : [activeId];
                    if (idsToDelete.length > 1) {
                      if (onRequestDeleteSelected) {
                        onRequestDeleteSelected(idsToDelete);
                      } else {
                        onDeleteSlide(activeId);
                      }
                    } else {
                      onDeleteSlide(activeId);
                    }
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
