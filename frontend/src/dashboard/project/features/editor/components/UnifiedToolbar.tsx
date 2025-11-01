import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceBetween,
  BringToFront,
  Group,
  Image as ImageIcon,
  Layers3,
  Minus,
  MoreHorizontal,
  RotateCw,
  SendToBack,
  SplitSquareVertical,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import classNames from "classnames";
import "./UnifiedToolbar.css";

type ActionHandler = () => void;

export interface ToolbarAction {
  id: string;
  label: string;
  onSelect?: ActionHandler;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface UnifiedToolbarProps {
  onInsertText?: ActionHandler;
  onInsertImage?: ActionHandler;
  onInsertShape?: ActionHandler;
  onInsertLine?: ActionHandler;
  onBringForward?: ActionHandler;
  onSendBackward?: ActionHandler;
  onAlignLeft?: ActionHandler;
  onAlignCenter?: ActionHandler;
  onAlignRight?: ActionHandler;
  onDistributeHorizontal?: ActionHandler;
  onDistributeVertical?: ActionHandler;
  onGroup?: ActionHandler;
  onUngroup?: ActionHandler;
  onZoomIn?: ActionHandler;
  onZoomOut?: ActionHandler;
  onZoomFit?: ActionHandler;
  onZoomReset?: ActionHandler;
  onToggleGrid?: ActionHandler;
  onToggleSnap?: ActionHandler;
  onToggleFocusMode?: ActionHandler;
  isFocusMode?: boolean;
  zoomLabel?: string;
  moreActions?: ToolbarAction[];
}

const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  onInsertText,
  onInsertImage,
  onInsertShape,
  onInsertLine,
  onBringForward,
  onSendBackward,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onDistributeHorizontal,
  onDistributeVertical,
  onGroup,
  onUngroup,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomReset,
  onToggleGrid,
  onToggleSnap,
  onToggleFocusMode,
  isFocusMode,
  zoomLabel = "100%",
  moreActions = [],
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  useEffect(() => {
    if (!moreOpen) return;
    const handleClick = (event: MouseEvent) => {
      const menuNode = moreMenuRef.current;
      const buttonNode = moreButtonRef.current;
      if (
        !menuNode ||
        !buttonNode ||
        (menuNode.contains(event.target as Node) ||
          buttonNode.contains(event.target as Node))
      ) {
        return;
      }
      closeMore();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closeMore, moreOpen]);

  const renderMoreActions = () => {
    if (!moreOpen) return null;
    return (
      <div className="unified-toolbar__menu" ref={moreMenuRef} role="menu">
        {moreActions.length === 0 ? (
          <span className="unified-toolbar__menuEmpty">No actions available</span>
        ) : (
          moreActions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="unified-toolbar__menuItem"
              onClick={() => {
                action.onSelect?.();
                closeMore();
              }}
              disabled={action.disabled}
            >
              {action.icon && <span className="unified-toolbar__menuIcon">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))
        )}
      </div>
    );
  };

  const renderButton = (
    label: string,
    icon: React.ReactNode,
    handler?: ActionHandler,
    options?: { active?: boolean }
  ) => (
    <button
      type="button"
      className={classNames("unified-toolbar__button", {
        "unified-toolbar__button--active": options?.active,
      })}
      onClick={handler}
      disabled={!handler}
      aria-label={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="unified-toolbar" role="toolbar" aria-label="Editor tools">
      <div className="unified-toolbar__group" aria-label="Insert tools">
        {renderButton("Insert text", <Type size={16} />, onInsertText)}
        {renderButton("Insert image", <ImageIcon size={16} />, onInsertImage)}
        {renderButton("Insert shape", <SquareIcon />, onInsertShape)}
        {renderButton("Insert line", <Minus size={16} />, onInsertLine)}
      </div>

      <div className="unified-toolbar__group" aria-label="Arrange tools">
        {renderButton("Bring forward", <BringToFront size={16} />, onBringForward)}
        {renderButton("Send backward", <SendToBack size={16} />, onSendBackward)}
        {renderButton("Align left", <AlignLeft size={16} />, onAlignLeft)}
        {renderButton("Align center", <AlignCenter size={16} />, onAlignCenter)}
        {renderButton("Align right", <AlignRight size={16} />, onAlignRight)}
        {renderButton(
          "Distribute horizontally",
          <AlignHorizontalSpaceBetween size={16} />,
          onDistributeHorizontal
        )}
        {renderButton(
          "Distribute vertically",
          <AlignVerticalSpaceBetween size={16} />,
          onDistributeVertical
        )}
        {renderButton("Group", <Group size={16} />, onGroup)}
        {renderButton("Ungroup", <SplitSquareVertical size={16} />, onUngroup)}
      </div>

      <div className="unified-toolbar__group" aria-label="View tools">
        {renderButton("Zoom out", <ZoomOut size={16} />, onZoomOut)}
        <button
          type="button"
          className="unified-toolbar__button unified-toolbar__button--label"
          onClick={onZoomReset}
          disabled={!onZoomReset}
        >
          {zoomLabel}
        </button>
        {renderButton("Zoom in", <ZoomIn size={16} />, onZoomIn)}
        {renderButton("Fit to screen", <RotateCw size={16} />, onZoomFit)}
        {renderButton("Toggle grid", <Layers3 size={16} />, onToggleGrid)}
        {renderButton("Toggle snap", <Layers3 size={16} />, onToggleSnap)}
        {renderButton(
          isFocusMode ? "Exit focus mode" : "Enter focus mode",
          <FocusIcon active={Boolean(isFocusMode)} />,
          onToggleFocusMode,
          { active: isFocusMode }
        )}
      </div>

      <div className="unified-toolbar__group unified-toolbar__group--trailing">
        <button
          type="button"
          className="unified-toolbar__button"
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="More actions"
          ref={moreButtonRef}
        >
          <MoreHorizontal size={16} />
        </button>
        {renderMoreActions()}
      </div>
    </div>
  );
};

const SquareIcon: React.FC = () => <span className="unified-toolbar__compositeIcon" aria-hidden="true" />;

const FocusIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <span
    className={classNames("unified-toolbar__focusIcon", {
      "unified-toolbar__focusIcon--active": active,
    })}
    aria-hidden="true"
  />
);

export default UnifiedToolbar;
