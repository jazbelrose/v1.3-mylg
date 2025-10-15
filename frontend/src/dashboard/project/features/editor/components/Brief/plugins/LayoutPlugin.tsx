import React, { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LayoutOutlined as LayoutIcon } from "@ant-design/icons";


import {
  $findMatchingParent,
  $insertNodeToNearestRoot,
  mergeRegister,
} from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type ElementNode,
} from "lexical";

import { useDropdown } from "../contexts/DropdownContext";
import {
  $createLayoutContainerNode,
  $isLayoutContainerNode,
  LayoutContainerNode,
} from "./nodes/LayoutContainerNode";
import {
  $createLayoutItemNode,
  $isLayoutItemNode,
  LayoutItemNode,
} from "./nodes/LayoutItemNode";

import { INSERT_LAYOUT_COMMAND, UPDATE_LAYOUT_COMMAND, getItemsCountFromTemplate } from "./LayoutCommands";

import "../lexical-editor.css";

/* --------------------------------- Plugin ---------------------------------- */

export function LayoutPlugin() {
  const [editor] = useLexicalComposerContext();

  // Dropdown from surrounding editor UI
  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();

  const layoutDropdownId = "layout-dropdown";
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!editor.hasNodes([LayoutContainerNode, LayoutItemNode])) {
      throw new Error(
        "LayoutPlugin: LayoutContainerNode or LayoutItemNode not registered on editor"
      );
    }

    const $onEscape = (before: boolean) => {
      const selection = $getSelection();
      if (
        $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.offset === 0
      ) {
        const container = $findMatchingParent(
          selection.anchor.getNode(),
          $isLayoutContainerNode
        );

        if ($isLayoutContainerNode(container)) {
          const parent = container.getParent();
          const child =
            parent && (before ? parent.getFirstChild() : parent.getLastChild());
          const descendantKey = before
            ? container.getFirstDescendant()?.getKey()
            : container.getLastDescendant()?.getKey();

          if (
            parent !== null &&
            child === container &&
            selection.anchor.key === descendantKey
          ) {
            if (before) {
              container.insertBefore($createParagraphNode());
            } else {
              container.insertAfter($createParagraphNode());
            }
          }
        }
      }
      return false;
    };

    const $fillLayoutItemIfEmpty = (node: LayoutItemNode) => {
      if (node.isEmpty()) {
        node.append($createParagraphNode());
      }
    };

    const $removeIsolatedLayoutItem = (node: LayoutItemNode): boolean => {
      const parent = node.getParent();
      if (!$isLayoutContainerNode(parent)) {
        const children = node.getChildren();
        for (const child of children) {
          node.insertBefore(child);
        }
        node.remove();
        return true;
      }
      return false;
    };

    const $isContainerCompletelyEmpty = (container: LayoutContainerNode): boolean => {
      const children = container.getChildren();
      return children.every((child) => {
        if (!$isLayoutItemNode(child)) return false;
        return child.getTextContent().trim() === "";
      });
    };

    return mergeRegister(
      // Arrow navigation escaping container
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape(false),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        () => $onEscape(false),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape(true),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        () => $onEscape(true),
        COMMAND_PRIORITY_LOW
      ),

      // Backspace inside empty container removes it or moves caret
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchorNode = selection.anchor.getNode();
            const container = $findMatchingParent(anchorNode, $isLayoutContainerNode);

            if ($isLayoutContainerNode(container)) {
              if (container.isEmpty() || $isContainerCompletelyEmpty(container)) {
                container.remove();
                return true;
              }
              const prev = container.getPreviousSibling() as ElementNode | null;
              if (prev) {
                prev.selectEnd();
                return true;
              }
            }
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),

      // Delete inside empty container removes it or moves caret
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const anchorNode = selection.anchor.getNode();
            const container = $findMatchingParent(anchorNode, $isLayoutContainerNode);

            if ($isLayoutContainerNode(container)) {
              if (container.isEmpty() || $isContainerCompletelyEmpty(container)) {
                container.remove();
                return true;
              }
              const next = container.getNextSibling() as ElementNode | null;
              if (next) {
                next.selectStart();
                return true;
              }
            }
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),

      // Insert new layout container
      editor.registerCommand<string>(
        INSERT_LAYOUT_COMMAND,
        (template) => {
          editor.update(() => {
            const container = $createLayoutContainerNode(template);
            const itemsCount = getItemsCountFromTemplate(template);

            for (let i = 0; i < itemsCount; i++) {
              container.append(
                $createLayoutItemNode().append($createParagraphNode())
              );
            }

            $insertNodeToNearestRoot(container);
            container.selectStart();
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // Update existing layout container
      editor.registerCommand<{ template: string; nodeKey: string }>(
        UPDATE_LAYOUT_COMMAND,
        ({ template, nodeKey }) => {
          editor.update(() => {
            const container = $getNodeByKey(nodeKey);
            if (!$isLayoutContainerNode(container)) return;

            const itemsCount = getItemsCountFromTemplate(template);
            const prevItemsCount = getItemsCountFromTemplate(
              container.getTemplateColumns()
            );

            if (itemsCount > prevItemsCount) {
              for (let i = prevItemsCount; i < itemsCount; i++) {
                container.append(
                  $createLayoutItemNode().append($createParagraphNode())
                );
              }
            } else if (itemsCount < prevItemsCount) {
              for (let i = prevItemsCount - 1; i >= itemsCount; i--) {
                const layoutItem = container.getChildAtIndex(i);
                if ($isLayoutItemNode(layoutItem)) {
                  layoutItem.remove();
                }
              }
            }

            container.setTemplateColumns(template);
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // Enforce structure: LayoutItem must live in LayoutContainer and be non-empty
      editor.registerNodeTransform(LayoutItemNode, (node) => {
        const removed = $removeIsolatedLayoutItem(node);
        if (!removed) $fillLayoutItemIfEmpty(node);
      }),

      // Enforce container children are all LayoutItem; otherwise unwrap and remove
      editor.registerNodeTransform(LayoutContainerNode, (node) => {
        if (node instanceof LayoutContainerNode) {
          const children = node.getChildren();
          if (!children.every($isLayoutItemNode)) {
            for (const child of children) {
              node.insertBefore(child);
            }
            node.remove();
          } else if (node.isEmpty()) {
            node.remove();
          }
        }
      })
    );
  }, [editor]);

  /* ------------------------------ Dropdown UI ------------------------------ */

  const handleInsertLayout = (template: string) => {
    editor.dispatchCommand(INSERT_LAYOUT_COMMAND, template);
    closeDropdown();
  };

  const toggleDropdown = () => {
    if (activeDropdown === layoutDropdownId) {
      closeDropdown();
    } else {
      openDropdown(layoutDropdownId, buttonRef.current ?? undefined);
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Insert Layout"
        onClick={toggleDropdown}
        className="layout-toggle-button"
      >
        <LayoutIcon />
      </button>

      {activeDropdown === layoutDropdownId && (
        <div ref={dropdownRef as React.RefObject<HTMLDivElement>} className="layout-dropdown">
          <button
            type="button"
            onClick={() => handleInsertLayout("1fr 1fr")}
            className="layout-dropdown-item"
          >
            2 Columns (Equal Width)
          </button>
          <button
            type="button"
            onClick={() => handleInsertLayout("25% 75%")}
            className="layout-dropdown-item"
          >
            2 Columns (25% - 75%)
          </button>
          <button
            type="button"
            onClick={() => handleInsertLayout("1fr 1fr 1fr")}
            className="layout-dropdown-item"
          >
            3 Columns (Equal Width)
          </button>
          <button
            type="button"
            onClick={() => handleInsertLayout("25% 50% 25%")}
            className="layout-dropdown-item"
          >
            3 Columns (25% - 50% - 25%)
          </button>
          <button
            type="button"
            onClick={() => handleInsertLayout("1fr 1fr 1fr 1fr")}
            className="layout-dropdown-item"
          >
            4 Columns (Equal Width)
          </button>
        </div>
      )}
    </div>
  );
}









