import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  $getSelection,
  $isNodeSelection,
} from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";

export default function DeleteTextBoxPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const removeSelectedTextBoxes = (event: KeyboardEvent) => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return false;

      const nodes = selection.getNodes();
      const hasTextBox = nodes.some((n) => n instanceof TextBoxNode);
      if (!hasTextBox) return false;

      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        const sel = $getSelection();
        if (!$isNodeSelection(sel)) return;

        sel.getNodes().forEach((node) => {
          if (node instanceof TextBoxNode) {
            node.remove();
          }
        });
      });

      return true;
    };

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      removeSelectedTextBoxes,
      COMMAND_PRIORITY_HIGH
    );

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      removeSelectedTextBoxes,
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      unregisterDelete();
      unregisterBackspace();
    };
  }, [editor]);

  return null;
}
