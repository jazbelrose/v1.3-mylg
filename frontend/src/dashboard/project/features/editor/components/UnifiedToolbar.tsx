import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BringToFront,
  Circle,
  Focus,
  Grid as GridIcon,
  Image as ImageIcon,
  LayoutList,
  Magnet,
  Minus,
  MoreVertical,
  SendToBack,
  Square,
  Type as TypeIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import classNames from "classnames";
import styles from "./UnifiedToolbar.module.css";
import { type EditorMode, type ModeDefinition } from "./toolbarModes";

export interface UnifiedToolbarProps {
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onStrikethrough?: () => void;
  onCode?: () => void;
  onParagraph?: () => void;
  onHeading1?: () => void;
  onHeading2?: () => void;
  onQuote?: () => void;
  onUnorderedList?: () => void;
  onOrderedList?: () => void;
  onFontChange?: (font: string) => void;
  onFontSizeChange?: (size: string) => void;
  onFontColorChange?: (value: string) => void;
  onBgColorChange?: (value: string) => void;
  onAlignLeft?: () => void;
  onAlignCenter?: () => void;
  onAlignRight?: () => void;
  onAlignJustify?: () => void;
  onAddRectangle?: () => void;
  onAddCircle?: () => void;
  onFreeDraw?: () => void;
  onSelectTool?: () => void;
  onAddText?: () => void;
  onAddImage?: () => void;
  onInsertLayout?: (template: string) => void;
  onColorChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFigma?: () => void;
  onVoice?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onClearCanvas?: () => void;
  onPreview?: () => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  initialMode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  theme?: "dark" | "light";
  orientation?: "horizontal" | "vertical";
  modes?: ModeDefinition[];
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onGroup?: () => void;
  onDistribute?: () => void;
  onToggleGrid?: (enabled: boolean) => void;
  onToggleSnap?: (enabled: boolean) => void;
  onToggleFocusMode?: () => void;
  isFocusMode?: boolean;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomToFit?: () => void;
  onResetZoom?: () => void;
  activeMode?: EditorMode;
  isGridEnabled?: boolean;
  isSnapEnabled?: boolean;
}

interface ToolbarButtonProps {
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  label,
  icon: Icon,
  onClick,
  disabled,
  title,
}) => (
  <button
    type="button"
    className={classNames(styles.toolbarButton, { [styles.disabled]: disabled })}
    onClick={onClick}
    disabled={disabled}
    title={title ?? label}
    aria-label={label}
  >
    {Icon ? <Icon size={16} aria-hidden="true" /> : null}
    <span>{label}</span>
  </button>
);

const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignJustify,
  onAddRectangle,
  onAddCircle,
  onFreeDraw,
  onAddText,
  onAddImage,
  onCopy,
  onPaste,
  onDelete,
  onClearCanvas,
  onPreview,
  onSave,
  onUndo,
  onRedo,
  onBringForward,
  onSendBackward,
  onGroup,
  onDistribute,
  onToggleGrid,
  onToggleSnap,
  onToggleFocusMode,
  isFocusMode,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onResetZoom,
  activeMode,
  isGridEnabled,
  isSnapEnabled,
  orientation = "horizontal",
  theme = "dark",
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(Boolean(isGridEnabled));
  const [snapEnabled, setSnapEnabled] = useState(Boolean(isSnapEnabled));
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setGridEnabled(Boolean(isGridEnabled));
  }, [isGridEnabled]);

  useEffect(() => {
    setSnapEnabled(Boolean(isSnapEnabled));
  }, [isSnapEnabled]);

  useEffect(() => {
    if (!moreOpen) return;
    const handleClickAway = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => {
      document.removeEventListener("mousedown", handleClickAway);
    };
  }, [moreOpen]);

  const isCanvasMode = activeMode === "canvas";

  const handleToggleGrid = () => {
    const next = !gridEnabled;
    setGridEnabled(next);
    onToggleGrid?.(next);
  };

  const handleToggleSnap = () => {
    const next = !snapEnabled;
    setSnapEnabled(next);
    onToggleSnap?.(next);
  };

  const moreActions = useMemo(
    () => [
      { label: "Preview", onClick: onPreview },
      { label: "Save", onClick: onSave },
      { label: "Undo", onClick: onUndo },
      { label: "Redo", onClick: onRedo },
      { label: "Copy", onClick: onCopy },
      { label: "Paste", onClick: onPaste },
      { label: "Clear canvas", onClick: onClearCanvas },
      { label: "Delete", onClick: onDelete },
    ],
    [onPreview, onSave, onUndo, onRedo, onCopy, onPaste, onClearCanvas, onDelete]
  );

  return (
    <div className={classNames(styles.toolbar, styles[theme], styles[orientation])}>
      <div className={styles.toolbarRow}>
        <div className={styles.toolbarGroup} aria-label="Insert actions">
          <span className={styles.groupLabel}>Insert</span>
          <ToolbarButton
            label="Text"
            icon={TypeIcon}
            onClick={onAddText}
            disabled={!onAddText || !isCanvasMode}
            title="Insert text"
          />
          <ToolbarButton
            label="Image"
            icon={ImageIcon}
            onClick={onAddImage}
            disabled={!onAddImage || !isCanvasMode}
            title="Insert image"
          />
          <ToolbarButton
            label="Shape"
            icon={Square}
            onClick={onAddRectangle ?? onAddCircle}
            disabled={!((onAddRectangle ?? onAddCircle) && isCanvasMode)}
            title="Insert shape"
          />
          <ToolbarButton
            label="Line"
            icon={Minus}
            onClick={onFreeDraw}
            disabled={!onFreeDraw || !isCanvasMode}
            title="Draw a line"
          />
        </div>

        <div className={styles.toolbarGroup} aria-label="Arrange actions">
          <span className={styles.groupLabel}>Arrange</span>
          <ToolbarButton
            label="Forward"
            icon={BringToFront}
            onClick={onBringForward}
            disabled={!onBringForward || !isCanvasMode}
            title="Bring forward"
          />
          <ToolbarButton
            label="Back"
            icon={SendToBack}
            onClick={onSendBackward}
            disabled={!onSendBackward || !isCanvasMode}
            title="Send backward"
          />
          <ToolbarButton
            label="Align"
            icon={AlignLeft}
            onClick={onAlignLeft}
            disabled={!onAlignLeft || !isCanvasMode}
            title="Align left"
          />
          <ToolbarButton
            label="Center"
            icon={AlignCenter}
            onClick={onAlignCenter}
            disabled={!onAlignCenter || !isCanvasMode}
            title="Align center"
          />
          <ToolbarButton
            label="Right"
            icon={AlignRight}
            onClick={onAlignRight}
            disabled={!onAlignRight || !isCanvasMode}
            title="Align right"
          />
          <ToolbarButton
            label="Distribute"
            icon={AlignJustify}
            onClick={onDistribute ?? onAlignJustify}
            disabled={!(onDistribute ?? onAlignJustify) || !isCanvasMode}
            title="Distribute"
          />
          <ToolbarButton
            label="Group"
            icon={LayoutList}
            onClick={onGroup}
            disabled={!onGroup || !isCanvasMode}
            title="Group selection"
          />
        </div>

        <div className={styles.toolbarGroup} aria-label="View actions">
          <span className={styles.groupLabel}>View</span>
          <ToolbarButton
            label="-"
            icon={ZoomOut}
            onClick={onZoomOut}
            disabled={!onZoomOut}
            title="Zoom out"
          />
          <div className={styles.zoomReadout} aria-live="polite">
            {zoom ? `${Math.round(zoom * 100)}%` : "100%"}
          </div>
          <ToolbarButton
            label="+"
            icon={ZoomIn}
            onClick={onZoomIn}
            disabled={!onZoomIn}
            title="Zoom in"
          />
          <ToolbarButton
            label="Fit"
            icon={Circle}
            onClick={onZoomToFit}
            disabled={!onZoomToFit}
            title="Zoom to fit"
          />
          <ToolbarButton
            label="100%"
            onClick={onResetZoom}
            disabled={!onResetZoom}
            title="Reset zoom"
          />
          <ToolbarButton
            label={gridEnabled ? "Grid on" : "Grid"}
            icon={GridIcon}
            onClick={handleToggleGrid}
            title="Toggle grid"
          />
          <ToolbarButton
            label={snapEnabled ? "Snap on" : "Snap"}
            icon={Magnet}
            onClick={handleToggleSnap}
            title="Toggle snap"
          />
          <ToolbarButton
            label={isFocusMode ? "Focused" : "Focus"}
            icon={Focus}
            onClick={onToggleFocusMode}
            disabled={!onToggleFocusMode}
            title="Toggle focus mode"
          />
        </div>

        <div className={classNames(styles.toolbarGroup, styles.moreGroup)} ref={menuRef}>
          <button
            type="button"
            className={styles.moreButton}
            onClick={() => setMoreOpen((prev) => !prev)}
            aria-haspopup="true"
            aria-expanded={moreOpen}
            aria-label="More actions"
          >
            <MoreVertical size={18} aria-hidden="true" />
          </button>
          {moreOpen && (
            <div className={styles.moreMenu} role="menu">
              {moreActions.map(({ label, onClick: action }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    action?.();
                    setMoreOpen(false);
                  }}
                  disabled={!action}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default UnifiedToolbar;
