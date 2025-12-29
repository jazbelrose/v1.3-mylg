import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createNodeSelection,
  $setSelection,
  $insertNodes,
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
          const defaultX = (1920 - defaultWidth) / 2;
          const defaultY = (1080 - defaultHeight) / 2;
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

          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([node]);
          } else {
            $insertNodes([node]);
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

  return null;
}

