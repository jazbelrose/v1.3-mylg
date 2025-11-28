// components/SlideToolbar.tsx - Compact single-line toolbar with icon groups
import React, { useMemo, useRef, type ChangeEvent } from "react";
import ReactDOM from "react-dom";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  Undo2,
  Redo2,
  Eye,
  Save,
  Copy,
  Trash2,
  Download,
  Mic,
  Clock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";
import { getCodeLanguages } from "@lexical/code";
import { FileImageOutlined, LayoutOutlined } from "@ant-design/icons";
import NodeIndexOutlined from "@ant-design/icons/lib/icons/NodeIndexOutlined";
import { SiFigma } from "react-icons/si";
import { useDropdown } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import ColorPicker from "@/shared/ui/ColorPicker";
import "./SlideToolbar.css";

type BlockType = "paragraph" | "quote" | "code" | "h1" | "h2" | "ul" | "ol";

const supportedBlockTypes = new Set<BlockType>([
  "paragraph",
  "quote",
  "code",
  "h1",
  "h2",
  "ul",
  "ol",
]);

const blockTypeToBlockName: Record<BlockType | "h3" | "h4" | "h5", string> = {
  code: "Code Block",
  h1: "Large Heading",
  h2: "Small Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  ol: "Numbered List",
  paragraph: "Normal",
  quote: "Quote",
  ul: "Bulleted List",
};

const FONT_FAMILIES = [
  "Helvetica Special",
  "Helvetica Black",
  "Helvetica Light",
  "Helvetica Neue",
  "Helvetica Medium",
  "mylg-serif",
] as const;

const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px", "48px"] as const;

type FontFamily = (typeof FONT_FAMILIES)[number];
type FontSize = (typeof FONT_SIZES)[number];

function Divider() {
  return <div className="divider" />;
}

type SelectProps = {
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  options: string[];
  value: string;
};
function Select({ onChange, className, options, value }: SelectProps) {
  return (
    <select className={className} onChange={onChange} value={value}>
      <option hidden value="" />
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

interface SlideToolbarProps {
  // Slide actions
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onMicToggle?: () => void;
  onSave?: () => void;
  onPreview?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  isMicActive?: boolean;

  // Zoom controls
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;

  // Text formatting commands
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onFormatBold?: () => void;
  onFormatItalic?: () => void;
  onFormatUnderline?: () => void;
  onFormatStrikethrough?: () => void;
  onFormatCode?: () => void;
  onAlignLeft?: () => void;
  onAlignCenter?: () => void;
  onAlignRight?: () => void;
  onAlignJustify?: () => void;
  onSetBlockType?: (type: BlockType) => void;
  onSetFontFamily?: (font: FontFamily) => void;
  onSetFontSize?: (size: FontSize) => void;
  onSetTextColor?: (color: string) => void;
  onSetBgColor?: (color: string) => void;
  onInsertImage?: () => void;
  onInsertVector?: () => void;
  onInsertFigma?: () => void;
  onInsertLayout?: () => void;

  // Text formatting state
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  isCode?: boolean;
  blockType?: BlockType;
  fontFamily?: FontFamily;
  fontSize?: FontSize;
  textColor?: string;
  bgColor?: string;
  codeLanguage?: string;
  onSetCodeLanguage?: (lang: string) => void;
}

const SlideToolbar: React.FC<SlideToolbarProps> = ({
  // Slide actions
  onDuplicate,
  onDelete,
  onExport,
  onMicToggle,
  onSave,
  onPreview,
  isSaving = false,
  isDirty = false,
  isMicActive = false,

  // Zoom controls
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,

  // Text formatting commands
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onFormatBold,
  onFormatItalic,
  onFormatUnderline,
  onFormatStrikethrough,
  onFormatCode,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignJustify,
  onSetBlockType,
  onSetFontFamily,
  onSetFontSize,
  onSetTextColor,
  onSetBgColor,
  onInsertImage,
  onInsertVector,
  onInsertFigma,
  onInsertLayout,

  // Text formatting state
  isBold = false,
  isItalic = false,
  isUnderline = false,
  isStrikethrough = false,
  isCode = false,
  blockType = "paragraph",
  fontFamily = "Helvetica Neue",
  fontSize = "16px",
  textColor = "#000000",
  bgColor = "#ffffff",
  codeLanguage = "",
  onSetCodeLanguage,
}) => {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const blockButtonRef = useRef<HTMLButtonElement | null>(null);
  const alignButtonRef = useRef<HTMLButtonElement | null>(null);
  const insertButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontButtonRef = useRef<HTMLButtonElement | null>(null);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const blockDropdownId = "block-dropdown";
  const alignDropdownId = "align-dropdown";
  const insertDropdownId = "insert-dropdown";
  const fontDropdownId = "font-dropdown";
  const colorDropdownId = "color-dropdown";
  const moreDropdownId = "more-dropdown";

  const codeLanguages = useMemo(() => getCodeLanguages(), []);

  const handleDropdownToggle = (dropdownId: string, buttonRef: React.RefObject<HTMLButtonElement>) => {
    if (activeDropdown === dropdownId) {
      closeDropdown();
    } else {
      openDropdown(dropdownId, buttonRef.current);
    }
  };

  const handleBlockDropdownToggle = () => {
    handleDropdownToggle(blockDropdownId, blockButtonRef);
  };

  const handleAlignDropdownToggle = () => {
    handleDropdownToggle(alignDropdownId, alignButtonRef);
  };

  const handleInsertDropdownToggle = () => {
    handleDropdownToggle(insertDropdownId, insertButtonRef);
  };

  const handleFontDropdownToggle = () => {
    handleDropdownToggle(fontDropdownId, fontButtonRef);
  };

  const handleColorDropdownToggle = () => {
    handleDropdownToggle(colorDropdownId, colorButtonRef);
  };

  const handleMoreDropdownToggle = () => {
    handleDropdownToggle(moreDropdownId, moreButtonRef);
  };

  const handleDropdownItemClick = (type: BlockType) => {
    onSetBlockType?.(type);
    closeDropdown();
  };

  const handleFontFamilySelect = (font: FontFamily) => {
    onSetFontFamily?.(font);
    closeDropdown();
  };

  const handleFontSizeSelect = (size: FontSize) => {
    onSetFontSize?.(size);
    closeDropdown();
  };

  const handleTextColorSelect = (e: { target: { value: string } }) => {
    onSetTextColor?.(e.target.value);
  };

  const handleBgColorSelect = (e: { target: { value: string } }) => {
    onSetBgColor?.(e.target.value);
  };

  const handleInsertImage = () => {
    onInsertImage?.();
    closeDropdown();
  };

  const handleInsertVector = () => {
    onInsertVector?.();
    closeDropdown();
  };

  const handleInsertFigma = () => {
    onInsertFigma?.();
    closeDropdown();
  };

  const handleInsertLayout = () => {
    onInsertLayout?.();
    closeDropdown();
  };

  const handleAlignLeftClick = () => {
    onAlignLeft?.();
    closeDropdown();
  };

  const handleAlignCenterClick = () => {
    onAlignCenter?.();
    closeDropdown();
  };

  const handleAlignRightClick = () => {
    onAlignRight?.();
    closeDropdown();
  };

  const handleAlignJustifyClick = () => {
    onAlignJustify?.();
    closeDropdown();
  };

  const handleListUlClick = () => {
    onSetBlockType?.("ul");
    closeDropdown();
  };

  const handleListOlClick = () => {
    onSetBlockType?.("ol");
    closeDropdown();
  };

  return (
    <div className="slide-toolbar" ref={toolbarRef}>
      {/* Compact Single-Line Layout */}
      <div className="toolbar-content">
        {/* Save Status */}
        <div className="save-status">
          {isSaving ? (
            <>
              <Clock size={16} />
              <span className="save-status__text">Saving…</span>
            </>
          ) : isDirty ? (
            <span className="save-status__text save-status__text--dirty">Unsaved</span>
          ) : (
            <span className="save-status__text save-status__text--clean">Saved</span>
          )}
        </div>

        {/* Save Button */}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="toolbar-item save"
            disabled={isSaving}
            title="Save slide"
          >
            <Save size={18} />
            <span className="toolbar-item__label">Save</span>
          </button>
        )}

        <Divider />

        {/* History Group: Undo/Redo */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="toolbar-item"
          title="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="toolbar-item"
          title="Redo"
        >
          <Redo2 size={18} />
        </button>

        <Divider />

        {/* Text Style Dropdown (Block Type) */}
        {supportedBlockTypes.has(blockType) && (
          <>
            <button
              type="button"
              className="toolbar-item block-controls"
              onClick={handleBlockDropdownToggle}
              ref={blockButtonRef}
              title="Text style"
            >
              <span className={"icon block-type " + blockType} />
              <i className="chevron-down" />
            </button>

            {activeDropdown === blockDropdownId && ReactDOM.createPortal(
              <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("paragraph")}
                >
                  <span className="icon">¶</span>
                  <span className="text">Body</span>
                  {blockType === "paragraph" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("h1")}
                >
                  <span className="icon">H1</span>
                  <span className="text">Heading</span>
                  {blockType === "h1" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("h2")}
                >
                  <span className="icon">H2</span>
                  <span className="text">Subheading</span>
                  {blockType === "h2" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("quote")}
                >
                  <span className="icon">❝</span>
                  <span className="text">Quote</span>
                  {blockType === "quote" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("code")}
                >
                  <span className="icon">&lt;/&gt;</span>
                  <span className="text">Code</span>
                  {blockType === "code" && <span className="active">✓</span>}
                </button>
              </div>,
              document.body
            )}
          </>
        )}

        {/* Bold/Italic/Underline Inline Icons */}
        {blockType !== "code" && (
          <>
            <button
              type="button"
              onClick={onFormatBold}
              className={"toolbar-item" + (isBold ? " active" : "")}
              title="Bold"
            >
              <Bold size={18} />
            </button>
            <button
              type="button"
              onClick={onFormatItalic}
              className={"toolbar-item" + (isItalic ? " active" : "")}
              title="Italic"
            >
              <Italic size={18} />
            </button>
            <button
              type="button"
              onClick={onFormatUnderline}
              className={"toolbar-item" + (isUnderline ? " active" : "")}
              title="Underline"
            >
              <Underline size={18} />
            </button>

            {/* Align & List Dropdown */}
            <button
              type="button"
              className="toolbar-item align-trigger"
              onClick={handleAlignDropdownToggle}
              ref={alignButtonRef}
              title="Align & Lists"
            >
              <AlignLeft size={18} />
              <i className="chevron-down" />
            </button>

            {activeDropdown === alignDropdownId && ReactDOM.createPortal(
              <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                <button
                  type="button"
                  className="item"
                  onClick={handleAlignLeftClick}
                >
                  <AlignLeft size={18} className="dropdown-icon" />
                  <span className="text">Align Left</span>
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={handleAlignCenterClick}
                >
                  <AlignCenter size={18} className="dropdown-icon" />
                  <span className="text">Align Center</span>
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={handleAlignRightClick}
                >
                  <AlignRight size={18} className="dropdown-icon" />
                  <span className="text">Align Right</span>
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={handleAlignJustifyClick}
                >
                  <AlignJustify size={18} className="dropdown-icon" />
                  <span className="text">Justify</span>
                </button>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="item"
                  onClick={handleListUlClick}
                >
                  <span className="icon">•</span>
                  <span className="text">Bulleted List</span>
                  {blockType === "ul" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={handleListOlClick}
                >
                  <span className="icon">1.</span>
                  <span className="text">Numbered List</span>
                  {blockType === "ol" && <span className="active">✓</span>}
                </button>
              </div>,
              document.body
            )}

            <Divider />

            {/* Font Dropdown */}
            <button
              type="button"
              className="toolbar-item font-trigger"
              onClick={handleFontDropdownToggle}
              ref={fontButtonRef}
              title="Font family & size"
            >
              <span className="toolbar-item__label">Aa</span>
              <i className="chevron-down" />
            </button>

            {activeDropdown === fontDropdownId && ReactDOM.createPortal(
              <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                <div className="font-section">
                  <label>Family</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => handleFontFamilySelect(e.target.value as FontFamily)}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="font-section">
                  <label>Size</label>
                  <select
                    value={fontSize}
                    onChange={(e) => handleFontSizeSelect(e.target.value as FontSize)}
                  >
                    {FONT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>,
              document.body
            )}

            {/* Color Dropdown */}
            <button
              type="button"
              className="toolbar-item color-trigger"
              onClick={handleColorDropdownToggle}
              ref={colorButtonRef}
              title="Text & background color"
            >
              <div className="color-swatch" style={{ background: textColor }} />
              <i className="chevron-down" />
            </button>

            {activeDropdown === colorDropdownId && ReactDOM.createPortal(
              <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                <div className="color-section">
                  <label>Text Color</label>
                  <ColorPicker
                    color={textColor}
                    onChange={handleTextColorSelect}
                  />
                </div>
                <div className="color-section">
                  <label>Background</label>
                  <ColorPicker
                    color={bgColor}
                    onChange={handleBgColorSelect}
                  />
                </div>
              </div>,
              document.body
            )}

            <Divider />

            {/* Insert Dropdown */}
            <button
              type="button"
              className="toolbar-item insert-trigger"
              onClick={handleInsertDropdownToggle}
              ref={insertButtonRef}
              title="Insert content"
            >
              <FileImageOutlined style={{ fontSize: "18px" }} />
              <i className="chevron-down" />
            </button>
            {activeDropdown === insertDropdownId && ReactDOM.createPortal(
              <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                <button type="button" className="item" onClick={handleInsertImage}>
                  <FileImageOutlined className="dropdown-icon" />
                  <span className="text">Image</span>
                </button>
                <button type="button" className="item" onClick={handleInsertVector}>
                  <NodeIndexOutlined className="dropdown-icon" />
                  <span className="text">Vector</span>
                </button>
                <button type="button" className="item" onClick={handleInsertFigma}>
                  <SiFigma className="dropdown-icon" size={16} />
                  <span className="text">Figma</span>
                </button>
                <button type="button" className="item" onClick={handleInsertLayout}>
                  <LayoutOutlined className="dropdown-icon" />
                  <span className="text">Layout</span>
                </button>
              </div>,
              document.body
            )}

            <Divider />

            {/* Zoom Controls */}
            <div className="zoom-controls">
              <button
                type="button"
                onClick={onZoomOut}
                className="toolbar-item"
                title="Zoom out"
                disabled={zoom <= 25}
              >
                <ZoomOut size={18} />
              </button>
              <span className="zoom-display">{zoom}%</span>
              <button
                type="button"
                onClick={onZoomIn}
                className="toolbar-item"
                title="Zoom in"
                disabled={zoom >= 200}
              >
                <ZoomIn size={18} />
              </button>
              <button
                type="button"
                onClick={onResetZoom}
                className="toolbar-item"
                title="Reset zoom"
                disabled={zoom === 100}
              >
                <RotateCcw size={18} />
              </button>
            </div>

            {/* More Menu (Mobile Overflow) */}
            {(onMicToggle || onDuplicate || onDelete || onExport || onPreview) && (
              <>
                <button
                  type="button"
                  className="toolbar-item more-trigger"
                  onClick={handleMoreDropdownToggle}
                  ref={moreButtonRef}
                  title="More actions"
                >
                  <MoreHorizontal size={18} />
                </button>
                {activeDropdown === moreDropdownId && ReactDOM.createPortal(
                  <div className="dropdown dropdown--right" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                    {onMicToggle && (
                      <button
                        type="button"
                        className={"item" + (isMicActive ? " active" : "")}
                        onClick={() => {
                          onMicToggle();
                          closeDropdown();
                        }}
                      >
                        <Mic size={18} className="dropdown-icon" />
                        <span className="text">{isMicActive ? "Stop Recording" : "Start Recording"}</span>
                      </button>
                    )}
                    {onDuplicate && (
                      <button
                        type="button"
                        className="item"
                        onClick={() => {
                          onDuplicate();
                          closeDropdown();
                        }}
                      >
                        <Copy size={18} className="dropdown-icon" />
                        <span className="text">Duplicate</span>
                      </button>
                    )}
                    {onExport && (
                      <button
                        type="button"
                        className="item"
                        onClick={() => {
                          onExport();
                          closeDropdown();
                        }}
                      >
                        <Download size={18} className="dropdown-icon" />
                        <span className="text">Export</span>
                      </button>
                    )}
                    {onPreview && (
                      <button
                        type="button"
                        className="item"
                        onClick={() => {
                          onPreview();
                          closeDropdown();
                        }}
                      >
                        <Eye size={18} className="dropdown-icon" />
                        <span className="text">Preview</span>
                      </button>
                    )}
                    {onDelete && (
                      <>
                        <div className="dropdown-divider" />
                        <button
                          type="button"
                          className="item item--danger"
                          onClick={() => {
                            onDelete();
                            closeDropdown();
                          }}
                        >
                          <Trash2 size={18} className="dropdown-icon" />
                          <span className="text">Delete</span>
                        </button>
                      </>
                    )}
                  </div>,
                  document.body
                )}
              </>
            )}
          </>
        )}

        {blockType === "code" && (
          <>
            <Select
              className="toolbar-item code-language"
              onChange={(e) => onSetCodeLanguage?.(e.target.value)}
              options={codeLanguages}
              value={codeLanguage}
            />
            <i className="chevron-down inside" />
          </>
        )}
      </div>
    </div>
  );
};

export default SlideToolbar;
