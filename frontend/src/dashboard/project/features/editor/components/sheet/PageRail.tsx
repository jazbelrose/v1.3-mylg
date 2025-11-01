import React from "react";
import {
  Plus,
  Copy,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  ChevronsLeft,
  ChevronsRight,
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
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const PageRail: React.FC<PageRailProps> = ({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onDuplicate,
  onMove,
  collapsed,
  onToggleCollapse,
}) => {
  const regularPages = pages.filter((page) => !page.isSuperSheet);
  const superSheet = pages.find((page) => page.isSuperSheet);

  if (collapsed) {
    return (
      <div className={classNames(styles.pageRail, styles.collapsed)}>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          aria-label="Expand pages panel"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pageRail} aria-label="Page thumbnails">
      <div className={styles.header}>
        <span className={styles.headerLabel}>
          <LayoutGrid size={16} aria-hidden="true" /> Pages
        </span>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          aria-label="Collapse pages panel"
        >
          <ChevronsLeft size={16} />
        </button>
      </div>
      <div className={styles.list}>
        {regularPages.map((page, index) => {
          const isActive = page.id === activePageId;
          return (
            <div key={page.id} className={styles.thumbnailSlot}>
              <button
                type="button"
                className={classNames(styles.thumbnailButton, {
                  [styles.active]: isActive,
                })}
                onClick={() => onSelect(page.id)}
                aria-label={`Select ${page.name}`}
              >
                <span className={styles.thumbnailNumber}>{index + 1}</span>
              </button>
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
            </div>
          );
        })}
        {superSheet && (
          <div className={styles.thumbnailSlot}>
            <button
              type="button"
              className={classNames(styles.thumbnailButton, {
                [styles.active]: superSheet.id === activePageId,
              })}
              onClick={() => onSelect(superSheet.id)}
              aria-label={`Select ${superSheet.name}`}
            >
              <span className={styles.thumbnailNumber}>∞</span>
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={onAdd} className={styles.addButton}>
        <Plus size={16} /> New page
      </button>
    </div>
  );
};

export default PageRail;
