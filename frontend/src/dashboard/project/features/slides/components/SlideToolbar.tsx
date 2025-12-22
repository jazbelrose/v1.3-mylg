import React, { useMemo, useRef, type ChangeEvent, useEffect, useState } from "react";
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
  Type,
  Plus,
  BringToFront,
  SendToBack,
  Lock,
} from "lucide-react";
import { getCodeLanguages } from "@lexical/code";
import { FileImageOutlined, LayoutOutlined } from "@ant-design/icons";
import NodeIndexOutlined from "@ant-design/icons/lib/icons/NodeIndexOutlined";
import { SiFigma } from "react-icons/si";
import { useDropdown } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import ColorPicker from "@/shared/ui/ColorPicker";
import {
  useToolbarContextBridge,
} from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarContextBridge";
import {
  BLOCK_TYPE_LABELS,
  FONT_FAMILIES,
  FONT_SIZES,
  SUPPORTED_BLOCK_TYPES,
  type FontFamily,
  type FontSize,
  type TextBlockType,
} from "@/dashboard/project/features/editor/components/Brief/plugins/toolbarShared";
import "./SlideToolbar.css";

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
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onNewSlide?: () => void;
  onMicToggle?: () => void;
  onSave?: () => void;
  onPreview?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  isMicActive?: boolean;

  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onSetZoom?: (level: number) => void;

  onUndo?: () => void;
  onRedo?: () => void;
  onFormatBold?: () => void;
  onFormatItalic?: () => void;
  onFormatUnderline?: () => void;
  onFormatStrikethrough?: () => void;
  onFormatCode?: () => void;
  onAlignLeft?: () => void;
  onAlignCenter?: () => void;
  onAlignRight?: () => void;
  onAlignJustify?: () => void;
  onSetBlockType?: (type: TextBlockType) => void;
  onSetFontFamily?: (font: FontFamily) => void;
  onSetFontSize?: (size: FontSize) => void;
  onSetTextColor?: (color: string) => void;
  onSetBgColor?: (color: string) => void;
  onSetSlideBackgroundColor?: (color: string) => void;
  slideBackgroundColor?: string;
  onInsertImage?: () => void;
  onInsertVector?: () => void;
  onInsertTextBox?: () => void;
  onInsertFigma?: () => void;
  onInsertLayout?: (template: string) => void;
  onSetCodeLanguage?: (lang: string) => void;

  onDeleteSelection?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onDuplicateSelection?: () => void;
  onLockSelection?: () => void;
}

const SlideToolbar: React.FC<SlideToolbarProps> = ({
  onDuplicate,
  onDelete,
  onExport,
  onNewSlide,
  onMicToggle,
  onSave,
  onPreview,
  isSaving = false,
  isDirty = false,
  isMicActive = false,

  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetZoom,

  onUndo,
  onRedo,
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
  onSetSlideBackgroundColor,
  slideBackgroundColor = "#101112",
  onInsertImage,
  onInsertVector,
  onInsertTextBox,
  onInsertFigma,
  onInsertLayout,
  onSetCodeLanguage,
  onDeleteSelection,
  onBringToFront,
  onSendToBack,
  onDuplicateSelection,
  onLockSelection,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { ctx, text, history } = useToolbarContextBridge();
  const blockButtonRef = useRef<HTMLButtonElement | null>(null);
  const alignButtonRef = useRef<HTMLButtonElement | null>(null);
  const insertButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontButtonRef = useRef<HTMLButtonElement | null>(null);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const slideBgButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const layoutButtonRef = useRef<HTMLButtonElement | null>(null);
  const zoomButtonRef = useRef<HTMLButtonElement | null>(null);

  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const blockDropdownId = "block-dropdown";
  const alignDropdownId = "align-dropdown";
  const insertDropdownId = "insert-dropdown";
  const fontDropdownId = "font-dropdown";
  const colorDropdownId = "color-dropdown";
  const slideBgDropdownId = "slide-bg-dropdown";
  const moreDropdownId = "more-dropdown";
  const layoutDropdownId = "layout-dropdown";
  const zoomDropdownId = "zoom-dropdown";

  const codeLanguages = useMemo(() => getCodeLanguages(), []);

  useEffect(() => {
    const handleResize = () => {
      if (!toolbarRef.current) return;
      const width = toolbarRef.current.offsetWidth;
      const newCollapsed = new Set<string>();
      // Simple priority: hide slide bg if < 1000
      if (width < 1000) newCollapsed.add('slide-bg');
      setCollapsedGroups(newCollapsed);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDropdownToggle = (
    dropdownId: string,
    buttonRef: React.RefObject<HTMLButtonElement>
  ) => {
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

  const handleSlideBgDropdownToggle = () => {
    handleDropdownToggle(slideBgDropdownId, slideBgButtonRef);
  };

  const handleMoreDropdownToggle = () => {
    handleDropdownToggle(moreDropdownId, moreButtonRef);
  };

  const handleLayoutDropdownToggle = () => {
    handleDropdownToggle(layoutDropdownId, layoutButtonRef);
  };

  const handleZoomDropdownToggle = () => {
    handleDropdownToggle(zoomDropdownId, zoomButtonRef);
  };

  const handleBlockTypeClick = (type: TextBlockType) => {
    onSetBlockType?.(type);
    closeDropdown();
  };

  const callAndClose = (fn?: () => void) => () => {
    fn?.();
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

  const handleSlideBgColorSelect = (e: { target: { value: string } }) => {
    onSetSlideBackgroundColor?.(e.target.value);
  };

  const handleInsert = (fn?: () => void) => {
    fn?.();
    closeDropdown();
  };

  const handleZoomPreset = (level: number) => {
    onSetZoom?.(level);
    closeDropdown();
  };

  const renderTextContext = () => {
    if (!SUPPORTED_BLOCK_TYPES.has(text.blockType)) {
      return null;
    }

    return (
      <div className="context-panel">
        <div className="context-controls">
          <button
            type="button"
            className="toolbar-item block-controls"
            onClick={handleBlockDropdownToggle}
            ref={blockButtonRef}
            title="Text style"
          >
            <span className="toolbar-item__label">{BLOCK_TYPE_LABELS[text.blockType]}</span>
            <i className="chevron-down" />
          </button>
          {activeDropdown === blockDropdownId &&
            ReactDOM.createPortal(
              <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
                {Array.from(SUPPORTED_BLOCK_TYPES).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="item"
                    onClick={() => handleBlockTypeClick(type)}
                  >
                    <span className="text">{BLOCK_TYPE_LABELS[type]}</span>
                    {text.blockType === type && <span className="active">✓</span>}
                  </button>
                ))}
              </div>,
              document.body
            )}

          <button
            type="button"
            onClick={onFormatBold}
            className={`toolbar-item${text.isBold ? " active" : ""}`}
            title="Bold"
          >
            <Bold size={18} />
          </button>
          <button
            type="button"
            onClick={onFormatItalic}
            className={`toolbar-item${text.isItalic ? " active" : ""}`}
            title="Italic"
          >
            <Italic size={18} />
          </button>
          <button
            type="button"
            onClick={onFormatUnderline}
            className={`toolbar-item${text.isUnderline ? " active" : ""}`}
            title="Underline"
          >
            <Underline size={18} />
          </button>
          <button
            type="button"
            onClick={onFormatStrikethrough}
            className={`toolbar-item${text.isStrikethrough ? " active" : ""}`}
            title="Strikethrough"
          >
            <Strikethrough size={18} />
          </button>
          <button
            type="button"
            onClick={onFormatCode}
            className={`toolbar-item${text.isCode ? " active" : ""}`}
            title="Code"
          >
            <Code size={18} />
          </button>

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
          {activeDropdown === alignDropdownId &&
            ReactDOM.createPortal(
              <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
                <button type="button" className="item" onClick={callAndClose(onAlignLeft)}>
                  <AlignLeft size={18} className="dropdown-icon" />
                  <span className="text">Align Left</span>
                </button>
                <button type="button" className="item" onClick={callAndClose(onAlignCenter)}>
                  <AlignCenter size={18} className="dropdown-icon" />
                  <span className="text">Align Center</span>
                </button>
                <button type="button" className="item" onClick={callAndClose(onAlignRight)}>
                  <AlignRight size={18} className="dropdown-icon" />
                  <span className="text">Align Right</span>
                </button>
                <button type="button" className="item" onClick={callAndClose(onAlignJustify)}>
                  <AlignJustify size={18} className="dropdown-icon" />
                  <span className="text">Justify</span>
                </button>
                <div className="dropdown-divider" />
                <button type="button" className="item" onClick={callAndClose(() => onSetBlockType?.("ul"))}>
                  <List size={18} className="dropdown-icon" />
                  <span className="text">Bulleted List</span>
                </button>
                <button type="button" className="item" onClick={callAndClose(() => onSetBlockType?.("ol"))}>
                  <span className="dropdown-icon">1.</span>
                  <span className="text">Numbered List</span>
                </button>
              </div>,
              document.body
            )}

          <button
            type="button"
            className="toolbar-item font-trigger"
            onClick={handleFontDropdownToggle}
            ref={fontButtonRef}
            title="Font family & size"
          >
            <span className="toolbar-item__label">{text.fontFamily}</span>
            <i className="chevron-down" />
          </button>
          {activeDropdown === fontDropdownId &&
            ReactDOM.createPortal(
              <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
                <div className="font-section">
                  <label>Family</label>
                  <select
                    value={text.fontFamily}
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
                    value={text.fontSize}
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

          <button
            type="button"
            className="toolbar-item color-trigger"
            onClick={handleColorDropdownToggle}
            ref={colorButtonRef}
            title="Text & background color"
          >
            <div className="color-swatch" style={{ background: text.textColor }} />
            <i className="chevron-down" />
          </button>
          {activeDropdown === colorDropdownId &&
            ReactDOM.createPortal(
              <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
                <div className="color-section">
                  <label>Text Color</label>
                  <ColorPicker color={text.textColor} onChange={handleTextColorSelect} />
                </div>
                <div className="color-section">
                  <label>Highlight</label>
                  <ColorPicker color={text.bgColor} onChange={handleBgColorSelect} />
                </div>
              </div>,
              document.body
            )}

          {text.blockType === "code" && (
            <Select
              className="toolbar-item code-language"
              onChange={(e) => onSetCodeLanguage?.(e.target.value)}
              options={codeLanguages}
              value={text.codeLanguage}
            />
          )}
        </div>
      </div>
    );
  };

  const renderObjectContext = (label: string, options: { showReplace?: boolean } = { showReplace: true }) => {
    const hasArrange = Boolean(onBringToFront || onSendToBack);
    return (
      <div className="context-panel">
        <div className="context-controls compact">
          {options.showReplace && (
            <button
              type="button"
              className="toolbar-item"
              onClick={() => handleInsert(onInsertImage)}
              title="Replace Image"
            >
              <FileImageOutlined className="dropdown-icon" />
              <span>Replace</span>
            </button>
          )}
          {hasArrange && (
            <>
              <button type="button" className="toolbar-item" onClick={onBringToFront} title="Bring to Front">
                <BringToFront size={18} />
              </button>
              <button type="button" className="toolbar-item" onClick={onSendToBack} title="Send to Back">
                <SendToBack size={18} />
              </button>
            </>
          )}
          {label === "Image" && (
            <>
              <button type="button" className="toolbar-item" onClick={onDuplicateSelection} title="Duplicate">
                <Copy size={18} />
                <span>Duplicate</span>
              </button>
              <button type="button" className="toolbar-item" onClick={onLockSelection} title="Lock">
                <Lock size={18} />
                <span>Lock</span>
              </button>
            </>
          )}
          <button type="button" className="toolbar-item danger" onClick={onDeleteSelection} title="Delete">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    );
  };

  const renderCanvasContext = () => (
    <div className="context-panel">
      <div className="context-controls compact">
        
      </div>
    </div>
  );

  const renderMixedContext = () => (
    <div className="context-panel">
      <div className="context-hint">Arrange or align via right-click menu.</div>
    </div>
  );

  const renderContextPanel = () => {
    switch (ctx.type) {
      case "text":
        return renderTextContext();
      case "image":
        return renderObjectContext("Image", { showReplace: false });
      case "textbox":
        return renderObjectContext("Text Box", { showReplace: false });
      case "mixed":
        return renderMixedContext();
      default:
        return renderCanvasContext();
    }
  };

  return (
    <div className={`slide-toolbar${ctx.type === "image" ? " slide-toolbar--image-context" : ""}`} ref={toolbarRef}>
      <div className="toolbar-left">
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="toolbar-item save"
            disabled={isSaving}
            title="Save slide"
          >
            <Save size={18} />
          </button>
        )}
        {onNewSlide && (
          <button
            type="button"
            className="toolbar-item"
            onClick={onNewSlide}
            title="New slide"
          >
            <Plus size={18} />
          </button>
        )}

        <Divider />

        <button
          type="button"
          disabled={!history.canUndo}
          onClick={onUndo}
          className="toolbar-item"
          title="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          disabled={!history.canRedo}
          onClick={onRedo}
          className="toolbar-item"
          title="Redo"
        >
          <Redo2 size={18} />
        </button>

        <Divider />

        <button
          type="button"
          className="toolbar-item zoom-trigger"
          onClick={handleZoomDropdownToggle}
          ref={zoomButtonRef}
          title="Zoom"
        >
          <span className="toolbar-item__label">{zoom}%</span>
          <i className="chevron-down" />
        </button>
        {activeDropdown === zoomDropdownId &&
          ReactDOM.createPortal(
            <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
              <button type="button" className="item" onClick={callAndClose(onZoomIn)} disabled={zoom >= 200}>
                <ZoomIn size={18} className="dropdown-icon" />
                <span className="text">Zoom In</span>
              </button>
              <button type="button" className="item" onClick={callAndClose(onZoomOut)} disabled={zoom <= 25}>
                <ZoomOut size={18} className="dropdown-icon" />
                <span className="text">Zoom Out</span>
              </button>
              <button type="button" className="item" onClick={callAndClose(onResetZoom)} disabled={zoom === 100}>
                <RotateCcw size={18} className="dropdown-icon" />
                <span className="text">Reset Zoom</span>
              </button>
              <div className="dropdown-divider" />
              {[50, 75, 100, 125, 150, 200].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`item${zoom === level ? " active" : ""}`}
                  disabled={!onSetZoom}
                  onClick={() => handleZoomPreset(level)}
                >
                  <span className="text">{level}%</span>
                  {zoom === level && <span className="active">✓</span>}
                </button>
              ))}
            </div>,
            document.body
          )}

        {!collapsedGroups.has('slide-bg') && (
          <>
            <button
              type="button"
              className="toolbar-item color-trigger"
              onClick={handleSlideBgDropdownToggle}
              ref={slideBgButtonRef}
              title="Slide background color"
            >
              <div
                className="color-swatch"
                style={{ background: slideBackgroundColor, border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </button>
            {activeDropdown === slideBgDropdownId &&
              ReactDOM.createPortal(
                <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
                  <div className="color-section">
                    <label>Slide Background</label>
                    <ColorPicker color={slideBackgroundColor} onChange={handleSlideBgColorSelect} />
                  </div>
                </div>,
                document.body
              )}
          </>
        )}

        {(onMicToggle || onDuplicate || onDelete || onExport || onPreview) && (
          <button
            type="button"
            className="toolbar-item more-trigger"
            onClick={handleMoreDropdownToggle}
            ref={moreButtonRef}
            title="More actions"
          >
            <MoreHorizontal size={18} />
          </button>
        )}
        {activeDropdown === moreDropdownId &&
          ReactDOM.createPortal(
            <div className="dropdown dropdown--right" data-slide-dropdown ref={dropdownRef}>
              {collapsedGroups.has('slide-bg') && (
                <>
                  <button type="button" className="item" onClick={handleSlideBgDropdownToggle}>
                    <div
                      className="color-swatch"
                      style={{ background: slideBackgroundColor, border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                    <span className="text">Slide Background</span>
                  </button>
                  <div className="dropdown-divider" />
                </>
              )}
              {onMicToggle && (
                <button
                  type="button"
                  className={`item${isMicActive ? " active" : ""}`}
                  onClick={() => {
                    onMicToggle();
                    closeDropdown();
                  }}
                >
                  <Mic size={18} className="dropdown-icon" />
                  <span className="text">
                    {isMicActive ? "Stop Recording" : "Start Recording"}
                  </span>
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
                  <span className="text">Duplicate Slide</span>
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
                    <span className="text">Delete Slide</span>
                  </button>
                </>
              )}
            </div>,
            document.body
          )}

        <Divider />

        <button
          type="button"
          className="toolbar-item insert-trigger"
          onClick={handleInsertDropdownToggle}
          ref={insertButtonRef}
          title="Insert content"
        >
          <span className="toolbar-item__label">Insert</span>
        </button>
        {activeDropdown === insertDropdownId &&
          ReactDOM.createPortal(
            <div className="dropdown" data-slide-dropdown ref={dropdownRef}>
              <button type="button" className="item" onClick={() => handleInsert(onInsertTextBox)}>
                <Type className="dropdown-icon" size={18} />
                <span className="text">Text Box</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(onInsertImage)}>
                <FileImageOutlined className="dropdown-icon" />
                <span className="text">Image</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(onInsertVector)}>
                <NodeIndexOutlined className="dropdown-icon" />
                <span className="text">Vector</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(onInsertFigma)}>
                <SiFigma className="dropdown-icon" size={16} />
                <span className="text">Figma</span>
              </button>
              <button
                type="button"
                className="item"
                onClick={handleLayoutDropdownToggle}
                ref={layoutButtonRef}
              >
                <LayoutOutlined className="dropdown-icon" />
                <span className="text">Layout</span>
                <i className="chevron-right" />
              </button>
            </div>,
            document.body
          )}

        {activeDropdown === layoutDropdownId &&
          ReactDOM.createPortal(
            <div
              className="dropdown dropdown--nested"
              data-slide-dropdown
              ref={(node) => {
                if (node && layoutButtonRef.current) {
                  const triggerRect = layoutButtonRef.current.getBoundingClientRect();
                  node.style.position = "fixed";
                  node.style.left = `${triggerRect.left + 12}px`;
                  node.style.top = `${triggerRect.bottom + 4}px`;
                  node.style.zIndex = "1001";
                  node.style.visibility = "visible";
                }
              }}
            >
              <button type="button" className="item" onClick={() => handleInsert(() => onInsertLayout?.("1fr 1fr"))}>
                <span className="text">2 Columns (Equal Width)</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(() => onInsertLayout?.("25% 75%"))}>
                <span className="text">2 Columns (25% - 75%)</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(() => onInsertLayout?.("1fr 1fr 1fr"))}>
                <span className="text">3 Columns (Equal Width)</span>
              </button>
              <button
                type="button"
                className="item"
                onClick={() => handleInsert(() => onInsertLayout?.("25% 50% 25%"))}
              >
                <span className="text">3 Columns (25% - 50% - 25%)</span>
              </button>
              <button
                type="button"
                className="item"
                onClick={() => handleInsert(() => onInsertLayout?.("1fr 1fr 1fr 1fr"))}
              >
                <span className="text">4 Columns (Equal Width)</span>
              </button>
            </div>,
            document.body
          )}

        <Divider />
      </div>

      <div className="toolbar-center">
        {renderContextPanel()}
      </div>

      <div className="toolbar-right">
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
      </div>
    </div>
  );
};

export default SlideToolbar;
