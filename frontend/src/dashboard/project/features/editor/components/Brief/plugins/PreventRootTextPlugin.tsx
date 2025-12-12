import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  PASTE_COMMAND,
  KEY_TAB_COMMAND,
  $getSelection,
  $isRangeSelection,
  $isNodeSelection,
  type LexicalNode,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CLICK_COMMAND,
  $setSelection,
  $createNodeSelection,
  $getNodeByKey,
} from "lexical";
import { $isTextBoxNode } from "./nodes/TextBoxNode";
import { applyModifierNodeSelection } from "./slides/slideSelectionUtils";
import { getInteractionType } from "./TextBoxTransformPlugin";

const TEXTBOX_TYPE = "text-box";

/**
 * PreventRootTextPlugin - Blocks typing/pasting text at the root level in slides mode
 * 
 * When enabled, this plugin prevents users from inserting text directly on the slide canvas
 * (outside textboxes) while preserving full editing capabilities inside TextBoxNodes.
 * 
 * Acceptance criteria:
 * - Clicking empty slide area -> typing/paste/enter does nothing (no root text)
 * - TextBoxes remain fully editable (typing, paste, enter, undo/redo)
 * - Images can be inserted/selected outside textboxes
 * - Clicking empty area deselects current node/selection
 * - No regressions to paste, undo, or other slide-level commands
 */
export default function PreventRootTextPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    /**
     * Check if the current selection is inside a TextBoxNode.
     * If inside a textbox, allow the operation; otherwise block it.
     */
    const isInsideTextBox = (): boolean => {
      const selection = $getSelection();
      
      // Node selections (e.g., selected image or textbox) should not create text
      if ($isNodeSelection(selection)) {
        return false;
      }

      // Check if range selection is inside a textbox
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        
        // Walk up the tree to check if any ancestor is a TextBoxNode
        let currentNode: LexicalNode | null = anchorNode;
        while (currentNode) {
          if ($isTextBoxNode(currentNode)) {
            return true;
          }
          currentNode = currentNode.getParent();
        }
      }

      return false;
    };

    const clearSelectionAndBlur = (): void => {
      let shouldBlur = false;
      
      editor.update(() => {
        const selection = $getSelection();
        // Only clear RangeSelection, preserve NodeSelection for textboxes
        if (selection && $isRangeSelection(selection)) {
          $setSelection(null);
          shouldBlur = true;
        }
      });

      // Only blur if we actually cleared a RangeSelection
      // Don't blur if there's a NodeSelection (for textboxes)
      if (shouldBlur) {
        const root = editor.getRootElement();
        if (root && document.activeElement === root) {
          root.blur();
        }
      }
    };

    const isCanvasBackgroundTarget = (
      target: EventTarget | null,
      rootElement: HTMLElement
    ): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      // Never treat anything inside a textbox as background.
      if (target.closest('[data-lexical-textbox]')) {
        return false;
      }

      // Background click = directly on the editor root OR known canvas wrapper elements.
      return (
        target === rootElement ||
        target.classList.contains("slide-editor__canvas-inner") ||
        target.classList.contains("slide-editor__slide-frame")
      );
    };

    const pointerEventName: "pointerdown" | "mousedown" =
      typeof window !== "undefined" && "PointerEvent" in window ? "pointerdown" : "mousedown";

    let detachBackgroundGuards: (() => void) | null = null;

    const unregisterRootListener = editor.registerRootListener((rootElement) => {
      if (detachBackgroundGuards) {
        detachBackgroundGuards();
        detachBackgroundGuards = null;
      }

      if (!rootElement) {
        return;
      }

      const handleBackgroundPointerDown = (event: MouseEvent | PointerEvent): void => {
        if ("button" in event && event.button !== 0) {
          return;
        }

        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        if (!isCanvasBackgroundTarget(event.target, rootElement)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearSelectionAndBlur();
      };

      rootElement.addEventListener(
        pointerEventName,
        handleBackgroundPointerDown as EventListener,
        true
      );

      detachBackgroundGuards = () => {
        rootElement.removeEventListener(
          pointerEventName,
          handleBackgroundPointerDown as EventListener,
          true
        );
      };
    });

    // Handle clicks on empty canvas to deselect + avoid caret, or select textbox on border/handle
    const unregisterClick = editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        const target = event.target;

        if (event.button !== 0) {
          return false;
        }

        const rootEl = editor.getRootElement();
        if (rootEl && isCanvasBackgroundTarget(target, rootEl)) {
          event.preventDefault();
          event.stopPropagation();
          clearSelectionAndBlur();
          return true;
        }

        if (!(target instanceof HTMLElement)) {
          return false;
        }

        const htmlTarget = target as HTMLElement;

        // Check if clicking on textbox or its handles
        const textboxElement = htmlTarget.closest('[data-lexical-textbox]');
        if (textboxElement) {
          const interactionType = getInteractionType(textboxElement as HTMLElement, event);
          if (interactionType !== null) {
            const nodeKey = textboxElement.getAttribute('data-lexical-node-key');
            if (nodeKey) {
              editor.update(() => {
                applyModifierNodeSelection(nodeKey, event);
              });
              event.preventDefault();
              event.stopPropagation();
              return true;
            }
          } else {
            // Click inside content area: allow default range selection/editing
            return false;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    // Block ENTER key at root level
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        let shouldBlock = false;
        
        editor.getEditorState().read(() => {
          if (!isInsideTextBox()) {
            shouldBlock = true;
          }
        });

        if (shouldBlock) {
          event?.preventDefault();
          event?.stopPropagation();
          return true; // Command handled, stop propagation
        }

        return false; // Let default behavior proceed
      },
      COMMAND_PRIORITY_CRITICAL
    );

    // Block INSERT_PARAGRAPH_COMMAND at root level
    const unregisterParagraph = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        let shouldBlock = false;
        
        editor.getEditorState().read(() => {
          if (!isInsideTextBox()) {
            shouldBlock = true;
          }
        });

        if (shouldBlock) {
          return true; // Command handled, stop propagation
        }

        return false; // Let default behavior proceed
      },
      COMMAND_PRIORITY_CRITICAL
    );

    // Block TAB key at root level
    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        let shouldBlock = false;
        
        editor.getEditorState().read(() => {
          if (!isInsideTextBox()) {
            shouldBlock = true;
          }
        });

        if (shouldBlock) {
          event.preventDefault();
          event.stopPropagation();
          return true; // Command handled, stop propagation
        }

        return false; // Let default behavior proceed
      },
      COMMAND_PRIORITY_CRITICAL
    );

    // Block text insertion at root level
    const unregisterInsertText = editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      () => {
        let shouldBlock = false;
        
        editor.getEditorState().read(() => {
          if (!isInsideTextBox()) {
            shouldBlock = true;
          }
        });

        if (shouldBlock) {
          return true; // Command handled, stop propagation
        }

        return false; // Let default behavior proceed
      },
      COMMAND_PRIORITY_CRITICAL
    );

    // Block paste at root level (but allow image paste via ImageCopyPastePlugin)
    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        let shouldBlock = false;
        
        editor.getEditorState().read(() => {
          // Allow paste if inside textbox
          if (isInsideTextBox()) {
            return;
          }

          // Check if paste contains text or non-image content
          const clipboardData = event.clipboardData;
          if (clipboardData) {
            // Check for image data in custom MIME type (from ImageCopyPastePlugin)
            const hasCustomImageData = clipboardData.types.includes('application/x-lexical-image');
            
            // If it's our custom image data, let ImageCopyPastePlugin handle it
            if (hasCustomImageData) {
              return;
            }

            const items = Array.from(clipboardData.items);
            const hasOnlyImages = items.length > 0 && items.every(item => item.type.startsWith('image/'));
            
            // Block if there's any text or mixed content at root level
            // Allow only pure image pastes (handled by ImageCopyPastePlugin)
            if (!hasOnlyImages) {
              shouldBlock = true;
            }
          }
        });

        if (shouldBlock) {
          event.preventDefault();
          event.stopPropagation();
          return true; // Command handled, stop propagation
        }

        return false; // Let other plugins handle it
      },
      COMMAND_PRIORITY_CRITICAL
    );

    let isCleaning = false;

    const unregisterUpdate = editor.registerUpdateListener(() => {
      if (isCleaning) {
        return;
      }

      editor.getEditorState().read(() => {
        const selection = $getSelection();

        if ($isRangeSelection(selection) && selection.anchor.getNode() && !isInsideTextBox()) {
          isCleaning = true;

          clearSelectionAndBlur();

          isCleaning = false;
        }
      });
    });

    const onDeleteKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const root = editor.getRootElement();
      const els = root?.querySelectorAll<HTMLElement>(
        `[data-lexical-textbox].editor-textbox-selected`
      );
      const keys: string[] = [];
      els?.forEach((el) => {
        const key = el.getAttribute("data-lexical-node-key");
        if (key) keys.push(key);
      });

      if (keys.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      editor.update(() => {
        keys.forEach((key) => {
          const node = $getNodeByKey(key);
          if (node && node.getType && node.getType() === TEXTBOX_TYPE) {
            node.remove();
          }
        });
        $setSelection(null);
      });
    };

    window.addEventListener("keydown", onDeleteKeyDown);

    return () => {
      unregisterClick();
      unregisterEnter();
      unregisterParagraph();
      unregisterTab();
      unregisterInsertText();
      unregisterPaste();
      unregisterUpdate();
      if (detachBackgroundGuards) {
        detachBackgroundGuards();
      }
      unregisterRootListener();
      window.removeEventListener("keydown", onDeleteKeyDown);
    };
  }, [editor]);

  return null;
}
