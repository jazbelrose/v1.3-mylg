import { createCommand, type LexicalCommand } from 'lexical';

export const SET_TEXT_COLOR_COMMAND: LexicalCommand<string> = createCommand('SET_TEXT_COLOR');
export const SET_BG_COLOR_COMMAND: LexicalCommand<string> = createCommand('SET_BG_COLOR');
export const INSERT_IMAGE_COMMAND = 'INSERT_IMAGE_COMMAND' as const;
export const SET_FONT_FAMILY_COMMAND: LexicalCommand<string> = createCommand('SET_FONT_FAMILY');
export const SET_FONT_SIZE_COMMAND: LexicalCommand<string> = createCommand('SET_FONT_SIZE');
export const SET_LINE_HEIGHT_COMMAND: LexicalCommand<string> = createCommand('SET_LINE_HEIGHT');
export const SET_LETTER_SPACING_COMMAND: LexicalCommand<string> = createCommand('SET_LETTER_SPACING');
export const OPEN_IMAGE_COMMAND: LexicalCommand<string> = createCommand('OPEN_IMAGE');
export const OPEN_FIGMA_COMMAND: LexicalCommand<string> = createCommand('OPEN_FIGMA');
export const OPEN_VECTOR_COMMAND: LexicalCommand<void> = createCommand('OPEN_VECTOR');
export const TOGGLE_SPEECH_COMMAND: LexicalCommand<void> = createCommand('TOGGLE_SPEECH');
export const OPEN_DROPDOWN_COMMAND: LexicalCommand<void> = createCommand('OPEN_DROPDOWN');
export const INSERT_TEXTBOX_COMMAND: LexicalCommand<void> = createCommand('INSERT_TEXTBOX');
export const INSERT_PICTURE_FRAME_COMMAND: LexicalCommand<void> = createCommand('INSERT_PICTURE_FRAME');

export type InsertPictureFrameLayoutPayload = {
  count: number;
  mode?: "grid" | "masonry";
  seed?: string | number;
  images?: string[];  // Optional array of image URLs to pre-fill frames
};

export const INSERT_PICTURE_FRAME_LAYOUT_COMMAND: LexicalCommand<InsertPictureFrameLayoutPayload> = createCommand(
  "INSERT_PICTURE_FRAME_LAYOUT"
);

// Picture frame image insertion commands
export const INSERT_IMAGE_TO_PICTURE_FRAME_COMMAND: LexicalCommand<void> = createCommand(
  "INSERT_IMAGE_TO_PICTURE_FRAME"
);
export const INSERT_IMAGE_FROM_PROJECT_TO_PICTURE_FRAME_COMMAND: LexicalCommand<void> = createCommand(
  "INSERT_IMAGE_FROM_PROJECT_TO_PICTURE_FRAME"
);

// Magic Layout Generator Pro types and commands
import type { LayoutVariant, TasteModeId, FrameContentType, TileLocks, TextFrameConfig } from "@/dashboard/project/features/slides/lib/magicLayoutTypes";

export type InsertMagicLayoutPayload = {
  variant: LayoutVariant;
  mode: "grid" | "masonry";
  seed: string;
  tasteMode: TasteModeId;
  /** Number of slides to create (default: 1) */
  slideCount?: number;
  /** Images for each slide - outer array is slides, inner is frame images */
  slideImages?: string[][];
  /** Text styling options */
  textStyle?: {
    fontStyle: string;
    dropCap: boolean;
    autoSize: boolean;
  };
};

export const INSERT_MAGIC_LAYOUT_COMMAND: LexicalCommand<InsertMagicLayoutPayload> = createCommand(
  "INSERT_MAGIC_LAYOUT"
);








