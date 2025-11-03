import React, { useEffect } from "react";
import {
  $getSelection,
  $isRangeSelection,
  KEY_BACKSPACE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalNode,
  $isElementNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isLayoutItemNode, type LayoutItemNode } from "./nodes/LayoutItemNode"; // adjust the import as needed
import { $isLayoutContainerNode } from "./nodes/LayoutContainerNode";

/**
 * Recursively climbs the tree from the given node to find a preceding empty LayoutItemNode.
 */
function findEmptyLayoutItemBefore(node: LexicalNode | null): LayoutItemNode | null {
  let current: LexicalNode | null = node;

  while (current) {
    // Look for previous siblings at the current level.
    let prev: LexicalNode | null = current.getPreviousSibling();

    while (prev) {
      if ($isLayoutItemNode(prev)) {
        const isEmptyElement =
          $isElementNode(prev) && prev.getChildrenSize() === 0;
        const isEmptyText = prev.getTextContent().trim() === "";

        if (isEmptyElement || isEmptyText) {
          return prev as LayoutItemNode;
        }
      }
      prev = prev.getPreviousSibling();
    }

    // If none found at this level, climb one level up.
    current = current.getParent();
  }

  return null;
}

function findParentLayoutItem(node: LexicalNode | null): LayoutItemNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isLayoutItemNode(current)) {
      return current as LayoutItemNode;
    }
    current = current.getParent();
  }
  return null;
}

const RemoveEmptyLayoutItemsOnBackspacePlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = editor.registerCommand<KeyboardEvent>(
      KEY_BACKSPACE_COMMAND,
      () => {
        const selection = $getSelection();
        // Only process if the selection is a collapsed range.
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchor = selection.anchor;

        // Only proceed if the caret is at offset 0.
        if (anchor.offset !== 0) {
          return false;
        }

        // Get the node where the caret is located.
        const currentNode = anchor.getNode();

        // Search upward for a preceding empty LayoutItemNode.
        const layoutItem = findEmptyLayoutItemBefore(currentNode);
        if (layoutItem) {
          layoutItem.remove();
          return true; // handled
        }

        const currentLayoutItem = findParentLayoutItem(currentNode);
        if (currentLayoutItem) {
          const parent = currentLayoutItem.getParent();
          const isEmpty =
            currentLayoutItem.getTextContent().trim() === "" &&
            currentLayoutItem.getChildren().every((child) => child.getTextContent().trim() === "");

          if (isEmpty && $isLayoutContainerNode(parent)) {
            const prevSibling = currentLayoutItem.getPreviousSibling();
            const nextSibling = currentLayoutItem.getNextSibling();

            currentLayoutItem.remove();

            if ($isLayoutItemNode(prevSibling)) {
              prevSibling.selectEnd();
            } else if ($isLayoutItemNode(nextSibling)) {
              nextSibling.selectStart();
            } else if ($isLayoutContainerNode(parent)) {
              const prevContainerSibling = parent.getPreviousSibling();
              const nextContainerSibling = parent.getNextSibling();

              if ($isElementNode(prevContainerSibling)) {
                prevContainerSibling.selectEnd();
              } else if ($isElementNode(nextContainerSibling)) {
                nextContainerSibling.selectStart();
              }
            }

            return true;
          }
        }

        return false; // not handled, let default behavior occur
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregister();
    };
  }, [editor]);

  return null;
};

export default RemoveEmptyLayoutItemsOnBackspacePlugin;









