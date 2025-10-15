export type StickerType = "note" | "photo" | "link";

export type NoteStickerContent = {
  text: string;
  color: string;
};

export type PhotoStickerContent = {
  url: string;
  alt?: string;
};

export type LinkStickerContent = {
  label: string;
  url: string;
};

export type StickerDraft =
  | { type: "note"; content: NoteStickerContent }
  | { type: "photo"; content: PhotoStickerContent }
  | { type: "link"; content: LinkStickerContent };

interface StickerBase {
  id: string;
  x: number;
  y: number;
  rotation: number;
  z: number;
  createdBy: string;
  createdAt: string;
}

export type Sticker =
  | (StickerBase & { type: "note"; content: NoteStickerContent })
  | (StickerBase & { type: "photo"; content: PhotoStickerContent })
  | (StickerBase & { type: "link"; content: LinkStickerContent });









