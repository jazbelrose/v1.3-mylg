import React, { useMemo, useState, useCallback } from "react";
import { Plus, Copy, ArrowUp, ArrowDown } from "lucide-react";
import UnifiedToolbar, {
  type UnifiedToolbarProps,
} from "@/dashboard/project/features/editor/components/UnifiedToolbar";
import DesignerComponent, {
  type DesignerRef,
  type SelectionMeta,
} from "@/dashboard/project/features/editor/components/canvas/designercomponent";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import styles from "./SheetEditor.module.css";

export interface SheetPageDescriptor {
  id: string;
  name: string;
}

export interface SheetDescriptor {
  id: string;
  name: string;
  pages: SheetPageDescriptor[];
}

type SheetEditorProps = {
  sheets: SheetDescriptor[];
  activeSheetId?: string;
  activePageId?: string;
  onSelectPage: (sheetId: string, pageId: string) => void;
  onAddPage: (sheetId: string) => void;
  onDuplicatePage: (sheetId: string, pageId: string) => void;
  onReorderPages: (sheetId: string, fromIndex: number, toIndex: number) => void;
  designerRef: React.RefObject<DesignerRef>;
  toolbarProps?: Partial<UnifiedToolbarProps>;
  briefContent?: string;
  onBriefChange?: (json: string) => void;
  projectId?: string | null;
};

const SheetEditor: React.FC<SheetEditorProps> = ({
  sheets,
  activeSheetId,
  activePageId,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onReorderPages,
  designerRef,
  toolbarProps,
  briefContent,
  onBriefChange,
  projectId,
}) => {
  const activeSheet = useMemo(
    () => sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0],
    [sheets, activeSheetId]
  );

  const activePage = useMemo(
    () => activeSheet?.pages.find((page) => page.id === activePageId) ?? activeSheet?.pages[0],
    [activeSheet, activePageId]
  );

  const [selectionMeta, setSelectionMeta] = useState<SelectionMeta | null>(null);
  const [briefToolbarActions, setBriefToolbarActions] = useState<Record<string, unknown>>({});

  const handlePageClick = useCallback(
    (sheetId: string, pageId: string) => {
      onSelectPage(sheetId, pageId);
    },
    [onSelectPage]
  );

  const handleDuplicatePage = useCallback(
    (sheetId: string, pageId: string) => {
      onDuplicatePage(sheetId, pageId);
    },
    [onDuplicatePage]
  );

  const handleAddPage = useCallback(() => {
    if (activeSheet) {
      onAddPage(activeSheet.id);
    }
  }, [activeSheet, onAddPage]);

  const handleMovePage = useCallback(
    (sheetId: string, fromIndex: number, toIndex: number) => {
      onReorderPages(sheetId, fromIndex, toIndex);
    },
    [onReorderPages]
  );

  const mergedToolbarProps = useMemo(() => {
    return { ...briefToolbarActions, ...(toolbarProps ?? {}) } as Partial<UnifiedToolbarProps>;
  }, [briefToolbarActions, toolbarProps]);

  return (
    <div className={styles.container}>
      <UnifiedToolbar
        {...mergedToolbarProps}
        initialMode="canvas"
        showModeSwitcher={false}
        theme="dark"
      />
      <div className={styles.body}>
        <aside className={styles.pageRail}>
          <div className={styles.railHeader}>
            <h3>{activeSheet?.name ?? "Sheet"}</h3>
            <button type="button" className={styles.addPageButton} onClick={handleAddPage}>
              <Plus size={14} />
              Add page
            </button>
          </div>
          <ul className={styles.pageList}>
            {activeSheet?.pages.map((page, index) => {
              const isActive = page.id === activePage?.id;
              return (
                <li
                  key={page.id}
                  className={`${styles.pageListItem} ${isActive ? styles.pageListItemActive : ""}`}
                  onClick={() => handlePageClick(activeSheet.id, page.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handlePageClick(activeSheet.id, page.id);
                    }
                  }}
                >
                  <span>{page.name}</span>
                  <div className={styles.pageActions}>
                    <button
                      type="button"
                      className={styles.pageActionButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDuplicatePage(activeSheet.id, page.id);
                      }}
                      title="Duplicate page"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.pageActionButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMovePage(activeSheet.id, index, Math.max(0, index - 1));
                      }}
                      disabled={index === 0}
                      title="Move page up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.pageActionButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMovePage(
                          activeSheet.id,
                          index,
                          Math.min((activeSheet?.pages.length ?? 0) - 1, index + 1)
                        );
                      }}
                      disabled={index === (activeSheet?.pages.length ?? 0) - 1}
                      title="Move page down"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
        <div className={styles.stage}>
          <header className={styles.stageHeader}>
            <div className={styles.stageTitle}>
              <span>{activeSheet?.name ?? "Sheet"}</span>
              <strong>{activePage?.name ?? "Page"}</strong>
            </div>
          </header>
          <div className={styles.canvasShell}>
            <DesignerComponent
              ref={designerRef}
              showLayersPanel={false}
              style={{ width: "100%" }}
              onSelectionChange={(meta) => setSelectionMeta(meta)}
            />
          </div>
        </div>
        <aside className={styles.inspector}>
          <section className={styles.inspectorSection}>
            <h4>Selection</h4>
            {selectionMeta ? (
              <dl className={styles.selectionMeta}>
                <dt>Layer</dt>
                <dd>{selectionMeta.name ?? selectionMeta.type ?? "Layer"}</dd>
                <dt>Type</dt>
                <dd>{selectionMeta.type ?? "Unknown"}</dd>
                <dt>ID</dt>
                <dd>{selectionMeta.id ?? "—"}</dd>
              </dl>
            ) : (
              <p className={styles.emptyState}>Select any layer to see its details.</p>
            )}
          </section>
          {onBriefChange ? (
            <section className={`${styles.inspectorSection} ${styles.notesPanel}`}>
              <h4>Brief notes</h4>
              <LexicalEditor
                key={projectId ?? "brief"}
                initialContent={briefContent ?? null}
                onChange={onBriefChange}
                registerToolbar={setBriefToolbarActions}
              />
            </section>
          ) : (
            <section className={styles.inspectorSection}>
              <h4>Notes</h4>
              <p className={styles.emptyState}>No notes available for this page.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

export default SheetEditor;
