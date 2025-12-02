// components/SlideToolbar.tsx - Compact single-line toolbar with icon groups
import React, { useMemo, useRef, type ChangeEvent } from "react";
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
            <span className="save-status__text save-status__text--dirty">Unsaved changes</span>
          ) : (
            <span className="save-status__text save-status__text--clean">All changes saved</span>
          )}
        </div>

        <Divider />

        {/* Undo/Redo */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="toolbar-item spaced"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="toolbar-item"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>

        <Divider />

        {/* Mic Button */}
        {onMicToggle && (
          <button
            onClick={onMicToggle}
            className={`toolbar-item ${isMicActive ? "mic-active" : ""}`}
          >
            <Mic size={16} />
            {isMicActive ? "Stop" : "Mic"}
          </button>
        )}

        {/* Duplicate Button */}
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="toolbar-item"
          >
            <Copy size={16} />
            
          </button>
        )}

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="toolbar-item delete"
          >
            <Trash2 size={16} />
            
          </button>
        )}

        {/* Export Button */}
        {onExport && (
          <button
            onClick={onExport}
            className="toolbar-item"
          >
            <Download size={16} />
            
          </button>
        )}

        {/* Save Button */}
        {onSave && (
          <button
            onClick={onSave}
            className="toolbar-item save"
            disabled={isSaving}
          >
            <Save size={16} />
            Save
          </button>
        )}

        <Divider />

        {/* Zoom Controls */}
        <div className="zoom-controls">
          <button
            type="button"
            onClick={onZoomOut}
            className="toolbar-item"
            aria-label="Zoom Out"
            disabled={zoom <= 25}
          >
            <ZoomOut size={16} />
          </button>
          <span className="zoom-display">{zoom}%</span>
          <button
            type="button"
            onClick={onZoomIn}
            className="toolbar-item"
            aria-label="Zoom In"
            disabled={zoom >= 200}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="toolbar-item"
            aria-label="Reset Zoom"
            disabled={zoom === 100}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        <Divider />
      </div>

      {/* Text Formatting Section */}
      <div className="text-formatting">
        {supportedBlockTypes.has(blockType) && (
          <>
            <button
              type="button"
              className="toolbar-item block-controls"
              onClick={handleBlockDropdownToggle}
              ref={blockButtonRef}
              aria-label="Formatting Options"
            >
              <span className={"icon block-type " + blockType} />
              <span className="text">{blockTypeToBlockName[blockType]}</span>
              <i className="chevron-down" />
            </button>

            {activeDropdown === blockDropdownId && (
              <div className="dropdown" ref={dropdownRef}>
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
                  onClick={() => handleDropdownItemClick("ul")}
                >
                  <span className="icon">•</span>
                  <span className="text">Bulleted</span>
                  {blockType === "ul" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("ol")}
                >
                  <span className="icon">1.</span>
                  <span className="text">Numbered</span>
                  {blockType === "ol" && <span className="active">✓</span>}
                </button>
              </div>
            )}
            <Divider />
          </>
        )}

        {blockType !== "code" && (
          <>
            <button
              type="button"
              onClick={onFormatBold}
              className={"toolbar-item spaced " + (isBold ? "active" : "")}
              aria-label="Format Bold"
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              onClick={onFormatItalic}
              className={"toolbar-item spaced " + (isItalic ? "active" : "")}
              aria-label="Format Italics"
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              onClick={onFormatUnderline}
              className={"toolbar-item spaced " + (isUnderline ? "active" : "")}
              aria-label="Format Underline"
            >
              <Underline size={16} />
            </button>
            <button
              type="button"
              onClick={onFormatStrikethrough}
              className={"toolbar-item spaced " + (isStrikethrough ? "active" : "")}
              aria-label="Format Strikethrough"
            >
              <Strikethrough size={16} />
            </button>
            <button
              type="button"
              onClick={onFormatCode}
              className={"toolbar-item spaced " + (isCode ? "active" : "")}
              aria-label="Insert Code"
            >
              <Code size={16} />
            </button>

            <Divider />

            <button
              type="button"
              onClick={onAlignLeft}
              className="toolbar-item spaced"
              aria-label="Left Align"
            >
              <AlignLeft size={16} />
            </button>
            <button
              type="button"
              onClick={onAlignCenter}
              className="toolbar-item spaced"
              aria-label="Center Align"
            >
              <AlignCenter size={16} />
            </button>
            <button
              type="button"
              onClick={onAlignRight}
              className="toolbar-item spaced"
              aria-label="Right Align"
            >
              <AlignRight size={16} />
            </button>
            <button
              type="button"
              onClick={onAlignJustify}
              className="toolbar-item"
              aria-label="Justify Align"
            >
              <AlignJustify size={16} />
            </button>

            <Divider />

            {/* Font Controls */}
            <button
              type="button"
              className="toolbar-item"
              onClick={handleFontDropdownToggle}
              ref={fontButtonRef}
              aria-label="Font Options"
            >
              <span className="text">Font</span>
              <i className="chevron-down" />
            </button>

            {activeDropdown === fontDropdownId && (
              <div className="dropdown" ref={dropdownRef}>
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
              </div>
            )}

            <Divider />

            {/* Color Controls */}
            <button
              type="button"
              className="toolbar-item"
              onClick={handleColorDropdownToggle}
              ref={colorButtonRef}
              aria-label="Color Options"
            >
              <span className="text">Color</span>
              <i className="chevron-down" />
            </button>

            {activeDropdown === colorDropdownId && (
              <div className="dropdown" ref={dropdownRef}>
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
              </div>
            )}

            <Divider />

            <button
              type="button"
              className="toolbar-item"
              onClick={handleInsertDropdownToggle}
              ref={insertButtonRef}
              aria-label="Insert Options"
            >
              <span className="text">Insert</span>
              <i className="chevron-down" />
            </button>
            {activeDropdown === insertDropdownId && (
              <div className="dropdown" ref={dropdownRef}>
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
              </div>
            )}

            <Divider />

            {onPreview && (
              <button
                type="button"
                onClick={onPreview}
                className="toolbar-item spaced"
                aria-label="Preview"
              >
                <Eye size={16} />
              </button>
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
