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

export default function TextBoxTransformPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }

    let interaction: MoveInteraction | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Only start dragging if you grabbed the drag handle
      const dragHandle = target.closest<HTMLElement>(".textbox-drag-handle");
      if (!dragHandle) return;

      const textbox = dragHandle.closest<HTMLElement>("[data-lexical-textbox]");
      if (!textbox) return;

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

    const onPointerMove = (event: PointerEvent) => {
      if (!interaction) return;

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

    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [editor]);

  return null;
}
