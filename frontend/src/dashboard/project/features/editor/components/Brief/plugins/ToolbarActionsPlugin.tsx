import { useEffect, useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createCodeNode } from "@lexical/code";
import { $setBlocksType } from "@lexical/selection";
import {
  SET_FONT_FAMILY_COMMAND,
  SET_FONT_SIZE_COMMAND,
  SET_TEXT_COLOR_COMMAND,
  SET_BG_COLOR_COMMAND,
  OPEN_IMAGE_COMMAND,
  OPEN_FIGMA_COMMAND,
  TOGGLE_SPEECH_COMMAND,
} from "../commands";
import { INSERT_LAYOUT_COMMAND } from "@/dashboard/project/features/editor/components/Brief/plugins/LayoutCommands";

type BlockType = "paragraph" | "h1" | "h2" | "quote" | "code" | "ul" | "ol";

export type ToolbarActions = {
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onCode: () => void;

  onParagraph: () => void;
  onHeading1: () => void;
  onHeading2: () => void;
  onQuote: () => void;
  onUnorderedList: () => void;
  onOrderedList: () => void;

  onFontChange: (value: string) => void;
  onFontSizeChange: (value: number | string) => void;
  onFontColorChange: (value: string) => void;
  onBgColorChange: (value: string) => void;

  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignJustify: () => void;

  onAddImage: () => void;
  onFigma: () => void;
  onVoice: () => void;

  onInsertLayout: (template: string) => void;

  onUndo: () => void;
  onRedo: () => void;
};

type Props = {
  /** The parent passes a function to receive editor action callbacks */
  registerToolbar?: (actions: ToolbarActions) => void;
};

export default function ToolbarActionsPlugin({ registerToolbar }: Props): null {
  const [editor] = useLexicalComposerContext();

  const formatBlock = useCallback(
    (type: BlockType) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        if (["paragraph", "h1", "h2", "quote", "code"].includes(type)) {
          editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        }

        switch (type) {
          case "paragraph":
            $setBlocksType(selection, () => $createParagraphNode());
            break;
          case "h1":
            $setBlocksType(selection, () => $createHeadingNode("h1"));
            break;
          case "h2":
            $setBlocksType(selection, () => $createHeadingNode("h2"));
            break;
          case "quote":
            $setBlocksType(selection, () => $createQuoteNode());
            break;
          case "code":
            $setBlocksType(selection, () => $createCodeNode());
            break;
          case "ul":
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            break;
          case "ol":
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            break;
        }
      });
    },
    [editor]
  );

  useEffect(() => {
    if (!registerToolbar) return;

    const actions: ToolbarActions = {
      onBold: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"),
      onItalic: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"),
      onUnderline: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"),
      onStrikethrough: () =>
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough"),
      onCode: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code"),

      onParagraph: () => formatBlock("paragraph"),
      onHeading1: () => formatBlock("h1"),
      onHeading2: () => formatBlock("h2"),
      onQuote: () => formatBlock("quote"),
      onUnorderedList: () => formatBlock("ul"),
      onOrderedList: () => formatBlock("ol"),

      onFontChange: (value) =>
        editor.dispatchCommand(SET_FONT_FAMILY_COMMAND, value),
      onFontSizeChange: (value) =>
        editor.dispatchCommand(
          SET_FONT_SIZE_COMMAND,
          typeof value === "number" ? `${value}px` : `${value}`
        ),
      onFontColorChange: (value) =>
        editor.dispatchCommand(SET_TEXT_COLOR_COMMAND, value),
      onBgColorChange: (value) =>
        editor.dispatchCommand(SET_BG_COLOR_COMMAND, value),

      onAlignLeft: () => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left"),
      onAlignCenter: () =>
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center"),
      onAlignRight: () =>
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right"),
      onAlignJustify: () =>
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify"),

      onAddImage: () => editor.dispatchCommand(OPEN_IMAGE_COMMAND, undefined),
      onFigma: () => editor.dispatchCommand(OPEN_FIGMA_COMMAND, undefined),
      onVoice: () => editor.dispatchCommand(TOGGLE_SPEECH_COMMAND, undefined),

      onInsertLayout: (template: string) =>
        editor.dispatchCommand(INSERT_LAYOUT_COMMAND, template),

      onUndo: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
      onRedo: () => editor.dispatchCommand(REDO_COMMAND, undefined),
    };

    registerToolbar(actions);
  }, [editor, formatBlock, registerToolbar]);

  return null;
}











