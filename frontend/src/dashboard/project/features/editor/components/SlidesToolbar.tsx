import React, { useMemo, useState } from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  ArrowBigDown,
  ArrowBigUp,
  Ellipsis,
  Group,
  Image as ImageIcon,
  LayoutDashboard,
  Minus,
  MousePointer,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import styles from "./SlidesToolbar.module.css";

type ToolbarHandler = () => void;

interface SlidesToolbarProps {
  onAddText?: ToolbarHandler;
  onAddImage?: ToolbarHandler;
  onAddRectangle?: ToolbarHandler;
  onAddLine?: ToolbarHandler;
  onSelectTool?: ToolbarHandler;
  onBringForward?: ToolbarHandler;
  onSendBackward?: ToolbarHandler;
  onAlignLeft?: ToolbarHandler;
  onAlignCenter?: ToolbarHandler;
  onAlignRight?: ToolbarHandler;
  onDistribute?: ToolbarHandler;
  onGroup?: ToolbarHandler;
  onUndo?: ToolbarHandler;
  onRedo?: ToolbarHandler;
  onCopy?: ToolbarHandler;
  onPaste?: ToolbarHandler;
  onDelete?: ToolbarHandler;
  onClear?: ToolbarHandler;
  onSave?: ToolbarHandler;
  onPreview?: ToolbarHandler;
  onZoomIn?: ToolbarHandler;
  onZoomOut?: ToolbarHandler;
  onFit?: ToolbarHandler;
  onResetZoom?: ToolbarHandler;
  onToggleFocus?: ToolbarHandler;
  onTogglePages?: ToolbarHandler;
  onOpenExtras?: ToolbarHandler;
  focusMode?: boolean;
  pagesCollapsed?: boolean;
}

const SlidesToolbar: React.FC<SlidesToolbarProps> = ({
  onAddText,
  onAddImage,
  onAddRectangle,
  onAddLine,
  onSelectTool,
  onBringForward,
  onSendBackward,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onDistribute,
  onGroup,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDelete,
  onClear,
  onSave,
  onPreview,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetZoom,
  onToggleFocus,
  onTogglePages,
  onOpenExtras,
  focusMode,
  pagesCollapsed,
}) => {
  const [extrasOpen, setExtrasOpen] = useState(false);

  const handleExtrasToggle = () => {
    setExtrasOpen((prev) => !prev);
    onOpenExtras?.();
  };

  const insertButtons = useMemo(
    () => [
      { label: "Select", icon: <MousePointer size={16} />, handler: onSelectTool },
      { label: "Text", icon: <Type size={16} />, handler: onAddText },
      { label: "Image", icon: <ImageIcon size={16} />, handler: onAddImage },
      { label: "Shape", icon: <Square size={16} />, handler: onAddRectangle },
        { label: "Line", icon: <Minus size={16} />, handler: onAddLine },
    ],
    [onSelectTool, onAddText, onAddImage, onAddRectangle, onAddLine]
  );

  const arrangeButtons = useMemo(
    () => [
      { label: "Forward", icon: <ArrowBigUp size={16} />, handler: onBringForward },
      { label: "Backward", icon: <ArrowBigDown size={16} />, handler: onSendBackward },
      { label: "Align L", icon: <AlignLeft size={16} />, handler: onAlignLeft },
      { label: "Align C", icon: <AlignCenter size={16} />, handler: onAlignCenter },
      { label: "Align R", icon: <AlignRight size={16} />, handler: onAlignRight },
      {
        label: "Distribute",
        icon: <AlignHorizontalJustifyCenter size={16} />,
        handler: onDistribute,
      },
      { label: "Group", icon: <Group size={16} />, handler: onGroup },
    ],
    [
      onBringForward,
      onSendBackward,
      onAlignLeft,
      onAlignCenter,
      onAlignRight,
      onDistribute,
      onGroup,
    ]
  );

  const viewButtons = useMemo(
    () => [
      { label: "Zoom out", icon: <ZoomOut size={16} />, handler: onZoomOut },
      { label: "Zoom in", icon: <ZoomIn size={16} />, handler: onZoomIn },
      { label: "Fit", icon: <LayoutDashboard size={16} />, handler: onFit },
      { label: "100%", icon: <Type size={16} />, handler: onResetZoom },
    ],
    [onZoomOut, onZoomIn, onFit, onResetZoom]
  );

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>Insert</span>
        <div className={styles.buttonRow}>
          {insertButtons.map(({ label, icon, handler }) => (
            <button
              key={label}
              type="button"
              className={styles.button}
              onClick={handler}
              disabled={!handler}
              aria-label={label}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Arrange</span>
        <div className={styles.buttonRow}>
          {arrangeButtons.map(({ label, icon, handler }) => (
            <button
              key={label}
              type="button"
              className={styles.button}
              onClick={handler}
              disabled={!handler}
              aria-label={label}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>View</span>
        <div className={styles.buttonRow}>
          {viewButtons.map(({ label, icon, handler }) => (
            <button
              key={label}
              type="button"
              className={styles.button}
              onClick={handler}
              disabled={!handler}
              aria-label={label}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Workspace</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            onClick={onTogglePages}
            aria-pressed={pagesCollapsed}
          >
            <LayoutDashboard size={16} />
            <span>{pagesCollapsed ? "Show pages" : "Hide pages"}</span>
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={onToggleFocus}
            aria-pressed={focusMode}
          >
            <Group size={16} />
            <span>{focusMode ? "Exit focus" : "Focus"}</span>
          </button>
          <button type="button" className={styles.button} onClick={handleExtrasToggle}>
            <Ellipsis size={16} />
            <span>More</span>
          </button>
        </div>
        {extrasOpen && (
          <div className={styles.moreMenu} role="menu">
            <button type="button" onClick={onUndo} disabled={!onUndo} role="menuitem">
              <Undo2 size={16} /> Undo
            </button>
            <button type="button" onClick={onRedo} disabled={!onRedo} role="menuitem">
              <Redo2 size={16} /> Redo
            </button>
            <button type="button" onClick={onCopy} disabled={!onCopy} role="menuitem">
              Copy
            </button>
            <button type="button" onClick={onPaste} disabled={!onPaste} role="menuitem">
              Paste
            </button>
            <button type="button" onClick={onDelete} disabled={!onDelete} role="menuitem">
              Delete
            </button>
            <button type="button" onClick={onClear} disabled={!onClear} role="menuitem">
              Clear canvas
            </button>
            <button type="button" onClick={onSave} disabled={!onSave} role="menuitem">
              Save
            </button>
            <button type="button" onClick={onPreview} disabled={!onPreview} role="menuitem">
              Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlidesToolbar;
