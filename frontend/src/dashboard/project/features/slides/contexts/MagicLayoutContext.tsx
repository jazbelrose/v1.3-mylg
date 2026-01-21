/**
 * MagicLayoutContext - State management for Magic Layout Workspace
 * 
 * Centralizes state management for the Magic Layout Pro workspace,
 * reducing prop drilling and enabling cleaner component composition.
 */

import React, {
  createContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import {
  generateMagicLayoutVariant,
  type MagicLayoutOutput,
  type LayoutVariant,
} from "../lib/magicLayoutGenerator";
import { getTasteMode, getTasteModeIds } from "../lib/tasteModes";
import type { TasteModeId } from "../lib/magicLayoutTypes";

// =====================================================
// TYPES
// =====================================================

type LayoutMode = "grid" | "masonry";

export interface TextBlock {
  id: string;
  type: "headline" | "subhead" | "body" | "caption" | "quote" | "credit";
  content: string;
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

interface GlobalLocks {
  lockSpacing: boolean;
  lockRadius: boolean;
}

interface FrameUIConfig {
  frameName: string;
  contentType: "image" | "text";
  imageSrc: string | null;
  textValue: string;
  lockPosition: boolean;
  lockSize: boolean;
}

// =====================================================
// CONTEXT STATE
// =====================================================

interface MagicLayoutState {
  // Core settings
  count: number;
  mode: LayoutMode;
  tasteMode: TasteModeId;
  seed: string;
  sessionId: string;

  // Spacing/radius
  spacingMode: "auto" | "custom";
  spacingValue: number;
  radiusMode: "auto" | "custom";
  radiusValue: number;
  globalLocks: GlobalLocks;

  // Frame configs
  frameConfigs: FrameUIConfig[];

  // Generated variants
  layoutOutput: MagicLayoutOutput | null;
  candidatePlans: LayoutVariant[][] | null;
  selectedVariantIndex: number;
  planSeedOverrides: Record<number, Record<number, string>>;

  // Images
  selectedImages: string[];

  // Multi-slide
  slideCount: number;
  activeSlideIndex: number;

  // Text blocks
  textBlocks: TextBlock[];
  textStyle: TextBlockStyle;

  // UI state
  showFullscreenPreview: boolean;
  showOverwriteConfirm: boolean;
  mobileTab: "plans" | "assets" | "text" | "settings";
  isFileManagerOpen: boolean;
}

interface MagicLayoutActions {
  // Settings
  setCount: (count: number) => void;
  setMode: (mode: LayoutMode) => void;
  setTasteMode: (tasteMode: TasteModeId) => void;
  regenerate: () => void;

  // Spacing/radius
  setSpacingMode: (mode: "auto" | "custom") => void;
  setSpacingValue: (value: number) => void;
  setRadiusMode: (mode: "auto" | "custom") => void;
  setRadiusValue: (value: number) => void;
  toggleSpacingLock: () => void;
  toggleRadiusLock: () => void;

  // Variants
  selectVariant: (index: number) => void;
  refreshVariant: (index: number) => void;

  // Images
  addImages: (urls: string[]) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;

  // Multi-slide
  setSlideCount: (count: number) => void;
  setActiveSlideIndex: (index: number) => void;

  // Text blocks
  addTextBlock: (type: TextBlock["type"]) => void;
  updateTextBlock: (id: string, updates: Partial<TextBlock>) => void;
  deleteTextBlock: (id: string) => void;
  setTextStylePreset: (preset: TextBlockStyle["preset"]) => void;
  setDropCapEnabled: (enabled: boolean) => void;
  setLineHeight: (value: number) => void;
  setParagraphSpacing: (value: number) => void;
  setTextAlignment: (alignment: "left" | "center" | "right") => void;
  setTextBackgroundEnabled: (enabled: boolean) => void;
  setTextBackgroundOpacity: (opacity: number) => void;

  // UI
  setShowFullscreenPreview: (show: boolean) => void;
  setShowOverwriteConfirm: (show: boolean) => void;
  setMobileTab: (tab: "plans" | "assets" | "text" | "settings") => void;
  setIsFileManagerOpen: (open: boolean) => void;
}

interface MagicLayoutContextValue {
  state: MagicLayoutState;
  actions: MagicLayoutActions;
  computed: {
    sessionKey: string;
    selectedPlanPreview: LayoutVariant[] | null;
    activeVariant: LayoutVariant | null;
    effectiveSpacing: number | undefined;
    effectiveRadius: number | undefined;
    tasteModes: Array<{ id: TasteModeId; name: string }>;
  };
}

// =====================================================
// CONTEXT
// =====================================================

const MagicLayoutContext = createContext<MagicLayoutContextValue | null>(null);

// =====================================================
// PROVIDER
// =====================================================

interface MagicLayoutProviderProps {
  children: ReactNode;
  initialImages?: string[];
}

export const MagicLayoutProvider: React.FC<MagicLayoutProviderProps> = ({
  children,
  initialImages = [],
}) => {
  // Core settings
  const [count, setCount] = useState(6);
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [tasteMode, setTasteMode] = useState<TasteModeId>("apple-clean");
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const [sessionId, setSessionId] = useState(() => `${Date.now()}`);

  // Spacing/radius
  const [spacingMode, setSpacingMode] = useState<"auto" | "custom">("auto");
  const [spacingValue, setSpacingValue] = useState(24);
  const [radiusMode, setRadiusMode] = useState<"auto" | "custom">("auto");
  const [radiusValue, setRadiusValue] = useState(16);
  const [globalLocks, setGlobalLocks] = useState<GlobalLocks>({
    lockSpacing: false,
    lockRadius: false,
  });

  // Frame configs
  const [frameConfigs, _setFrameConfigs] = useState<FrameUIConfig[]>([]);

  // Generated variants
  const [layoutOutput, _setLayoutOutput] = useState<MagicLayoutOutput | null>(null);
  const [candidatePlans, _setCandidatePlans] = useState<LayoutVariant[][] | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [planSeedOverrides, setPlanSeedOverrides] = useState<
    Record<number, Record<number, string>>
  >({});
  
  // Mark as used (these will be used when context-based generation is added)
  void _setFrameConfigs;
  void _setLayoutOutput;
  void _setCandidatePlans;

  // Images
  const [selectedImages, setSelectedImages] = useState<string[]>(initialImages);

  // Multi-slide
  const [slideCount, setSlideCount] = useState(1);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Text blocks
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [textStyle, setTextStyle] = useState<TextBlockStyle>({
    preset: "editorial",
    dropCap: false,
    lineHeight: 1.6,
    paragraphSpacing: 1.2,
    alignment: "left",
    backgroundPanel: false,
    backgroundOpacity: 0.8,
  });

  // UI state
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [mobileTab, setMobileTab] = useState<"plans" | "assets" | "text" | "settings">("plans");
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);

  // Computed values
  const sessionKey = useMemo(() => `${sessionId}#${tasteMode}`, [sessionId, tasteMode]);

  const effectiveSpacing = spacingMode === "auto" ? undefined : spacingValue;
  const effectiveRadius = radiusMode === "auto" ? undefined : radiusValue;

  const tasteModes = useMemo(() => {
    return getTasteModeIds().map((id) => ({
      id,
      name: getTasteMode(id).name,
    }));
  }, []);

  // Selected plan preview
  const selectedPlanPreview = useMemo(() => {
    if (!layoutOutput || !layoutOutput.variants[selectedVariantIndex]) return null;

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

  // Actions
  const actions: MagicLayoutActions = useMemo(
    () => ({
      setCount: (c) => setCount(Math.max(1, Math.min(20, c))),
      setMode,
      setTasteMode,
      regenerate: () => {
        setSeed(`${Date.now()}`);
        setSessionId(`${Date.now()}`);
      },

      setSpacingMode,
      setSpacingValue: (v) => setSpacingValue(Math.max(0, Math.min(120, v))),
      setRadiusMode,
      setRadiusValue: (v) => setRadiusValue(Math.max(0, Math.min(80, v))),
      toggleSpacingLock: () =>
        setGlobalLocks((prev) => ({ ...prev, lockSpacing: !prev.lockSpacing })),
      toggleRadiusLock: () =>
        setGlobalLocks((prev) => ({ ...prev, lockRadius: !prev.lockRadius })),

      selectVariant: setSelectedVariantIndex,
      refreshVariant: (variantIndex) => {
        const newSeed = `${Date.now()}#refresh${variantIndex}`;
        setPlanSeedOverrides((prev) => ({
          ...prev,
          [selectedVariantIndex]: {
            ...(prev[selectedVariantIndex] || {}),
            [variantIndex]: newSeed,
          },
        }));
      },

      addImages: (urls) => setSelectedImages((prev) => [...prev, ...urls]),
      removeImage: (index) => {
        setSelectedImages((prev) => {
          const newImages = [...prev];
          if (newImages[index]?.startsWith("blob:")) {
            URL.revokeObjectURL(newImages[index]);
          }
          newImages.splice(index, 1);
          return newImages;
        });
      },
      clearImages: () => {
        selectedImages.forEach((url) => {
          if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
        });
        setSelectedImages([]);
      },

      setSlideCount: (c) => setSlideCount(Math.max(1, Math.min(20, c))),
      setActiveSlideIndex,

      addTextBlock: (type) => {
        const newBlock: TextBlock = {
          id: `tb-${Date.now()}`,
          type,
          content: "",
        };
        setTextBlocks((prev) => [...prev, newBlock]);
      },
      updateTextBlock: (id, updates) => {
        setTextBlocks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
        );
      },
      deleteTextBlock: (id) => {
        setTextBlocks((prev) => prev.filter((b) => b.id !== id));
      },
      setTextStylePreset: (preset) =>
        setTextStyle((prev) => ({ ...prev, preset })),
      setDropCapEnabled: (dropCap) =>
        setTextStyle((prev) => ({ ...prev, dropCap })),
      setLineHeight: (lineHeight) =>
        setTextStyle((prev) => ({ ...prev, lineHeight })),
      setParagraphSpacing: (paragraphSpacing) =>
        setTextStyle((prev) => ({ ...prev, paragraphSpacing })),
      setTextAlignment: (alignment) =>
        setTextStyle((prev) => ({ ...prev, alignment })),
      setTextBackgroundEnabled: (backgroundPanel) =>
        setTextStyle((prev) => ({ ...prev, backgroundPanel })),
      setTextBackgroundOpacity: (backgroundOpacity) =>
        setTextStyle((prev) => ({ ...prev, backgroundOpacity })),

      setShowFullscreenPreview,
      setShowOverwriteConfirm,
      setMobileTab,
      setIsFileManagerOpen,
    }),
    [selectedVariantIndex, selectedImages]
  );

  // State object
  const state: MagicLayoutState = {
    count,
    mode,
    tasteMode,
    seed,
    sessionId,
    spacingMode,
    spacingValue,
    radiusMode,
    radiusValue,
    globalLocks,
    frameConfigs,
    layoutOutput,
    candidatePlans,
    selectedVariantIndex,
    planSeedOverrides,
    selectedImages,
    slideCount,
    activeSlideIndex,
    textBlocks,
    textStyle,
    showFullscreenPreview,
    showOverwriteConfirm,
    mobileTab,
    isFileManagerOpen,
  };

  const computed = {
    sessionKey,
    selectedPlanPreview,
    activeVariant,
    effectiveSpacing,
    effectiveRadius,
    tasteModes,
  };

  const value: MagicLayoutContextValue = { state, actions, computed };

  return (
    <MagicLayoutContext.Provider value={value}>
      {children}
    </MagicLayoutContext.Provider>
  );
};

// Export type for the hook in separate file
export type { MagicLayoutContextValue };

export default MagicLayoutContext;
