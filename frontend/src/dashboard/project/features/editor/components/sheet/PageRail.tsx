import React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const PageRail: React.FC<PageRailProps> = ({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onDuplicate,
  onMove,
  collapsed = false,
  onToggleCollapse,
}) => {
  const regularPages = pages.filter((page) => !page.isSuperSheet);
  const superSheet = pages.find((page) => page.isSuperSheet);

  if (collapsed) {
    return (
      <div className={classNames(styles.pageRail, styles.collapsed)}>
        <button
          type="button"
          className={styles.collapseHandle}
          onClick={onToggleCollapse}
          aria-label="Expand page rail"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pageRail} aria-label="Pages">
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Layers size={16} aria-hidden="true" />
          <span>Pages</span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className={styles.collapseHandle}
          aria-label="Collapse page rail"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className={styles.list}>
        {regularPages.map((page, index) => {
          const handleSelect = () => onSelect(page.id);
          const isActive = page.id === activePageId;
          return (
            <div
              key={page.id}
              className={classNames(styles.pageItem, {
                [styles.active]: isActive,
              })}
            >
              <button
                type="button"
                className={styles.thumbnailButton}
                onClick={handleSelect}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={styles.thumbnailIndex}>{index + 1}</span>
                <span className={styles.thumbnailName}>{page.name}</span>
              </button>
              <div className={styles.pageActions}>
                <button
                  type="button"
                  onClick={() => onDuplicate(page.id)}
                  aria-label={`Duplicate ${page.name}`}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(page.id, "up")}
                  disabled={index === 0}
                  aria-label={`Move ${page.name} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(page.id, "down")}
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
          <div
            key={superSheet.id}
            className={classNames(styles.pageItem, styles.superSheet, {
              [styles.active]: superSheet.id === activePageId,
            })}
          >
            <button
              type="button"
              className={styles.thumbnailButton}
              onClick={() => onSelect(superSheet.id)}
              aria-current={superSheet.id === activePageId ? "page" : undefined}
            >
              <span className={styles.thumbnailIndex}>∞</span>
              <span className={styles.thumbnailName}>{superSheet.name}</span>
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={onAdd} className={styles.addButton}>
        <Plus size={16} />
        <span>New page</span>
      </button>
    </div>
  );
};

export default PageRail;
