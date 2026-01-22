/**
 * MagicLayoutWorkspace - Pro Tools workspace for Magic Layout
 * Full-screen overlay with 3-panel layout
 * - Left: Plans (variant grid) + Assets
 * - Center: Large preview canvas
 * - Right: Text blocks + Settings
 * Responsive: Tablet collapses right panel, Phone uses bottom sheet
 */
import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  ChevronDown,
  Plus,
  Upload,
  FolderOpen,
  Trash2,
  Type,
  Settings2,
  Lock,
  Unlock,
  RefreshCw,
  Maximize2,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Wand2,
  LayoutGrid,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  ArrowUp,
  List,
  FileText,
} from "lucide-react";
import {
  generateMagicLayouts,
  generateMagicLayoutVariant,
  type MagicLayoutOutput,
  type LayoutVariant,
} from "../lib/magicLayoutGenerator";
import {
  getTasteMode,
  getTasteModeIds,
} from "../lib/tasteModes";
import type { TasteModeId } from "../lib/magicLayoutTypes";
import { useIsMobile, useIsTablet } from "../hooks/useMediaQuery";
import {
  FileManagerV2,
  type FileItem,
} from "@/dashboard/project/components/FileManager";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import { useTextAssist, type TextAssistAction } from "../hooks/useTextAssist";
import { getThumbnailUrl } from "@/shared/utils/api";
import "./MagicLayoutWorkspace.css";

// =====================================================
// TYPES
// =====================================================
type LayoutMode = "grid" | "masonry";
type RegenerationScope = "plan" | "slide" | "layout-only";

/** Settings that apply to the entire plan (presentation-wide defaults) */
interface PlanLayoutSettings {
  framesPerSlide: number;
  mode: LayoutMode;
  tasteMode: TasteModeId;
  spacing: number;
  radius: number;
  slideCount: number;
}

/** Per-slide overrides (only stores values that differ from plan defaults) */
type SlideLayoutOverrides = Partial<{
  framesPerSlide: number;
  mode: LayoutMode;
  tasteMode: TasteModeId;
  spacing: number;
  radius: number;
}>;

/** Settings mode for the right panel */
type SettingsMode = "plan" | "slide";

interface FrameUIConfig {
  frameName: string;
  contentType: "image" | "text";
  imageSrc: string | null;
  textValue: string;
  lockPosition: boolean;
  lockSize: boolean;
}

interface GlobalLocks {
  lockSpacing: boolean;
  lockRadius: boolean;
}

export interface TextBlock {
  id: string;
  type: "headline" | "subhead" | "body" | "caption" | "quote" | "credit";
  content: string;
}

/** Text block instance attached to a specific slide */
export interface SlideTextBlockInstance {
  id: string;
  blockId: string; // Reference to TextBlock.id
  slideIndex: number;
  presetId: TextBlockStyle["preset"];
  locked: boolean; // Don't move on regeneration
  placementHint?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "auto";
}

export interface TextBlockStyle {
  preset: "editorial" | "minimal" | "caption-heavy" | "quote-focused";
  dropCap: boolean;
  lineHeight: number;
  paragraphSpacing: number;
  alignment: "left" | "center" | "right";
  backgroundPanel: boolean;
  backgroundOpacity: number;
}

type MobileTab = "plans" | "assets" | "text" | "settings";

// =====================================================
// PROPS
// =====================================================
interface MagicLayoutWorkspaceProps {
  open: boolean;
  onClose: () => void;
  insertOnly?: boolean;
  onApply: (
    variants: LayoutVariant[],
    options: {
      mode: LayoutMode;
      seed: string;
      tasteMode: TasteModeId;
      slideCount?: number;
      slideImages?: Array<Array<string | null>>;
      textStyle?: {
        fontStyle: string;
        dropCap: boolean;
        autoSize: boolean;
      };
    }
  ) => void;
  projectImageUrls?: Array<{ url: string; name: string }>;
  hasExistingContent?: boolean;
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

/**
 * CollapsibleSection - Expandable sidebar section
 */
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="magic-workspace__section">
      <div
        className="magic-workspace__section-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="magic-workspace__section-title">
          <span className="magic-workspace__section-icon">{icon}</span>
          {title}
          {badge !== undefined && (
            <span className="magic-workspace__section-badge">{badge}</span>
          )}
        </div>
        <span
          className={`magic-workspace__section-chevron ${isOpen ? "magic-workspace__section-chevron--open" : ""}`}
        >
          <ChevronDown size={14} />
        </span>
      </div>
      {isOpen && (
        <div className="magic-workspace__section-content">{children}</div>
      )}
    </div>
  );
};

/**
 * VirtualizedAssetGrid - Virtualized grid for asset thumbnails
 * Only renders visible items + buffer for smooth scrolling with 25+ images
 */
interface VirtualizedAssetGridProps {
  images: string[];
  thumbnails: string[];
  onRemove: (index: number) => void;
}

const GRID_ITEM_SIZE = 72; // px per thumbnail
const GRID_COLUMNS = 4;
const BUFFER_ROWS = 2;

const VirtualizedAssetGrid: React.FC<VirtualizedAssetGridProps> = ({
  images,
  thumbnails,
  onRemove,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(300);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Track container height
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate visible range
  const rowHeight = GRID_ITEM_SIZE + 8; // Include gap
  const totalRows = Math.ceil(images.length / GRID_COLUMNS);
  const totalHeight = totalRows * rowHeight;
  
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + BUFFER_ROWS
  );
  
  const startIndex = startRow * GRID_COLUMNS;
  const endIndex = Math.min(images.length, endRow * GRID_COLUMNS);
  const visibleItems = images.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className="magic-workspace__assets-grid magic-workspace__assets-grid--virtualized"
      onScroll={handleScroll}
      style={{ maxHeight: 300, overflowY: "auto" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: startRow * rowHeight,
            left: 0,
            right: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
            gap: 8,
          }}
        >
          {visibleItems.map((_, localIdx) => {
            const globalIdx = startIndex + localIdx;
            return (
              <div
                key={globalIdx}
                className="magic-workspace__asset-thumb magic-workspace__asset-thumb--selected"
              >
                <img
                  src={thumbnails[globalIdx]}
                  alt={`Asset ${globalIdx + 1}`}
                  loading="lazy"
                />
                <span className="magic-workspace__asset-index">{globalIdx + 1}</span>
                <button
                  type="button"
                  className="magic-workspace__asset-remove"
                  onClick={() => onRemove(globalIdx)}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * LayoutPreviewSvg - Renders a layout variant as SVG
 * Uses thumbnails for preview performance, with optional imageOffset for multi-slide distribution
 * Supports live preview of spacing/radius changes without regeneration
 */
interface LayoutPreviewSvgProps {
  variant: LayoutVariant;
  images?: string[];
  imageOffset?: number; // Starting index in images array for this slide
  width?: number;
  height?: number;
  /** Override radius for live preview (applies to all frames) */
  radiusOverride?: number;
  /** Override spacing/gap for live preview - affects frame positions */
  spacingOverride?: number;
}

const LayoutPreviewSvg: React.FC<LayoutPreviewSvgProps> = ({
  variant,
  images = [],
  imageOffset = 0,
  width = 1920,
  height = 1080,
  radiusOverride,
  spacingOverride,
}) => {
  // Memoize thumbnail URLs for performance
  const thumbnailImages = useMemo(
    () => images.map((url) => getThumbnailUrl(url, { fallbackToOriginal: true })),
    [images]
  );

  const viewBox = `0 0 ${width} ${height}`;
  
  // Track image cursor only for image frames, starting from offset
  let imageCursor = imageOffset;

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={width} height={height} fill="#1a1c1e" />
      {variant.frames.map((frame, i) => {
        const isTextFrame = frame.contentType === "text";
        // Apply radius override if provided, otherwise use frame's radius
        const radius = radiusOverride !== undefined ? radiusOverride : (frame.radius ?? 0);
        const frameId = `frame-${variant.id || 'v'}-${i}-${frame.x}-${frame.y}`;
        
        // Only get image for image frames, using thumbnail for preview
        const imgSrc = isTextFrame ? null : thumbnailImages[imageCursor++] ?? null;

        return (
          <g key={frameId}>
            {imgSrc ? (
              <>
                <defs>
                  <clipPath id={`clip-${frameId}`}>
                    <rect
                      x={frame.x}
                      y={frame.y}
                      width={frame.width}
                      height={frame.height}
                      rx={radius}
                    />
                  </clipPath>
                </defs>
                <image
                  href={imgSrc}
                  x={frame.x}
                  y={frame.y}
                  width={frame.width}
                  height={frame.height}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-${frameId})`}
                />
              </>
            ) : (
              <rect
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                rx={radius}
                fill={
                  isTextFrame
                    ? "rgba(79, 140, 255, 0.15)"
                    : `hsl(${220 + i * 15}, 15%, ${25 + (i % 3) * 5}%)`
                }
                stroke={
                  isTextFrame
                    ? "rgba(79, 140, 255, 0.4)"
                    : "rgba(255,255,255,0.08)"
                }
                strokeWidth={isTextFrame ? 2 : 1}
                strokeDasharray={isTextFrame ? "8 4" : undefined}
              />
            )}
            {/* Show text indicator for text frames */}
            {isTextFrame && (
              <text
                x={frame.x + frame.width / 2}
                y={frame.y + frame.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(79, 140, 255, 0.6)"
                fontSize={Math.min(frame.width, frame.height) * 0.15}
                fontFamily="system-ui, sans-serif"
              >
                T
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/**
 * PlanCard - Clickable layout variant card
 */
interface PlanCardProps {
  variant: LayoutVariant;
  index: number;
  isSelected: boolean;
  images: string[];
  slideCount?: number; // For tooltip "Regenerate N slides"
  onSelect: () => void;
  onRefresh: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({
  variant,
  index,
  isSelected,
  images,
  slideCount = 1,
  onSelect,
  onRefresh,
}) => {
  return (
    <div
      className={`magic-workspace__plan-card ${isSelected ? "magic-workspace__plan-card--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="magic-workspace__plan-preview">
        <LayoutPreviewSvg variant={variant} images={images} />
      </div>
      <div className="magic-workspace__plan-info">
        <div>
          <span className="magic-workspace__plan-label">Plan {index + 1}</span>
          <span className="magic-workspace__plan-frames">
            {" "}
            · {variant.frames.length} frames
          </span>
        </div>
        <button
          type="button"
          className="magic-workspace__plan-refresh"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          title={slideCount > 1 ? `Regenerate all ${slideCount} slides` : "Regenerate layout"}
        >
          <RefreshCw size={12} />
        </button>
      </div>
    </div>
  );
};

/**
 * TextBlockEditor - Single text block with type selector and AI assist
 */
interface TextBlockEditorProps {
  block: TextBlock;
  onUpdate: (id: string, updates: Partial<TextBlock>) => void;
  onDelete: (id: string) => void;
  onAiAction?: (id: string, action: TextAssistAction) => void;
  isAiLoading?: boolean;
}

const TextBlockEditor: React.FC<TextBlockEditorProps> = ({
  block,
  onUpdate,
  onDelete,
  onAiAction,
  isAiLoading = false,
}) => {
  const [showAiMenu, setShowAiMenu] = useState(false);
  
  const typeLabels: Record<TextBlock["type"], string> = {
    headline: "Headline",
    subhead: "Subhead",
    body: "Body",
    caption: "Caption",
    quote: "Quote",
    credit: "Credit",
  };

  const aiActions: Array<{ id: TextAssistAction; label: string; icon: React.ReactNode }> = [
    { id: "shorten", label: "Shorten", icon: <Minus size={12} /> },
    { id: "expand", label: "Expand", icon: <ArrowUp size={12} /> },
    { id: "make-editorial", label: "Make Editorial", icon: <FileText size={12} /> },
    { id: "bullet-list", label: "Bullet List", icon: <List size={12} /> },
  ];

  return (
    <div className="magic-workspace__text-block">
      <div className="magic-workspace__text-block-header">
        <select
          className="magic-workspace__text-block-type"
          value={block.type}
          onChange={(e) =>
            onUpdate(block.id, { type: e.target.value as TextBlock["type"] })
          }
          style={{
            background: "rgba(99, 102, 241, 0.15)",
            border: "none",
            cursor: "pointer",
          }}
        >
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="magic-workspace__text-block-actions">
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={`magic-workspace__text-block-btn ${showAiMenu ? "magic-workspace__text-block-btn--active" : ""}`}
              onClick={() => setShowAiMenu(!showAiMenu)}
              title="AI Assist"
              disabled={isAiLoading}
            >
              {isAiLoading ? (
                <RefreshCw size={12} className="magic-workspace__spin" />
              ) : (
                <Wand2 size={12} />
              )}
            </button>
            {showAiMenu && (
              <div className="magic-workspace__ai-menu">
                {aiActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="magic-workspace__ai-menu-item"
                    onClick={() => {
                      onAiAction?.(block.id, action.id);
                      setShowAiMenu(false);
                    }}
                    disabled={isAiLoading}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="magic-workspace__text-block-btn"
            onClick={() => onDelete(block.id)}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <textarea
        className="magic-workspace__text-block-textarea"
        value={block.content}
        onChange={(e) => onUpdate(block.id, { content: e.target.value })}
        placeholder={`Enter ${typeLabels[block.type].toLowerCase()}...`}
      />
    </div>
  );
};

/**
 * TextStylePresets - Quick style preset buttons
 */
interface TextStylePresetsProps {
  active: TextBlockStyle["preset"];
  onChange: (preset: TextBlockStyle["preset"]) => void;
}

const TextStylePresets: React.FC<TextStylePresetsProps> = ({
  active,
  onChange,
}) => {
  const presets: Array<{ id: TextBlockStyle["preset"]; label: string }> = [
    { id: "editorial", label: "Editorial" },
    { id: "minimal", label: "Minimal" },
    { id: "caption-heavy", label: "Caption-heavy" },
    { id: "quote-focused", label: "Quote-focused" },
  ];

  return (
    <div className="magic-workspace__style-presets">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`magic-workspace__style-preset ${active === p.id ? "magic-workspace__style-preset--active" : ""}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};

// =====================================================
// MAIN COMPONENT
// =====================================================
const MagicLayoutWorkspace: React.FC<MagicLayoutWorkspaceProps> = ({
  open,
  onClose,
  insertOnly = false,
  onApply,
  projectImageUrls,
  hasExistingContent = false,
}) => {
  // =====================================================
  // STATE
  // =====================================================

  // Core settings
  const [count, setCount] = useState(6);
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [tasteMode, setTasteMode] = useState<TasteModeId>("apple-clean");
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const [sessionId, setSessionId] = useState(() => `${Date.now()}`);
  const sessionKey = useMemo(
    () => `${sessionId}#${tasteMode}`,
    [sessionId, tasteMode]
  );

  // Global spacing / radius
  const [spacingMode, setSpacingMode] = useState<"auto" | "custom">("auto");
  const [spacingValue, setSpacingValue] = useState(24);
  const [radiusMode, setRadiusMode] = useState<"auto" | "custom">("auto");
  const [radiusValue, setRadiusValue] = useState(16);

  // Global locks
  const [globalLocks, setGlobalLocks] = useState<GlobalLocks>({
    lockSpacing: false,
    lockRadius: false,
  });

  // Per-frame configs
  const [frameConfigs, setFrameConfigs] = useState<FrameUIConfig[]>([]);

  // Generated variants
  const [layoutOutput, setLayoutOutput] = useState<MagicLayoutOutput | null>(
    null
  );
  const [candidatePlans, setCandidatePlans] = useState<
    LayoutVariant[][] | null
  >(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [planSeedOverrides, setPlanSeedOverrides] = useState<
    Record<number, Record<number, string>>
  >({});

  // Image selection
  const [selectedImages, setSelectedImages] = useState<string[]>(
    projectImageUrls?.map((img) => img.url) ?? []
  );
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Multi-slide
  const [slideCount, setSlideCount] = useState(1);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  
  // Settings mode: null activeSlide = plan mode, selected slide = slide mode
  const [slideSelected, setSlideSelected] = useState(false);
  
  // Per-slide overrides (keyed by slide index)
  const [slideOverrides, setSlideOverrides] = useState<Map<number, SlideLayoutOverrides>>(new Map());

  // Text blocks (new feature)
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [slideTextBlocks, setSlideTextBlocks] = useState<Map<number, SlideTextBlockInstance[]>>(new Map());
  const [textStylePreset, setTextStylePreset] =
    useState<TextBlockStyle["preset"]>("editorial");
  const [dropCapEnabled, setDropCapEnabled] = useState(false);
  const [lineHeight, setLineHeight] = useState(1.6);
  const [paragraphSpacing, setParagraphSpacing] = useState(1.2);
  const [textAlignment, setTextAlignment] = useState<
    "left" | "center" | "right"
  >("left");
  const [textBackgroundEnabled, setTextBackgroundEnabled] = useState(false);
  const [textBackgroundOpacity, setTextBackgroundOpacity] = useState(0.8);

  // Regeneration state
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [pendingRegenScope, setPendingRegenScope] = useState<{ scope: RegenerationScope; slideIndex?: number } | null>(null);

  // UI state
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("plans");

  // Responsive detection
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // =====================================================
  // COMPUTED VALUES
  // =====================================================

  // Settings mode - plan mode when no slide is explicitly selected
  const settingsMode: SettingsMode = slideSelected && slideCount > 1 ? "slide" : "plan";

  // Plan-level defaults (the source of truth for the entire presentation)
  const planDefaults = useMemo<PlanLayoutSettings>(() => ({
    framesPerSlide: count,
    mode,
    tasteMode,
    spacing: spacingValue,
    radius: radiusValue,
    slideCount,
  }), [count, mode, tasteMode, spacingValue, radiusValue, slideCount]);

  // Current slide's overrides (if any)
  const currentSlideOverrides = useMemo(() => {
    return slideOverrides.get(activeSlideIndex) ?? {};
  }, [slideOverrides, activeSlideIndex]);

  // Resolved settings for the current slide (plan defaults + slide overrides)
  const resolvedSettings = useMemo<PlanLayoutSettings>(() => {
    return {
      ...planDefaults,
      ...currentSlideOverrides,
    };
  }, [planDefaults, currentSlideOverrides]);

  // Check which fields are overridden for current slide
  const isOverridden = useCallback((field: keyof SlideLayoutOverrides): boolean => {
    return currentSlideOverrides[field] !== undefined;
  }, [currentSlideOverrides]);

  // Base effective values (for layout generation - uses resolved settings)
  const effectiveSpacing = spacingMode === "auto" ? undefined : resolvedSettings.spacing;
  const effectiveRadius = radiusMode === "auto" ? undefined : resolvedSettings.radius;

  const appliedFrameConfigs = useMemo(() => {
    return frameConfigs.map((cfg, i) => ({
      ...cfg,
      imageSrc: selectedImages[i] ?? cfg.imageSrc,
    }));
  }, [frameConfigs, selectedImages]);

  // Context label for header
  const contextLabel = useMemo(() => {
    const planLabel = `Plan ${selectedVariantIndex + 1}`;
    const modeLabel = mode === "masonry" ? "Masonry" : "Grid";
    const tasteLabel = getTasteMode(tasteMode).name;
    
    if (settingsMode === "plan") {
      return `${planLabel} · ${slideCount} slide${slideCount !== 1 ? "s" : ""} · ${modeLabel}`;
    } else {
      return `${planLabel} / Slide ${activeSlideIndex + 1}`;
    }
  }, [selectedVariantIndex, mode, tasteMode, slideCount, settingsMode, activeSlideIndex]);

  // Override summary for slide settings header
  const overrideSummary = useMemo(() => {
    if (settingsMode !== "slide") return "";
    const overrideKeys = Object.keys(currentSlideOverrides) as (keyof SlideLayoutOverrides)[];
    if (overrideKeys.length === 0) return "Using plan defaults";
    const labels: Record<keyof SlideLayoutOverrides, string> = {
      framesPerSlide: "Frames",
      mode: "Mode",
      tasteMode: "Style",
      spacing: "Spacing",
      radius: "Radius",
    };
    return `Overrides: ${overrideKeys.map(k => labels[k]).join(", ")}`;
  }, [settingsMode, currentSlideOverrides]);

  // =====================================================
  // LAYOUT GENERATION
  // =====================================================

  const generateLayouts = useCallback(() => {
    const output = generateMagicLayouts({
      frameCount: count,
      mode,
      tasteMode,
      seed,
      canvasWidth: 1920,
      canvasHeight: 1080,
      globalLocks,
      sessionKey,
      overrides: {
        gutter: effectiveSpacing,
        radius: effectiveRadius,
      },
      frameConfigs: appliedFrameConfigs.map((cfg) => ({
        contentType: cfg.contentType,
        imageSrc: cfg.imageSrc,
        textConfig: cfg.contentType === "text" ? { intent: "body" as const, content: cfg.textValue } : null,
        locks: { lockPosition: cfg.lockPosition, lockCrop: false, lockHero: false },
      })),
      variantCount: 6,
    });
    setLayoutOutput(output);
    setSelectedVariantIndex(0);
    setCandidatePlans(null);
    setPlanSeedOverrides({});

    // Init frame configs if empty
    if (frameConfigs.length === 0 && output.variants[0]) {
      const initConfigs = output.variants[0].frames.map((f, i) => ({
        frameName: `Frame ${i + 1}`,
        contentType: "image" as const,
        imageSrc: selectedImages[i] ?? null,
        textValue: "",
        lockPosition: false,
        lockSize: false,
      }));
      setFrameConfigs(initConfigs);
    }
  }, [
    count,
    mode,
    tasteMode,
    seed,
    sessionKey,
    effectiveSpacing,
    effectiveRadius,
    globalLocks,
    appliedFrameConfigs,
    frameConfigs.length,
    selectedImages,
  ]);

  // Generate on open
  useEffect(() => {
    if (open && !layoutOutput) {
      generateLayouts();
    }
  }, [open, layoutOutput, generateLayouts]);

  // Regenerate when settings change
  useEffect(() => {
    if (open) {
      generateLayouts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, count, mode]);

  // Image frame count (for future asset matching)
  const _imageFrameCount = useMemo(() => {
    return (
      frameConfigs.filter((cfg) => cfg.contentType === "image").length || count
    );
  }, [frameConfigs, count]);
  void _imageFrameCount; // Suppress unused warning - reserved for future use

  const selectedPlanPreview = useMemo(() => {
    if (!layoutOutput || !layoutOutput.variants[selectedVariantIndex])
      return null;

    const selectedVar = layoutOutput.variants[selectedVariantIndex];
    const sessionSeed = layoutOutput.input.seed || seed;

    const basePlan = (() => {
      if (slideCount <= 1) return [selectedVar];
      const existing = candidatePlans?.[selectedVariantIndex];
      if (existing && existing.length === slideCount) return existing;
      const plan: LayoutVariant[] = [selectedVar];
      for (let slideIdx = 1; slideIdx < slideCount; slideIdx++) {
        const variantSeed = `${sessionSeed}#plan${selectedVariantIndex}#slide${slideIdx}`;
        const slideVar = generateMagicLayoutVariant(
          layoutOutput.input,
          variantSeed,
          slideIdx,
          sessionSeed
        );
        plan.push(slideVar);
      }
      return plan;
    })();

    // Apply per-slide seed overrides
    const overrides = planSeedOverrides[selectedVariantIndex] || {};
    const finalPlan = basePlan.map((variant, slideIdx) => {
      const overrideSeed = overrides[slideIdx];
      if (overrideSeed) {
        return generateMagicLayoutVariant(
          layoutOutput.input,
          overrideSeed,
          slideIdx,
          sessionSeed
        );
      }
      return variant;
    });

    return finalPlan;
  }, [
    layoutOutput,
    selectedVariantIndex,
    seed,
    slideCount,
    candidatePlans,
    planSeedOverrides,
  ]);

  const activeVariant = useMemo(() => {
    if (!selectedPlanPreview) return null;
    return selectedPlanPreview[activeSlideIndex] || selectedPlanPreview[0];
  }, [selectedPlanPreview, activeSlideIndex]);

  // Get text blocks attached to current slide
  const currentSlideTextBlocks = useMemo(() => {
    return slideTextBlocks.get(activeSlideIndex) ?? [];
  }, [slideTextBlocks, activeSlideIndex]);

  // =====================================================
  // HANDLERS
  // =====================================================

  /**
   * Regenerate all slides in the current plan
   * Shows confirmation if multiple slides
   */
  const handleRefreshPlan = useCallback(() => {
    if (slideCount > 1) {
      setPendingRegenScope({ scope: "plan" });
      setShowRegenConfirm(true);
    } else {
      // Single slide - just refresh immediately
      setSeed(`${Date.now()}`);
      setSessionId(`${Date.now()}`);
    }
  }, [slideCount]);

  /**
   * Regenerate a single slide (no confirmation needed)
   */
  const handleRefreshSlide = useCallback(
    (slideIndex: number) => {
      const newSeed = `${Date.now()}#slide${slideIndex}`;
      setPlanSeedOverrides((prev) => ({
        ...prev,
        [selectedVariantIndex]: {
          ...(prev[selectedVariantIndex] || {}),
          [slideIndex]: newSeed,
        },
      }));
    },
    [selectedVariantIndex]
  );

  /**
   * Regenerate layout only (keep images and text blocks in place)
   */
  const handleRefreshLayoutOnly = useCallback(
    (slideIndex: number) => {
      // Same as slide refresh but preserves locked text block positions
      const newSeed = `${Date.now()}#layout${slideIndex}`;
      setPlanSeedOverrides((prev) => ({
        ...prev,
        [selectedVariantIndex]: {
          ...(prev[selectedVariantIndex] || {}),
          [slideIndex]: newSeed,
        },
      }));
    },
    [selectedVariantIndex]
  );

  /**
   * Confirm plan-level regeneration
   */
  const handleConfirmRegen = useCallback(() => {
    if (pendingRegenScope?.scope === "plan") {
      setSeed(`${Date.now()}`);
      setSessionId(`${Date.now()}`);
    }
    setShowRegenConfirm(false);
    setPendingRegenScope(null);
  }, [pendingRegenScope]);

  const handleCancelRegen = useCallback(() => {
    setShowRegenConfirm(false);
    setPendingRegenScope(null);
  }, []);

  // Legacy handler for backward compatibility
  const handleRefreshAll = useCallback(() => {
    setSeed(`${Date.now()}`);
    setSessionId(`${Date.now()}`);
  }, []);

  const handleRefreshVariant = useCallback(
    (variantIndex: number) => {
      const newSeed = `${Date.now()}#refresh${variantIndex}`;
      setPlanSeedOverrides((prev) => ({
        ...prev,
        [selectedVariantIndex]: {
          ...(prev[selectedVariantIndex] || {}),
          [variantIndex]: newSeed,
        },
      }));
    },
    [selectedVariantIndex]
  );

  /**
   * Handle plan selection - sets active plan and clears slide selection
   */
  const handleSelectPlan = useCallback((planIndex: number) => {
    setSelectedVariantIndex(planIndex);
    setSlideSelected(false); // Clear slide selection, enter plan mode
    setActiveSlideIndex(0); // Reset to first slide
  }, []);

  /**
   * Handle slide selection - sets active slide and enters slide mode
   */
  const handleSelectSlide = useCallback((slideIndex: number) => {
    setActiveSlideIndex(slideIndex);
    setSlideSelected(true); // Enter slide mode
  }, []);

  /**
   * Switch back to plan settings mode
   */
  const handleBackToPlanMode = useCallback(() => {
    setSlideSelected(false);
  }, []);

  /**
   * Set a slide override value
   */
  const handleSetSlideOverride = useCallback(<K extends keyof SlideLayoutOverrides>(
    field: K,
    value: SlideLayoutOverrides[K]
  ) => {
    setSlideOverrides(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(activeSlideIndex) ?? {};
      newMap.set(activeSlideIndex, { ...current, [field]: value });
      return newMap;
    });
  }, [activeSlideIndex]);

  /**
   * Clear a slide override (revert to plan default)
   */
  const handleClearSlideOverride = useCallback((field: keyof SlideLayoutOverrides) => {
    setSlideOverrides(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(activeSlideIndex);
      if (current) {
        const updated = { ...current };
        delete updated[field];
        if (Object.keys(updated).length === 0) {
          newMap.delete(activeSlideIndex);
        } else {
          newMap.set(activeSlideIndex, updated);
        }
      }
      return newMap;
    });
  }, [activeSlideIndex]);

  /**
   * Toggle override for a specific field
   */
  const handleToggleOverride = useCallback((field: keyof SlideLayoutOverrides, enable: boolean) => {
    if (enable) {
      // Enable override with current plan value
      handleSetSlideOverride(field, planDefaults[field as keyof PlanLayoutSettings] as SlideLayoutOverrides[typeof field]);
    } else {
      // Disable override (revert to plan default)
      handleClearSlideOverride(field);
    }
  }, [handleSetSlideOverride, handleClearSlideOverride, planDefaults]);

  /**
   * Attach a text block to the current slide
   */
  const handleAttachTextBlockToSlide = useCallback(
    (blockId: string) => {
      const block = textBlocks.find((b) => b.id === blockId);
      if (!block) return;

      const instance: SlideTextBlockInstance = {
        id: `${blockId}-slide${activeSlideIndex}-${Date.now()}`,
        blockId,
        slideIndex: activeSlideIndex,
        presetId: textStylePreset,
        locked: false,
        placementHint: "auto",
      };

      setSlideTextBlocks((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(activeSlideIndex) ?? [];
        newMap.set(activeSlideIndex, [...existing, instance]);
        return newMap;
      });
    },
    [textBlocks, activeSlideIndex, textStylePreset]
  );

  /**
   * Remove a text block instance from a slide
   */
  const handleRemoveTextBlockFromSlide = useCallback(
    (instanceId: string, slideIndex: number) => {
      setSlideTextBlocks((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(slideIndex) ?? [];
        newMap.set(
          slideIndex,
          existing.filter((inst) => inst.id !== instanceId)
        );
        return newMap;
      });
    },
    []
  );

  /**
   * Toggle lock on a text block instance
   */
  const handleToggleTextBlockLock = useCallback(
    (instanceId: string, slideIndex: number) => {
      setSlideTextBlocks((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(slideIndex) ?? [];
        newMap.set(
          slideIndex,
          existing.map((inst) =>
            inst.id === instanceId ? { ...inst, locked: !inst.locked } : inst
          )
        );
        return newMap;
      });
    },
    []
  );

  const handleClearImages = useCallback(() => {
    selectedImages.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
    setSelectedImages([]);
  }, [selectedImages]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const newUrls = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .map((f) => URL.createObjectURL(f));
      setSelectedImages((prev) => [...prev, ...newUrls]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    []
  );

  const handleProjectFileSelect = useCallback((files: FileItem[]) => {
    const imageFiles = files.filter((f) => {
      const ext = f.fileName.toLowerCase().split(".").pop() || "";
      return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    });
    const imageUrls = imageFiles.map((f) => f.url);
    // Add new project images to selectedImages (avoid duplicates)
    setSelectedImages((prev) => [
      ...prev,
      ...imageUrls.filter((url) => !prev.includes(url)),
    ]);
    setIsFileManagerOpen(false);
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const newImages = [...prev];
      if (newImages[index]?.startsWith("blob:")) {
        URL.revokeObjectURL(newImages[index]);
      }
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  // Text block handlers
  const handleAddTextBlock = useCallback((type: TextBlock["type"]) => {
    const newBlock: TextBlock = {
      id: `tb-${Date.now()}`,
      type,
      content: "",
    };
    setTextBlocks((prev) => [...prev, newBlock]);
  }, []);

  const handleUpdateTextBlock = useCallback(
    (id: string, updates: Partial<TextBlock>) => {
      setTextBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
      );
    },
    []
  );

  const handleDeleteTextBlock = useCallback((id: string) => {
    setTextBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // AI text assist
  const { isLoading: isAiLoading, runAction: runAiAction } = useTextAssist();

  const handleAiAction = useCallback(
    async (blockId: string, action: TextAssistAction) => {
      const block = textBlocks.find((b) => b.id === blockId);
      if (!block) return;

      const result = await runAiAction(action, block.content, selectedImages);
      setTextBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, content: result } : b))
      );
    },
    [textBlocks, selectedImages, runAiAction]
  );

  // Build slideImages array for apply
  const buildSlideImages = useCallback((): Array<Array<string | null>> => {
    if (!selectedPlanPreview) return [];
    
    const slideImages: Array<Array<string | null>> = [];
    let cursor = 0;
    
    for (const variant of selectedPlanPreview) {
      const imageFrameCount = variant.frames.filter(
        (f) => f.contentType === "image"
      ).length;
      const slideImageSet: Array<string | null> = [];
      for (let i = 0; i < imageFrameCount; i++) {
        slideImageSet.push(
          cursor < selectedImages.length ? selectedImages[cursor++] : null
        );
      }
      slideImages.push(slideImageSet);
    }
    
    return slideImages;
  }, [selectedPlanPreview, selectedImages]);

  // Apply layout
  const handleApply = useCallback(() => {
    if (!selectedPlanPreview) return;

    if (hasExistingContent && !insertOnly) {
      setShowOverwriteConfirm(true);
      return;
    }

    const slideImages = buildSlideImages();

    onApply(selectedPlanPreview, {
      mode,
      seed,
      tasteMode,
      slideCount,
      slideImages,
      textStyle: {
        fontStyle: textStylePreset === "editorial" ? "serif" : "clean",
        dropCap: dropCapEnabled,
        autoSize: true,
      },
    });
    onClose();
  }, [
    selectedPlanPreview,
    hasExistingContent,
    insertOnly,
    onApply,
    mode,
    seed,
    tasteMode,
    slideCount,
    buildSlideImages,
    textStylePreset,
    dropCapEnabled,
    onClose,
  ]);

  const handleConfirmOverwrite = useCallback(() => {
    if (!selectedPlanPreview) return;
    setShowOverwriteConfirm(false);
    
    const slideImages = buildSlideImages();
    
    onApply(selectedPlanPreview, {
      mode,
      seed,
      tasteMode,
      slideCount,
      slideImages,
      textStyle: {
        fontStyle: textStylePreset === "editorial" ? "serif" : "clean",
        dropCap: dropCapEnabled,
        autoSize: true,
      },
    });
    onClose();
  }, [
    selectedPlanPreview,
    onApply,
    mode,
    seed,
    tasteMode,
    slideCount,
    buildSlideImages,
    textStylePreset,
    dropCapEnabled,
    onClose,
  ]);

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showFullscreenPreview) {
          setShowFullscreenPreview(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, showFullscreenPreview, onClose]);

  // =====================================================
  // RENDER HELPERS
  // =====================================================

  // Memoize thumbnail URLs for asset grid and previews
  const thumbnailImages = useMemo(
    () => selectedImages.map((url) => getThumbnailUrl(url, { fallbackToOriginal: true })),
    [selectedImages]
  );

  // Compute cumulative image offsets for each slide
  const slideImageOffsets = useMemo(() => {
    if (!selectedPlanPreview) return [];
    const offsets: number[] = [];
    let cumulative = 0;
    for (const variant of selectedPlanPreview) {
      offsets.push(cumulative);
      cumulative += variant.frames.filter((f) => f.contentType === "image").length;
    }
    return offsets;
  }, [selectedPlanPreview]);

  const renderPlansSection = () => (
    <CollapsibleSection
      title="Plans"
      icon={<LayoutGrid size={16} />}
      badge={layoutOutput?.variants.length}
    >
      <div className="magic-workspace__plans-grid">
        {layoutOutput?.variants.map((variant, i) => {
          // Each plan card shows first N images (plans are alternatives, not sequential slides)
          const imageFrameCount = variant.frames.filter((f) => f.contentType === "image").length;
          const variantImages = thumbnailImages.slice(0, imageFrameCount);

          return (
            <PlanCard
              key={`plan-${i}`}
              variant={variant}
              index={i}
              isSelected={selectedVariantIndex === i}
              images={variantImages}
              slideCount={slideCount}
              onSelect={() => handleSelectPlan(i)}
              onRefresh={() => handleRefreshPlan()}
            />
          );
        })}
      </div>
    </CollapsibleSection>
  );

  const renderAssetsSection = () => (
    <CollapsibleSection
      title="Assets"
      icon={<ImagePlus size={16} />}
      badge={selectedImages.length > 0 ? selectedImages.length : undefined}
    >
      <div className="magic-workspace__assets-actions">
        <button
          type="button"
          className="magic-workspace__assets-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} />
          Upload
        </button>
        <button
          type="button"
          className="magic-workspace__assets-btn"
          onClick={() => setIsFileManagerOpen(true)}
        >
          <FolderOpen size={14} />
          Project
        </button>
        {selectedImages.length > 0 && (
          <button
            type="button"
            className="magic-workspace__assets-btn"
            onClick={handleClearImages}
            style={{ marginLeft: "auto" }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {selectedImages.length > 0 && (
        <VirtualizedAssetGrid
          images={selectedImages}
          thumbnails={thumbnailImages}
          onRemove={handleRemoveImage}
        />
      )}

      {selectedImages.length === 0 && (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: "12px",
          }}
        >
          No images selected
          <br />
          <span style={{ fontSize: "11px", opacity: 0.7 }}>
            Upload or select from project
          </span>
        </div>
      )}
    </CollapsibleSection>
  );

  const renderSettingsSection = () => {
    // Helper to render a setting row with optional override toggle (for slide mode)
    const renderSettingRow = (
      label: string,
      field: keyof SlideLayoutOverrides | null,
      children: React.ReactNode,
      fullWidth = false
    ) => {
      const hasOverride = field && settingsMode === "slide" && isOverridden(field);
      
      return (
        <div className={`magic-workspace__setting-card ${fullWidth ? "magic-workspace__setting-card--full" : ""}`}>
          <div className="magic-workspace__setting-header">
            <span className="magic-workspace__setting-label">
              {label}
              {field && settingsMode === "slide" && !hasOverride && (
                <span className="magic-workspace__setting-plan-tag">Plan</span>
              )}
            </span>
            {field && settingsMode === "slide" && (
              <button
                type="button"
                className={`magic-workspace__override-toggle ${hasOverride ? "magic-workspace__override-toggle--active" : ""}`}
                onClick={() => handleToggleOverride(field, !hasOverride)}
                title={hasOverride ? "Use plan default" : "Override for this slide"}
              >
                {hasOverride ? "Override" : "Default"}
              </button>
            )}
          </div>
          <div className={`magic-workspace__setting-value ${!hasOverride && settingsMode === "slide" && field ? "magic-workspace__setting-value--disabled" : ""}`}>
            {children}
          </div>
        </div>
      );
    };

    return (
      <CollapsibleSection
        title={settingsMode === "plan" ? "Plan Settings" : `Slide ${activeSlideIndex + 1} Settings`}
        icon={<Settings2 size={16} />}
        defaultOpen={true}
      >
        {/* Context header/breadcrumb */}
        <div className="magic-workspace__settings-context">
          <span className="magic-workspace__context-label">{contextLabel}</span>
          {settingsMode === "slide" && (
            <>
              <span className="magic-workspace__context-summary">{overrideSummary}</span>
              <button
                type="button"
                className="magic-workspace__back-to-plan"
                onClick={handleBackToPlanMode}
              >
                <ChevronLeft size={12} />
                Plan Settings
              </button>
            </>
          )}
        </div>

        <div className="magic-workspace__settings-grid">
          {/* Frames - always shown */}
          {renderSettingRow("Frames", "framesPerSlide", (
            <input
              type="number"
              min={1}
              max={20}
              value={settingsMode === "slide" && isOverridden("framesPerSlide") 
                ? currentSlideOverrides.framesPerSlide 
                : count}
              disabled={settingsMode === "slide" && !isOverridden("framesPerSlide")}
              onChange={(e) => {
                const val = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                if (settingsMode === "slide" && isOverridden("framesPerSlide")) {
                  handleSetSlideOverride("framesPerSlide", val);
                } else {
                  setCount(val);
                }
              }}
              className="magic-workspace__setting-input"
            />
          ))}

          {/* Mode */}
          {renderSettingRow("Mode", "mode", (
            <select
              value={settingsMode === "slide" && isOverridden("mode") 
                ? currentSlideOverrides.mode 
                : mode}
              disabled={settingsMode === "slide" && !isOverridden("mode")}
              onChange={(e) => {
                const val = e.target.value as LayoutMode;
                if (settingsMode === "slide" && isOverridden("mode")) {
                  handleSetSlideOverride("mode", val);
                } else {
                  setMode(val);
                }
              }}
              className="magic-workspace__setting-select"
            >
              <option value="grid">Grid</option>
              <option value="masonry">Masonry</option>
            </select>
          ))}

          {/* Style */}
          {renderSettingRow("Style", "tasteMode", (
            <select
              value={settingsMode === "slide" && isOverridden("tasteMode") 
                ? currentSlideOverrides.tasteMode 
                : tasteMode}
              disabled={settingsMode === "slide" && !isOverridden("tasteMode")}
              onChange={(e) => {
                const val = e.target.value as TasteModeId;
                if (settingsMode === "slide" && isOverridden("tasteMode")) {
                  handleSetSlideOverride("tasteMode", val);
                } else {
                  setTasteMode(val);
                }
              }}
              className="magic-workspace__setting-select"
            >
              {getTasteModeIds().map((id) => (
                <option key={id} value={id}>
                  {getTasteMode(id).name}
                </option>
              ))}
            </select>
          ))}

          {/* Slides - ONLY in Plan mode */}
          {settingsMode === "plan" && (
            <div className="magic-workspace__setting-card">
              <span className="magic-workspace__setting-label">Slides</span>
              <div className="magic-workspace__setting-value">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={slideCount}
                  onChange={(e) =>
                    setSlideCount(
                      Math.max(1, Math.min(20, Number(e.target.value) || 1))
                    )
                  }
                  className="magic-workspace__setting-input"
                />
              </div>
            </div>
          )}

          {/* Spacing */}
          {renderSettingRow("Spacing", "spacing", (
            <>
              <button
                type="button"
                className={`magic-workspace__mode-toggle ${spacingMode === "auto" ? "magic-workspace__mode-toggle--active" : ""}`}
                onClick={() =>
                  setSpacingMode((prev) => (prev === "auto" ? "custom" : "auto"))
                }
                disabled={settingsMode === "slide" && !isOverridden("spacing")}
              >
                {spacingMode === "auto" ? "Auto" : "Custom"}
              </button>
              <input
                type="number"
                min={0}
                max={120}
                value={settingsMode === "slide" && isOverridden("spacing") 
                  ? currentSlideOverrides.spacing 
                  : spacingValue}
                disabled={spacingMode === "auto" || (settingsMode === "slide" && !isOverridden("spacing"))}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(120, Number(e.target.value) || 0));
                  if (settingsMode === "slide" && isOverridden("spacing")) {
                    handleSetSlideOverride("spacing", val);
                  } else {
                    setSpacingValue(val);
                  }
                }}
                className="magic-workspace__setting-input"
              />
              {settingsMode === "plan" && (
                <button
                  type="button"
                  className={`magic-workspace__lock-btn ${globalLocks.lockSpacing ? "magic-workspace__lock-btn--active" : ""}`}
                  onClick={() =>
                    setGlobalLocks((prev) => ({
                      ...prev,
                      lockSpacing: !prev.lockSpacing,
                    }))
                  }
                >
                  {globalLocks.lockSpacing ? (
                    <Lock size={12} />
                  ) : (
                    <Unlock size={12} />
                  )}
                </button>
              )}
            </>
          ), true)}

          {/* Radius */}
          {renderSettingRow("Radius", "radius", (
            <>
              <button
                type="button"
                className={`magic-workspace__mode-toggle ${radiusMode === "auto" ? "magic-workspace__mode-toggle--active" : ""}`}
                onClick={() =>
                  setRadiusMode((prev) => (prev === "auto" ? "custom" : "auto"))
                }
                disabled={settingsMode === "slide" && !isOverridden("radius")}
              >
                {radiusMode === "auto" ? "Auto" : "Custom"}
              </button>
              <input
                type="number"
                min={0}
                max={80}
                value={settingsMode === "slide" && isOverridden("radius") 
                  ? currentSlideOverrides.radius 
                  : radiusValue}
                disabled={radiusMode === "auto" || (settingsMode === "slide" && !isOverridden("radius"))}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(80, Number(e.target.value) || 0));
                  if (settingsMode === "slide" && isOverridden("radius")) {
                    handleSetSlideOverride("radius", val);
                  } else {
                    setRadiusValue(val);
                  }
                }}
                className="magic-workspace__setting-input"
              />
              {settingsMode === "plan" && (
                <button
                  type="button"
                  className={`magic-workspace__lock-btn ${globalLocks.lockRadius ? "magic-workspace__lock-btn--active" : ""}`}
                  onClick={() =>
                    setGlobalLocks((prev) => ({
                      ...prev,
                      lockRadius: !prev.lockRadius,
                    }))
                  }
                >
                  {globalLocks.lockRadius ? (
                    <Lock size={12} />
                  ) : (
                    <Unlock size={12} />
                  )}
                </button>
              )}
            </>
          ), true)}
        </div>

        {/* Regenerate actions - context-aware */}
        <div className="magic-workspace__regen-actions">
          {settingsMode === "slide" ? (
            <>
              {/* Primary: Regenerate This Slide */}
              <button
                type="button"
                className="magic-workspace__regen-btn"
                onClick={() => handleRefreshSlide(activeSlideIndex)}
                title="Regenerate this slide only"
              >
                <RefreshCw size={12} />
                Regenerate This Slide
              </button>
              {/* Secondary: Regenerate All */}
              {slideCount > 1 && (
                <button
                  type="button"
                  className="magic-workspace__regen-btn magic-workspace__regen-btn--secondary"
                  onClick={() => handleRefreshPlan()}
                  title={`Regenerate all ${slideCount} slides`}
                >
                  <LayoutGrid size={12} />
                  Regenerate All Slides
                </button>
              )}
            </>
          ) : (
            <>
              {/* Primary: Regenerate All Slides (plan mode) */}
              <button
                type="button"
                className="magic-workspace__regen-btn"
                onClick={() => handleRefreshPlan()}
                title={slideCount > 1 ? `Regenerate all ${slideCount} slides` : "Regenerate layout"}
              >
                <RefreshCw size={12} />
                {slideCount > 1 ? `Regenerate All ${slideCount} Slides` : "Regenerate Layout"}
              </button>
            </>
          )}
        </div>
      </CollapsibleSection>
    );
  };

  const renderTextBlocksSection = () => (
    <CollapsibleSection
      title={settingsMode === "slide" ? `Text Blocks · Slide ${activeSlideIndex + 1}` : "Text Blocks"}
      icon={<Type size={16} />}
      badge={textBlocks.length > 0 ? textBlocks.length : undefined}
    >
      {/* Plan mode: show message that text blocks are slide-specific */}
      {settingsMode === "plan" && slideCount > 1 && (
        <div className="magic-workspace__text-blocks-plan-hint">
          <Type size={14} />
          <span>Text blocks are slide-specific. Select a slide from the filmstrip below to edit text blocks.</span>
        </div>
      )}
      
      <TextStylePresets active={textStylePreset} onChange={setTextStylePreset} />

      <div className="magic-workspace__text-blocks">
        {textBlocks.map((block) => {
          // Check if this block is attached to current slide
          const isAttached = currentSlideTextBlocks.some((inst) => inst.blockId === block.id);
          
          return (
            <div key={block.id} className="magic-workspace__text-block-wrapper">
              <TextBlockEditor
                block={block}
                onUpdate={handleUpdateTextBlock}
                onDelete={handleDeleteTextBlock}
                onAiAction={handleAiAction}
                isAiLoading={isAiLoading}
              />
              {/* Apply to slide button */}
              <button
                type="button"
                className={`magic-workspace__apply-to-slide ${isAttached ? "magic-workspace__apply-to-slide--attached" : ""}`}
                onClick={() => handleAttachTextBlockToSlide(block.id)}
                disabled={isAttached}
                title={isAttached ? `Attached to Slide ${activeSlideIndex + 1}` : `Apply to Slide ${activeSlideIndex + 1}`}
              >
                {isAttached ? (
                  <>
                    <Lock size={10} />
                    Slide {activeSlideIndex + 1}
                  </>
                ) : (
                  <>
                    <Plus size={10} />
                    Apply to Slide {activeSlideIndex + 1}
                  </>
                )}
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="magic-workspace__add-text-block"
          onClick={() => handleAddTextBlock("body")}
        >
          <Plus size={14} />
          Add Text Block
        </button>
      </div>

      {/* Attached text blocks for current slide */}
      {currentSlideTextBlocks.length > 0 && (
        <div className="magic-workspace__attached-blocks">
          <div className="magic-workspace__attached-header">
            <span>Slide {activeSlideIndex + 1} Text Blocks</span>
            <span className="magic-workspace__attached-count">{currentSlideTextBlocks.length}</span>
          </div>
          {currentSlideTextBlocks.map((instance) => {
            const block = textBlocks.find((b) => b.id === instance.blockId);
            if (!block) return null;
            return (
              <div key={instance.id} className="magic-workspace__attached-item">
                <span className="magic-workspace__attached-type">{block.type}</span>
                <span className="magic-workspace__attached-preset">{instance.presetId}</span>
                <div className="magic-workspace__attached-actions">
                  <button
                    type="button"
                    className={`magic-workspace__attached-lock ${instance.locked ? "magic-workspace__attached-lock--active" : ""}`}
                    onClick={() => handleToggleTextBlockLock(instance.id, activeSlideIndex)}
                    title={instance.locked ? "Unlock position" : "Lock position"}
                  >
                    {instance.locked ? <Lock size={10} /> : <Unlock size={10} />}
                  </button>
                  <button
                    type="button"
                    className="magic-workspace__attached-remove"
                    onClick={() => handleRemoveTextBlockFromSlide(instance.id, activeSlideIndex)}
                    title="Remove from slide"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {textBlocks.length > 0 && (
        <div className="magic-workspace__style-controls">
          <div className="magic-workspace__style-row">
            <span className="magic-workspace__style-label">Drop Cap</span>
            <button
              type="button"
              className={`magic-workspace__toggle-switch ${dropCapEnabled ? "magic-workspace__toggle-switch--on" : ""}`}
              onClick={() => setDropCapEnabled(!dropCapEnabled)}
            />
          </div>

          <div className="magic-workspace__style-row">
            <span className="magic-workspace__style-label">Line Height</span>
            <div className="magic-workspace__slider">
              <input
                type="range"
                min={1}
                max={2.5}
                step={0.1}
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
              />
              <span className="magic-workspace__slider-value">
                {lineHeight.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="magic-workspace__style-row">
            <span className="magic-workspace__style-label">
              Paragraph Spacing
            </span>
            <div className="magic-workspace__slider">
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={paragraphSpacing}
                onChange={(e) => setParagraphSpacing(Number(e.target.value))}
              />
              <span className="magic-workspace__slider-value">
                {paragraphSpacing.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="magic-workspace__style-row">
            <span className="magic-workspace__style-label">Alignment</span>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                className={`magic-workspace__lock-btn ${textAlignment === "left" ? "magic-workspace__lock-btn--active" : ""}`}
                onClick={() => setTextAlignment("left")}
                style={
                  textAlignment === "left"
                    ? {
                        background: "rgba(79, 140, 255, 0.2)",
                        borderColor: "rgba(79, 140, 255, 0.4)",
                        color: "rgba(79, 140, 255, 1)",
                      }
                    : {}
                }
              >
                <AlignLeft size={12} />
              </button>
              <button
                type="button"
                className={`magic-workspace__lock-btn ${textAlignment === "center" ? "magic-workspace__lock-btn--active" : ""}`}
                onClick={() => setTextAlignment("center")}
                style={
                  textAlignment === "center"
                    ? {
                        background: "rgba(79, 140, 255, 0.2)",
                        borderColor: "rgba(79, 140, 255, 0.4)",
                        color: "rgba(79, 140, 255, 1)",
                      }
                    : {}
                }
              >
                <AlignCenter size={12} />
              </button>
              <button
                type="button"
                className={`magic-workspace__lock-btn ${textAlignment === "right" ? "magic-workspace__lock-btn--active" : ""}`}
                onClick={() => setTextAlignment("right")}
                style={
                  textAlignment === "right"
                    ? {
                        background: "rgba(79, 140, 255, 0.2)",
                        borderColor: "rgba(79, 140, 255, 0.4)",
                        color: "rgba(79, 140, 255, 1)",
                      }
                    : {}
                }
              >
                <AlignRight size={12} />
              </button>
            </div>
          </div>

          <div className="magic-workspace__style-row">
            <span className="magic-workspace__style-label">
              Background Panel
            </span>
            <button
              type="button"
              className={`magic-workspace__toggle-switch ${textBackgroundEnabled ? "magic-workspace__toggle-switch--on" : ""}`}
              onClick={() => setTextBackgroundEnabled(!textBackgroundEnabled)}
            />
          </div>

          {textBackgroundEnabled && (
            <div className="magic-workspace__style-row">
              <span className="magic-workspace__style-label">
                Panel Opacity
              </span>
              <div className="magic-workspace__slider">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={textBackgroundOpacity}
                  onChange={(e) =>
                    setTextBackgroundOpacity(Number(e.target.value))
                  }
                />
                <span className="magic-workspace__slider-value">
                  {Math.round(textBackgroundOpacity * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );

  // =====================================================
  // MAIN RENDER
  // =====================================================

  if (!open) return null;

  const content = (
    <div className="magic-workspace__overlay" onClick={onClose}>
      <div className="magic-workspace" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="magic-workspace__header">
          <div className="magic-workspace__title-group">
            <div className="magic-workspace__icon">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="magic-workspace__title">Magic Layout</h2>
              <p className="magic-workspace__subtitle">
                Create beautiful slide layouts with AI assistance
              </p>
            </div>
          </div>
          <div className="magic-workspace__header-actions">
            <button
              type="button"
              className="magic-workspace__close-btn"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content - 3 panel layout */}
        <div className="magic-workspace__content">
          {/* Left sidebar - Plans & Assets */}
          {!isMobile && (
            <div className="magic-workspace__sidebar-left">
              {renderPlansSection()}
              {renderAssetsSection()}
            </div>
          )}

          {/* Center - Preview canvas */}
          <div className="magic-workspace__preview-area">
            <div className="magic-workspace__canvas-container">
              <div className="magic-workspace__canvas">
                {activeVariant && (
                  <>
                    <LayoutPreviewSvg
                      variant={activeVariant}
                      images={selectedImages}
                      imageOffset={slideImageOffsets[activeSlideIndex] ?? 0}
                      radiusOverride={radiusMode === "custom" ? resolvedSettings.radius : undefined}
                    />
                    <div
                      className="magic-workspace__canvas-overlay"
                      onClick={() => setShowFullscreenPreview(true)}
                    >
                      <div className="magic-workspace__canvas-zoom">
                        <Maximize2 size={16} />
                        Click to enlarge
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Slide strip (filmstrip) - taller with enhanced selection */}
            {slideCount > 1 && selectedPlanPreview && (
              <div className="magic-workspace__slide-strip magic-workspace__slide-strip--enhanced">
                {selectedPlanPreview.map((variant, i) => {
                  const slideBlocks = slideTextBlocks.get(i) ?? [];
                  const isActive = activeSlideIndex === i && slideSelected;
                  const hasOverrides = slideOverrides.has(i);
                  return (
                    <div
                      key={i}
                      className={`magic-workspace__slide-thumb magic-workspace__slide-thumb--large ${
                        activeSlideIndex === i ? "magic-workspace__slide-thumb--active" : ""
                      } ${isActive ? "magic-workspace__slide-thumb--editing" : ""}`}
                      onClick={() => handleSelectSlide(i)}
                    >
                      <LayoutPreviewSvg
                        variant={variant}
                        images={selectedImages}
                        imageOffset={slideImageOffsets[i] ?? 0}
                      />
                      {/* Slide number badge */}
                      <span className="magic-workspace__slide-number">{i + 1}</span>
                      {/* Override indicator */}
                      {hasOverrides && (
                        <span className="magic-workspace__slide-override-badge" title="Has overrides">
                          <Settings2 size={8} />
                        </span>
                      )}
                      {/* Text blocks indicator */}
                      {slideBlocks.length > 0 && (
                        <span className="magic-workspace__slide-text-badge" title={`${slideBlocks.length} text block(s)`}>
                          <Type size={10} />
                        </span>
                      )}
                      {/* Per-slide refresh on hover */}
                      <button
                        type="button"
                        className="magic-workspace__slide-refresh"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefreshSlide(i);
                        }}
                        title="Regenerate this slide"
                      >
                        <RefreshCw size={10} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="magic-workspace__slide-add magic-workspace__slide-add--large"
                  onClick={() => setSlideCount((c) => Math.min(20, c + 1))}
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Right sidebar - Context-aware: Settings first in plan mode, Text Blocks first in slide mode */}
          {!isMobile && !isTablet && (
            <div className="magic-workspace__sidebar-right">
              {settingsMode === "slide" ? (
                <>
                  {renderTextBlocksSection()}
                  {renderSettingsSection()}
                </>
              ) : (
                <>
                  {renderSettingsSection()}
                  {renderTextBlocksSection()}
                </>
              )}
            </div>
          )}
        </div>

        {/* Mobile bottom sheet */}
        {isMobile && (
          <div className="magic-workspace__mobile-sheet">
            <div className="magic-workspace__mobile-tabs">
              <button
                type="button"
                className={`magic-workspace__mobile-tab ${mobileTab === "plans" ? "magic-workspace__mobile-tab--active" : ""}`}
                onClick={() => setMobileTab("plans")}
              >
                <LayoutGrid size={14} />
                Plans
              </button>
              <button
                type="button"
                className={`magic-workspace__mobile-tab ${mobileTab === "assets" ? "magic-workspace__mobile-tab--active" : ""}`}
                onClick={() => setMobileTab("assets")}
              >
                <ImagePlus size={14} />
                Assets
              </button>
              <button
                type="button"
                className={`magic-workspace__mobile-tab ${mobileTab === "text" ? "magic-workspace__mobile-tab--active" : ""}`}
                onClick={() => setMobileTab("text")}
              >
                <Type size={14} />
                Text
              </button>
              <button
                type="button"
                className={`magic-workspace__mobile-tab ${mobileTab === "settings" ? "magic-workspace__mobile-tab--active" : ""}`}
                onClick={() => setMobileTab("settings")}
              >
                <Settings2 size={14} />
                Settings
              </button>
            </div>
            <div className="magic-workspace__mobile-content">
              {mobileTab === "plans" && (
                <div className="magic-workspace__plans-grid">
                  {layoutOutput?.variants.map((variant, i) => {
                    const imageFrameCount = variant.frames.filter((f) => f.contentType === "image").length;
                    const variantImages = thumbnailImages.slice(0, imageFrameCount);
                    return (
                      <PlanCard
                        key={`plan-m-${i}`}
                        variant={variant}
                        index={i}
                        isSelected={selectedVariantIndex === i}
                        images={variantImages}
                        onSelect={() => setSelectedVariantIndex(i)}
                        onRefresh={() => handleRefreshVariant(i)}
                      />
                    );
                  })}
                </div>
              )}
              {mobileTab === "assets" && (
                <>
                  <div className="magic-workspace__assets-actions">
                    <button
                      type="button"
                      className="magic-workspace__assets-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      Upload
                    </button>
                    <button
                      type="button"
                      className="magic-workspace__assets-btn"
                      onClick={() => setIsFileManagerOpen(true)}
                    >
                      <FolderOpen size={14} />
                      Project
                    </button>
                  </div>
                  {selectedImages.length > 0 && (
                    <VirtualizedAssetGrid
                      images={selectedImages}
                      thumbnails={thumbnailImages}
                      onRemove={handleRemoveImage}
                    />
                  )}
                </>
              )}
              {mobileTab === "text" && (
                <>
                  <TextStylePresets
                    active={textStylePreset}
                    onChange={setTextStylePreset}
                  />
                  <div className="magic-workspace__text-blocks">
                    {textBlocks.map((block) => (
                      <TextBlockEditor
                        key={block.id}
                        block={block}
                        onUpdate={handleUpdateTextBlock}
                        onDelete={handleDeleteTextBlock}
                      />
                    ))}
                    <button
                      type="button"
                      className="magic-workspace__add-text-block"
                      onClick={() => handleAddTextBlock("body")}
                    >
                      <Plus size={14} />
                      Add Text Block
                    </button>
                  </div>
                </>
              )}
              {mobileTab === "settings" && (
                <div className="magic-workspace__settings-grid">
                  <div className="magic-workspace__setting-card">
                    <span className="magic-workspace__setting-label">
                      Frames
                    </span>
                    <div className="magic-workspace__setting-value">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={count}
                        onChange={(e) =>
                          setCount(
                            Math.max(
                              1,
                              Math.min(20, Number(e.target.value) || 1)
                            )
                          )
                        }
                        className="magic-workspace__setting-input"
                      />
                    </div>
                  </div>
                  <div className="magic-workspace__setting-card">
                    <span className="magic-workspace__setting-label">
                      Style
                    </span>
                    <div className="magic-workspace__setting-value">
                      <select
                        value={tasteMode}
                        onChange={(e) =>
                          setTasteMode(e.target.value as TasteModeId)
                        }
                        className="magic-workspace__setting-select"
                      >
                        {getTasteModeIds().map((id) => (
                          <option key={id} value={id}>
                            {getTasteMode(id).name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="magic-workspace__footer">
          <div className="magic-workspace__footer-stats">
            {layoutOutput && (
              <>
                {layoutOutput.variants.length} plans •{" "}
                {activeVariant?.frames.length || 0} frames •{" "}
                {selectedImages.length} images
              </>
            )}
          </div>
          <div className="magic-workspace__footer-actions">
            <button
              type="button"
              className="magic-workspace__btn magic-workspace__btn--secondary"
              onClick={handleRefreshAll}
            >
              <RefreshCw size={14} />
              Regenerate
            </button>
            <button
              type="button"
              className="magic-workspace__btn magic-workspace__btn--primary"
              disabled={!activeVariant}
              onClick={handleApply}
            >
              <Sparkles size={14} />
              {insertOnly ? "Insert Slides" : "Apply Layout"}
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />

        {/* File manager modal */}
        {isFileManagerOpen && (
          <FileManagerV2
            isOpen={isFileManagerOpen}
            onRequestClose={() => setIsFileManagerOpen(false)}
            onFileSelect={handleProjectFileSelect}
            selectionMode="multi"
            fileTypeFilter="images"
          />
        )}

        {/* Confirmation dialog for overwrite */}
        <ConfirmModal
          isOpen={showOverwriteConfirm}
          onRequestClose={() => setShowOverwriteConfirm(false)}
          onConfirm={handleConfirmOverwrite}
          message="This slide already has content. Applying this layout will add new frames on top of the existing content. Do you want to continue?"
          confirmLabel="Apply Layout"
          cancelLabel="Cancel"
        />

        {/* Confirmation dialog for plan regeneration */}
        <ConfirmModal
          isOpen={showRegenConfirm}
          onRequestClose={handleCancelRegen}
          onConfirm={handleConfirmRegen}
          message={`Regenerate all ${slideCount} slides? This will create new layouts for every slide in this plan.`}
          confirmLabel={`Regenerate ${slideCount} Slides`}
          cancelLabel="Cancel"
        />
      </div>

      {/* Fullscreen Preview Lightbox */}
      {showFullscreenPreview && activeVariant && (
        <div className="magic-workspace__fullscreen-preview">
          <button
            type="button"
            className="magic-workspace__fullscreen-close"
            onClick={() => setShowFullscreenPreview(false)}
          >
            <X size={20} />
          </button>

          {slideCount > 1 && (
            <>
              <button
                type="button"
                className="magic-workspace__fullscreen-nav magic-workspace__fullscreen-nav--prev"
                onClick={() =>
                  setActiveSlideIndex((prev) =>
                    prev > 0 ? prev - 1 : slideCount - 1
                  )
                }
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                className="magic-workspace__fullscreen-nav magic-workspace__fullscreen-nav--next"
                onClick={() =>
                  setActiveSlideIndex((prev) =>
                    prev < slideCount - 1 ? prev + 1 : 0
                  )
                }
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          <div className="magic-workspace__fullscreen-canvas">
            <LayoutPreviewSvg variant={activeVariant} images={selectedImages} />
          </div>

          {slideCount > 1 && (
            <div className="magic-workspace__fullscreen-counter">
              {activeSlideIndex + 1} / {slideCount}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default MagicLayoutWorkspace;
