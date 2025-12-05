import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
} from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";

type InteractionType = "move" | "resize-left" | "resize-right" | "resize-top" | "resize-bottom" | "resize-bottom-right" | "rotate";

type Interaction = {
  type: InteractionType;
  nodeKey: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  originRotation: number;
  startAngle: number;
  centerX: number;
  centerY: number;
};

const EDGE_THRESHOLD = 8; // px from edge that counts as "border"
const RESIZE_HANDLE_OFFSET = 20; // px from corners where center handles are
const TEXTBOX_TYPE = "text-box";

function getInteractionType(textbox: HTMLElement, event: PointerEvent, forceMove = false): InteractionType | null {
  const target = event.target as HTMLElement;
  const rect = textbox.getBoundingClientRect();
  const { clientX, clientY } = event;

  if (forceMove) {
    return "move";
  }

  if (target.classList.contains("textbox-move-handle")) {
    return "move";
  }

  if (target.classList.contains("textbox-rotate-handle")) {
    return "rotate";
  }

  // Check if clicking directly on a resize handle element
  if (target.classList.contains("textbox-resize-handle")) {
    if (target.classList.contains("textbox-resize-handle-top")) return "resize-top";
    if (target.classList.contains("textbox-resize-handle-bottom")) return "resize-bottom";
    if (target.classList.contains("textbox-resize-handle-left")) return "resize-left";
    if (target.classList.contains("textbox-resize-handle-right")) return "resize-right";
    if (target.classList.contains("textbox-resize-handle-bottom-right")) return "resize-bottom-right";
  }

  const onLeftEdge = Math.abs(clientX - rect.left) <= EDGE_THRESHOLD;
  const onRightEdge = Math.abs(clientX - rect.right) <= EDGE_THRESHOLD;
  const onTopEdge = Math.abs(clientY - rect.top) <= EDGE_THRESHOLD;
  const onBottomEdge = Math.abs(clientY - rect.bottom) <= EDGE_THRESHOLD;

  // Calculate center positions for resize handles
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Check for resize handles at center of each edge
  const onTopCenterHandle = onTopEdge && Math.abs(clientX - centerX) <= RESIZE_HANDLE_OFFSET;
  const onBottomCenterHandle = onBottomEdge && Math.abs(clientX - centerX) <= RESIZE_HANDLE_OFFSET;
  const onLeftCenterHandle = onLeftEdge && Math.abs(clientY - centerY) <= RESIZE_HANDLE_OFFSET;
  const onRightCenterHandle = onRightEdge && Math.abs(clientY - centerY) <= RESIZE_HANDLE_OFFSET;
  
  // Check for bottom-right corner resize handle
  const inBottomRightCorner = 
    rect.right - clientX <= RESIZE_HANDLE_OFFSET && 
    rect.bottom - clientY <= RESIZE_HANDLE_OFFSET;

  // Priority: specific resize handles first
  if (onTopCenterHandle) return "resize-top";
  if (onBottomCenterHandle) return "resize-bottom";
  if (onLeftCenterHandle) return "resize-left";
  if (onRightCenterHandle) return "resize-right";
  if (inBottomRightCorner) return "resize-bottom-right";

  // If on any edge but not on a resize handle, it's a move
  if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
    return "move";
  }

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
    case "resize-bottom-right": return "nwse-resize";
    case "rotate": return "grab";
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
    let selectedTextbox: HTMLElement | null = null;

    const setSelected = (textbox: HTMLElement | null) => {
      if (selectedTextbox && selectedTextbox !== textbox) {
        selectedTextbox.classList.remove("editor-textbox-selected");
      }
      selectedTextbox = textbox;
      if (selectedTextbox) {
        selectedTextbox.classList.add("editor-textbox-selected");
      }
    };

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
      if (!textbox) {
        setSelected(null);
        // Only clear Lexical selection if the current node selection is a textbox
        editor.update(() => {
          const selection = $getSelection();
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes();
            const allTextboxes = nodes.length > 0 && nodes.every((n) => n.getType && n.getType() === TEXTBOX_TYPE);
            if (allTextboxes) {
              $setSelection(null);
            }
          }
        });
        return;
      }

      setSelected(textbox);
      editor.focus();

      const interactionType = getInteractionType(textbox, event);
      if (!interactionType) {
        // Click inside -> normal text editing
        return;
      }

      const nodeKey = textbox.getAttribute("data-lexical-node-key");
      if (!nodeKey) return;

      // Sync visual selection with Lexical node selection for object interactions
      editor.update(() => {
        const selection = $createNodeSelection();
        selection.add(nodeKey);
        $setSelection(selection);
      });
      editor.focus();

      let originX = 0;
      let originY = 0;
      let originWidth = 0;
      let originHeight = 0;
      let originRotation = 0;

      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof TextBoxNode) {
          const { x, y } = node.getPosition();
          const { width, height } = node.getSize();
          originRotation = node.getRotation();
          originX = x;
          originY = y;
          originWidth = width;
          originHeight = height;
        }
      });

      const rect = textbox.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);

      interaction = {
        type: interactionType,
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        originX,
        originY,
        originWidth,
        originHeight,
        originRotation,
        startAngle,
        centerX,
        centerY,
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
          case "resize-bottom-right":
            newWidth = interaction!.originWidth + dx;
            newHeight = interaction!.originHeight + dy;
            break;
          case "rotate": {
            const currentAngle = Math.atan2(
              event.clientY - interaction!.centerY,
              event.clientX - interaction!.centerX
            );
            const deltaRad = currentAngle - interaction!.startAngle;
            const deltaDeg = (deltaRad * 180) / Math.PI;
            const nextRotation = interaction!.originRotation + deltaDeg;
            node.setRotation(nextRotation);
            return;
          }
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const root = editor.getRootElement();
      const el = root?.querySelector<HTMLElement>(
        `[data-lexical-textbox].editor-textbox-selected`
      );
      const key = el?.getAttribute("data-lexical-node-key");
      if (!key) return;

      e.preventDefault();
      e.stopPropagation();

      editor.update(() => {
        const node = $getNodeByKey(key);
        if (node && node.getType && node.getType() === TEXTBOX_TYPE) {
          node.remove();
        }
      });
    };

    // Hover detection for cursor change
    root.addEventListener("pointermove", onPointerMoveHover);
    // Drag handling
    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMoveDrag);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      root.removeEventListener("pointermove", onPointerMoveHover);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMoveDrag);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      // cleanup hover class just in case
      if (hoverTextbox) {
        hoverTextbox.classList.remove("editor-textbox-border-hover");
      }
      setSelected(null);
    };
  }, [editor]);

  return null;
}
