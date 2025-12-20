import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { INSERT_TEXTBOX_COMMAND } from "../commands";
import { $createTextBoxNode, TextBoxNode } from "./nodes/TextBoxNode";

/**
 * Simple plugin to insert a styled block-level text box node.
 * Keeps the node in the normal document flow so it sits with other blocks.
 */
export default function TextBoxPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([TextBoxNode])) {
      throw new Error("TextBoxPlugin: TextBoxNode not registered on editor");
    }

    return editor.registerCommand(
      INSERT_TEXTBOX_COMMAND,
      () => {
        editor.update(() => {
          // Drop a new floating text box roughly near the center of the slide.
          const defaultX = (1920 - 480) / 2; // Center horizontally
          const defaultY = (1080 - 160) / 2; // Center vertically
          const textBox = $createTextBoxNode(defaultX, defaultY, 480, 160);
          const paragraph = $createParagraphNode();
          textBox.append(paragraph);
          $insertNodeToNearestRoot(textBox);
          paragraph.selectEnd();
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerNodeTransform(TextBoxNode, (node) => {
      if (node.isEmpty()) {
        node.append($createParagraphNode());
      }
    });
  }, [editor]);

  return null;
}
