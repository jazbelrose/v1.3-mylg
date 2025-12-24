import React from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  type RangeSelection,
} from "lexical";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import { $isListNode, ListNode } from "@lexical/list";
import { $isHeadingNode } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
import { $isCodeNode } from "@lexical/code";

import { ResizableImageNode } from "./nodes/ResizableImageNode";
import { TextBoxNode } from "./nodes/TextBoxNode";
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  FONT_FAMILY_CSS_VALUES,
  FONT_SIZES,
  resolveFontFamilyFromCss,
  SUPPORTED_BLOCK_TYPES,
  type FontSize,
  type TextBlockType,
} from "./toolbarShared";
import { DEFAULT_IMAGE_BORDER_RADIUS } from "./nodes/imageBorderRadius";
import { SvgNode } from "./nodes/SvgNode";
import { useOptionalToolbarContext } from "./ToolbarContextBridge";

function getBlockTypeFromSelection(selection: RangeSelection): {
  blockType: TextBlockType;
  codeLanguage: string;
} {
  const anchorNode = selection.anchor.getNode();
  const element =
    anchorNode.getKey() === "root" ? anchorNode : anchorNode.getTopLevelElementOrThrow();

  let blockType: TextBlockType = "paragraph";
  let codeLanguage = "";

  if ($isListNode(element)) {
    const parentList = $getNearestNodeOfType(anchorNode, ListNode);
    const type = parentList ? parentList.getTag() : element.getTag();
    if (type === "ul" || type === "ol") {
      blockType = type;
    }
  } else if ($isHeadingNode(element)) {
    const tag = element.getTag();
    if (tag === "h1" || tag === "h2") {
      blockType = tag;
    }
  } else {
    const type = element.getType();
    if (SUPPORTED_BLOCK_TYPES.has(type as TextBlockType)) {
      blockType = type as TextBlockType;
    }
  }

  if ($isCodeNode(element)) {
    blockType = "code";
    codeLanguage = element.getLanguage() || "";
  }

  return { blockType, codeLanguage };
}

function resolveFontSize(value: string | null | undefined): FontSize {
  if (!value) return DEFAULT_FONT_SIZE;
  const size = value.trim();
  return (FONT_SIZES.find((option) => option === size) ?? DEFAULT_FONT_SIZE) as FontSize;
}

export default function ToolbarContextPlugin() {
  const [editor] = useLexicalComposerContext();
  const ctxApi = useOptionalToolbarContext();

  React.useEffect(() => {
    if (!ctxApi) return;

    const { setCtx, setText, setHistory } = ctxApi;

    const updateToolbarContext = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();

        if (!selection) {
          setCtx({ type: "none" });
          return;
        }

        if ($isRangeSelection(selection)) {
          const { blockType, codeLanguage } = getBlockTypeFromSelection(selection);
          const textColor = $getSelectionStyleValueForProperty(
            selection,
            "color",
            DEFAULT_TEXT_COLOR
          );
          const bgColor = $getSelectionStyleValueForProperty(
            selection,
            "background-color",
            DEFAULT_BG_COLOR
          );
          const fontFamilyCss = $getSelectionStyleValueForProperty(
            selection,
            "font-family",
            FONT_FAMILY_CSS_VALUES[DEFAULT_FONT_FAMILY]
          );
          const fontSize = resolveFontSize(
            $getSelectionStyleValueForProperty(
              selection,
              "font-size",
              DEFAULT_FONT_SIZE
            )
          );

          setText((prev) => ({
            ...prev,
            blockType,
            codeLanguage,
            isBold: selection.hasFormat("bold"),
            isItalic: selection.hasFormat("italic"),
            isUnderline: selection.hasFormat("underline"),
            isStrikethrough: selection.hasFormat("strikethrough"),
            isCode: selection.hasFormat("code"),
            fontFamily: resolveFontFamilyFromCss(fontFamilyCss),
            fontSize,
            textColor,
            bgColor,
          }));
          setCtx({ type: "text", isRange: !selection.isCollapsed() });
          return;
        }

        if ($isNodeSelection(selection)) {
          const nodes = selection.getNodes();
          if (nodes.length === 0) {
            setCtx({ type: "none" });
            return;
          }

          const imageNode = nodes.find((node) => node instanceof ResizableImageNode);
          if (imageNode) {
            setCtx({
              type: "image",
              nodeKey: imageNode.getKey(),
              borderRadius: imageNode.getBorderRadius(),
              width: imageNode.getWidth(),
              height: imageNode.getHeight(),
            });
            return;
          }

          const svgNode = nodes.find((node) => node instanceof SvgNode);
          if (svgNode) {
            setCtx({
              type: "svg",
              nodeKey: svgNode.getKey(),
              width: svgNode.getWidth(),
              height: svgNode.getHeight(),
            });
            return;
          }

          const textBoxNode = nodes.find((node) => node instanceof TextBoxNode);
          if (textBoxNode) {
            setCtx({ type: "textbox", nodeKey: textBoxNode.getKey() });
            return;
          }

          setCtx(nodes.length > 1 ? { type: "mixed" } : { type: "none" });
          return;
        }

        setCtx({ type: "none" });
      });
    };

    updateToolbarContext();

    return mergeRegister(
      editor.registerUpdateListener(() => {
        updateToolbarContext();
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbarContext();
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload: boolean) => {
          setHistory((prev) => ({ ...prev, canUndo: payload }));
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload: boolean) => {
          setHistory((prev) => ({ ...prev, canRedo: payload }));
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [ctxApi?.setCtx, editor]);

  return null;
}
