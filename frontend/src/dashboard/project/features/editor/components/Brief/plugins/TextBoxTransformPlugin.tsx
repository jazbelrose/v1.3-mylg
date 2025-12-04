import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";

type InteractionType = "move" | "resize-left" | "resize-right" | "resize-top" | "resize-bottom" 
  | "resize-top-left" | "resize-top-right" | "resize-bottom-left" | "resize-bottom-right";

type Interaction = {
  type: InteractionType;
  nodeKey: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
};

const EDGE_THRESHOLD = 8; // px from edge that counts as "border"
const CORNER_SIZE = 16; // px for corner resize zones

function getInteractionType(textbox: HTMLElement, event: PointerEvent, forceMove = false): InteractionType | null {
  const rect = textbox.getBoundingClientRect();
  const { clientX, clientY } = event;

  // If Shift is held, force move mode
  if (forceMove || event.shiftKey) {
    return "move";
  }

  const onLeft = Math.abs(clientX - rect.left) <= EDGE_THRESHOLD;
  const onRight = Math.abs(clientX - rect.right) <= EDGE_THRESHOLD;
  const onTop = Math.abs(clientY - rect.top) <= EDGE_THRESHOLD;
  const onBottom = Math.abs(clientY - rect.bottom) <= EDGE_THRESHOLD;

  // Check corners first (higher priority)
  const inTopLeftCorner = clientX - rect.left <= CORNER_SIZE && clientY - rect.top <= CORNER_SIZE;
  const inTopRightCorner = rect.right - clientX <= CORNER_SIZE && clientY - rect.top <= CORNER_SIZE;
  const inBottomLeftCorner = clientX - rect.left <= CORNER_SIZE && rect.bottom - clientY <= CORNER_SIZE;
  const inBottomRightCorner = rect.right - clientX <= CORNER_SIZE && rect.bottom - clientY <= CORNER_SIZE;

  if (inTopLeftCorner) return "resize-top-left";
  if (inTopRightCorner) return "resize-top-right";
  if (inBottomLeftCorner) return "resize-bottom-left";
  if (inBottomRightCorner) return "resize-bottom-right";

  // Then check edges
  if (onLeft) return "resize-left";
  if (onRight) return "resize-right";
  if (onTop) return "resize-top";
  if (onBottom) return "resize-bottom";

  return null;
}

function getCursorForInteraction(type: InteractionType | null): string {
  if (!type) return "text";
  
  switch (type) {
    case "move": return "move";
    case "resize-left":
    case "resize-right": return "ew-resize";
    case "resize-top":
    case "resize-bottom": return "ns-resize";
    case "resize-top-left":
    case "resize-bottom-right": return "nwse-resize";
    case "resize-top-right":
    case "resize-bottom-left": return "nesw-resize";
    default: return "text";
  }
}

export default function TextBoxTransformPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }

    let interaction: Interaction | null = null;
    let hoverTextbox: HTMLElement | null = null;

    const clearHover = () => {
      if (hoverTextbox) {
        hoverTextbox.style.cursor = "";
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

      const interactionType = getInteractionType(textbox, event);
      if (interactionType) {
        if (hoverTextbox !== textbox) {
          clearHover();
          hoverTextbox = textbox;
        }
        hoverTextbox.style.cursor = getCursorForInteraction(interactionType);
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

      const interactionType = getInteractionType(textbox, event);
      if (!interactionType) {
        // Click inside -> normal text editing
        return;
      }

      const nodeKey = textbox.getAttribute("data-lexical-node-key");
      if (!nodeKey) return;

      let originX = 0;
      let originY = 0;
      let originWidth = 0;
      let originHeight = 0;

      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof TextBoxNode) {
          const { x, y } = node.getPosition();
          const { width, height } = node.getSize();
          originX = x;
          originY = y;
          originWidth = width;
          originHeight = height;
        }
      });

      interaction = {
        type: interactionType,
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        originX,
        originY,
        originWidth,
        originHeight,
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

      editor.update(() => {
        const node = $getNodeByKey(interaction!.nodeKey);
        if (!(node instanceof TextBoxNode)) return;

        let newX = interaction!.originX;
        let newY = interaction!.originY;
        let newWidth = interaction!.originWidth;
        let newHeight = interaction!.originHeight;

        switch (interaction!.type) {
          case "move":
            newX = interaction!.originX + dx;
            newY = interaction!.originY + dy;
            break;
          case "resize-left":
            newX = interaction!.originX + dx;
            newWidth = interaction!.originWidth - dx;
            break;
          case "resize-right":
            newWidth = interaction!.originWidth + dx;
            break;
          case "resize-top":
            newY = interaction!.originY + dy;
            newHeight = interaction!.originHeight - dy;
            break;
          case "resize-bottom":
            newHeight = interaction!.originHeight + dy;
            break;
          case "resize-top-left":
            newX = interaction!.originX + dx;
            newY = interaction!.originY + dy;
            newWidth = interaction!.originWidth - dx;
            newHeight = interaction!.originHeight - dy;
            break;
          case "resize-top-right":
            newY = interaction!.originY + dy;
            newWidth = interaction!.originWidth + dx;
            newHeight = interaction!.originHeight - dy;
            break;
          case "resize-bottom-left":
            newX = interaction!.originX + dx;
            newWidth = interaction!.originWidth - dx;
            newHeight = interaction!.originHeight + dy;
            break;
          case "resize-bottom-right":
            newWidth = interaction!.originWidth + dx;
            newHeight = interaction!.originHeight + dy;
            break;
        }

        // Enforce minimum size for resize operations
        if (interaction!.type !== "move") {
          const MIN_SIZE = 50;
          if (newWidth < MIN_SIZE || newHeight < MIN_SIZE) {
            return;
          }
        }

        node.setPosition(newX, newY);
        node.setSize(newWidth, newHeight);
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
