import React from "react";
import type { Slide } from "@/shared/types/slides";
import styles from "./slides-panel.module.css";
import { Plus, Trash } from "lucide-react";
import { getFileUrl } from "@/shared/utils/api";

type SlidesPanelProps = {
  slides: Slide[];
  activeSlideId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

const SlidesPanel: React.FC<SlidesPanelProps> = ({ slides, activeSlideId, onSelect, onAdd, onDelete }) => {
  return (
    <div className={styles._panel}>
      <div className={styles._header}>
        <span>Slides</span>
        <button className={styles._addBtn} onClick={onAdd} title="Add slide">
          <Plus size={16} /> Add
        </button>
      </div>
      <div className={styles._list}>
        {slides.map((slide, idx) => {
          const isActive = slide.id === activeSlideId;
          const thumb = slide.thumbnail ? getFileUrl(slide.thumbnail) : undefined;
          return (
            <div
              key={slide.id}
              className={`${styles._item} ${isActive ? styles._itemActive : ""}`}
              onClick={() => onSelect(slide.id)}
            >
              <img className={styles._thumb} src={thumb} alt={slide.title || `Slide ${idx + 1}`} />
              <div className={styles._meta}>
                <div className={styles._title}>{slide.title || `Slide ${idx + 1}`}</div>
                <div className={styles._subtitle}>#{idx + 1}</div>
              </div>
              <div style={{ marginLeft: "auto" }} className={styles._actions}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(slide.id);
                  }}
                  title="Delete slide"
                  style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SlidesPanel;

