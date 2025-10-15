import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isNodeSelection,
  KEY_DELETE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalCommand,
  type NodeSelection,
  type LexicalNode,
} from "lexical";
import { ImageNode } from "./nodes/ImageNode";
import { ResizableImageNode } from "./nodes/ResizableImageNode";

const isDeletableImageNode = (node: LexicalNode): node is ImageNode | ResizableImageNode =>
  node instanceof ImageNode || node instanceof ResizableImageNode;

export default function DeleteImagePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const removeSelectedImage = (): boolean => {
      const selection = $getSelection();
      if ($isNodeSelection(selection)) {
        const nodes = (selection as NodeSelection).getNodes();
        for (const node of nodes) {
          if (isDeletableImageNode(node)) {
            node.remove();
            return true; // handled
          }
        }
      }
      return false; // not handled
    };

    const unregisterDelete = editor.registerCommand<KeyboardEvent>(
      KEY_DELETE_COMMAND as LexicalCommand<KeyboardEvent>,
      () => removeSelectedImage(),
      COMMAND_PRIORITY_LOW
    );

    const unregisterBackspace = editor.registerCommand<KeyboardEvent>(
      KEY_BACKSPACE_COMMAND as LexicalCommand<KeyboardEvent>,
      () => removeSelectedImage(),
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterDelete();
      unregisterBackspace();
    };
  }, [editor]);

  return null;
}









