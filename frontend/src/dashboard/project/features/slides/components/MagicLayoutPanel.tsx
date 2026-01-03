/**
 * MagicLayoutPanel - Upgraded layout generator with Pro features
 * 
 * Phase 1 MVP Features:
 * - Taste mode dropdown (Apple-clean, Brutalist)
 * - Variants rail with 6 candidates
 * - Per-frame locks (position, crop, hero)
 * - Global locks (spacing, radius)
 * - Text/Image frame toggle
 * - Keyboard shortcuts 1-6 for variant selection
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  RefreshCw,
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
} from "lucide-react";
import {
  generateMagicLayouts,
  generatePreviewLayout,
  type MagicLayoutOutput,
  type LayoutVariant,
  type GeneratedFrame,
} from "../lib/magicLayoutGenerator";
import { getTasteMode, getTasteModeIds, TASTE_MODES } from "../lib/tasteModes";
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
import "./MagicLayoutPanel.css";

export interface MagicLayoutPanelProps {
  open: boolean;
  onClose: () => void;
  onApply: (
    variant: LayoutVariant,
    options: {
      mode: LayoutMode;
      seed: string;
      tasteMode: TasteModeId;
    }
  ) => void;
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

export const MagicLayoutPanel: React.FC<MagicLayoutPanelProps> = ({
  open,
  onClose,
  onApply,
}) => {
  // Core settings
  const [count, setCount] = useState(6);
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [tasteMode, setTasteMode] = useState<TasteModeId>("apple-clean");
  const [seed, setSeed] = useState(() => `${Date.now()}`);

  // Global locks
  const [globalLocks, setGlobalLocks] = useState<GlobalLocks>({
    lockSpacing: false,
    lockRadius: false,
  });

  // Per-frame configs
  const [frameConfigs, setFrameConfigs] = useState<FrameUIConfig[]>([]);

  // Generated variants
  const [layoutOutput, setLayoutOutput] = useState<MagicLayoutOutput | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  // Image selection
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Settings panel expanded
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      canvasWidth: 1920,
      canvasHeight: 1080,
      globalLocks,
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
  }, [open, count, mode, tasteMode, seed, globalLocks, frameConfigs, selectedImages]);

  // Reset seed when opening
  useEffect(() => {
    if (open) {
      setSeed(`${Date.now()}`);
    }
  }, [open]);

  const handleGenerate = useCallback(() => {
    setSeed(`${Date.now()}`);
  }, []);

  const handleApply = useCallback(() => {
    if (!layoutOutput || !layoutOutput.variants[selectedVariantIndex]) return;

    const selectedVariant = layoutOutput.variants[selectedVariantIndex];
    
    // Merge selected images into variant frames
    const variantWithImages: LayoutVariant = {
      ...selectedVariant,
      frames: selectedVariant.frames.map((frame, i) => ({
        ...frame,
        imageSrc:
          frame.contentType === "image" ? selectedImages[i] ?? frame.imageSrc : null,
      })),
    };

    onApply(variantWithImages, {
      mode,
      seed: selectedVariant.seed,
      tasteMode,
    });

    setSelectedImages([]);
    onClose();
  }, [layoutOutput, selectedVariantIndex, selectedImages, mode, tasteMode, onApply, onClose]);

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
    const imageUrls = imageFiles.map((f) => f.url);
    setSelectedImages((prev) => [...prev, ...imageUrls]);
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

  // Text frames in selected variant
  const textFrameIndices = useMemo(
    () =>
      frameConfigs
        .map((cfg, i) => (cfg.contentType === "text" ? i : -1))
        .filter((i) => i >= 0),
    [frameConfigs]
  );

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
              <option value="apple-clean">Apple Clean</option>
              <option value="brutalist-grid">Brutalist</option>
              {/* Phase 2: Add more taste modes */}
              {/* <option value="fashion-editorial">Fashion Editorial</option> */}
              {/* <option value="vaporwave-cyber">Vaporwave/Cyber</option> */}
              {/* <option value="pinterest-collage">Pinterest Collage</option> */}
              {/* <option value="museum-wall">Museum Wall</option> */}
            </select>
          </div>
        </div>

        {/* Taste Mode Description */}
        <div className="magic-layout-panel__taste-info">
          <span className="magic-layout-panel__taste-name">{activeTaste.name}</span>
          <span className="magic-layout-panel__taste-desc">{activeTaste.description}</span>
        </div>

        {/* Global Locks */}
        {showAdvanced && (
          <div className="magic-layout-panel__global-locks">
            <span className="magic-layout-panel__section-label">Global Locks</span>
            <div className="magic-layout-panel__lock-buttons">
              <button
                type="button"
                className={`magic-layout-panel__lock-btn ${
                  globalLocks.lockSpacing ? "magic-layout-panel__lock-btn--active" : ""
                }`}
                onClick={() => toggleGlobalLock("lockSpacing")}
                title="Lock spacing"
              >
                {globalLocks.lockSpacing ? <Lock size={12} /> : <Unlock size={12} />}
                <span>Spacing</span>
              </button>
              <button
                type="button"
                className={`magic-layout-panel__lock-btn ${
                  globalLocks.lockRadius ? "magic-layout-panel__lock-btn--active" : ""
                }`}
                onClick={() => toggleGlobalLock("lockRadius")}
                title="Lock radius"
              >
                {globalLocks.lockRadius ? <Lock size={12} /> : <Unlock size={12} />}
                <span>Radius</span>
              </button>
            </div>
          </div>
        )}

        {/* Variants Rail */}
        {layoutOutput && (
          <VariantsRail
            variants={layoutOutput.variants}
            selectedIndex={selectedVariantIndex}
            onSelect={setSelectedVariantIndex}
            enableKeyboardShortcuts={true}
          />
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

          {selectedImages.length > 0 && (
            <div className="magic-layout-panel__images-grid">
              {selectedImages.map((url, i) => (
                <div key={i} className="magic-layout-panel__image-thumb">
                  <img src={url} alt={`Selected ${i + 1}`} />
                  <button
                    type="button"
                    className="magic-layout-panel__image-remove"
                    onClick={() => handleRemoveImage(i)}
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
            title="Apply selected layout"
          >
            <Check size={14} />
            <span>Apply Layout {selectedVariantIndex + 1}</span>
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
    </div>
  );
};

export default MagicLayoutPanel;
