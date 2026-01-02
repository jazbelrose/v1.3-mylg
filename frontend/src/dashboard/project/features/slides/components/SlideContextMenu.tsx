// SlideContextMenu.tsx - Right-click context menu for slide elements
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Scissors,
  Copy,
  ClipboardPaste,
  ArrowUpToLine,
  ArrowUp,
  ArrowDown,
  ArrowDownToLine,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Group,
  Ungroup,
  Lock,
  Unlock,
  Trash2,
  ChevronRight,
  Type,
  RectangleHorizontal,
  Image,
} from "lucide-react";
import { FileImageOutlined, LayoutOutlined } from "@ant-design/icons";
import NodeIndexOutlined from "@ant-design/icons/lib/icons/NodeIndexOutlined";
import { useToolbarContextBridge } from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarContextBridge";
import "./SlideContextMenu.css";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface SlideContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;

  // Clipboard
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;

  // Arrange (z-order)
  onBringToFront?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onSendToBack?: () => void;

  // Object Alignment
  onAlignSelectionLeft?: () => void;
  onAlignSelectionRight?: () => void;
  onAlignSelectionTop?: () => void;
  onAlignSelectionBottom?: () => void;
  onAlignSelectionCenterH?: () => void;
  onAlignSelectionCenterV?: () => void;
  onDistributeSelectionHorizontal?: () => void;
  onDistributeSelectionVertical?: () => void;

  // Group
  onGroupSelection?: () => void;
  onUngroupSelection?: () => void;

  // Lock & Delete
  onLockSelection?: () => void;
  onDeleteSelection?: () => void;

  // Insert (for canvas context)
  onInsertTextBox?: () => void;
  onInsertPictureFrame?: () => void;
  onInsertPictureFrameLayout?: () => void;
  onInsertImage?: () => void;
  onInsertSvg?: () => void;

  // Replace picture frame with text box
  onReplacePictureFrameWithTextBox?: () => void;

  // Picture frame image insertion
  onInsertImageToPictureFrame?: () => void;
  onInsertImageFromProjectToPictureFrame?: () => void;

  // Selection info
  selectionCount?: number;
  isLocked?: boolean;
}

const ARRANGE_SHORTCUTS = {
  bringToFront: "Ctrl+Shift+]",
  bringForward: "Ctrl+]",
  sendBackward: "Ctrl+[",
  sendToBack: "Ctrl+Shift+[",
} as const;

const SlideContextMenu: React.FC<SlideContextMenuProps> = ({
  position,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onAlignSelectionLeft,
  onAlignSelectionRight,
  onAlignSelectionTop,
  onAlignSelectionBottom,
  onAlignSelectionCenterH,
  onAlignSelectionCenterV,
  onDistributeSelectionHorizontal,
  onDistributeSelectionVertical,
  onGroupSelection,
  onUngroupSelection,
  onLockSelection,
  onDeleteSelection,
  onInsertTextBox,
  onInsertPictureFrame,
  onInsertPictureFrameLayout,
  onInsertImage,
  onInsertSvg,
  onReplacePictureFrameWithTextBox,
  onInsertImageToPictureFrame,
  onInsertImageFromProjectToPictureFrame,
  selectionCount = 0,
  isLocked = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = React.useState<string | null>(null);
  const { ctx } = useToolbarContextBridge();

  // Check if a picture frame is selected
  const isPictureFrameSelected = ctx.type === "picture-frame";

  // Get actual selection count from context
  const actualSelectionCount = 
    ctx.type === "group" || ctx.type === "mixed" 
      ? (ctx as any).selectionCount ?? selectionCount
      : ctx.type === "image" || ctx.type === "picture-frame" || ctx.type === "svg" || ctx.type === "textbox"
        ? (ctx as any).selectionCount ?? 1
        : selectionCount;

  const hasSelection = actualSelectionCount > 0 || 
    ctx.type === "image" || 
    ctx.type === "picture-frame" || 
    ctx.type === "svg" || 
    ctx.type === "textbox" || 
    ctx.type === "group" ||
    ctx.type === "mixed";

  const canGroup = actualSelectionCount >= 2 && ctx.type !== "group";
  const canUngroup = ctx.type === "group";
  const canAlign = actualSelectionCount >= 2;
  const canDistribute = actualSelectionCount >= 3;

  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [position, onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!position || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    if (position.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (position.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menu.style.left = `${Math.max(8, adjustedX)}px`;
    menu.style.top = `${Math.max(8, adjustedY)}px`;
  }, [position]);

  if (!position) return null;

  const callAndClose = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };

  const handleSubmenuToggle = (submenuId: string) => {
    setOpenSubmenu(openSubmenu === submenuId ? null : submenuId);
  };

  const renderCanvasMenu = () => (
    <>
      <button
        type="button"
        className="context-menu__item"
        onClick={callAndClose(onPaste)}
        disabled={!onPaste}
      >
        <ClipboardPaste size={16} className="context-menu__icon" />
        <span className="context-menu__label">Paste</span>
        <span className="context-menu__shortcut">Ctrl+V</span>
      </button>

      <div className="context-menu__divider" />

      <div className="context-menu__item context-menu__item--submenu">
        <span className="context-menu__label">Insert</span>
        <ChevronRight size={14} className="context-menu__chevron" />
        <div className="context-menu__submenu">
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onInsertTextBox)}
          >
            <Type size={16} className="context-menu__icon" />
            <span className="context-menu__label">Text Box</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onInsertPictureFrame)}
          >
            <RectangleHorizontal size={16} className="context-menu__icon" />
            <span className="context-menu__label">Picture Frame</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onInsertPictureFrameLayout)}
          >
            <LayoutOutlined className="context-menu__icon" />
            <span className="context-menu__label">Picture Frame Layout…</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onInsertImage)}
          >
            <FileImageOutlined className="context-menu__icon" />
            <span className="context-menu__label">Image</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onInsertSvg)}
          >
            <NodeIndexOutlined className="context-menu__icon" />
            <span className="context-menu__label">SVG</span>
          </button>
        </div>
      </div>
    </>
  );

  const renderSelectionMenu = () => (
    <>
      {/* Clipboard */}
      <button
        type="button"
        className="context-menu__item"
        onClick={callAndClose(onCut)}
        disabled={!onCut}
      >
        <Scissors size={16} className="context-menu__icon" />
        <span className="context-menu__label">Cut</span>
        <span className="context-menu__shortcut">Ctrl+X</span>
      </button>
      <button
        type="button"
        className="context-menu__item"
        onClick={callAndClose(onCopy)}
        disabled={!onCopy}
      >
        <Copy size={16} className="context-menu__icon" />
        <span className="context-menu__label">Copy</span>
        <span className="context-menu__shortcut">Ctrl+C</span>
      </button>
      <button
        type="button"
        className="context-menu__item"
        onClick={callAndClose(onPaste)}
        disabled={!onPaste}
      >
        <ClipboardPaste size={16} className="context-menu__icon" />
        <span className="context-menu__label">Paste</span>
        <span className="context-menu__shortcut">Ctrl+V</span>
      </button>

      <div className="context-menu__divider" />

      {/* Picture Frame Image Insertion - only shown for single picture frame selection */}
      {isPictureFrameSelected && actualSelectionCount === 1 && (
        <>
          {onInsertImageToPictureFrame && (
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onInsertImageToPictureFrame)}
            >
              <Image size={16} className="context-menu__icon" />
              <span className="context-menu__label">Insert Image from Computer</span>
            </button>
          )}
          {onInsertImageFromProjectToPictureFrame && (
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onInsertImageFromProjectToPictureFrame)}
            >
              <FileImageOutlined className="context-menu__icon" />
              <span className="context-menu__label">Insert Image from Project</span>
            </button>
          )}
          {(onInsertImageToPictureFrame || onInsertImageFromProjectToPictureFrame) && (
            <div className="context-menu__divider" />
          )}
        </>
      )}

      {/* Replace Picture Frame with Text Box - only shown for single picture frame selection */}
      {isPictureFrameSelected && actualSelectionCount === 1 && onReplacePictureFrameWithTextBox && (
        <>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onReplacePictureFrameWithTextBox)}
          >
            <Type size={16} className="context-menu__icon" />
            <span className="context-menu__label">Replace with Text Box</span>
          </button>
          <div className="context-menu__divider" />
        </>
      )}

      {/* Arrange (z-order) submenu */}
      <div className="context-menu__item context-menu__item--submenu">
        <span className="context-menu__label">Arrange</span>
        <ChevronRight size={14} className="context-menu__chevron" />
        <div className="context-menu__submenu">
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onBringToFront)}
          >
            <ArrowUpToLine size={16} className="context-menu__icon" />
            <span className="context-menu__label">Bring to Front</span>
            <span className="context-menu__shortcut">{ARRANGE_SHORTCUTS.bringToFront}</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onBringForward)}
          >
            <ArrowUp size={16} className="context-menu__icon" />
            <span className="context-menu__label">Bring Forward</span>
            <span className="context-menu__shortcut">{ARRANGE_SHORTCUTS.bringForward}</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onSendBackward)}
          >
            <ArrowDown size={16} className="context-menu__icon" />
            <span className="context-menu__label">Send Backward</span>
            <span className="context-menu__shortcut">{ARRANGE_SHORTCUTS.sendBackward}</span>
          </button>
          <button
            type="button"
            className="context-menu__item"
            onClick={callAndClose(onSendToBack)}
          >
            <ArrowDownToLine size={16} className="context-menu__icon" />
            <span className="context-menu__label">Send to Back</span>
            <span className="context-menu__shortcut">{ARRANGE_SHORTCUTS.sendToBack}</span>
          </button>
        </div>
      </div>

      {/* Alignment submenu (only for multi-selection) */}
      {actualSelectionCount >= 2 && (
        <div className="context-menu__item context-menu__item--submenu">
          <span className="context-menu__label">Alignment</span>
          <ChevronRight size={14} className="context-menu__chevron" />
          <div className="context-menu__submenu">
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onAlignSelectionLeft)}
              disabled={!canAlign}
            >
              <AlignHorizontalJustifyStart size={16} className="context-menu__icon" />
              <span className="context-menu__label">Align Left</span>
            </button>
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onAlignSelectionRight)}
              disabled={!canAlign}
            >
              <AlignHorizontalJustifyEnd size={16} className="context-menu__icon" />
              <span className="context-menu__label">Align Right</span>
            </button>
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onAlignSelectionTop)}
              disabled={!canAlign}
            >
              <AlignVerticalJustifyStart size={16} className="context-menu__icon" />
              <span className="context-menu__label">Align Top</span>
            </button>
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onAlignSelectionBottom)}
              disabled={!canAlign}
            >
              <AlignVerticalJustifyEnd size={16} className="context-menu__icon" />
              <span className="context-menu__label">Align Bottom</span>
            </button>

            <div className="context-menu__divider" />

            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onAlignSelectionCenterH)}
              disabled={!canAlign}
            >
              <AlignHorizontalJustifyCenter size={16} className="context-menu__icon" />
              <span className="context-menu__label">Center Horizontally</span>
            </button>
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onAlignSelectionCenterV)}
              disabled={!canAlign}
            >
              <AlignVerticalJustifyCenter size={16} className="context-menu__icon" />
              <span className="context-menu__label">Center Vertically</span>
            </button>

            <div className="context-menu__divider" />

            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onDistributeSelectionHorizontal)}
              disabled={!canDistribute}
            >
              <AlignHorizontalDistributeCenter size={16} className="context-menu__icon" />
              <span className="context-menu__label">Distribute Horizontally</span>
            </button>
            <button
              type="button"
              className="context-menu__item"
              onClick={callAndClose(onDistributeSelectionVertical)}
              disabled={!canDistribute}
            >
              <AlignVerticalDistributeCenter size={16} className="context-menu__icon" />
              <span className="context-menu__label">Distribute Vertically</span>
            </button>
          </div>
        </div>
      )}

      <div className="context-menu__divider" />

      {/* Group / Ungroup */}
      {canGroup && onGroupSelection && (
        <button
          type="button"
          className="context-menu__item"
          onClick={callAndClose(onGroupSelection)}
        >
          <Group size={16} className="context-menu__icon" />
          <span className="context-menu__label">Group</span>
          <span className="context-menu__shortcut">Ctrl+G</span>
        </button>
      )}
      {canUngroup && onUngroupSelection && (
        <button
          type="button"
          className="context-menu__item"
          onClick={callAndClose(onUngroupSelection)}
        >
          <Ungroup size={16} className="context-menu__icon" />
          <span className="context-menu__label">Ungroup</span>
          <span className="context-menu__shortcut">Ctrl+U</span>
        </button>
      )}

      {/* Lock / Unlock */}
      {onLockSelection && (
        <button
          type="button"
          className="context-menu__item"
          onClick={callAndClose(onLockSelection)}
        >
          {isLocked ? (
            <Unlock size={16} className="context-menu__icon" />
          ) : (
            <Lock size={16} className="context-menu__icon" />
          )}
          <span className="context-menu__label">{isLocked ? "Unlock" : "Lock"}</span>
        </button>
      )}

      <div className="context-menu__divider" />

      {/* Delete */}
      <button
        type="button"
        className="context-menu__item context-menu__item--danger"
        onClick={callAndClose(onDeleteSelection)}
        disabled={!onDeleteSelection}
      >
        <Trash2 size={16} className="context-menu__icon" />
        <span className="context-menu__label">Delete</span>
        <span className="context-menu__shortcut">Del</span>
      </button>
    </>
  );

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="slide-context-menu"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
      }}
    >
      {hasSelection ? renderSelectionMenu() : renderCanvasMenu()}
    </div>,
    document.body
  );
};

export default SlideContextMenu;
