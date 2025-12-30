import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { REDO_COMMAND, UNDO_COMMAND } from "lexical";

function isEditableLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}

export default function SlidesUndoHotkeysPlugin({
  enabled = true,
}: {
  enabled?: boolean;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;

    const onKeyDownCapture = (event: KeyboardEvent): void => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      if (!isCtrlOrCmd || event.altKey) return;

      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!isUndo && !isRedo) return;

      if (!editor.isEditable()) return;

      const root = editor.getRootElement();
      if (!root) return;

      // Don't steal undo from form controls / rich editors outside the slide editor.
      if (isEditableLikeTarget(event.target) && !root.contains(event.target as Node)) {
        return;
      }

      // Only handle when the slide editor is actually the active context.
      const targetNode = event.target instanceof Node ? event.target : null;
      const activeEl = document.activeElement;
      const isInEditorContext =
        (targetNode ? root.contains(targetNode) : false) ||
        (activeEl instanceof Node ? root.contains(activeEl) : false);
      if (!isInEditorContext) return;

      event.preventDefault();
      event.stopPropagation();
      editor.dispatchCommand(isUndo ? UNDO_COMMAND : REDO_COMMAND, undefined);
    };

    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => {
      window.removeEventListener("keydown", onKeyDownCapture, true);
    };
  }, [editor, enabled]);

  return null;
}

