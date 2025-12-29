import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $setSelection,
  $getRoot,
  $createParagraphNode,
  type LexicalNode,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";

import { INSERT_PICTURE_FRAME_COMMAND } from "../commands";
import { $createPictureFrameNode, PictureFrameNode } from "./nodes/PictureFrameNode";

export default function PictureFramePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([PictureFrameNode])) {
      throw new Error("PictureFramePlugin: PictureFrameNode not registered on editor");
    }

    return editor.registerCommand(
      INSERT_PICTURE_FRAME_COMMAND,
      () => {
        editor.update(() => {
          const defaultWidth = 320;
          const defaultHeight = 240;
          const countExistingFrames = (node: LexicalNode): number => {
            let count = node instanceof PictureFrameNode ? 1 : 0;
            const maybeChildren = (node as unknown as { getChildren?: () => LexicalNode[] }).getChildren;
            if (typeof maybeChildren === "function") {
              maybeChildren.call(node).forEach((child) => {
                count += countExistingFrames(child);
              });
            }
            return count;
          };

          const existingFrames = countExistingFrames($getRoot());
          const cascade = 28;
          const offset = existingFrames * cascade;

          const defaultX = Math.min((1920 - defaultWidth) / 2 + offset, 1920 - defaultWidth - 24);
          const defaultY = Math.min((1080 - defaultHeight) / 2 + offset, 1080 - defaultHeight - 24);
          const node = $createPictureFrameNode({
            x: defaultX,
            y: defaultY,
            width: defaultWidth,
            height: defaultHeight,
            fit: "cover",
            radius: 16,
            imageSrc: null,
            background: "#2a2c2f",
            border: { enabled: false, width: 2, color: "#ffffff" },
          });

          // Keep picture frames in a paragraph so they serialize/normalize consistently (same as ResizableImageNode).
          const root = $getRoot();
          const last = root.getLastChild();
          if (last && last.getType() === "paragraph") {
            (last as unknown as { append: (...nodes: LexicalNode[]) => void }).append(node);
          } else {
            const paragraph = $createParagraphNode();
            root.append(paragraph);
            paragraph.append(node);
          }

          const nodeSelection = $createNodeSelection();
          nodeSelection.add(node.getKey());
          $setSelection(nodeSelection);
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  useEffect(() => {
    // Migration/normalization: older docs may have picture frames attached directly to the root.
    // Move them into a paragraph so they persist and thumbnail rendering can find them reliably.
    return editor.registerNodeTransform(PictureFrameNode, (node) => {
      const parent = node.getParent();
      if (!parent) return;
      if (parent.getType() !== "root") return;

      const paragraph = $createParagraphNode();
      node.insertBefore(paragraph);
      paragraph.append(node);
    });
  }, [editor]);

  return null;
}
