import React, { useMemo, useRef, useCallback, type ChangeEvent, useState, useEffect } from "react";
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
  Upload,
  MoreHorizontal,
  Type,
  Plus,
  Link,
  ChevronDown,
  Unlink,
  RectangleHorizontal,
} from "lucide-react";
import { getCodeLanguages } from "@lexical/code";
import { FileImageOutlined, LayoutOutlined } from "@ant-design/icons";
import NodeIndexOutlined from "@ant-design/icons/lib/icons/NodeIndexOutlined";
import { useDropdown } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import ColorPicker from "@/shared/ui/ColorPicker";
import {
  useToolbarContextBridge,
} from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarContextBridge";
import {
  DEFAULT_IMAGE_BORDER_RADIUS,
  IMAGE_BORDER_RADIUS_KEYS,
  type ImageBorderRadiusKey,
  type ImageBorderRadiusState,
} from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/imageBorderRadius";
import type {
  PictureFrameBorder,
  PictureFrameFitMode,
} from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/PictureFrameNode";
import {
  BLOCK_TYPE_LABELS,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  LETTER_SPACINGS,
  SUPPORTED_BLOCK_TYPES,
  type FontFamily,
  type FontSize,
  type LineHeight,
  type LetterSpacing,
  type TextBlockType,
} from "@/dashboard/project/features/editor/components/Brief/plugins/toolbarShared";
import "./SlideToolbar.css";

function Divider() {
  return <div className="divider" />;
}

type PillSliderDropdownProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unitSuffix?: string;
  dropdownTitle: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled?: boolean;
  inputChWidth?: number;
  onChange: (value: number) => void;
};

function PillSliderDropdown({
  label,
  value,
  min,
  max,
  step = 1,
  unitSuffix,
  dropdownTitle,
  open,
  setOpen,
  disabled = false,
  inputChWidth,
  onChange,
}: PillSliderDropdownProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (popupRef.current?.contains(target) || toggleRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen]);

  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const safeValue = Number.isFinite(value) ? clamp(value) : min;
  const inputStyle = inputChWidth ? ({ width: `${inputChWidth}ch` } as const) : undefined;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className={`corner-pill${open ? " active" : ""}`}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) {
            setOpen(!open);
          }
        }}
        ref={toggleRef}
        aria-expanded={open}
      >
        <span className="corner-pill__label">{label}&nbsp;</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) {
              onChange(clamp(next));
            }
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          className="corner-pill__input"
          style={inputStyle}
          aria-label={dropdownTitle}
          disabled={disabled}
        />
        {unitSuffix ? <span>{unitSuffix}</span> : null}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="corner-dropdown"
          ref={popupRef}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="corner-dropdown__header">
            <span className="corner-dropdown__title">{dropdownTitle}</span>
            <span className="corner-dropdown__header-value">
              {safeValue}
              {unitSuffix}
            </span>
          </div>
          <div
            className="corner-dropdown__slider-row"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={safeValue}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isNaN(next)) {
                  onChange(clamp(next));
                }
              }}
              disabled={disabled}
              className="corner-dropdown__slider"
              aria-label={dropdownTitle}
            />
          </div>
        </div>
      )}
    </div>
  );
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

const CORNER_LABELS: Record<ImageBorderRadiusKey, string> = {
  topLeft: "Top Left",
  topRight: "Top Right",
  bottomRight: "Bottom Right",
  bottomLeft: "Bottom Left",
};

interface SlideToolbarProps {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onExportAllPdf?: (preset?: "screen" | "high" | "print") => void;
  isExportingPdf?: boolean;
  pdfExportProgress?: { current: number; total: number } | null;
  onNewSlide?: () => void;
  onImportPdf?: () => void;
  isImportingPdf?: boolean;
  pdfImportStatus?: "idle" | "uploading" | "processing";
  importProgress?: number;
  importCurrentPage?: number;
  importTotalPages?: number;
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
  onSetLineHeight?: (lineHeight: LineHeight) => void;
  onSetLetterSpacing?: (letterSpacing: LetterSpacing) => void;
  onSetTextColor?: (color: string) => void;
  onSetBgColor?: (color: string) => void;
  onSetSlideBackgroundColor?: (color: string) => void;
  slideBackgroundColor?: string;
  onInsertImage?: () => void;
  onInsertSvg?: () => void;
  onInsertTextBox?: () => void;
  onInsertPictureFrame?: () => void;
  /** Opens the floating layout generator panel */
  onOpenLayoutPanel?: () => void;
  onInsertFigma?: () => void;
  onInsertLayout?: (template: string) => void;
  onSetCodeLanguage?: (lang: string) => void;

  // Property update handlers (used in property bar)
  onUpdateImageBorderRadius?: (updates: Partial<ImageBorderRadiusState>) => void;
  onUpdateImageBorder?: (updates: Partial<PictureFrameBorder>) => void;
  onUpdateTextBoxBorderRadius?: (updates: Partial<ImageBorderRadiusState>) => void;
  onUpdatePictureFrameRadius?: (radius: number) => void;
  onUpdatePictureFrameFit?: (fit: PictureFrameFitMode) => void;
  onUpdatePictureFrameBorder?: (updates: Partial<PictureFrameBorder>) => void;
  onUpdateTextBoxBorder?: (updates: Partial<PictureFrameBorder>) => void;

  // Deck version props
  versionDropdown?: React.ReactNode;
}

const SlideToolbar: React.FC<SlideToolbarProps> = ({
  onDuplicate,
  onDelete,
  onExport,
  onExportAllPdf,
  isExportingPdf = false,
  pdfExportProgress,
  onNewSlide,
  onImportPdf,
  isImportingPdf = false,
  pdfImportStatus,
  importProgress,
  importCurrentPage,
  importTotalPages,
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
  onSetLineHeight,
  onSetLetterSpacing,
  onSetTextColor,
  onSetBgColor,
  onSetSlideBackgroundColor,
  slideBackgroundColor = "#101112",
  onInsertImage,
  onInsertSvg,
  onInsertTextBox,
  onInsertPictureFrame,
  onOpenLayoutPanel,
  onSetCodeLanguage,
  onUpdateImageBorderRadius,
  onUpdateImageBorder,
  onUpdateTextBoxBorderRadius,
  onUpdatePictureFrameRadius,
  onUpdatePictureFrameFit,
  onUpdatePictureFrameBorder,
  onUpdateTextBoxBorder,
  versionDropdown,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [cornersLinked, setCornersLinked] = useState(true);
  const [showCornerPopup, setShowCornerPopup] = useState(false);
  const cornerPopupRef = useRef<HTMLDivElement | null>(null);
  const cornerPopupToggleRef = useRef<HTMLButtonElement | null>(null);

  const [textBoxCornersLinked, setTextBoxCornersLinked] = useState(true);
  const [showTextBoxCornerPopup, setShowTextBoxCornerPopup] = useState(false);
  const textBoxCornerPopupRef = useRef<HTMLDivElement | null>(null);
  const textBoxCornerPopupToggleRef = useRef<HTMLButtonElement | null>(null);

  const [showImageBorderPopup, setShowImageBorderPopup] = useState(false);
  const [showTextBoxBorderPopup, setShowTextBoxBorderPopup] = useState(false);

  const [showPictureFrameCornersPopup, setShowPictureFrameCornersPopup] = useState(false);
  const [showPictureFrameBorderPopup, setShowPictureFrameBorderPopup] = useState(false);

  const { ctx, text, history } = useToolbarContextBridge();
  const blockButtonRef = useRef<HTMLButtonElement | null>(null);
  const alignButtonRef = useRef<HTMLButtonElement | null>(null);
  const insertButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontButtonRef = useRef<HTMLButtonElement | null>(null);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const slideBgButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const zoomButtonRef = useRef<HTMLButtonElement | null>(null);

  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const blockDropdownId = "block-dropdown";
  const alignDropdownId = "align-dropdown";
  const insertDropdownId = "insert-dropdown";
  const fontDropdownId = "font-dropdown";
  const colorDropdownId = "color-dropdown";
  const slideBgDropdownId = "slide-bg-dropdown";
  const moreDropdownId = "more-dropdown";
  const zoomDropdownId = "zoom-dropdown";

  const codeLanguages = useMemo(() => getCodeLanguages(), []);
  const isImageContext = ctx.type === "image";
  const isPictureFrameContext = ctx.type === "picture-frame";
  const isTextBoxContext = ctx.type === "textbox";
  const currentImageKey = isImageContext ? ctx.nodeKey : null;
  const currentTextBoxKey = isTextBoxContext ? ctx.nodeKey : null;
  const imageBorderRadius = isImageContext
    ? ctx.borderRadius
    : DEFAULT_IMAGE_BORDER_RADIUS;

  const textBoxBorderRadius = isTextBoxContext
    ? ctx.borderRadius
    : DEFAULT_IMAGE_BORDER_RADIUS;

  const imageBorder = isImageContext ? ctx.border : null;
  const isImageBorderEnabled = isImageContext ? Boolean(ctx.border?.enabled) : false;

  const textBoxBorder = isTextBoxContext ? ctx.border : null;
  const isTextBoxBorderEnabled = isTextBoxContext ? Boolean(ctx.border?.enabled) : false;

  const pictureFrameState = isPictureFrameContext ? ctx : null;
  const isPictureFrameBorderEnabled =
    ctx.type === "picture-frame" ? Boolean(ctx.border?.enabled) : false;

  useEffect(() => {
    if (ctx.type !== "picture-frame") {
      setShowPictureFrameCornersPopup(false);
      setShowPictureFrameBorderPopup(false);
    }
  }, [ctx.type]);

  useEffect(() => {
    if (ctx.type !== "image") {
      setShowImageBorderPopup(false);
    }
    if (ctx.type !== "textbox") {
      setShowTextBoxBorderPopup(false);
    }
  }, [ctx.type]);

  useEffect(() => {
    if (!isPictureFrameBorderEnabled) {
      setShowPictureFrameBorderPopup(false);
    }
  }, [isPictureFrameBorderEnabled]);

  useEffect(() => {
    if (!isImageBorderEnabled) {
      setShowImageBorderPopup(false);
    }
  }, [isImageBorderEnabled]);

  useEffect(() => {
    if (!isTextBoxBorderEnabled) {
      setShowTextBoxBorderPopup(false);
    }
  }, [isTextBoxBorderEnabled]);

  useEffect(() => {
    setCornersLinked(true);
    setShowCornerPopup(false);
  }, [currentImageKey]);

  useEffect(() => {
    setTextBoxCornersLinked(true);
    setShowTextBoxCornerPopup(false);
  }, [currentTextBoxKey]);

  const handleCornerChange = (corner: ImageBorderRadiusKey, value: string) => {
    if (!onUpdateImageBorderRadius) {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return;
    }
    const updates: Partial<ImageBorderRadiusState> = {};
    if (cornersLinked) {
      IMAGE_BORDER_RADIUS_KEYS.forEach((key) => {
        updates[key] = parsed;
      });
    } else {
      updates[corner] = parsed;
    }
    onUpdateImageBorderRadius(updates);
  };

  const getMaxUniformCornerRadius = () => {
    if (ctx.type !== "image") return 0;
    const minDimension = Math.min(ctx.width, ctx.height);
    return minDimension > 0 ? minDimension / 2 : 0;
  };

  const maxUniformCornerRadius = getMaxUniformCornerRadius();
  const averageCornerRadius = Math.round(
    IMAGE_BORDER_RADIUS_KEYS.reduce(
      (total, key) => total + imageBorderRadius[key],
      0
    ) / IMAGE_BORDER_RADIUS_KEYS.length
  );
  const normalizedCornerRadius =
    maxUniformCornerRadius > 0
      ? Math.min(averageCornerRadius, maxUniformCornerRadius)
      : averageCornerRadius;
  const sliderPercent =
    maxUniformCornerRadius > 0
      ? Math.round((normalizedCornerRadius / maxUniformCornerRadius) * 100)
      : 0;
  const sliderValue = Math.min(100, Math.max(0, sliderPercent));
  const sliderDisabled =
    !onUpdateImageBorderRadius || maxUniformCornerRadius <= 0;

  const handleUniformRadiusSliderChange = (percent: number) => {
    if (!onUpdateImageBorderRadius) {
      return;
    }
    const maxRadius = getMaxUniformCornerRadius();
    if (maxRadius <= 0) return;

    const clampedPercent = Math.min(100, Math.max(0, percent));
    const radiusPx = Math.round((clampedPercent / 100) * maxRadius);
    const updates: Partial<ImageBorderRadiusState> = {};
    IMAGE_BORDER_RADIUS_KEYS.forEach((key) => {
      updates[key] = radiusPx;
    });
    setCornersLinked(true);
    onUpdateImageBorderRadius(updates);
  };

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

  useEffect(() => {
    if (!showCornerPopup) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        cornerPopupRef.current?.contains(target) ||
        cornerPopupToggleRef.current?.contains(target)
      ) {
        return;
      }
      setShowCornerPopup(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCornerPopup]);

  useEffect(() => {
    if (!showTextBoxCornerPopup) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        textBoxCornerPopupRef.current?.contains(target) ||
        textBoxCornerPopupToggleRef.current?.contains(target)
      ) {
        return;
      }
      setShowTextBoxCornerPopup(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTextBoxCornerPopup]);

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
  };

  const handleFontSizeSelect = (size: FontSize) => {
    onSetFontSize?.(size);
  };

  const handleLineHeightSelect = (lineHeight: LineHeight) => {
    onSetLineHeight?.(lineHeight);
  };

  const handleLetterSpacingSelect = (letterSpacing: LetterSpacing) => {
    onSetLetterSpacing?.(letterSpacing);
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

  const handleOpenLayoutPanel = useCallback(() => {
    onOpenLayoutPanel?.();
    closeDropdown();
  }, [onOpenLayoutPanel, closeDropdown]);

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
                <div className="font-section">
                  <label>Line Height</label>
                  <select
                    value={text.lineHeight || "1.5"}
                    onChange={(e) => handleLineHeightSelect(e.target.value as LineHeight)}
                  >
                    {LINE_HEIGHTS.map((lh) => (
                      <option key={lh} value={lh}>
                        {lh}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="font-section">
                  <label>Letter Spacing</label>
                  <select
                    value={text.letterSpacing || "0"}
                    onChange={(e) => handleLetterSpacingSelect(e.target.value as LetterSpacing)}
                  >
                    {LETTER_SPACINGS.map((ls) => (
                      <option key={ls} value={ls}>
                        {ls === "0" ? "Normal" : ls}
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

  // Property Bar: Only show properties, no commands (arrange/align/group/delete moved to context menu)
  const renderObjectContext = (label: string) => {
    return (
      <div className="context-panel">
        <div className="context-controls compact">
          <span className="context-label">{label}</span>
          {label === "Image" && isImageContext && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className={`corner-pill${showCornerPopup ? " active" : ""}`}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setShowCornerPopup((prev) => !prev);
                }}
                ref={cornerPopupToggleRef}
                aria-expanded={showCornerPopup}
              >
                <span className="corner-pill__label">Corners:&nbsp;</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={sliderValue}
                  onChange={(event) => {
                    const val = Number(event.target.value);
                    if (!Number.isNaN(val)) {
                      handleUniformRadiusSliderChange(Math.min(100, Math.max(0, val)));
                    }
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  className="corner-pill__input"
                  aria-label="Corner radius percentage"
                  disabled={sliderDisabled}
                />
                <span>%</span>
                <ChevronDown size={14} />
              </button>
              {showCornerPopup && (
                <div
                  className="corner-dropdown"
                  ref={cornerPopupRef}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <div className="corner-dropdown__header">
                    <span className="corner-dropdown__title">Corner radius</span>
                    <span className="corner-dropdown__header-value">
                      {Math.round(normalizedCornerRadius)}px
                    </span>
                  </div>
                  <div
                    className="corner-dropdown__slider-row"
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={sliderValue}
                      onChange={(event) =>
                        handleUniformRadiusSliderChange(Number(event.target.value))
                      }
                      disabled={sliderDisabled}
                      className="corner-dropdown__slider"
                      aria-label="Uniform corner radius"
                    />
                  </div>
                  <button
                    type="button"
                    className={`corner-dropdown__toggle${cornersLinked ? "" : " active"}`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCornersLinked((prev) => !prev);
                    }}
                  >
                    {cornersLinked ? (
                      <>
                        <Unlink size={12} />
                        <span>Edit corners independently</span>
                      </>
                    ) : (
                      <>
                        <Link size={12} />
                        <span>Link corners together</span>
                      </>
                    )}
                  </button>
                  {!cornersLinked && (
                    <div className="corner-dropdown__grid">
                      {IMAGE_BORDER_RADIUS_KEYS.map((cornerKey) => (
                        <label key={cornerKey} className="corner-dropdown__cell">
                          <span>{CORNER_LABELS[cornerKey]}</span>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(maxUniformCornerRadius, 1)}
                            step={1}
                            value={imageBorderRadius[cornerKey]}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                            }}
                            onChange={(event) =>
                              handleCornerChange(cornerKey, event.target.value)
                            }
                            className="corner-dropdown__range"
                            disabled={maxUniformCornerRadius <= 0}
                            aria-label={`${CORNER_LABELS[cornerKey]} radius`}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {label === "Text Box" && isTextBoxContext && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className={`corner-pill${showTextBoxCornerPopup ? " active" : ""}`}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setShowTextBoxCornerPopup((prev) => !prev);
                }}
                ref={textBoxCornerPopupToggleRef}
                aria-expanded={showTextBoxCornerPopup}
              >
                <span className="corner-pill__label">Corners:&nbsp;</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={(() => {
                    const max = Math.max(1, Math.min(ctx.width, ctx.height) / 2);
                    const avg = Math.round(
                      IMAGE_BORDER_RADIUS_KEYS.reduce(
                        (total, key) => total + textBoxBorderRadius[key],
                        0
                      ) / IMAGE_BORDER_RADIUS_KEYS.length
                    );
                    const normalized = Math.min(avg, max);
                    return Math.round((normalized / max) * 100);
                  })()}
                  onChange={(event) => {
                    const val = Number(event.target.value);
                    if (Number.isNaN(val) || !onUpdateTextBoxBorderRadius) return;
                    const max = Math.max(1, Math.min(ctx.width, ctx.height) / 2);
                    const clamped = Math.min(100, Math.max(0, val));
                    const radiusPx = Math.round((clamped / 100) * max);
                    const updates: Partial<ImageBorderRadiusState> = {};
                    IMAGE_BORDER_RADIUS_KEYS.forEach((key) => {
                      updates[key] = radiusPx;
                    });
                    setTextBoxCornersLinked(true);
                    onUpdateTextBoxBorderRadius(updates);
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  className="corner-pill__input"
                  aria-label="Corner radius percentage"
                  disabled={!onUpdateTextBoxBorderRadius}
                />
                <span>%</span>
                <ChevronDown size={14} />
              </button>
              {showTextBoxCornerPopup && (
                <div
                  className="corner-dropdown"
                  ref={textBoxCornerPopupRef}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <div className="corner-dropdown__header">
                    <span className="corner-dropdown__title">Corner radius</span>
                    <span className="corner-dropdown__header-value">
                      {Math.round(
                        IMAGE_BORDER_RADIUS_KEYS.reduce(
                          (total, key) => total + textBoxBorderRadius[key],
                          0
                        ) / IMAGE_BORDER_RADIUS_KEYS.length
                      )}
                      px
                    </span>
                  </div>
                  <div
                    className="corner-dropdown__slider-row"
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={(() => {
                        const max = Math.max(1, Math.min(ctx.width, ctx.height) / 2);
                        const avg = Math.round(
                          IMAGE_BORDER_RADIUS_KEYS.reduce(
                            (total, key) => total + textBoxBorderRadius[key],
                            0
                          ) / IMAGE_BORDER_RADIUS_KEYS.length
                        );
                        const normalized = Math.min(avg, max);
                        return Math.round((normalized / max) * 100);
                      })()}
                      onChange={(event) => {
                        if (!onUpdateTextBoxBorderRadius) return;
                        const max = Math.max(1, Math.min(ctx.width, ctx.height) / 2);
                        const percent = Math.min(100, Math.max(0, Number(event.target.value)));
                        const radiusPx = Math.round((percent / 100) * max);
                        const updates: Partial<ImageBorderRadiusState> = {};
                        IMAGE_BORDER_RADIUS_KEYS.forEach((key) => {
                          updates[key] = radiusPx;
                        });
                        setTextBoxCornersLinked(true);
                        onUpdateTextBoxBorderRadius(updates);
                      }}
                      disabled={!onUpdateTextBoxBorderRadius}
                      className="corner-dropdown__slider"
                      aria-label="Uniform corner radius"
                    />
                  </div>
                  <button
                    type="button"
                    className={`corner-dropdown__toggle${textBoxCornersLinked ? "" : " active"}`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTextBoxCornersLinked((prev) => !prev);
                    }}
                  >
                    {textBoxCornersLinked ? (
                      <>
                        <Unlink size={12} />
                        <span>Edit corners independently</span>
                      </>
                    ) : (
                      <>
                        <Link size={12} />
                        <span>Link corners together</span>
                      </>
                    )}
                  </button>
                  {!textBoxCornersLinked && (
                    <div className="corner-dropdown__grid">
                      {IMAGE_BORDER_RADIUS_KEYS.map((cornerKey) => (
                        <label key={cornerKey} className="corner-dropdown__cell">
                          <span>{CORNER_LABELS[cornerKey]}</span>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(Math.min(ctx.width, ctx.height) / 2, 1)}
                            step={1}
                            value={textBoxBorderRadius[cornerKey]}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                            }}
                            onChange={(event) => {
                              if (!onUpdateTextBoxBorderRadius) return;
                              const updates: Partial<ImageBorderRadiusState> = {};
                              updates[cornerKey] = Number(event.target.value);
                              onUpdateTextBoxBorderRadius(updates);
                            }}
                            className="corner-dropdown__range"
                            disabled={!onUpdateTextBoxBorderRadius}
                            aria-label={`${CORNER_LABELS[cornerKey]} radius`}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {label === "Image" && isImageContext && imageBorder && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={Boolean(imageBorder.enabled)}
                  onChange={(event) => onUpdateImageBorder?.({ enabled: event.target.checked })}
                  disabled={!onUpdateImageBorder}
                />
                Border
              </label>
              {Boolean(imageBorder.enabled) && (
                <>
                  <PillSliderDropdown
                    label="Border:"
                    value={Number(imageBorder.width) || 0}
                    min={0}
                    max={40}
                    step={1}
                    unitSuffix="px"
                    dropdownTitle="Border width"
                    open={showImageBorderPopup}
                    setOpen={(open) => {
                      setShowImageBorderPopup(open);
                      if (open) {
                        setShowCornerPopup(false);
                      }
                    }}
                    inputChWidth={3}
                    disabled={!onUpdateImageBorder}
                    onChange={(next) => onUpdateImageBorder?.({ width: next })}
                  />
                  <ColorPicker
                    color={imageBorder.color || "#ffffff"}
                    onChange={(event) => onUpdateImageBorder?.({ color: event.target.value })}
                  />
                </>
              )}
            </div>
          )}

          {label === "Text Box" && ctx.type === "textbox" && textBoxBorder && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={Boolean(textBoxBorder.enabled)}
                  onChange={(event) => onUpdateTextBoxBorder?.({ enabled: event.target.checked })}
                  disabled={!onUpdateTextBoxBorder}
                />
                Border
              </label>
              {Boolean(textBoxBorder.enabled) && (
                <>
                  <PillSliderDropdown
                    label="Border:"
                    value={Number(textBoxBorder.width) || 0}
                    min={0}
                    max={40}
                    step={1}
                    unitSuffix="px"
                    dropdownTitle="Border width"
                    open={showTextBoxBorderPopup}
                    setOpen={(open) => setShowTextBoxBorderPopup(open)}
                    inputChWidth={3}
                    disabled={!onUpdateTextBoxBorder}
                    onChange={(next) => onUpdateTextBoxBorder?.({ width: next })}
                  />
                  <ColorPicker
                    color={textBoxBorder.color || "#ffffff"}
                    onChange={(event) => onUpdateTextBoxBorder?.({ color: event.target.value })}
                  />
                </>
              )}
            </div>
          )}
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

  // Picture Frame Property Bar: Only properties, no commands
  const renderPictureFrameContext = () => {
    if (!pictureFrameState) {
      return renderCanvasContext();
    }

    const { radius: frameRadius, fit: frameFit, border: frameBorder } = pictureFrameState;
    const safeRadius = Number.isFinite(frameRadius) ? Math.max(0, frameRadius) : 0;
    const borderEnabled = Boolean(frameBorder?.enabled);
    const borderWidth = Number(frameBorder?.width) || 0;
    const borderColor = frameBorder?.color || "#ffffff";

    return (
      <div className="context-panel">
        <div className="context-controls compact" style={{ gap: 12 }}>
          <span className="context-label">Picture Frame</span>
          <PillSliderDropdown
            label="Corners:"
            value={safeRadius}
            min={0}
            max={200}
            step={1}
            unitSuffix="px"
            dropdownTitle="Corner radius"
            open={showPictureFrameCornersPopup}
            setOpen={(open) => {
              setShowPictureFrameCornersPopup(open);
              if (open) {
                setShowPictureFrameBorderPopup(false);
              }
            }}
            inputChWidth={3.5}
            disabled={!onUpdatePictureFrameRadius}
            onChange={(next) => onUpdatePictureFrameRadius?.(next)}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Fit</span>
            <select
              className="toolbar-item"
              value={frameFit}
              onChange={(event) => onUpdatePictureFrameFit?.(event.target.value as PictureFrameFitMode)}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={borderEnabled}
                onChange={(event) => onUpdatePictureFrameBorder?.({ enabled: event.target.checked })}
              />
              Border
            </label>
            {borderEnabled && (
              <>
                <PillSliderDropdown
                  label="Border:"
                  value={borderWidth}
                  min={0}
                  max={40}
                  step={1}
                  unitSuffix="px"
                  dropdownTitle="Border width"
                  open={showPictureFrameBorderPopup}
                  setOpen={(open) => {
                    setShowPictureFrameBorderPopup(open);
                    if (open) {
                      setShowPictureFrameCornersPopup(false);
                    }
                  }}
                  inputChWidth={3}
                  disabled={!onUpdatePictureFrameBorder}
                  onChange={(next) => onUpdatePictureFrameBorder?.({ width: next })}
                />
                <ColorPicker
                  color={borderColor}
                  onChange={(event) => onUpdatePictureFrameBorder?.({ color: event.target.value })}
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderContextPanel = () => {
    switch (ctx.type) {
      case "text":
        return renderTextContext();
      case "group":
        return renderObjectContext("Group");
      case "image":
        return renderObjectContext("Image");
      case "picture-frame":
        return renderPictureFrameContext();
      case "svg":
        return renderObjectContext("Vector");
      case "textbox":
        return renderObjectContext("Text Box");
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
        {onImportPdf && (
          <button
            type="button"
            className="toolbar-item"
            onClick={onImportPdf}
            disabled={isImportingPdf}
            title={
              !isImportingPdf
                ? "Import PDF as slides"
                : pdfImportStatus === "uploading"
                  ? (typeof importProgress === "number" && importProgress > 0 && importProgress < 100)
                    ? `Uploading PDF… ${importProgress}%`
                    : "Uploading PDF…"
                  : (typeof importTotalPages === "number" && importTotalPages > 0)
                    ? `Importing slides… ${Math.min(importCurrentPage || 0, importTotalPages)}/${importTotalPages}`
                    : "Importing slides…"
            }
          >
            <Upload size={18} />
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

        {onPreview && (
          <button
            type="button"
            className="toolbar-item"
            onClick={onPreview}
            title="Preview"
          >
            <Eye size={18} />
          </button>
        )}

        {(onMicToggle || onDuplicate || onDelete || onExport) && (
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
              {(onExport || onExportAllPdf) && (
                <>
                  <div className="dropdown-divider" />
                  <div className="dropdown-section-label">Export</div>
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
                      <span className="text">Export Slide as SVG (Affinity)</span>
                    </button>
                  )}
                  {onExportAllPdf && (
                    <>
                      <button
                        type="button"
                        className="item"
                        disabled={isExportingPdf}
                        onClick={() => {
                          onExportAllPdf("screen");
                          closeDropdown();
                        }}
                      >
                        <Download size={18} className="dropdown-icon" />
                        <span className="text">
                          {isExportingPdf && pdfExportProgress
                            ? `Exporting... (${pdfExportProgress.current}/${pdfExportProgress.total})`
                            : "PDF (Screen) — small & fast"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="item"
                        disabled={isExportingPdf}
                        onClick={() => {
                          onExportAllPdf("high");
                          closeDropdown();
                        }}
                      >
                        <Download size={18} className="dropdown-icon" />
                        <span className="text">
                          {isExportingPdf && pdfExportProgress
                            ? `Exporting... (${pdfExportProgress.current}/${pdfExportProgress.total})`
                            : "PDF (High) — crisp (default)"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="item"
                        disabled={isExportingPdf}
                        onClick={() => {
                          onExportAllPdf("print");
                          closeDropdown();
                        }}
                      >
                        <Download size={18} className="dropdown-icon" />
                        <span className="text">
                          {isExportingPdf && pdfExportProgress
                            ? `Exporting... (${pdfExportProgress.current}/${pdfExportProgress.total})`
                            : "PDF (Print) — very large"}
                        </span>
                      </button>
                    </>
                  )}
                </>
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
              <button type="button" className="item" onClick={() => handleInsert(onInsertPictureFrame)}>
                <RectangleHorizontal className="dropdown-icon" size={18} />
                <span className="text">Picture Frame</span>
              </button>
              <button type="button" className="item" onClick={handleOpenLayoutPanel}>
                <LayoutOutlined className="dropdown-icon" />
                <span className="text">Picture Frame Layout…</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(onInsertImage)}>
                <FileImageOutlined className="dropdown-icon" />
                <span className="text">Image</span>
              </button>
              <button type="button" className="item" onClick={() => handleInsert(onInsertSvg)}>
                <NodeIndexOutlined className="dropdown-icon" />
                <span className="text">SVG</span>
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
        {versionDropdown}
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
