import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  $getSelection,
  $isNodeSelection,
  $getNodeByKey,
} from "lexical";

const TEXTBOX_TYPE = "text-box";

export default function DeleteTextBoxPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      let didRemove = false;

      editor.update(() => {
        // Primary path: node selection
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          const nodes = selection.getNodes();
          for (const node of nodes) {
            if (node.getType && node.getType() === TEXTBOX_TYPE) {
              node.remove();
              didRemove = true;
            }
          }
        }

        if (didRemove) {
          return;
        }

        // Fallback: remove visually selected textbox if NodeSelection was not set
        const root = editor.getRootElement();
        const el = root?.querySelector<HTMLElement>(
          `[data-lexical-textbox].editor-textbox-selected`
        );
        const key = el?.getAttribute("data-lexical-node-key");

        if (key) {
          const node = $getNodeByKey(key);
          if (node && node.getType && node.getType() === TEXTBOX_TYPE) {
            node.remove();
            didRemove = true;
          }
        }
      });

      if (didRemove) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      return false;
    };

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      handler,
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      handler,
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      unregisterDelete();
      unregisterBackspace();
    };
  }, [editor]);

  return null;
}
