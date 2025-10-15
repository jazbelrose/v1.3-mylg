import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { Sticker, StickerDraft } from "../types";

type StickerUpdate = Partial<Pick<Sticker, "x" | "y" | "rotation" | "z">>;

const GRID_SIZE = 8;
const STORAGE_PREFIX = "mylg:moodboard:";

const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, value));

const randomRotation = () => {
  const magnitude = 1 + Math.random();
  const direction = Math.random() > 0.5 ? 1 : -1;
  return Number((magnitude * direction).toFixed(2));
};

const randomNoteColor = () => {
  const palette = ["#fef3c7", "#fee2e2", "#e0f2fe", "#dcfce7", "#ede9fe", "#fce7f3"];
  return palette[Math.floor(Math.random() * palette.length)];
};

const withDefaults = (draft: StickerDraft): StickerDraft => {
  if (draft.type === "note") {
    return {
      ...draft,
      content: {
        color: draft.content.color || randomNoteColor(),
        text: draft.content.text,
      },
    };
  }

  return draft;
};

const buildSticker = (
  draft: StickerDraft,
  createdBy: string,
  basePosition: { x: number; y: number }
): Sticker => {
  const base = {
    id: uuid(),
    x: snapToGrid(basePosition.x),
    y: snapToGrid(basePosition.y),
    rotation: randomRotation(),
    z: 1,
    createdBy,
    createdAt: new Date().toISOString(),
  };

  if (draft.type === "note") {
    return {
      ...base,
      type: "note" as const,
      content: { ...draft.content },
    };
  }

  if (draft.type === "photo") {
    return {
      ...base,
      type: "photo" as const,
      content: { ...draft.content },
    };
  }

  return {
    ...base,
    type: "link" as const,
    content: { ...draft.content },
  };
};

const getStorageKey = (projectId?: string) =>
  projectId ? `${STORAGE_PREFIX}${projectId}` : undefined;

const readFromStorage = (projectId?: string): Sticker[] => {
  const key = getStorageKey(projectId);
  if (!key || typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Sticker[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      x: snapToGrid(item.x),
      y: snapToGrid(item.y),
      rotation: typeof item.rotation === "number" ? item.rotation : randomRotation(),
      z: typeof item.z === "number" ? item.z : 1,
    }));
  } catch (error) {
    console.error("Failed to parse moodboard stickers", error);
    return [];
  }
};

const persistToStorage = (projectId: string | undefined, stickers: Sticker[]): void => {
  const key = getStorageKey(projectId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(stickers));
  } catch (error) {
    console.warn("Unable to persist moodboard stickers", error);
  }
};

export interface UseMoodboardStoreOptions {
  projectId?: string;
  userId?: string;
}

export interface UseMoodboardStore {
  stickers: Sticker[];
  addSticker: (draft: StickerDraft, position?: { x: number; y: number }) => Sticker | null;
  updateSticker: (id: string, updater: StickerUpdate | ((sticker: Sticker) => StickerUpdate)) => void;
  removeSticker: (id: string) => void;
  bringToFront: (id: string) => void;
  clear: () => void;
  nextStackIndex: number;
  snap: (value: number) => number;
}

export const useMoodboardStore = ({ projectId, userId }: UseMoodboardStoreOptions): UseMoodboardStore => {
  const [stickers, setStickers] = useState<Sticker[]>(() => readFromStorage(projectId));
  const latestProject = useRef(projectId);

  useEffect(() => {
    if (projectId === latestProject.current) return;
    latestProject.current = projectId;
    setStickers(readFromStorage(projectId));
  }, [projectId]);

  const persist = useCallback(
    (items: Sticker[]) => {
      setStickers(items);
      if (projectId) {
        persistToStorage(projectId, items);
      }
    },
    [projectId]
  );

  const nextStackIndex = useMemo(() => {
    if (!stickers.length) return 1;
    return Math.max(...stickers.map((item) => item.z)) + 1;
  }, [stickers]);

  const addSticker = useCallback<UseMoodboardStore["addSticker"]>(
    (rawDraft, position) => {
      const draft = withDefaults(rawDraft);
      const owner = userId || "anonymous";
      const basePosition = position || {
        x: 48 + stickers.length * 24,
        y: 48 + stickers.length * 16,
      };

      const sticker = buildSticker(draft, owner, basePosition);
      sticker.z = nextStackIndex;

      const updated = [...stickers, sticker];
      persist(updated);
      return sticker;
    },
    [persist, nextStackIndex, stickers, userId]
  );

  const updateSticker = useCallback<UseMoodboardStore["updateSticker"]>(
    (id, updater) => {
      persist(
        stickers.map((item) => {
          if (item.id !== id) return item;
          const patch = typeof updater === "function" ? updater(item) : updater;
          const next: Sticker = { ...item };

          if (typeof patch.x === "number") {
            next.x = clamp(snapToGrid(patch.x));
          }
          if (typeof patch.y === "number") {
            next.y = clamp(snapToGrid(patch.y));
          }
          if (typeof patch.rotation === "number") {
            next.rotation = patch.rotation;
          }
          if (typeof patch.z === "number") {
            next.z = patch.z;
          }
          return next;
        })
      );
    },
    [persist, stickers]
  );

  const removeSticker = useCallback(
    (id: string) => {
      persist(stickers.filter((item) => item.id !== id));
    },
    [persist, stickers]
  );

  const bringToFront = useCallback(
    (id: string) => {
      persist(
        stickers.map((item) =>
          item.id === id
            ? {
                ...item,
                z: nextStackIndex,
              }
            : item
        )
      );
    },
    [persist, nextStackIndex, stickers]
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    stickers,
    addSticker,
    updateSticker,
    removeSticker,
    bringToFront,
    clear,
    nextStackIndex,
    snap: snapToGrid,
  };
};

export const useGrid = () => ({ GRID_SIZE, snapToGrid });









