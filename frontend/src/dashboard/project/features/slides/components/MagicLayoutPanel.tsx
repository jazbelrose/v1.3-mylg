/**
 * MagicLayoutPanel - Upgraded layout generator with Pro features
 * 
 * Phase 1 MVP Features:
 * - Taste mode dropdown (Apple Clean, Brutalist, Fashion, Cyber, Pinterest, Museum)
 * - Variants rail with 6 candidates
 * - Per-frame locks (position, crop, hero)
 * - Global locks (spacing, radius)
 * - Text/Image frame toggle
 * - Keyboard shortcuts 1-6 for variant selection
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  RefreshCw,
  RotateCcw,
  X,
  Check,
  LayoutGrid,
  ImagePlus,
  FolderOpen,
  Upload,
  Trash2,
  Lock,
  Unlock,
  Type,
  Image as ImageIcon,
  Sparkles,
  Settings2,
  Layers,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import {
  generateMagicLayouts,
  generateMagicLayoutVariant,
  generatePreviewLayout,
  type MagicLayoutOutput,
  type LayoutVariant,
  type GeneratedFrame,
} from "../lib/magicLayoutGenerator";
import { getTasteMode, getTasteModeIds } from "../lib/tasteModes";
import type {
  TasteModeId,
  FrameContentType,
  TileLocks,
  GlobalLocks,
  TextIntent,
} from "../lib/magicLayoutTypes";
import type { LayoutMode } from "../lib/pictureFrameLayoutGenerator";
import VariantsRail from "./VariantsRail";
import { FileManager, type FileItem } from "@/dashboard/project/components/FileManager";
import { ConfirmModal } from "@/shared/ui";
import "./MagicLayoutPanel.css";

export interface MagicLayoutPanelProps {
  open: boolean;
  onClose: () => void;
  /** When true, Magic Layout inserts new slides and never overwrites the current slide. */
  insertOnly?: boolean;
  onApply: (
    variants: LayoutVariant[],
    options: {
      mode: LayoutMode;
      seed: string;
      tasteMode: TasteModeId;
      slideCount?: number;
      /** Images for each slide - outer array is slides, inner is frame images */
      slideImages?: Array<Array<string | null>>;
      textStyle?: {
        fontStyle: string;
        dropCap: boolean;
        autoSize: boolean;
      };
    }
  ) => void;
  /** Optional: pre-loaded project images for gallery selection */
  projectImageUrls?: Array<{ url: string; name: string }>;
  /** Whether the current slide has existing content (for confirmation dialog) */
  hasExistingContent?: boolean;
}

// Frame config for UI state
interface FrameUIConfig {
  contentType: FrameContentType;
  imageSrc: string | null;
  textContent: string;
  textIntent: TextIntent;
  locks: TileLocks;
}

const DEFAULT_FRAME_CONFIG: FrameUIConfig = {
  contentType: "image",
  imageSrc: null,
  textContent: "",
  textIntent: "body",
  locks: { lockPosition: false, lockCrop: false, lockHero: false },
};

function PlanSlideSvgPreview({
  variant,
  images,
  previewId,
}: {
  variant: LayoutVariant;
  images: Array<string | null>;
  previewId: string;
}) {
  const viewBox = `0 0 ${variant.canvas.width / 10} ${variant.canvas.height / 10}`;
  const scale = 0.1;

  let imageCursor = 0;

  return (
    <svg className="magic-layout-panel__plan-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      {variant.frames.map((frame) => {
        const isText = frame.contentType === "text";
        const imageUrl = !isText ? images[imageCursor++] ?? null : null;
        const clipId = `clip-${previewId}-${variant.id}-${frame.id}`;

        return (
          <g key={frame.id}>
            {imageUrl && (
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={frame.x * scale}
                    y={frame.y * scale}
                    width={frame.width * scale}
                    height={frame.height * scale}
                    rx={Math.min(frame.radius * scale, 2)}
                  />
                </clipPath>
              </defs>
            )}
            {imageUrl && (
              <image
                href={imageUrl}
                x={frame.x * scale}
                y={frame.y * scale}
                width={frame.width * scale}
                height={frame.height * scale}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
              />
            )}
            <rect
              x={frame.x * scale}
              y={frame.y * scale}
              width={frame.width * scale}
              height={frame.height * scale}
              rx={Math.min(frame.radius * scale, 2)}
              fill={imageUrl ? "none" : isText ? "rgba(79, 140, 255, 0.3)" : "rgba(255, 255, 255, 0.10)"}
              stroke={isText ? "rgba(79, 140, 255, 0.6)" : "rgba(255, 255, 255, 0.35)"}
              strokeWidth={isText ? 0.8 : 0.5}
            />
          </g>
        );
      })}
    </svg>
  );
}

export const MagicLayoutPanel: React.FC<MagicLayoutPanelProps> = ({
  open,
  onClose,
  insertOnly = false,
  onApply,
  projectImageUrls,
  hasExistingContent = false,
}) => {
  // Core settings
  const [count, setCount] = useState(6);
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [tasteMode, setTasteMode] = useState<TasteModeId>("apple-clean");
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const [sessionId, setSessionId] = useState(() => `${Date.now()}`);
  const sessionKey = useMemo(() => `${sessionId}#${tasteMode}`, [sessionId, tasteMode]);

  // Global spacing / radius controls
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
  const [layoutOutput, setLayoutOutput] = useState<MagicLayoutOutput | null>(null);
  const [candidatePlans, setCandidatePlans] = useState<LayoutVariant[][] | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [previewVariantIndex, setPreviewVariantIndex] = useState<number | null>(null);

  // Optional per-plan / per-slide regeneration overrides (multi-slide plans only)
  const [planSeedOverrides, setPlanSeedOverrides] = useState<Record<number, Record<number, string>>>({});

  // Image selection
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [projectImages, setProjectImages] = useState<Array<{ url: string; name: string }>>([]);
  const [showProjectGallery, setShowProjectGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Multi-slide insert
  const [slideCount, setSlideCount] = useState(1);

  // Text styling options
  const [textStyle, setTextStyle] = useState({
    fontStyle: "clean" as "clean" | "serif" | "mono" | "display",
    dropCap: false,
    autoSize: true,
  });

  // Settings panel expanded
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Confirmation dialog for existing content
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Initialize frame configs when count changes
  useEffect(() => {
    setFrameConfigs((prev) => {
      const newConfigs: FrameUIConfig[] = [];
      for (let i = 0; i < count; i++) {
        newConfigs.push(prev[i] ?? { ...DEFAULT_FRAME_CONFIG });
      }
      return newConfigs;
    });
  }, [count]);

  // Generate layouts when params change
  useEffect(() => {
    if (!open) return;

    const output = generateMagicLayouts({
      frameCount: count,
      mode,
      tasteMode,
      seed,
      sessionKey,
      canvasWidth: 1920,
      canvasHeight: 1080,
      globalLocks,
      overrides: {
        gutter: spacingMode === "custom" ? spacingValue : undefined,
        radius: radiusMode === "custom" ? radiusValue : undefined,
      },
      frameConfigs: frameConfigs.map((cfg, i) => ({
        contentType: cfg.contentType,
        imageSrc: selectedImages[i] ?? cfg.imageSrc,
        textConfig:
          cfg.contentType === "text"
            ? { intent: cfg.textIntent, content: cfg.textContent }
            : null,
        locks: cfg.locks,
      })),
      variantCount: 6,
    });

    setLayoutOutput(output);
    setSelectedVariantIndex(0);

    // When inserting multiple slides, each candidate represents a multi-slide plan:
    // slide 1 uses the chosen candidate, and subsequent slides get unique layouts
    // derived from the same generation settings.
    if (slideCount > 1) {
      const sessionSeed = output.input.seed || seed;
      const plans = output.variants.map((baseVariant, planIdx) => {
        const plan: LayoutVariant[] = [baseVariant];
        for (let slideIdx = 1; slideIdx < slideCount; slideIdx++) {
          const variantSeed = `${sessionSeed}#plan${planIdx}#slide${slideIdx}`;
          plan.push(generateMagicLayoutVariant(output.input, variantSeed, slideIdx, sessionSeed));
        }
        return plan;
      });
      setCandidatePlans(plans);
    } else {
      setCandidatePlans(null);
    }
  }, [open, count, mode, tasteMode, seed, globalLocks, frameConfigs, selectedImages, slideCount, sessionKey, spacingMode, spacingValue, radiusMode, radiusValue]);

  // Reset seed when opening
  useEffect(() => {
    if (open) {
      setSeed(`${Date.now()}`);
      setSessionId(`${Date.now()}`);
      setPlanSeedOverrides({});
    }
  }, [open]);

  // Clear per-slide overrides when generation settings change
  useEffect(() => {
    setPlanSeedOverrides({});
  }, [seed, tasteMode, mode, count]);

  const handleGenerate = useCallback(() => {
    setSeed(`${Date.now()}`);
  }, []);

  // Handler for hover preview - ghost applies a variant temporarily
  const handleHoverPreview = useCallback((index: number | null) => {
    setPreviewVariantIndex(index);
    // In the future, this could dispatch a preview command to show ghost overlay
    // For now, we just track which variant is being previewed
  }, []);

  const shufflePlanSlide = useCallback((planIndex: number, slideIndex: number) => {
    setPlanSeedOverrides((prev) => {
      const plan = { ...(prev[planIndex] ?? {}) };
      plan[slideIndex] = `${Date.now()}#${Math.random().toString(16).slice(2)}`;
      return { ...prev, [planIndex]: plan };
    });
  }, []);

  const resetPlanOverrides = useCallback((planIndex: number) => {
    setPlanSeedOverrides((prev) => {
      if (!prev[planIndex]) return prev;
      const next = { ...prev };
      delete next[planIndex];
      return next;
    });
  }, []);

  const shuffleAllPlanSlides = useCallback(
    (planIndex: number) => {
      setPlanSeedOverrides((prev) => {
        const plan = { ...(prev[planIndex] ?? {}) };
        for (let slideIndex = 1; slideIndex < slideCount; slideIndex++) {
          plan[slideIndex] = `${Date.now()}#${slideIndex}#${Math.random().toString(16).slice(2)}`;
        }
        return { ...prev, [planIndex]: plan };
      });
    },
    [slideCount]
  );

  const selectedPlanPreview = useMemo(() => {
    if (!layoutOutput || !layoutOutput.variants[selectedVariantIndex]) return null;

    const selectedVariant = layoutOutput.variants[selectedVariantIndex];
    const sessionSeed = layoutOutput.input.seed || seed;

    const basePlan = (() => {
      if (slideCount <= 1) return [selectedVariant];
      const existing = candidatePlans?.[selectedVariantIndex];
      if (existing && existing.length === slideCount) return existing;
      const plan: LayoutVariant[] = [selectedVariant];
      for (let slideIdx = 1; slideIdx < slideCount; slideIdx++) {
        const variantSeed = `${sessionSeed}#plan${selectedVariantIndex}#slide${slideIdx}`;
        plan.push(generateMagicLayoutVariant(layoutOutput.input, variantSeed, slideIdx, sessionSeed));
      }
      return plan;
    })();

    const overridesForPlan = planSeedOverrides[selectedVariantIndex] ?? {};
    const planVariants = basePlan.map((variant, slideIdx) => {
      if (slideIdx === 0) return variant;
      const overrideSeed = overridesForPlan[slideIdx];
      if (!overrideSeed) return variant;
      return generateMagicLayoutVariant(layoutOutput.input, overrideSeed, slideIdx, sessionSeed);
    });

    const slideImages: Array<Array<string | null>> = [];
    let cursor = 0;
    for (const variant of planVariants) {
      const imageFrameCount = variant.frames.filter((f) => f.contentType === "image").length;
      const slideImageSet: Array<string | null> = [];
      for (let frameIdx = 0; frameIdx < imageFrameCount; frameIdx++) {
        slideImageSet.push(cursor < selectedImages.length ? selectedImages[cursor++] : null);
      }
      slideImages.push(slideImageSet);
    }

    return { variants: planVariants, slideImages };
  }, [layoutOutput, selectedVariantIndex, slideCount, candidatePlans, seed, planSeedOverrides, selectedImages]);

  /**
   * Core apply logic - builds slide images and calls onApply
   */
  const executeApply = useCallback(() => {
    if (!layoutOutput || !layoutOutput.variants[selectedVariantIndex]) return;

    const selectedVariant = layoutOutput.variants[selectedVariantIndex];

    const selectedPlanVariants = (() => {
      if (slideCount <= 1) return [selectedVariant];

      const sessionSeed = layoutOutput.input.seed || seed;
      const existing = candidatePlans?.[selectedVariantIndex];
      const basePlan =
        existing && existing.length === slideCount
          ? existing
          : (() => {
              const plan: LayoutVariant[] = [selectedVariant];
              for (let slideIdx = 1; slideIdx < slideCount; slideIdx++) {
                const variantSeed = `${sessionSeed}#plan${selectedVariantIndex}#slide${slideIdx}`;
                plan.push(generateMagicLayoutVariant(layoutOutput.input, variantSeed, slideIdx, sessionSeed));
              }
              return plan;
            })();

      const overridesForPlan = planSeedOverrides[selectedVariantIndex] ?? {};
      return basePlan.map((variant, slideIdx) => {
        if (slideIdx === 0) return variant;
        const overrideSeed = overridesForPlan[slideIdx];
        if (!overrideSeed) return variant;
        return generateMagicLayoutVariant(layoutOutput.input, overrideSeed, slideIdx, sessionSeed);
      });
    })();

    // Deal imported images across slides in order with no repeats.
    // When we run out, remaining frames stay empty (null).
    const dealtSlideImages: Array<Array<string | null>> = [];
    let cursor = 0;
    for (const variant of selectedPlanVariants) {
      const imageFrameCount = variant.frames.filter((f) => f.contentType === "image").length;
      const slideImageSet: Array<string | null> = [];
      for (let frameIdx = 0; frameIdx < imageFrameCount; frameIdx++) {
        slideImageSet.push(cursor < selectedImages.length ? selectedImages[cursor++] : null);
      }
      dealtSlideImages.push(slideImageSet);
    }

    // Apply-time variants: ensure the first slide preview reflects dealt images.
    const variantsWithImages: LayoutVariant[] = selectedPlanVariants.map((variant, slideIdx) => {
      if (slideIdx !== 0) return variant;
      return {
        ...variant,
        frames: variant.frames.map((frame, i) => {
          if (frame.contentType !== "image") return frame;
          const imageFrameIdx =
            variant.frames.slice(0, i + 1).filter((f) => f.contentType === "image").length - 1;
          const imageSrc = dealtSlideImages[0]?.[imageFrameIdx] ?? null;
          return { ...frame, imageSrc };
        }),
      };
    });

    onApply(variantsWithImages, {
      mode,
      seed: selectedVariant.seed,
      tasteMode,
      slideCount,
      slideImages: dealtSlideImages,
      textStyle,
    });

    setSelectedImages([]);
    onClose();
  }, [layoutOutput, selectedVariantIndex, selectedImages, mode, tasteMode, slideCount, textStyle, onApply, onClose, candidatePlans, seed, planSeedOverrides]);

  /**
   * Handle apply button click - shows confirmation if slide has existing content
   */
  const handleApply = useCallback(() => {
    if (!layoutOutput || !layoutOutput.variants[selectedVariantIndex]) return;

    // If the current slide has existing content and this is a single-slide apply,
    // show confirmation dialog
    if (!insertOnly && hasExistingContent && slideCount === 1) {
      setShowOverwriteConfirm(true);
      return;
    }

    // Otherwise proceed directly
    executeApply();
  }, [layoutOutput, selectedVariantIndex, hasExistingContent, slideCount, executeApply, insertOnly]);

  /**
   * Handle confirmation to overwrite existing content
   */
  const handleConfirmOverwrite = useCallback(() => {
    setShowOverwriteConfirm(false);
    executeApply();
  }, [executeApply]);

  const handleCancelOverwrite = useCallback(() => {
    setShowOverwriteConfirm(false);
  }, []);

  const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(20, Number(e.target.value) || 1));
    setCount(val);
  }, []);

  const handleModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as LayoutMode);
  }, []);

  const handleTasteModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTasteMode(e.target.value as TasteModeId);
  }, []);

  // Frame config handlers
  const toggleFrameContentType = useCallback((frameIndex: number) => {
    setFrameConfigs((prev) => {
      const updated = [...prev];
      if (updated[frameIndex]) {
        updated[frameIndex] = {
          ...updated[frameIndex],
          contentType: updated[frameIndex].contentType === "image" ? "text" : "image",
        };
      }
      return updated;
    });
  }, []);

  const toggleFrameLock = useCallback(
    (frameIndex: number, lockType: keyof TileLocks) => {
      setFrameConfigs((prev) => {
        const updated = [...prev];
        if (updated[frameIndex]) {
          const turningOn = !updated[frameIndex].locks[lockType];
          if (lockType === "lockHero" && turningOn) {
            // Only allow one hero lock at a time
            for (let i = 0; i < updated.length; i++) {
              if (i === frameIndex || !updated[i]) continue;
              updated[i] = { ...updated[i], locks: { ...updated[i].locks, lockHero: false } };
            }
          }
          updated[frameIndex] = {
            ...updated[frameIndex],
            locks: {
              ...updated[frameIndex].locks,
              [lockType]: !updated[frameIndex].locks[lockType],
            },
          };
        }
        return updated;
      });
    },
    []
  );

  const updateFrameText = useCallback((frameIndex: number, text: string) => {
    setFrameConfigs((prev) => {
      const updated = [...prev];
      if (updated[frameIndex]) {
        updated[frameIndex] = {
          ...updated[frameIndex],
          textContent: text,
        };
      }
      return updated;
    });
  }, []);

  const updateFrameTextIntent = useCallback((frameIndex: number, intent: TextIntent) => {
    setFrameConfigs((prev) => {
      const updated = [...prev];
      if (updated[frameIndex]) {
        updated[frameIndex] = {
          ...updated[frameIndex],
          textIntent: intent,
        };
      }
      return updated;
    });
  }, []);

  // Global lock handlers
  const toggleGlobalLock = useCallback((lockType: keyof GlobalLocks) => {
    setGlobalLocks((prev) => ({
      ...prev,
      [lockType]: !prev[lockType],
    }));
  }, []);

  // Image selection handlers
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setSelectedImages((prev) => [...prev, ...newUrls]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleProjectFileSelect = useCallback((files: FileItem[]) => {
    const imageFiles = files.filter((f) => {
      const ext = f.fileName.toLowerCase().split(".").pop() || "";
      return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    });
    // Populate project gallery for checkbox selection
    const images = imageFiles.map((f) => ({ url: f.url, name: f.fileName }));
    setProjectImages(images);
    setShowProjectGallery(true);
    setIsFileManagerOpen(false);
  }, []);

  // Toggle image selection in gallery
  const handleToggleProjectImage = useCallback((url: string) => {
    setSelectedImages((prev) => {
      if (prev.includes(url)) {
        return prev.filter((u) => u !== url);
      }
      return [...prev, url];
    });
  }, []);

  // Select all project images
  const handleSelectAllProjectImages = useCallback(() => {
    setSelectedImages(projectImages.map((img) => img.url));
  }, [projectImages]);

  // Clear project gallery
  const handleCloseProjectGallery = useCallback(() => {
    setShowProjectGallery(false);
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

  const handleClearImages = useCallback(() => {
    selectedImages.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
    setSelectedImages([]);
  }, [selectedImages]);

  // Get selected variant
  const selectedVariant = useMemo(
    () => layoutOutput?.variants[selectedVariantIndex] ?? null,
    [layoutOutput, selectedVariantIndex]
  );

  // Active taste mode info
  const activeTaste = useMemo(() => getTasteMode(tasteMode), [tasteMode]);
  const tasteModeIds = useMemo(() => getTasteModeIds(), []);

  const effectiveGutter = useMemo(() => {
    if (spacingMode === "custom") return spacingValue;
    return layoutOutput?.variants[0]?.gutter ?? spacingValue;
  }, [layoutOutput, spacingMode, spacingValue]);

  const effectiveRadius = useMemo(() => {
    if (radiusMode === "custom") return radiusValue;
    return layoutOutput?.variants[0]?.frames?.[0]?.radius ?? radiusValue;
  }, [layoutOutput, radiusMode, radiusValue]);

  // Text frames in selected variant
  const textFrameIndices = useMemo(
    () =>
      frameConfigs
        .map((cfg, i) => (cfg.contentType === "text" ? i : -1))
        .filter((i) => i >= 0),
    [frameConfigs]
  );

  // Calculate suggested slide count based on images and frame count
  const imageFrameCount = useMemo(() => {
    return frameConfigs.filter((cfg) => cfg.contentType === "image").length || count;
  }, [frameConfigs, count]);

  const suggestedSlideCount = useMemo(() => {
    if (selectedImages.length === 0 || imageFrameCount === 0) return 1;
    return Math.ceil(selectedImages.length / imageFrameCount);
  }, [selectedImages.length, imageFrameCount]);

  const dealingStats = useMemo(() => {
    const slotsPerSlide = Math.max(0, imageFrameCount);
    const totalSlots = Math.max(1, slideCount) * slotsPerSlide;
    const usedImages = Math.min(selectedImages.length, totalSlots);
    const unusedImages = Math.max(0, selectedImages.length - usedImages);
    const emptyFrames = Math.max(0, totalSlots - selectedImages.length);
    return { slotsPerSlide, totalSlots, usedImages, unusedImages, emptyFrames };
  }, [imageFrameCount, selectedImages.length, slideCount]);

  // Auto-set slide count based on images
  const handleAutoSlideCount = useCallback(() => {
    setSlideCount(suggestedSlideCount);
  }, [suggestedSlideCount]);

  if (!open) return null;

  return (
    <div className="magic-layout-panel">
      <div className="magic-layout-panel__header">
        <Sparkles size={16} className="magic-layout-panel__icon" />
        <span className="magic-layout-panel__title">Magic Layout</span>
        <button
          type="button"
          className="magic-layout-panel__settings-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
          title="Toggle advanced settings"
        >
          <Settings2 size={14} />
        </button>
        <button
          type="button"
          className="magic-layout-panel__close"
          onClick={onClose}
          title="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="magic-layout-panel__body">
        {/* Core Controls */}
        <div className="magic-layout-panel__controls">
          <div className="magic-layout-panel__field">
            <label htmlFor="ml-count">Frames:</label>
            <input
              id="ml-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={handleCountChange}
              className="magic-layout-panel__input"
            />
          </div>

          <div className="magic-layout-panel__field">
            <label htmlFor="ml-mode">Mode:</label>
            <select
              id="ml-mode"
              value={mode}
              onChange={handleModeChange}
              className="magic-layout-panel__select"
            >
              <option value="grid">Grid</option>
              <option value="masonry">Masonry</option>
            </select>
          </div>

          <div className="magic-layout-panel__field magic-layout-panel__field--wide">
            <label htmlFor="ml-taste">Style:</label>
            <select
              id="ml-taste"
              value={tasteMode}
              onChange={handleTasteModeChange}
              className="magic-layout-panel__select magic-layout-panel__select--taste"
            >
              {tasteModeIds.map((id) => (
                <option key={id} value={id}>
                  {getTasteMode(id).name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Taste Mode Description */}
        <div className="magic-layout-panel__taste-info">
          <span className="magic-layout-panel__taste-name">{activeTaste.name}</span>
          <span className="magic-layout-panel__taste-desc">{activeTaste.description}</span>
        </div>

        {/* Global Layout */}
        {showAdvanced && (
          <div className="magic-layout-panel__global-locks">
            <span className="magic-layout-panel__section-label">Global Layout</span>

            <div className="magic-layout-panel__global-row">
              <span className="magic-layout-panel__global-row-label">Spacing</span>
              <div className="magic-layout-panel__global-row-controls">
                <label className="magic-layout-panel__global-toggle">
                  <input
                    type="checkbox"
                    checked={spacingMode === "auto"}
                    onChange={(e) => setSpacingMode(e.target.checked ? "auto" : "custom")}
                  />
                  <span>Auto</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={effectiveGutter}
                  disabled={spacingMode === "auto"}
                  onChange={(e) => setSpacingValue(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                  className="magic-layout-panel__global-input"
                />
                <button
                  type="button"
                  className={`magic-layout-panel__lock-btn ${
                    globalLocks.lockSpacing ? "magic-layout-panel__lock-btn--active" : ""
                  }`}
                  onClick={() => toggleGlobalLock("lockSpacing")}
                  title="Lock spacing across regenerations"
                >
                  {globalLocks.lockSpacing ? <Lock size={12} /> : <Unlock size={12} />}
                  <span>Lock</span>
                </button>
              </div>
            </div>

            <div className="magic-layout-panel__global-row">
              <span className="magic-layout-panel__global-row-label">Radius</span>
              <div className="magic-layout-panel__global-row-controls">
                <label className="magic-layout-panel__global-toggle">
                  <input
                    type="checkbox"
                    checked={radiusMode === "auto"}
                    onChange={(e) => setRadiusMode(e.target.checked ? "auto" : "custom")}
                  />
                  <span>Auto</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={effectiveRadius}
                  disabled={radiusMode === "auto"}
                  onChange={(e) => setRadiusValue(Math.max(0, Math.min(80, Number(e.target.value) || 0)))}
                  className="magic-layout-panel__global-input"
                />
                <button
                  type="button"
                  className={`magic-layout-panel__lock-btn ${
                    globalLocks.lockRadius ? "magic-layout-panel__lock-btn--active" : ""
                  }`}
                  onClick={() => toggleGlobalLock("lockRadius")}
                  title="Lock radius across regenerations"
                >
                  {globalLocks.lockRadius ? <Lock size={12} /> : <Unlock size={12} />}
                  <span>Lock</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Variants Rail */}
        {layoutOutput && (
          <VariantsRail
            variants={layoutOutput.variants}
            selectedIndex={selectedVariantIndex}
            onSelect={setSelectedVariantIndex}
            onHoverPreview={handleHoverPreview}
            enableKeyboardShortcuts={true}
            titleText={slideCount > 1 ? `Plans (${slideCount} slides)` : "Layouts"}
            hintText={
              slideCount > 1
                ? "Pick a plan, click to insert"
                : insertOnly
                  ? "Hover to preview, click to insert"
                  : "Hover to preview, click to apply"
            }
            previewImages={selectedImages}
          />
        )}

        {/* Plan Preview (multi-slide) */}
        {slideCount > 1 && selectedPlanPreview && (
          <div className="magic-layout-panel__plan-preview">
            <div className="magic-layout-panel__plan-header">
              <span className="magic-layout-panel__section-label">Plan Preview</span>
              <div className="magic-layout-panel__plan-actions">
                <button
                  type="button"
                  className="magic-layout-panel__lock-btn"
                  onClick={() => shuffleAllPlanSlides(selectedVariantIndex)}
                  title="Regenerate layouts for slides 2+ in this plan"
                >
                  <RefreshCw size={12} />
                  <span>Shuffle Slides</span>
                </button>
                <button
                  type="button"
                  className="magic-layout-panel__lock-btn"
                  onClick={() => resetPlanOverrides(selectedVariantIndex)}
                  title="Reset per-slide regenerations for this plan"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="magic-layout-panel__plan-strip">
              {selectedPlanPreview.variants.map((variant, idx) => (
                <div key={`${variant.id}-${idx}`} className="magic-layout-panel__plan-slide">
                  <div className="magic-layout-panel__plan-slide-label">
                    <span>Slide {idx + 1}</span>
                    {idx > 0 && (
                      <button
                        type="button"
                        className="magic-layout-panel__plan-slide-shuffle"
                        onClick={() => shufflePlanSlide(selectedVariantIndex, idx)}
                        title={`Regenerate slide ${idx + 1} layout`}
                      >
                        <RefreshCw size={12} />
                      </button>
                    )}
                  </div>
                  <PlanSlideSvgPreview
                    variant={variant}
                    images={selectedPlanPreview.slideImages[idx] ?? []}
                    previewId={`plan-${selectedVariantIndex}-slide-${idx}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Frame Configs (per-tile settings) */}
        {showAdvanced && (
          <div className="magic-layout-panel__frames-section">
            <span className="magic-layout-panel__section-label">Frame Settings</span>
            <div className="magic-layout-panel__frames-grid">
              {frameConfigs.slice(0, Math.min(count, 12)).map((cfg, i) => (
                <div key={i} className="magic-layout-panel__frame-config">
                  <div className="magic-layout-panel__frame-header">
                    <span className="magic-layout-panel__frame-num">{i + 1}</span>
                    <button
                      type="button"
                      className={`magic-layout-panel__type-toggle ${
                        cfg.contentType === "text" ? "magic-layout-panel__type-toggle--text" : ""
                      }`}
                      onClick={() => toggleFrameContentType(i)}
                      title={cfg.contentType === "image" ? "Switch to text" : "Switch to image"}
                    >
                      {cfg.contentType === "image" ? (
                        <ImageIcon size={11} />
                      ) : (
                        <Type size={11} />
                      )}
                    </button>
                    <div className="magic-layout-panel__frame-locks">
                      <button
                        type="button"
                        className={`magic-layout-panel__frame-lock ${
                          cfg.locks.lockPosition ? "magic-layout-panel__frame-lock--active" : ""
                        }`}
                        onClick={() => toggleFrameLock(i, "lockPosition")}
                        title="Lock position"
                      >
                        {cfg.locks.lockPosition ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                      <button
                        type="button"
                        className={`magic-layout-panel__frame-lock ${
                          cfg.locks.lockHero ? "magic-layout-panel__frame-lock--active" : ""
                        }`}
                        onClick={() => toggleFrameLock(i, "lockHero")}
                        title="Lock as hero"
                      >
                        {cfg.locks.lockHero ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                      <button
                        type="button"
                        className={`magic-layout-panel__frame-lock ${
                          cfg.locks.lockCrop ? "magic-layout-panel__frame-lock--active" : ""
                        }`}
                        onClick={() => toggleFrameLock(i, "lockCrop")}
                        title="Lock crop (reserved)"
                      >
                        {cfg.locks.lockCrop ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                    </div>
                  </div>
                  {cfg.contentType === "text" && (
                    <input
                      type="text"
                      placeholder="Enter text..."
                      value={cfg.textContent}
                      onChange={(e) => updateFrameText(i, e.target.value)}
                      className="magic-layout-panel__frame-text-input"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image Selection */}
        <div className="magic-layout-panel__images-section">
          <div className="magic-layout-panel__images-header">
            <ImagePlus size={14} />
            <span>Pre-fill Images</span>
            <span className="magic-layout-panel__images-count">
              {selectedImages.length > 0 ? `(${selectedImages.length})` : "(optional)"}
            </span>
          </div>

          <div className="magic-layout-panel__images-actions">
            <button
              type="button"
              className="magic-layout-panel__btn magic-layout-panel__btn--icon"
              onClick={() => fileInputRef.current?.click()}
              title="Upload from computer"
            >
              <Upload size={14} />
              <span>Upload</span>
            </button>
            <button
              type="button"
              className="magic-layout-panel__btn magic-layout-panel__btn--icon"
              onClick={() => setIsFileManagerOpen(true)}
              title="Select from project"
            >
              <FolderOpen size={14} />
              <span>Project</span>
            </button>
            {selectedImages.length > 0 && (
              <button
                type="button"
                className="magic-layout-panel__btn magic-layout-panel__btn--icon magic-layout-panel__btn--danger"
                onClick={handleClearImages}
                title="Clear all"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Selected Images Thumbnails */}
          {selectedImages.length > 0 && (
            <div className="magic-layout-panel__images-grid">
              {selectedImages.map((url, i) => (
                <div key={i} className="magic-layout-panel__image-thumb magic-layout-panel__image-thumb--selected">
                  <img src={url} alt={`Selected ${i + 1}`} />
                  <button
                    type="button"
                    className="magic-layout-panel__image-remove"
                    onClick={() => handleRemoveImage(i)}
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                  <span className="magic-layout-panel__gallery-index">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Project Image Gallery - Checkbox selection mode */}
        {showProjectGallery && projectImages.length > 0 && (
          <div className="magic-layout-panel__project-gallery">
            <div className="magic-layout-panel__gallery-header">
              <div className="magic-layout-panel__gallery-title">
                <FolderOpen size={14} />
                <span>Project Images</span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className="magic-layout-panel__gallery-count">
                  {selectedImages.filter((u) => projectImages.some((p) => p.url === u)).length} / {projectImages.length}
                </span>
                <button
                  type="button"
                  className="magic-layout-panel__btn magic-layout-panel__btn--icon"
                  onClick={handleSelectAllProjectImages}
                  title="Select all"
                >
                  <CheckCircle2 size={12} />
                </button>
                <button
                  type="button"
                  className="magic-layout-panel__btn magic-layout-panel__btn--icon"
                  onClick={handleCloseProjectGallery}
                  title="Close gallery"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <div className="magic-layout-panel__gallery-grid">
              {projectImages.map((img, i) => {
                const isSelected = selectedImages.includes(img.url);
                const selectionIndex = selectedImages.indexOf(img.url);
                return (
                  <div
                    key={i}
                    className={`magic-layout-panel__gallery-item ${isSelected ? "magic-layout-panel__gallery-item--selected" : ""}`}
                    onClick={() => handleToggleProjectImage(img.url)}
                    title={img.name}
                  >
                    <img src={img.url} alt={img.name} loading="lazy" />
                    <span className="magic-layout-panel__gallery-check">
                      {isSelected && <Check size={12} />}
                    </span>
                    {isSelected && (
                      <span className="magic-layout-panel__gallery-index">{selectionIndex + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Text Styling Section */}
        {textFrameIndices.length > 0 && (
          <div className="magic-layout-panel__text-section">
            <div className="magic-layout-panel__text-header">
              <Wand2 size={14} />
              <span>Editorial Text Magic</span>
            </div>
            <div className="magic-layout-panel__text-controls">
              <div className="magic-layout-panel__text-field">
                <label htmlFor="ml-font-style">Font Style</label>
                <select
                  id="ml-font-style"
                  value={textStyle.fontStyle}
                  onChange={(e) => setTextStyle((prev) => ({ ...prev, fontStyle: e.target.value as typeof prev.fontStyle }))}
                  className="magic-layout-panel__text-select"
                >
                  <option value="clean">Clean Sans</option>
                  <option value="serif">Editorial Serif</option>
                  <option value="mono">Mono/Tech</option>
                  <option value="display">Display Bold</option>
                </select>
              </div>
              <div className="magic-layout-panel__text-field">
                <label className="magic-layout-panel__text-checkbox">
                  <input
                    type="checkbox"
                    checked={textStyle.dropCap}
                    onChange={(e) => setTextStyle((prev) => ({ ...prev, dropCap: e.target.checked }))}
                  />
                  Drop Cap
                </label>
              </div>
              <div className="magic-layout-panel__text-field">
                <label className="magic-layout-panel__text-checkbox">
                  <input
                    type="checkbox"
                    checked={textStyle.autoSize}
                    onChange={(e) => setTextStyle((prev) => ({ ...prev, autoSize: e.target.checked }))}
                  />
                  Auto-size Font
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Multi-Slide Insert */}
        <div className="magic-layout-panel__slides-section">
          <div className="magic-layout-panel__slides-label">
            <Layers size={14} />
            <span>Insert Slides</span>
          </div>
          <input
            type="number"
            min={1}
            max={20}
            value={slideCount}
            onChange={(e) => setSlideCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="magic-layout-panel__slides-input"
          />
          {selectedImages.length > imageFrameCount && suggestedSlideCount > 1 && slideCount !== suggestedSlideCount && (
            <button
              type="button"
              className="magic-layout-panel__btn magic-layout-panel__btn--auto"
              onClick={handleAutoSlideCount}
              title={`Auto-set to ${suggestedSlideCount} slides to use all ${selectedImages.length} images`}
            >
              Auto: {suggestedSlideCount}
            </button>
          )}
          <span className="magic-layout-panel__slides-hint">
            {slideCount === 1 ? (
              selectedImages.length === 0 ? (
                "Single slide"
              ) : dealingStats.unusedImages > 0 ? (
                `${dealingStats.usedImages} used • ${dealingStats.unusedImages} unused`
              ) : dealingStats.emptyFrames > 0 ? (
                `${dealingStats.usedImages} used • ${dealingStats.emptyFrames} empty frames`
              ) : (
                `${dealingStats.usedImages} used`
              )
            ) : selectedImages.length === 0 ? (
              `${slideCount} slides • ${dealingStats.totalSlots} empty frames`
            ) : (
              `${slideCount} slides • ${dealingStats.usedImages} used` +
              (dealingStats.unusedImages > 0 ? ` • ${dealingStats.unusedImages} unused` : "") +
              (dealingStats.emptyFrames > 0 ? ` • ${dealingStats.emptyFrames} empty frames` : "")
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="magic-layout-panel__actions">
          <button
            type="button"
            className="magic-layout-panel__btn magic-layout-panel__btn--secondary"
            onClick={handleGenerate}
            title="Regenerate with new seed"
          >
            <RefreshCw size={14} />
            <span>Regen</span>
          </button>

          <button
            type="button"
            className="magic-layout-panel__btn magic-layout-panel__btn--primary"
            onClick={handleApply}
            disabled={!selectedVariant}
            title={
              slideCount > 1
                ? `Insert ${slideCount} slides (plan ${selectedVariantIndex + 1})`
                : insertOnly
                  ? `Insert 1 slide (layout ${selectedVariantIndex + 1})`
                  : "Apply selected layout"
            }
          >
            <Check size={14} />
            <span>
              {slideCount > 1
                ? `Insert ${slideCount} Slides`
                : insertOnly
                  ? "Insert Slide"
                  : `Apply Layout ${selectedVariantIndex + 1}`}
            </span>
          </button>
        </div>

        {/* Generation Stats */}
        {layoutOutput && (
          <div className="magic-layout-panel__stats">
            <span>
              Generated {layoutOutput.meta.candidatesEvaluated} candidates in{" "}
              {layoutOutput.meta.generationTimeMs}ms
            </span>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />

      {/* File manager modal */}
      {isFileManagerOpen && (
        <FileManager
          isOpen={isFileManagerOpen}
          onRequestClose={() => setIsFileManagerOpen(false)}
          onFileSelect={handleProjectFileSelect}
          selectionMode="multi"
          fileTypeFilter="images"
        />
      )}

      {/* Confirmation dialog for overwriting existing content */}
      <ConfirmModal
        isOpen={showOverwriteConfirm}
        onRequestClose={handleCancelOverwrite}
        onConfirm={handleConfirmOverwrite}
        message="This slide already has content. Applying this layout will add new frames on top of the existing content. Do you want to continue?"
        confirmLabel="Apply Layout"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default MagicLayoutPanel;
