import { useEffect, useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  $getSelection,
  $getNodeByKey,
  $isRangeSelection,
  $isNodeSelection,
  $createParagraphNode,
  type LexicalNode,
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
  OPEN_VECTOR_COMMAND,
  TOGGLE_SPEECH_COMMAND,
  INSERT_TEXTBOX_COMMAND,
  INSERT_PICTURE_FRAME_COMMAND,
  INSERT_PICTURE_FRAME_LAYOUT_COMMAND,
} from "../commands";
import { INSERT_LAYOUT_COMMAND } from "@/dashboard/project/features/editor/components/Brief/plugins/LayoutCommands";
import { ResizableImageNode } from "./nodes/ResizableImageNode";
import { ImageNode } from "./nodes/ImageNode";
import { TextBoxNode } from "./nodes/TextBoxNode";
import { SvgNode } from "./nodes/SvgNode";
import { PictureFrameNode, type PictureFrameBorder, type PictureFrameFitMode } from "./nodes/PictureFrameNode";
import type { ImageBorderRadiusState } from "./nodes/imageBorderRadius";
import { reorderSlideStackablesInRoot } from "./slides/slideStackingUtils";
import { duplicateSlideNodes, getSlideNodeSelectionKeys } from "./slides/slideSelectionUtils";
import { collectGroupIndex, createGroupId, getNodeGroupId, setNodeGroupId } from "./slides/grouping";
import { alignSlideNodes, distributeSlideNodes } from "./slides/slideArrangeUtils";

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
  onInsertVector: () => void;
  onFigma: () => void;
  onVoice: () => void;
  onInsertTextBox: () => void;
  onInsertPictureFrame: () => void;
  onInsertPictureFrameLayout: () => void;
  /** Apply layout with specific parameters (no prompts) */
  onApplyPictureFrameLayout: (count: number, mode: "grid" | "masonry", seed: string) => void;

  onInsertLayout: (template: string) => void;

  onUndo: () => void;
  onRedo: () => void;

  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onAlignSelectionLeft: () => void;
  onAlignSelectionRight: () => void;
  onAlignSelectionTop: () => void;
  onAlignSelectionBottom: () => void;
  onDistributeSelectionHorizontal: () => void;
  onDistributeSelectionVertical: () => void;
  onUpdateImageBorderRadius: (updates: Partial<ImageBorderRadiusState>) => void;
  onUpdateImageBorder: (updates: Partial<PictureFrameBorder>) => void;
  onUpdatePictureFrameRadius: (radius: number) => void;
  onUpdatePictureFrameFit: (fit: PictureFrameFitMode) => void;
  onUpdatePictureFrameBorder: (updates: Partial<PictureFrameBorder>) => void;
  onUpdateTextBoxBorder: (updates: Partial<PictureFrameBorder>) => void;
  onUpdateTextBoxBorderRadius: (updates: Partial<ImageBorderRadiusState>) => void;
  onToggleLockSelection: () => void;
  onReplacePictureFrameWithTextBox: () => void;
  onLineHeightChange: (value: string) => void;
  onLetterSpacingChange: (value: string) => void;
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

  const mutateSelectedNodes = useCallback(
    (mutator: (node: LexicalNode) => void) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isNodeSelection(selection)) {
          return;
        }
        selection.getNodes().forEach((node) => {
          if (node.isAttached()) {
            mutator(node);
          }
        });
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
      onInsertVector: () => editor.dispatchCommand(OPEN_VECTOR_COMMAND, undefined),
      onFigma: () => editor.dispatchCommand(OPEN_FIGMA_COMMAND, undefined),
      onVoice: () => editor.dispatchCommand(TOGGLE_SPEECH_COMMAND, undefined),
      onInsertTextBox: () => editor.dispatchCommand(INSERT_TEXTBOX_COMMAND, undefined),
      onInsertPictureFrame: () =>
        editor.dispatchCommand(INSERT_PICTURE_FRAME_COMMAND, undefined),
      onInsertPictureFrameLayout: () => {
        // No-op: UI now handles layout configuration via the toolbar panel
        // This is kept for backward compatibility
      },
      onApplyPictureFrameLayout: (count: number, mode: "grid" | "masonry", seed: string) => {
        editor.dispatchCommand(INSERT_PICTURE_FRAME_LAYOUT_COMMAND, { count, mode, seed });
      },

      onInsertLayout: (template: string) =>
        editor.dispatchCommand(INSERT_LAYOUT_COMMAND, template),

      onUndo: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
      onRedo: () => editor.dispatchCommand(REDO_COMMAND, undefined),

      onDuplicateSelection: () => {
        editor.update(() => {
          const keys = getSlideNodeSelectionKeys();
          if (!keys || keys.length === 0) return;
          duplicateSlideNodes(keys, { offsetX: 12, offsetY: 12, selectClones: true });
        });
      },
      onDeleteSelection: () =>
        mutateSelectedNodes((node) => {
          node.remove();
        }),
      onGroupSelection: () => {
        editor.update(() => {
          const keys = getSlideNodeSelectionKeys();
          if (!keys || keys.length < 2) return;
          const nodes = keys
            .map((key) => $getNodeByKey<LexicalNode>(key))
            .filter((node): node is LexicalNode => Boolean(node));
          const groupable = nodes.filter((node) => {
            const maybe = node as unknown as { setGroupId?: (groupId: string | null) => void };
            return typeof maybe.setGroupId === "function";
          });
          if (groupable.length < 2) return;
          const groupId = createGroupId();
          groupable.forEach((node) => setNodeGroupId(node, groupId));
        });
      },
      onUngroupSelection: () => {
        editor.update(() => {
          const keys = getSlideNodeSelectionKeys();
          if (!keys || keys.length === 0) return;
          const groupIds = new Set<string>();
          keys.forEach((key) => {
            const node = $getNodeByKey<LexicalNode>(key);
            const gid = getNodeGroupId(node);
            if (gid) groupIds.add(gid);
          });
          if (groupIds.size === 0) return;
          const index = collectGroupIndex();
          groupIds.forEach((gid) => {
            const memberKeys = index.groupIdToKeys.get(gid) ?? [];
            memberKeys.forEach((memberKey) => {
              const node = $getNodeByKey<LexicalNode>(memberKey);
              setNodeGroupId(node, null);
            });
          });
        });
      },
      onBringToFront: () => {
        console.log('[toolbar] onBringToFront clicked');
        editor.update(() => {
          reorderSlideStackablesInRoot("bringToFront");
        });
      },
      onSendToBack: () => {
        console.log('[toolbar] onSendToBack clicked');
        editor.update(() => {
          reorderSlideStackablesInRoot("sendToBack");
        });
      },
      onBringForward: () => {
        console.log('[toolbar] onBringForward clicked');
        editor.update(() => {
          reorderSlideStackablesInRoot("bringForward");
        });
      },
      onSendBackward: () => {
        console.log('[toolbar] onSendBackward clicked');
        editor.update(() => {
          reorderSlideStackablesInRoot("sendBackward");
        });
      },
      onAlignSelectionLeft: () =>
        editor.update(() => {
          alignSlideNodes(getSlideNodeSelectionKeys(), "left");
        }),
      onAlignSelectionRight: () =>
        editor.update(() => {
          alignSlideNodes(getSlideNodeSelectionKeys(), "right");
        }),
      onAlignSelectionTop: () =>
        editor.update(() => {
          alignSlideNodes(getSlideNodeSelectionKeys(), "top");
        }),
      onAlignSelectionBottom: () =>
        editor.update(() => {
          alignSlideNodes(getSlideNodeSelectionKeys(), "bottom");
        }),
      onDistributeSelectionHorizontal: () =>
        editor.update(() => {
          distributeSlideNodes(getSlideNodeSelectionKeys(), "horizontal");
        }),
      onDistributeSelectionVertical: () =>
        editor.update(() => {
          distributeSlideNodes(getSlideNodeSelectionKeys(), "vertical");
        }),
      onUpdateImageBorderRadius: (updates) =>
        mutateSelectedNodes((node) => {
          if (node instanceof ResizableImageNode) {
            node.setBorderRadius(updates);
          }
        }),
      onUpdateImageBorder: (updates) =>
        mutateSelectedNodes((node) => {
          if (node instanceof ResizableImageNode) {
            node.setBorder?.(updates);
          }
          if (node instanceof ImageNode) {
            node.setBorder?.(updates);
          }
        }),
      onUpdatePictureFrameRadius: (radius) =>
        mutateSelectedNodes((node) => {
          if (node instanceof PictureFrameNode) {
            node.setRadius(radius);
          }
        }),
      onUpdatePictureFrameFit: (fit) =>
        mutateSelectedNodes((node) => {
          if (node instanceof PictureFrameNode) {
            node.setFit(fit);
          }
        }),
      onUpdatePictureFrameBorder: (updates) =>
        mutateSelectedNodes((node) => {
          if (node instanceof PictureFrameNode) {
            node.setBorder(updates);
          }
        }),
      onUpdateTextBoxBorder: (updates) =>
        mutateSelectedNodes((node) => {
          if (node instanceof TextBoxNode) {
            node.setBorder?.(updates);
          }
        }),
      onUpdateTextBoxBorderRadius: (updates) =>
        mutateSelectedNodes((node) => {
          if (node instanceof TextBoxNode) {
            node.setBorderRadius?.(updates);
          }
        }),
      onToggleLockSelection: () => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isNodeSelection(selection)) {
            return;
          }

          const nodes = selection.getNodes();
          const lockableNodes = nodes.filter(
            (node): node is ResizableImageNode | ImageNode | TextBoxNode | SvgNode | PictureFrameNode =>
              node instanceof ResizableImageNode ||
              node instanceof ImageNode ||
              node instanceof TextBoxNode ||
              node instanceof SvgNode ||
              node instanceof PictureFrameNode
          );

          if (lockableNodes.length === 0) {
            return;
          }

          const shouldLock = lockableNodes.some((node) => !node.getLocked?.());
          lockableNodes.forEach((node) => node.setLocked?.(shouldLock));
        });
      },
      onReplacePictureFrameWithTextBox: () => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isNodeSelection(selection)) {
            return;
          }

          const nodes = selection.getNodes();
          const pictureFrames = nodes.filter(
            (node): node is PictureFrameNode => node instanceof PictureFrameNode
          );

          if (pictureFrames.length === 0) {
            return;
          }

          pictureFrames.forEach((pf) => {
            const x = pf.getX();
            const y = pf.getY();
            const width = pf.getWidth();
            const height = pf.getHeight();
            const rotation = pf.getRotation?.() ?? 0;
            const border = pf.getBorder?.() ?? { enabled: false, width: 2, color: '#ffffff' };
            const locked = pf.getLocked?.() ?? false;
            const groupId = pf.getGroupId?.() ?? null;
            // Convert single radius to all-corners format for TextBoxNode
            const radius = pf.getRadius?.() ?? 0;
            const borderRadius = {
              topLeft: radius,
              topRight: radius,
              bottomRight: radius,
              bottomLeft: radius,
            };

            // Create a new TextBoxNode with same position, size, and style
            // TextBoxNode constructor: (x, y, width, height, rotation, borderRadius, border, key, locked, groupId)
            const textBox = new TextBoxNode(
              x,
              y,
              width,
              height,
              rotation,
              borderRadius,
              border,
              undefined, // key - auto-generated
              locked,
              groupId
            );

            // Replace the picture frame with the text box
            pf.replace(textBox);
          });
        });
      },
      onLineHeightChange: (value: string) => {
        // Line height is applied via CSS style on the text node
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            // Apply line-height to the selected text blocks
            const nodes = selection.getNodes();
            nodes.forEach((node) => {
              const element = node.getParent();
              if (element && 'setStyle' in element && typeof element.setStyle === 'function') {
                (element as { setStyle: (style: string) => void }).setStyle(`line-height: ${value};`);
              }
            });
          }
        });
      },
      onLetterSpacingChange: (value: string) => {
        // Letter spacing is applied via CSS style on text
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const nodes = selection.getNodes();
            nodes.forEach((node) => {
              const element = node.getParent();
              if (element && 'setStyle' in element && typeof element.setStyle === 'function') {
                (element as { setStyle: (style: string) => void }).setStyle(`letter-spacing: ${value};`);
              }
            });
          }
        });
      },
    };

    registerToolbar(actions);
  }, [editor, formatBlock, mutateSelectedNodes, registerToolbar]);

  return null;
}











