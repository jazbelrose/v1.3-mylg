import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $setSelection } from "lexical";

export default function ClickAwayDeselectPlugin({ enabled = true }: { enabled?: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;

    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot) {
        prevRoot.removeEventListener("pointerdown", onPointerDownCapture, true);
      }
      if (!root) return;

      root.addEventListener("pointerdown", onPointerDownCapture, true);

      function onPointerDownCapture(e: PointerEvent) {
        if (e.button !== 0) return; // left click only
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Only clear when the click lands on the root editable surface itself
        // (i.e., blank canvas, not an element/node)
        if (target !== root) return;

        e.preventDefault(); // prevents caret
        editor.update(() => {
          const selection = $getSelection();
          if (selection) $setSelection(null);
        });
      }

      return () => {
        root.removeEventListener("pointerdown", onPointerDownCapture, true);
      };
    });
  }, [editor, enabled]);

  return null;
}