// SlidesSidebar component - sidebar with slide thumbnails and navigation
import React, { useState } from "react";
import { Plus } from "lucide-react";
import type { Slide } from "@/shared/utils/api";

interface SlidesSidebarProps {
  slides: Slide[];
  activeSlideId: string;
  onSlideSelect: (slideId: string) => void;
  onNewSlide: () => void;
  onReorderSlides: (slides: Slide[]) => void;
}

/**
 * Sidebar component showing slide thumbnails with drag-and-drop reordering
 */
export const SlidesSidebar: React.FC<SlidesSidebarProps> = ({
  slides,
  activeSlideId,
  onSlideSelect,
  onNewSlide,
  onReorderSlides,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === index) {
      return;
    }

    const newSlides = [...slides];
    const draggedSlide = newSlides[draggedIndex];
    newSlides.splice(draggedIndex, 1);
    newSlides.splice(index, 0, draggedSlide);

    // Update order property
    const reorderedSlides = newSlides.map((slide, idx) => ({
      ...slide,
      order: idx,
    }));

    onReorderSlides(reorderedSlides);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="slides-sidebar">
      <div className="slides-sidebar-header">
        <h3>Slides</h3>
        <button
          className="slides-sidebar-add-btn"
          onClick={onNewSlide}
          title="Add new slide"
          aria-label="Add new slide"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="slides-sidebar-list">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`slide-thumbnail ${
              slide.id === activeSlideId ? "active" : ""
            } ${draggedIndex === index ? "dragging" : ""}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => onSlideSelect(slide.id)}
          >
            <div className="slide-thumbnail-number">{index + 1}</div>
            
            {slide.thumbnail ? (
              <img
                src={slide.thumbnail}
                alt={slide.title || `Slide ${index + 1}`}
                className="slide-thumbnail-image"
              />
            ) : (
              <div className="slide-thumbnail-placeholder">
                <span>{slide.title || `Slide ${index + 1}`}</span>
              </div>
            )}

            {slide.title && (
              <div className="slide-thumbnail-title">{slide.title}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
