import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $getSelection, $isNodeSelection } from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";

const TEXTBOX_TYPE = "text-box";

export default function TextBoxKeyboardShortcutsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();

    const getSelectedTextBoxKey = (): string | null => {
      const keyFromNodeSelection = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          const node = selection
            .getNodes()
            .find((n) => n.getType && n.getType() === TEXTBOX_TYPE);
          return node?.getKey() ?? null;
        }
        return null;
      });

      if (keyFromNodeSelection) {
        return keyFromNodeSelection;
      }

      const container: ParentNode | null = root ?? document;
      const el = container?.querySelector<HTMLElement>(
        `[data-lexical-textbox].editor-textbox-selected`
      );
      return el?.getAttribute("data-lexical-node-key") ?? null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = getSelectedTextBoxKey();
      if (!key) return;

      const isArrow =
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown";

      const isRotateKey =
        (e.ctrlKey || e.metaKey) &&
        (e.key === "r" ||
          e.key === "R" ||
          e.key === "l" ||
          e.key === "L" ||
          e.key === "0");

      const isDelete = e.key === "Delete" || e.key === "Backspace";

      if (!isArrow && !isRotateKey && !isDelete) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      editor.update(() => {
        const node = $getNodeByKey<TextBoxNode>(key);
        if (!node || !(node instanceof TextBoxNode)) {
          return;
        }

        const step = e.shiftKey ? 10 : 1;
        const rotationStep = e.shiftKey ? 15 : 5;

        if (isDelete) {
          node.remove();
          return;
        }

        if (isArrow) {
          const { x, y } = node.getPosition();
          switch (e.key) {
            case "ArrowLeft":
              node.setPosition(x - step, y);
              break;
            case "ArrowRight":
              node.setPosition(x + step, y);
              break;
            case "ArrowUp":
              node.setPosition(x, y - step);
              break;
            case "ArrowDown":
              node.setPosition(x, y + step);
              break;
          }
          return;
        }

        if (isRotateKey && (e.ctrlKey || e.metaKey)) {
          const currentRotation = node.getRotation();

          switch (e.key) {
            case "r":
            case "R":
              node.setRotation(currentRotation + rotationStep);
              break;
            case "l":
            case "L":
              node.setRotation(currentRotation - rotationStep);
              break;
            case "0":
              node.setRotation(0);
              break;
          }
        }
      });
    };

    if (root) {
      root.addEventListener("keydown", handleKeyDown, true);
    } else {
      window.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      if (root) {
        root.removeEventListener("keydown", handleKeyDown, true);
      } else {
        window.removeEventListener("keydown", handleKeyDown, true);
      }
    };
  }, [editor]);

  return null;
}

