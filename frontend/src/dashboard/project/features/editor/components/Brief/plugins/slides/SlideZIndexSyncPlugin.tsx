import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type LexicalNode } from "lexical";
import { isSlideStackableNode } from "./slideStackingUtils";

const STACK_Z_INDEX_BASE = 10;

function collectStackableKeysInSubtree(node: LexicalNode, out: string[]): void {
  if (isSlideStackableNode(node)) {
    out.push(node.getKey());
  }

  const maybeChildren = (node as unknown as { getChildren?: () => LexicalNode[] }).getChildren;
  if (typeof maybeChildren !== "function") {
    return;
  }

  for (const child of maybeChildren.call(node)) {
    collectStackableKeysInSubtree(child, out);
  }
}

function isDebugEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("debugSlidesStacking") === "1";
  } catch {
    return false;
  }
}

function findNodeElementByKey(root: HTMLElement, key: string): HTMLElement | null {
  // Prefer the explicit hook we control across nodes.
  const selector = `[data-lexical-node-key="${CSS.escape(key)}"]`;
  return root.querySelector(selector);
}

export default function SlideZIndexSyncPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const apply = (editorState: { read: <T>(fn: () => T) => T }) => {
      const rootEl = editor.getRootElement();
      if (!rootEl) return;

      const orderedKeys: string[] = editorState.read(() => {
        const root = $getRoot();
        const ordered: string[] = [];
        for (const child of root.getChildren()) {
          collectStackableKeysInSubtree(child, ordered);
        }
        return ordered;
      });

      const debug = isDebugEnabled();
      let missing = 0;

      for (let i = 0; i < orderedKeys.length; i++) {
        const key = orderedKeys[i];
        const el = findNodeElementByKey(rootEl, key);
        if (!el) {
          missing++;
          continue;
        }
        el.style.zIndex = String(STACK_Z_INDEX_BASE + i);
      }

      if (debug) {
        // eslint-disable-next-line no-console
        console.log("[slides stacking] z-index sync", { count: orderedKeys.length, missing });
      }
    };

    apply(editor.getEditorState());

    return editor.registerUpdateListener(({ editorState }) => {
      apply(editorState);
    });
  }, [editor]);

  return null;
}
