import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $setSelection, type LexicalNode } from "lexical";
import { getSlideNodeSelectionKeys } from "./slides/slideSelectionUtils";

const DEFAULT_MOVE_STEP = 1;
const DEFAULT_MOVE_STEP_FAST = 10;
const DEFAULT_ROTATE_STEP = 5;
const DEFAULT_ROTATE_STEP_FAST = 15;

const SUPPORTED_NODE_TYPES = new Set([
  "picture-frame",
  "resizable-image",
  "image",
  "svg",
  "text-box",
]);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function nodeIsLocked(node: LexicalNode): boolean {
  const maybeLocked = node as unknown as { getLocked?: () => boolean };
  return typeof maybeLocked.getLocked === "function" ? Boolean(maybeLocked.getLocked()) : false;
}

function getStackablePosition(node: LexicalNode): { x: number; y: number } | null {
  const maybe = node as unknown as {
    getX?: () => number;
    getY?: () => number;
    getPosition?: () => { x: number; y: number };
  };
  if (typeof maybe.getPosition === "function") return maybe.getPosition();
  if (typeof maybe.getX === "function" && typeof maybe.getY === "function") {
    return { x: maybe.getX(), y: maybe.getY() };
  }
  return null;
}

function setStackablePosition(node: LexicalNode, x: number, y: number): void {
  const maybe = node as unknown as {
    setX?: (value: number) => void;
    setY?: (value: number) => void;
    setPosition?: (x: number, y: number) => void;
  };
  if (typeof maybe.setPosition === "function") {
    maybe.setPosition(x, y);
    return;
  }
  if (typeof maybe.setX === "function" && typeof maybe.setY === "function") {
    maybe.setX(x);
    maybe.setY(y);
  }
}

function getNodeRotation(node: LexicalNode): number | null {
  const maybe = node as unknown as { getRotation?: () => number };
  return typeof maybe.getRotation === "function" ? maybe.getRotation() : null;
}

function setNodeRotation(node: LexicalNode, rotation: number): void {
  const maybe = node as unknown as { setRotation?: (value: number) => void };
  if (typeof maybe.setRotation === "function") {
    maybe.setRotation(rotation);
  }
}

export default function SlidesObjectKeyboardShortcutsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;

      // Let slide-level z-order shortcuts (Ctrl/?[ and Ctrl/?]) bubble so SlideEditor can handle them.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const isBracketRight = event.key === "]" || event.code === "BracketRight";
        const isBracketLeft = event.key === "[" || event.code === "BracketLeft";
        if (isBracketRight || isBracketLeft) {
          return;
        }
      }

      const isArrow =
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown";

      const isDelete = event.key === "Delete" || event.key === "Backspace";

      const isRotateKey =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (event.key === "r" ||
          event.key === "R" ||
          event.key === "l" ||
          event.key === "L" ||
          event.key === "0");

      if (!isArrow && !isDelete && !isRotateKey) {
        return;
      }

      const selectedKeys = editor.getEditorState().read(() => getSlideNodeSelectionKeys());
      if (selectedKeys.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      editor.update(() => {
        const step = event.shiftKey ? DEFAULT_MOVE_STEP_FAST : DEFAULT_MOVE_STEP;
        const rotationStep = event.shiftKey ? DEFAULT_ROTATE_STEP_FAST : DEFAULT_ROTATE_STEP;

        if (isDelete) {
          let removedAny = false;
          for (const key of selectedKeys) {
            const node = $getNodeByKey<LexicalNode>(key);
            if (!node) continue;
            if (nodeIsLocked(node)) continue;
            if (!SUPPORTED_NODE_TYPES.has(node.getType())) continue;
            node.remove();
            removedAny = true;
          }
          if (removedAny) {
            $setSelection(null);
          }
          return;
        }

        if (isArrow) {
          let dx = 0;
          let dy = 0;
          switch (event.key) {
            case "ArrowLeft":
              dx = -step;
              break;
            case "ArrowRight":
              dx = step;
              break;
            case "ArrowUp":
              dy = -step;
              break;
            case "ArrowDown":
              dy = step;
              break;
          }

          for (const key of selectedKeys) {
            const node = $getNodeByKey<LexicalNode>(key);
            if (!node) continue;
            if (nodeIsLocked(node)) continue;
            if (!SUPPORTED_NODE_TYPES.has(node.getType())) continue;

            const pos = getStackablePosition(node);
            if (!pos) continue;
            setStackablePosition(node, pos.x + dx, pos.y + dy);
          }
          return;
        }

        if (isRotateKey) {
          // Avoid rotating multi-selection as a unit until we have group/selection pivot logic.
          if (selectedKeys.length !== 1) {
            return;
          }
          const key = selectedKeys[0];
          const node = $getNodeByKey<LexicalNode>(key);
          if (!node) return;
          if (nodeIsLocked(node)) return;
          if (!SUPPORTED_NODE_TYPES.has(node.getType())) return;

          const currentRotation = getNodeRotation(node);
          if (typeof currentRotation !== "number") return;

          switch (event.key) {
            case "r":
            case "R":
              setNodeRotation(node, currentRotation + rotationStep);
              break;
            case "l":
            case "L":
              setNodeRotation(node, currentRotation - rotationStep);
              break;
            case "0":
              setNodeRotation(node, 0);
              break;
          }
        }
      });
    };

    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
    };
  }, [editor]);

  return null;
}
