import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpToLine,
  BringToFront,
  ClipboardPaste,
  Copy,
  Eraser,
  Eye,
  Figma,
  Focus,
  Grid,
  Group,
  Image as ImageIcon,
  LayoutDashboard,
  Magnet,
  Mic,
  Minus,
  MoreHorizontal,
  Redo2,
  Save,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import ColorPicker from "@/shared/ui/ColorPicker";
import "./UnifiedToolbar.css";

type EditorMode = string;

interface UnifiedToolbarProps {
  mode?: EditorMode;
  initialMode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  modes?: Array<{ key: EditorMode; label: string }>;
  onAddText?: () => void;
  onAddImage?: () => void;
  onAddRectangle?: () => void;
  onAddCircle?: () => void;
  onFreeDraw?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onAlignLeft?: () => void;
  onAlignCenter?: () => void;
  onAlignRight?: () => void;
  onAlignJustify?: () => void;
  onDistributeHorizontal?: () => void;
  onDistributeVertical?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onPreview?: () => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onClearCanvas?: () => void;
  onToggleGrid?: () => void;
  onToggleSnap?: () => void;
  onToggleFocusMode?: () => void;
  isFocusMode?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
  onResetZoom?: () => void;
  zoom?: number;
  // Lexical actions
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
  onFontChange?: (value: string) => void;
  onFontSizeChange?: (value: string) => void;
  onFontColorChange?: (value: string) => void;
  onBgColorChange?: (value: string) => void;
  onFigma?: () => void;
  onVoice?: () => void;
  onInsertLayout?: (template: string) => void;
}

const BLOCK_OPTIONS = [
  { value: "body", label: "Body" },
  { value: "heading", label: "Heading" },
  { value: "subheading", label: "Subheading" },
  { value: "quote", label: "Quote" },
  { value: "bulleted", label: "Bulleted" },
  { value: "numbered", label: "Numbered" },
];

const FONT_OPTIONS = [
  "Inter",
  "Helvetica",
  "Times New Roman",
  "Georgia",
];

const SIZE_OPTIONS = ["12", "14", "16", "18", "24", "32"];

const LAYOUT_PRESETS = [
  { label: "2 Columns", value: "1fr 1fr" },
  { label: "2 Column split", value: "25% 75%" },
  { label: "3 Columns", value: "1fr 1fr 1fr" },
  { label: "Hero", value: "25% 50% 25%" },
  { label: "Quad", value: "1fr 1fr 1fr 1fr" },
];

const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  mode = "canvas",
  onAddText,
  onAddImage,
  onAddRectangle,
  onAddCircle,
  onFreeDraw,
  onBringForward,
  onSendBackward,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignJustify,
  onDistributeHorizontal,
  onDistributeVertical,
  onGroup,
  onUngroup,
  onPreview,
  onSave,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDelete,
  onClearCanvas,
  onToggleGrid,
  onToggleSnap,
  onToggleFocusMode,
  isFocusMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetZoom,
  zoom = 1,
  onBold,
  onItalic,
  onUnderline,
  onStrikethrough,
  onCode,
  onParagraph,
  onHeading1,
  onHeading2,
  onQuote,
  onUnorderedList,
  onOrderedList,
  onFontChange,
  onFontSizeChange,
  onFontColorChange,
  onBgColorChange,
  onFigma,
  onVoice,
  onInsertLayout,
}) => {
  const [fontColor, setFontColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#000000");
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isBriefMode = useMemo(() => mode === "brief", [mode]);

  const handleBlockChange = (value: string) => {
    switch (value) {
      case "body":
        onParagraph?.();
        break;
      case "heading":
        onHeading1?.();
        break;
      case "subheading":
        onHeading2?.();
        break;
      case "quote":
        onQuote?.();
        break;
      case "bulleted":
        onUnorderedList?.();
        break;
      case "numbered":
        onOrderedList?.();
        break;
      default:
        break;
    }
  };

  const handleFontColorChange = (event: { target: { value: string } }) => {
    setFontColor(event.target.value);
    onFontColorChange?.(event.target.value);
  };

  const handleBgColorChange = (event: { target: { value: string } }) => {
    setBgColor(event.target.value);
    onBgColorChange?.(event.target.value);
  };

  const renderInsertGroup = () => (
    <div className="toolbar-group" aria-label="Insert tools">
      <span className="group-label">Insert</span>
      <button type="button" onClick={onAddText} disabled={!onAddText}>
        <Type size={16} />
        <span>Text</span>
      </button>
      <button type="button" onClick={onAddImage} disabled={!onAddImage}>
        <ImageIcon size={16} />
        <span>Image</span>
      </button>
      <button
        type="button"
        onClick={onAddRectangle ?? onAddCircle}
        disabled={!onAddRectangle && !onAddCircle}
      >
        <Square size={16} />
        <span>Shape</span>
      </button>
      <button type="button" onClick={onFreeDraw} disabled={!onFreeDraw}>
        <Minus size={16} />
        <span>Line</span>
      </button>
    </div>
  );

  const renderArrangeGroup = () => (
    <div className="toolbar-group" aria-label="Arrange tools">
      <span className="group-label">Arrange</span>
      <button type="button" onClick={onBringForward} disabled={!onBringForward}>
        <BringToFront size={16} />
        <span>Forward</span>
      </button>
      <button type="button" onClick={onSendBackward} disabled={!onSendBackward}>
        <SendToBack size={16} />
        <span>Backward</span>
      </button>
      <button type="button" onClick={onAlignLeft} disabled={!onAlignLeft}>
        <AlignLeft size={16} />
      </button>
      <button type="button" onClick={onAlignCenter} disabled={!onAlignCenter}>
        <AlignCenter size={16} />
      </button>
      <button type="button" onClick={onAlignRight} disabled={!onAlignRight}>
        <AlignRight size={16} />
      </button>
      <button type="button" onClick={onAlignJustify} disabled={!onAlignJustify}>
        <AlignJustify size={16} />
      </button>
      <button
        type="button"
        onClick={onDistributeHorizontal}
        disabled={!onDistributeHorizontal}
      >
        <ArrowLeftRight size={16} />
      </button>
      <button
        type="button"
        onClick={onDistributeVertical}
        disabled={!onDistributeVertical}
      >
        <ArrowUpDown size={16} />
      </button>
      <button type="button" onClick={onGroup} disabled={!onGroup}>
        <Group size={16} />
      </button>
      <button type="button" onClick={onUngroup} disabled={!onUngroup}>
        <Ungroup size={16} />
      </button>
    </div>
  );

  const renderViewGroup = () => (
    <div className="toolbar-group" aria-label="View options">
      <span className="group-label">View</span>
      <button type="button" onClick={onZoomOut} disabled={!onZoomOut}>
        <ZoomOut size={16} />
      </button>
      <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={onZoomIn} disabled={!onZoomIn}>
        <ZoomIn size={16} />
      </button>
      <button type="button" onClick={onFit} disabled={!onFit}>
        <ArrowDownToLine size={16} />
        <span>Fit</span>
      </button>
      <button type="button" onClick={onResetZoom} disabled={!onResetZoom}>
        <ArrowUpToLine size={16} />
        <span>100%</span>
      </button>
      <button type="button" onClick={onToggleGrid} disabled={!onToggleGrid}>
        <Grid size={16} />
      </button>
      <button type="button" onClick={onToggleSnap} disabled={!onToggleSnap}>
        <Magnet size={16} />
      </button>
      <button
        type="button"
        className={isFocusMode ? "active" : undefined}
        onClick={onToggleFocusMode}
        disabled={!onToggleFocusMode}
      >
        <Focus size={16} />
        <span>Focus</span>
      </button>
    </div>
  );

  const renderFormatGroup = () => (
    <div className="toolbar-group" aria-label="Text formatting">
      <span className="group-label">Format</span>
      <select
        onChange={(event) => handleBlockChange(event.target.value)}
        defaultValue="body"
      >
        {BLOCK_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        onChange={(event) => onFontChange?.(event.target.value)}
        defaultValue={FONT_OPTIONS[0]}
      >
        {FONT_OPTIONS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <select
        onChange={(event) => onFontSizeChange?.(event.target.value)}
        defaultValue={SIZE_OPTIONS[2]}
      >
        {SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <ColorPicker color={fontColor} onChange={handleFontColorChange} />
      <ColorPicker color={bgColor} onChange={handleBgColorChange} />
      <button type="button" onClick={onBold} disabled={!onBold}>
        B
      </button>
      <button type="button" onClick={onItalic} disabled={!onItalic}>
        I
      </button>
      <button type="button" onClick={onUnderline} disabled={!onUnderline}>
        U
      </button>
      <button
        type="button"
        onClick={onStrikethrough}
        disabled={!onStrikethrough}
      >
        S
      </button>
      <button type="button" onClick={onCode} disabled={!onCode}>
        {'</>'}
      </button>
    </div>
  );

  const renderInlineControls = () => (
    <div className="toolbar-group" aria-label="Text alignment">
      <span className="group-label">Align</span>
      <button type="button" onClick={onAlignLeft} disabled={!onAlignLeft}>
        <AlignLeft size={16} />
      </button>
      <button type="button" onClick={onAlignCenter} disabled={!onAlignCenter}>
        <AlignCenter size={16} />
      </button>
      <button type="button" onClick={onAlignRight} disabled={!onAlignRight}>
        <AlignRight size={16} />
      </button>
      <button type="button" onClick={onAlignJustify} disabled={!onAlignJustify}>
        <AlignJustify size={16} />
      </button>
    </div>
  );

  const renderMoreMenu = () => (
    <div className="toolbar-more" ref={menuRef}>
      <button
        type="button"
        className={moreOpen ? "active" : undefined}
        onClick={() => setMoreOpen((prev) => !prev)}
        aria-expanded={moreOpen}
        aria-haspopup="menu"
      >
        <MoreHorizontal size={18} />
      </button>
      {moreOpen && (
        <div className="toolbar-menu" role="menu">
          <button type="button" onClick={onPreview} disabled={!onPreview}>
            <Eye size={16} />
            <span>Preview</span>
          </button>
          <button type="button" onClick={onSave} disabled={!onSave}>
            <Save size={16} />
            <span>Save</span>
          </button>
          <button type="button" onClick={onUndo} disabled={!onUndo}>
            <Undo2 size={16} />
            <span>Undo</span>
          </button>
          <button type="button" onClick={onRedo} disabled={!onRedo}>
            <Redo2 size={16} />
            <span>Redo</span>
          </button>
          <button type="button" onClick={onCopy} disabled={!onCopy}>
            <Copy size={16} />
            <span>Copy</span>
          </button>
          <button type="button" onClick={onPaste} disabled={!onPaste}>
            <ClipboardPaste size={16} />
            <span>Paste</span>
          </button>
          <button type="button" onClick={onDelete} disabled={!onDelete}>
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
          <button type="button" onClick={onClearCanvas} disabled={!onClearCanvas}>
            <Eraser size={16} />
            <span>Clear</span>
          </button>
          {onFigma && (
            <button type="button" onClick={onFigma}>
              <Figma size={16} />
              <span>Figma</span>
            </button>
          )}
          {onVoice && (
            <button type="button" onClick={onVoice}>
              <Mic size={16} />
              <span>Dictate</span>
            </button>
          )}
          {onInsertLayout && (
            <div className="toolbar-layouts">
              <span>Layouts</span>
              {LAYOUT_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onInsertLayout(value)}
                >
                  <LayoutDashboard size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="unified-toolbar">
      {isBriefMode ? (
        <>
          {renderFormatGroup()}
          {renderInlineControls()}
        </>
      ) : (
        <>
          {renderInsertGroup()}
          {renderArrangeGroup()}
          {renderViewGroup()}
        </>
      )}
      {renderMoreMenu()}
    </div>
  );
};

export default UnifiedToolbar;
