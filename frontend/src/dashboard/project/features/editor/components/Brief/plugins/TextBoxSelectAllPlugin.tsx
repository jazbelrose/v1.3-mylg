import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createRangeSelection,
  $setSelection,
  type LexicalNode,
} from "lexical";
import { $isTextBoxNode, TextBoxNode } from "./nodes/TextBoxNode";

/**
 * TextBoxSelectAllPlugin
 *
 * When Ctrl+A (or Cmd+A on Mac) is pressed while editing inside a TextBoxNode,
 * this plugin intercepts the event and selects only the text within that textbox,
 * instead of selecting all content in the entire editor.
 */
export default function TextBoxSelectAllPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    /**
     * Find the TextBoxNode ancestor of a given node
     */
    const findTextBoxAncestor = (node: LexicalNode | null): TextBoxNode | null => {
      let current = node;
      while (current) {
        if ($isTextBoxNode(current)) {
          return current;
        }
        current = current.getParent();
      }
      return null;
    };

    /**
     * Handle Ctrl+A / Cmd+A keydown events
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Only handle Ctrl+A or Cmd+A
      const isSelectAll =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === "a" || event.key === "A");

      if (!isSelectAll) {
        return;
      }

      // Check if we're inside a textbox with a range selection
      const shouldHandle = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        return findTextBoxAncestor(anchorNode) !== null;
      });

      if (!shouldHandle) {
        return;
      }

      // Prevent the default select-all behavior
      event.preventDefault();
      event.stopPropagation();

      // Select all content within the textbox
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const anchorNode = selection.anchor.getNode();
        const textBox = findTextBoxAncestor(anchorNode);

        if (!textBox) {
          return;
        }

        // Get the first and last text nodes in the textbox
        const textBoxChildren = textBox.getChildren();
        if (textBoxChildren.length === 0) {
          return;
        }

        // Find the first and last selectable positions
        const firstChild = textBoxChildren[0];
        const lastChild = textBoxChildren[textBoxChildren.length - 1];

        // Get the deepest first and last text positions
        const getFirstTextNode = (node: LexicalNode): LexicalNode => {
          const children = "getChildren" in node && typeof node.getChildren === "function" 
            ? (node as { getChildren: () => LexicalNode[] }).getChildren() 
            : [];
          if (children.length === 0) {
            return node;
          }
          return getFirstTextNode(children[0]);
        };

        const getLastTextNode = (node: LexicalNode): LexicalNode => {
          const children = "getChildren" in node && typeof node.getChildren === "function"
            ? (node as { getChildren: () => LexicalNode[] }).getChildren()
            : [];
          if (children.length === 0) {
            return node;
          }
          return getLastTextNode(children[children.length - 1]);
        };

        const firstTextNode = getFirstTextNode(firstChild);
        const lastTextNode = getLastTextNode(lastChild);

        // Get the content length of the last text node
        const lastNodeLength = "getTextContentSize" in lastTextNode && 
          typeof lastTextNode.getTextContentSize === "function"
            ? (lastTextNode as { getTextContentSize: () => number }).getTextContentSize()
            : 0;

        // Create a new range selection spanning the entire textbox content
        const newSelection = $createRangeSelection();
        newSelection.anchor.set(firstTextNode.getKey(), 0, "text");
        newSelection.focus.set(lastTextNode.getKey(), lastNodeLength, "text");

        $setSelection(newSelection);
      });
    };

    // Use capture phase to intercept before other handlers
    rootElement.addEventListener("keydown", handleKeyDown, true);

    return () => {
      rootElement.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editor]);

  return null;
}
