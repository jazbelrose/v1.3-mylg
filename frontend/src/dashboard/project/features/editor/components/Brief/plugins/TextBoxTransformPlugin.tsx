import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";

type MoveInteraction = {
  nodeKey: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const EDGE_THRESHOLD = 8; // px from edge that counts as "border"

function isOnBorder(textbox: HTMLElement, event: PointerEvent): boolean {
  const rect = textbox.getBoundingClientRect();
  const { clientX, clientY } = event;

  const onLeft = Math.abs(clientX - rect.left) <= EDGE_THRESHOLD;
  const onRight = Math.abs(clientX - rect.right) <= EDGE_THRESHOLD;
  const onTop = Math.abs(clientY - rect.top) <= EDGE_THRESHOLD;
  const onBottom = Math.abs(clientY - rect.bottom) <= EDGE_THRESHOLD;

  return onLeft || onRight || onTop || onBottom;
}

function isClickOnDragHandle(target: HTMLElement): boolean {
  return target.classList.contains("textbox-drag-handle");
}

export default function TextBoxTransformPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }

    let interaction: MoveInteraction | null = null;
    let hoverTextbox: HTMLElement | null = null;

    const clearHover = () => {
      if (hoverTextbox) {
        hoverTextbox.classList.remove("editor-textbox-border-hover");
        hoverTextbox = null;
      }
    };

    const onPointerMoveHover = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        clearHover();
        return;
      }

      const textbox = target.closest<HTMLElement>("[data-lexical-textbox]");
      if (!textbox) {
        clearHover();
        return;
      }

      // Show move cursor on border OR on drag handle
      if (isOnBorder(textbox, event) || isClickOnDragHandle(target)) {
        if (hoverTextbox !== textbox) {
          clearHover();
          hoverTextbox = textbox;
          hoverTextbox.classList.add("editor-textbox-border-hover");
        }
      } else {
        if (hoverTextbox === textbox) {
          clearHover();
        }
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const textbox = target.closest<HTMLElement>("[data-lexical-textbox]");
      if (!textbox) return;

      // Start dragging if on border OR on drag handle
      const shouldStartDrag = isOnBorder(textbox, event) || isClickOnDragHandle(target);
      
      if (!shouldStartDrag) {
        // Click inside -> normal text editing
        return;
      }

      const nodeKey = textbox.getAttribute("data-lexical-node-key");
      if (!nodeKey) return;

      let originX = 0;
      let originY = 0;

      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof TextBoxNode) {
          const { x, y } = node.getPosition();
          originX = x;
          originY = y;
        }
      });

      interaction = {
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        originX,
        originY,
      };

      (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMoveDrag = (event: PointerEvent) => {
      if (!interaction) {
        return;
      }

      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;

      const nextX = interaction.originX + dx;
      const nextY = interaction.originY + dy;

      editor.update(() => {
        const node = $getNodeByKey(interaction!.nodeKey);
        if (node instanceof TextBoxNode) {
          node.setPosition(nextX, nextY);
        }
      });
    };

    const onPointerUp = () => {
      interaction = null;
    };

    // Hover detection for cursor change
    root.addEventListener("pointermove", onPointerMoveHover);
    // Drag handling
    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMoveDrag);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      root.removeEventListener("pointermove", onPointerMoveHover);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMoveDrag);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      // cleanup hover class just in case
      if (hoverTextbox) {
        hoverTextbox.classList.remove("editor-textbox-border-hover");
      }
    };
  }, [editor]);

  return null;
}
