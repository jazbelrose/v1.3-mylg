import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isNodeSelection, REDO_COMMAND, UNDO_COMMAND } from "lexical";

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

      const root = editor.getRootElement();

      if (isEditableLikeTarget(event.target) && root && !root.contains(event.target as Node)) {
        return;
      }

      let shouldHandle = false;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        shouldHandle = $isNodeSelection(selection);
      });

      if (!shouldHandle) return;

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

