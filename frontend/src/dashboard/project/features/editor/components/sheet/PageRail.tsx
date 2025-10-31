import React from "react";
import { Plus, Copy, ArrowUp, ArrowDown, Layers } from "lucide-react";
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
    <aside className={styles.pageRail} aria-label="Page rail">
      <div className={styles.header}>
        <span>Pages</span>
        <Layers size={16} aria-hidden="true" />
      </div>
      <div className={styles.list}>
        {regularPages.map((page, index) => {
          const handleSelect = () => onSelect(page.id);
          return (
            <div
              key={page.id}
              role="button"
              tabIndex={0}
              onClick={handleSelect}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect();
                }
              }}
              className={classNames(styles.pageButton, {
                [styles.active]: page.id === activePageId,
              })}
            >
              <span className={styles.thumbnail}>{index + 1}</span>
              <div className={styles.meta}>
                <span>{page.name}</span>
                <small>Custom layout</small>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionButton}
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
                  className={styles.actionButton}
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
                  className={styles.actionButton}
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
          <>
            <div className={styles.separator} aria-hidden="true" />
            <div
              key={superSheet.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(superSheet.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(superSheet.id);
                }
              }}
              className={classNames(styles.pageButton, {
                [styles.active]: superSheet.id === activePageId,
              })}
            >
              <span className={styles.thumbnail}>∞</span>
              <div className={styles.meta}>
                <span>{superSheet.name}</span>
                <small>All layers</small>
              </div>
            </div>
          </>
        )}
      </div>
      <button type="button" onClick={onAdd} className={styles.addButton}>
        <Plus size={16} /> Add page
      </button>
    </aside>
  );
};

export default PageRail;
