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
  COMMAND_PRIORITY_LOW,
  $setSelection,
} from "lexical";
import { $isTextBoxNode } from "./nodes/TextBoxNode";

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

    // Handle clicks on empty canvas to deselect
    const unregisterClick = editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        
        // Check if clicking on the canvas background (not a node)
        // The editor-input is the contentEditable area
        const isCanvasBackground = 
          target.classList.contains('editor-input') ||
          target.classList.contains('slide-editor__canvas-inner') ||
          target.classList.contains('slide-editor__slide-frame');

        if (isCanvasBackground) {
          // Clear selection when clicking empty canvas
          editor.update(() => {
            const selection = $getSelection();
            if (selection) {
              $setSelection(null);
            }
          });
          // Don't prevent default - let click propagate
          return false;
        }

        return false; // Let other handlers process the click
      },
      COMMAND_PRIORITY_LOW // Use low priority so node-specific handlers run first
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

    return () => {
      unregisterClick();
      unregisterEnter();
      unregisterParagraph();
      unregisterTab();
      unregisterInsertText();
      unregisterPaste();
    };
  }, [editor]);

  return null;
}
