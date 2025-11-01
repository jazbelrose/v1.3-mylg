import React from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Layers,
  Plus,
} from "lucide-react";
import classNames from "classnames";
import styles from "./PageRail.module.css";
import type { SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

interface PageRailProps {
  pages: SheetPageState[];
  activePageId: string;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onDuplicate: (pageId: string) => void;
  onMove: (pageId: string, direction: "up" | "down") => void;
}

const PageRail: React.FC<PageRailProps> = ({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onDuplicate,
  onMove,
}) => {
  const regularPages = pages.filter((page) => !page.isSuperSheet);
  const superSheet = pages.find((page) => page.isSuperSheet);

  return (
    <nav className={styles.pageRail} aria-label="Slides">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Layers size={16} aria-hidden="true" />
          <span>Pages</span>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onAdd}
          aria-label="Add a new page"
        >
          <Plus size={16} />
        </button>
      </div>
      <ol className={styles.thumbnailList}>
        {regularPages.map((page, index) => {
          const isActive = page.id === activePageId;
          return (
            <li key={page.id}>
              <button
                type="button"
                className={classNames(styles.thumbnailButton, {
                  [styles.active]: isActive,
                })}
                onClick={() => onSelect(page.id)}
                aria-pressed={isActive}
                title={page.name}
              >
                <span className={styles.pageIndex}>{index + 1}</span>
                <div className={styles.thumbnail} aria-hidden="true">
                  <div className={styles.thumbCanvas} />
                </div>
                <div className={styles.thumbnailActions}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate(page.id);
                    }}
                    aria-label={`Duplicate ${page.name}`}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMove(page.id, "up");
                    }}
                    disabled={index === 0}
                    aria-label={`Move ${page.name} up`}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMove(page.id, "down");
                    }}
                    disabled={index === regularPages.length - 1}
                    aria-label={`Move ${page.name} down`}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      {superSheet && (
        <button
          type="button"
          className={classNames(styles.thumbnailButton, styles.superSlide, {
            [styles.active]: superSheet.id === activePageId,
          })}
          onClick={() => onSelect(superSheet.id)}
          title={superSheet.name}
        >
          <span className={styles.pageIndex}>∞</span>
          <div className={styles.thumbnail} aria-hidden="true">
            <div className={styles.thumbCanvas} />
          </div>
        </button>
      )}
      <button type="button" onClick={onAdd} className={styles.addButton}>
        <Plus size={16} />
        <span>Add page</span>
      </button>
    </nav>
  );
};

export default PageRail;
