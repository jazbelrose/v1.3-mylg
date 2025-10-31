import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import StickerCard from "./StickerCard";
import QuickInsertPalette from "./QuickInsertPalette";
import { useMoodboardStore } from "../hooks/useMoodboardStore";
import type { Sticker, StickerDraft } from "../types";
import styles from "../moodboard.module.css";
import {
  PROJECT_BRAND_ACCENT,
  PROJECT_BRAND_BG,
  type ProjectAccentPalette,
} from "@/dashboard/project/hooks/useProjectPalette";

const DEFAULT_ACCENT = PROJECT_BRAND_ACCENT;
const DEFAULT_RGB: [number, number, number] = [250, 51, 86];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const hexToRgbTuple = (hex?: string): [number, number, number] => {
  if (!hex) return DEFAULT_RGB;
  let cleaned = hex.trim();
  if (!cleaned) return DEFAULT_RGB;
  if (cleaned.startsWith("#")) cleaned = cleaned.slice(1);
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (cleaned.length !== 6) return DEFAULT_RGB;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return DEFAULT_RGB;
  }
  return [r, g, b];
};

const tupleToHex = ([r, g, b]: [number, number, number]): string => {
  const toHex = (channel: number) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mixRgbTuples = (
  source: [number, number, number],
  target: [number, number, number],
  amount: number
): [number, number, number] => {
  const mix = clamp(amount, 0, 1);
  const inv = 1 - mix;
  return [
    Math.round(source[0] * inv + target[0] * mix),
    Math.round(source[1] * inv + target[1] * mix),
    Math.round(source[2] * inv + target[2] * mix),
  ];
};

const tupleToRgba = (
  [r, g, b]: [number, number, number],
  alpha = 1
): string => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${clamp(alpha, 0, 1)})`;

const mixHexColors = (source: string, target: string, amount: number): string =>
  tupleToHex(mixRgbTuples(hexToRgbTuple(source), hexToRgbTuple(target), amount));

const DEFAULT_ACCENT_WEAK = mixHexColors(DEFAULT_ACCENT, PROJECT_BRAND_BG, 0.65);
const BRAND_BG_RGB = hexToRgbTuple(PROJECT_BRAND_BG);

const WHITE_RGB: [number, number, number] = [255, 255, 255];

const mixWithWhite = (hex: string, amount = 0.82, alpha = 0.95): string => {
  const [r, g, b] = hexToRgbTuple(hex);
  const mix = clamp(amount, 0, 1);
  const blend = (channel: number) =>
    Math.round(channel + (255 - channel) * mix);
  const blended = [blend(r), blend(g), blend(b)];
  const clampedAlpha = clamp(alpha, 0, 1);
  return `rgba(${blended[0]}, ${blended[1]}, ${blended[2]}, ${clampedAlpha})`;
};

const GRID_STEP = 8;

export interface MoodboardCanvasProps {
  projectId?: string;
  userId?: string;
  palette?: ProjectAccentPalette;
  onLayerSync?: (stickers: Sticker[]) => void;
}

type DragState = {
  id: string;
  pointerStart: { x: number; y: number };
  stickerStart: { x: number; y: number };
};

const MoodboardCanvas: React.FC<MoodboardCanvasProps> = ({
  projectId,
  userId,
  palette,
  onLayerSync,
}) => {
  const { stickers, addSticker, updateSticker, removeSticker, bringToFront, clear } =
    useMoodboardStore({ projectId, userId });
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const accent = palette?.accent ?? DEFAULT_ACCENT;
  const accentStrong = palette?.accentStrong ?? accent;
  const accentWeak = palette?.accentWeak ?? DEFAULT_ACCENT_WEAK;

  const themeStyle = useMemo<React.CSSProperties>(() => {
    const [r, g, b] = hexToRgbTuple(accent);
    const accentRgb: [number, number, number] = [r, g, b];
    const weakRgb = hexToRgbTuple(accentWeak);
    const strongRgb = hexToRgbTuple(accentStrong);

    const pageBackground = tupleToHex(mixRgbTuples(BRAND_BG_RGB, weakRgb, 0.22));
    const toolbarSurface = tupleToRgba(mixRgbTuples(weakRgb, BRAND_BG_RGB, 0.38), 0.86);
    const toolbarSurfaceHover = tupleToRgba(mixRgbTuples(weakRgb, strongRgb, 0.28), 0.92);
    const toolbarBorder = tupleToRgba(mixRgbTuples(weakRgb, strongRgb, 0.35), 0.48);
    const toolbarBorderStrong = tupleToRgba(mixRgbTuples(strongRgb, weakRgb, 0.2), 0.72);
    const mutedText = tupleToRgba(mixRgbTuples(weakRgb, WHITE_RGB, 0.68), 0.82);
    const keyboardBg = tupleToRgba(mixRgbTuples(weakRgb, strongRgb, 0.18), 0.28);
    const keyboardBorder = tupleToRgba(mixRgbTuples(strongRgb, BRAND_BG_RGB, 0.35), 0.5);
    const canvasBackground = tupleToRgba(mixRgbTuples(weakRgb, BRAND_BG_RGB, 0.52), 0.88);
    const canvasGrid = tupleToRgba(mixRgbTuples(weakRgb, WHITE_RGB, 0.32), 0.18);
    const canvasBorder = tupleToRgba(mixRgbTuples(strongRgb, weakRgb, 0.48), 0.58);
    const canvasShadow = tupleToRgba(mixRgbTuples(weakRgb, BRAND_BG_RGB, 0.28), 0.22);
    const overlayBase = mixRgbTuples(accentRgb, BRAND_BG_RGB, 0.72);
    const overlayTint = tupleToRgba(overlayBase, 0.78);
    const raisedBorder = tupleToRgba(mixRgbTuples(strongRgb, weakRgb, 0.34), 0.42);

    return {
      "--moodboard-brand": accent,
      "--moodboard-brand-rgb": `${r}, ${g}, ${b}`,
      "--moodboard-brand-gradient-end": accentStrong,
      "--moodboard-brand-text-soft": mixWithWhite(accent),
      "--moodboard-brand-weak": accentWeak,
      "--moodboard-brand-weak-rgb": `${weakRgb[0]}, ${weakRgb[1]}, ${weakRgb[2]}`,
      "--moodboard-page-bg": pageBackground,
      "--moodboard-toolbar-surface": toolbarSurface,
      "--moodboard-toolbar-surface-hover": toolbarSurfaceHover,
      "--moodboard-toolbar-border": toolbarBorder,
      "--moodboard-toolbar-border-strong": toolbarBorderStrong,
      "--moodboard-text-muted": mutedText,
      "--moodboard-keyboard-kbd-bg": keyboardBg,
      "--moodboard-keyboard-kbd-border": keyboardBorder,
      "--moodboard-canvas-bg": canvasBackground,
      "--moodboard-canvas-grid": canvasGrid,
      "--moodboard-canvas-border": canvasBorder,
      "--moodboard-canvas-shadow": canvasShadow,
      "--moodboard-overlay": overlayTint,
      "--moodboard-surface-raised": PROJECT_BRAND_BG,
      "--moodboard-surface-raised-border": raisedBorder,
    } as React.CSSProperties;
  }, [accent, accentStrong, accentWeak]);

  const selectedSticker = useMemo<Sticker | null>(() => {
    if (!selectedId) return null;
    return stickers.find((item) => item.id === selectedId) ?? null;
  }, [selectedId, stickers]);

  useEffect(() => {
    onLayerSync?.(stickers);
  }, [stickers, onLayerSync]);

  const cleanupDrag = useCallback(() => {
    setDragState(null);
    setDragOffset(null);
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDragOffset({
        x: event.clientX - dragState.pointerStart.x,
        y: event.clientY - dragState.pointerStart.y,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const deltaX = event.clientX - dragState.pointerStart.x;
      const deltaY = event.clientY - dragState.pointerStart.y;
      const nextX = dragState.stickerStart.x + deltaX;
      const nextY = dragState.stickerStart.y + deltaY;
      updateSticker(dragState.id, {
        x: nextX,
        y: nextY,
      });
      cleanupDrag();
    };

    const handlePointerCancel = () => {
      cleanupDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerCancel, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [cleanupDrag, dragState, updateSticker]);

  const handleStickerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, id: string) => {
      event.preventDefault();
      event.stopPropagation();
      const sticker = stickers.find((item) => item.id === id);
      if (!sticker) return;
      bringToFront(id);
      setSelectedId(id);
      setDragState({
        id,
        pointerStart: { x: event.clientX, y: event.clientY },
        stickerStart: { x: sticker.x, y: sticker.y },
      });
      setDragOffset({ x: 0, y: 0 });
    },
    [bringToFront, stickers]
  );

  const handleBoardPointerDown = useCallback(() => {
    setSelectedId(null);
    boardRef.current?.focus();
  }, []);

  const handleBoardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (paletteOpen) {
        if (event.key === "Escape") {
          setPaletteOpen(false);
        }
        return;
      }

      if (event.key === "+" || event.key === "=" || event.key === "/") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (!selectedSticker) return;

      const step = event.shiftKey ? GRID_STEP * 3 : GRID_STEP;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        updateSticker(selectedSticker.id, { y: selectedSticker.y - step });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        updateSticker(selectedSticker.id, { y: selectedSticker.y + step });
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateSticker(selectedSticker.id, { x: selectedSticker.x - step });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateSticker(selectedSticker.id, { x: selectedSticker.x + step });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSticker(selectedSticker.id);
        setSelectedId(null);
      }
    },
    [paletteOpen, removeSticker, selectedSticker, updateSticker]
  );

  const focusBoard = useCallback(() => {
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    focusBoard();
  }, [focusBoard]);

  const handleAddSticker = useCallback(
    (draft: StickerDraft) => {
      const rect = boardRef.current?.getBoundingClientRect();
      const basePosition = rect
        ? {
            x: rect.width / 2 - 80,
            y: rect.height / 2 - 80,
          }
        : { x: 64, y: 64 };
      const created = addSticker(draft, basePosition);
      if (created) {
        setSelectedId(created.id);
        bringToFront(created.id);
        setTimeout(focusBoard, 0);
      }
    },
    [addSticker, bringToFront, focusBoard]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedSticker) return;
    removeSticker(selectedSticker.id);
    setSelectedId(null);
    focusBoard();
  }, [focusBoard, removeSticker, selectedSticker]);

  const showEmptyState = stickers.length === 0;

  return (
    <div className={styles.moodboardPage} style={themeStyle}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarButtons}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setPaletteOpen(true)}
          >
            <Plus size={16} />
            Add sticker
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              setPaletteOpen(true);
            }}
            aria-label="Open quick insert"
          >
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>/</span>
            Quick insert
          </button>
        </div>

        <div className={styles.keyboardHint}>
          <span>
            <kbd>/</kbd> Quick insert
          </span>
          <span>
            <kbd>+</kbd> Add
          </span>
          <span>
            <kbd>↑↓←→</kbd> Nudge
          </span>
        </div>

        <div className={styles.toolbarButtons}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleDeleteSelected}
            disabled={!selectedSticker}
          >
            <Trash2 size={16} />
            Remove
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              clear();
              setSelectedId(null);
              focusBoard();
            }}
            disabled={!stickers.length}
          >
            <RefreshCw size={16} />
            Reset
          </button>
        </div>
      </div>

      <div className={styles.canvasWrapper}>
        <div
          ref={boardRef}
          className={styles.canvas}
          tabIndex={0}
          role="application"
          aria-label="Moodboard canvas"
          onPointerDown={handleBoardPointerDown}
          onKeyDown={handleBoardKeyDown}
        >
          {showEmptyState && (
            <div className={styles.emptyState}>
              Press <kbd>+</kbd> or <kbd>/</kbd> to drop your first sticker.
            </div>
          )}

          {stickers.map((sticker) => (
            <StickerCard
              key={sticker.id}
              sticker={sticker}
              isSelected={selectedId === sticker.id}
              isActiveDrag={dragState?.id === sticker.id}
              offset={dragState?.id === sticker.id ? dragOffset : null}
              onPointerDown={handleStickerPointerDown}
              onFocus={setSelectedId}
              onRemove={removeSticker}
            />
          ))}
        </div>
      </div>

      <QuickInsertPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          focusBoard();
        }}
        onSubmit={(draft) => {
          handleAddSticker(draft);
        }}
      />
    </div>
  );
};

export default MoodboardCanvas;











