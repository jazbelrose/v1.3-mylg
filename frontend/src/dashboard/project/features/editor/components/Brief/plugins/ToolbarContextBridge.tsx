import React from "react";
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  type FontFamily,
  type FontSize,
  type TextBlockType,
} from "./toolbarShared";
import type { ImageBorderRadiusState } from "./nodes/imageBorderRadius";
import type { PictureFrameBorder, PictureFrameFitMode } from "./nodes/PictureFrameNode";

export type ToolbarContext =
  | { type: "none" }
  | { type: "text"; isRange: boolean }
  | {
      type: "group";
      groupId: string;
      memberCount: number;
      locked: boolean;
      selectionCount: number;
    }
  | {
      type: "image";
      nodeKey: string;
      locked: boolean;
      selectionCount: number;
      borderRadius: ImageBorderRadiusState;
      border: PictureFrameBorder;
      width: number;
      height: number;
    }
  | {
      type: "picture-frame";
      nodeKey: string;
      locked: boolean;
      selectionCount: number;
      imageSrc: string | null;
      fit: PictureFrameFitMode;
      radius: number;
      border: PictureFrameBorder;
      width: number;
      height: number;
    }
  | {
      type: "svg";
      nodeKey: string;
      locked: boolean;
      selectionCount: number;
      width: number;
      height: number;
    }
  | {
      type: "textbox";
      nodeKey: string;
      locked: boolean;
      selectionCount: number;
      border: PictureFrameBorder;
      borderRadius: ImageBorderRadiusState;
      width: number;
      height: number;
    }
  | { type: "mixed"; selectionCount: number };

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

export type TextFormattingState = {
  blockType: TextBlockType;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  isCode: boolean;
  fontFamily: FontFamily;
  fontSize: FontSize;
  textColor: string;
  bgColor: string;
  codeLanguage: string;
};

export const DEFAULT_TEXT_STATE: TextFormattingState = {
  blockType: "paragraph",
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrikethrough: false,
  isCode: false,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  textColor: DEFAULT_TEXT_COLOR,
  bgColor: DEFAULT_BG_COLOR,
  codeLanguage: "",
};

const ToolbarContextReact = React.createContext<{
  ctx: ToolbarContext;
  setCtx: React.Dispatch<React.SetStateAction<ToolbarContext>>;
  text: TextFormattingState;
  setText: React.Dispatch<React.SetStateAction<TextFormattingState>>;
  history: HistoryState;
  setHistory: React.Dispatch<React.SetStateAction<HistoryState>>;
} | null>(null);

export function ToolbarContextProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = React.useState<ToolbarContext>({ type: "none" });
  const [text, setText] = React.useState<TextFormattingState>(DEFAULT_TEXT_STATE);
  const [history, setHistory] = React.useState<HistoryState>({ canUndo: false, canRedo: false });

  const value = React.useMemo(
    () => ({ ctx, setCtx, text, setText, history, setHistory }),
    [ctx, text, history]
  );

  return <ToolbarContextReact.Provider value={value}>{children}</ToolbarContextReact.Provider>;
}

export function useToolbarContextBridge() {
  const ctx = React.useContext(ToolbarContextReact);
  if (!ctx) {
    throw new Error("ToolbarContextProvider is missing in the component tree.");
  }
  return ctx;
}

export function useOptionalToolbarContext() {
  return React.useContext(ToolbarContextReact);
}
