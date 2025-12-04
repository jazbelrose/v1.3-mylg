import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";

type ResizeHandle = "nw" | "ne" | "se" | "sw";

const MIN_WIDTH = 160;
const MIN_HEIGHT = 80;

export default function TextBoxTransformPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    const parent = root?.parentElement;

    if (!root || !parent) {
      return;
    }

    const overlayRoot = document.createElement("div");
    overlayRoot.className = "textbox-overlay-layer";
    overlayRoot.setAttribute("data-textbox-overlay-root", "true");
    overlayRoot.style.position = "absolute";
    overlayRoot.style.inset = "0";
    overlayRoot.style.pointerEvents = "none";
    overlayRoot.style.zIndex = "5";
    parent.appendChild(overlayRoot);

    const overlayMap = new Map<string, HTMLDivElement>();

    type MoveInteraction = {
      type: "move";
      nodeKey: string;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      overlay: HTMLDivElement;
      scale: number;
    };

    type ResizeInteraction = {
      type: "resize";
      nodeKey: string;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      originWidth: number;
      originHeight: number;
      handle: ResizeHandle;
      overlay: HTMLDivElement;
      scale: number;
    };

    type Interaction = MoveInteraction | ResizeInteraction;

    let interaction: Interaction | null = null;

    const removeOverlay = (key: string) => {
      const overlay = overlayMap.get(key);
      if (overlay) {
        overlay.remove();
        overlayMap.delete(key);
      }
    };

    const getScale = (): number => {
      if (!root) {
        return 1;
      }
      const rect = root.getBoundingClientRect();
      const layoutWidth = root.offsetWidth || rect.width;
      if (!layoutWidth) {
        return 1;
      }
      const scale = rect.width / layoutWidth;
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    };

    const getPaddingOffset = (): { left: number; top: number } => {
      if (!root) {
        return { left: 0, top: 0 };
      }
      const styles = window.getComputedStyle(root);
      const left = parseFloat(styles.paddingLeft || "0");
      const top = parseFloat(styles.paddingTop || "0");
      return {
        left: Number.isFinite(left) ? left : 0,
        top: Number.isFinite(top) ? top : 0,
      };
    };

    const applyOverlayPosition = (
      nodeKey: string,
      overlay: HTMLDivElement
    ): void => {
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey);
        if (!(node instanceof TextBoxNode)) {
          return;
        }
        const { x, y } = node.getPosition();
        const { width, height } = node.getSize();
        const { left, top } = getPaddingOffset();
        overlay.style.transform = `translate(${left + x}px, ${top + y}px)`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
      });
    };

    const syncOverlays = (): void => {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }

      const domTextBoxes = Array.from(
        rootElement.querySelectorAll<HTMLElement>("[data-lexical-textbox]")
      );
      const seen = new Set<string>();

      domTextBoxes.forEach((el) => {
        const nodeKey = el.getAttribute("data-lexical-node-key");
        if (!nodeKey) {
          return;
        }
        seen.add(nodeKey);
        const overlay = ensureOverlay(nodeKey);
        applyOverlayPosition(nodeKey, overlay);
      });

      overlayMap.forEach((_value, key) => {
        if (!seen.has(key)) {
          removeOverlay(key);
        }
      });
    };

    const startMove = (
      nodeKey: string,
      overlay: HTMLDivElement,
      event: PointerEvent
    ): void => {
      event.preventDefault();
      event.stopPropagation();

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
        type: "move",
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        originX,
        originY,
        overlay,
        scale: getScale(),
      };

      (event.target as HTMLElement | null)?.setPointerCapture?.(
        event.pointerId
      );
    };

    const startResize = (
      nodeKey: string,
      overlay: HTMLDivElement,
      handle: ResizeHandle,
      event: PointerEvent
    ): void => {
      event.preventDefault();
      event.stopPropagation();

      let originX = 0;
      let originY = 0;
      let originWidth = MIN_WIDTH;
      let originHeight = MIN_HEIGHT;

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
        type: "resize",
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        originX,
        originY,
        originWidth,
        originHeight,
        handle,
        overlay,
        scale: getScale(),
      };

      (event.target as HTMLElement | null)?.setPointerCapture?.(
        event.pointerId
      );
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (!interaction) {
        return;
      }

      const dx = (event.clientX - interaction.startX) / interaction.scale;
      const dy = (event.clientY - interaction.startY) / interaction.scale;

      if (interaction.type === "move") {
        const nextX = Math.max(0, interaction.originX + dx);
        const nextY = Math.max(0, interaction.originY + dy);
        const { left, top } = getPaddingOffset();
        interaction.overlay.style.transform = `translate(${left + nextX}px, ${top + nextY}px)`;

        editor.update(() => {
          const node = $getNodeByKey(interaction.nodeKey);
          if (node instanceof TextBoxNode) {
            node.setPosition(nextX, nextY);
          }
        });
        return;
      }

      const { handle } = interaction;
      let nextX = interaction.originX;
      let nextY = interaction.originY;
      let nextWidth = interaction.originWidth;
      let nextHeight = interaction.originHeight;

      if (handle.includes("e")) {
        nextWidth = Math.max(MIN_WIDTH, interaction.originWidth + dx);
      }
      if (handle.includes("s")) {
        nextHeight = Math.max(MIN_HEIGHT, interaction.originHeight + dy);
      }
      if (handle.includes("w")) {
        nextWidth = Math.max(MIN_WIDTH, interaction.originWidth - dx);
        nextX = interaction.originX + (interaction.originWidth - nextWidth);
      }
      if (handle.includes("n")) {
        nextHeight = Math.max(MIN_HEIGHT, interaction.originHeight - dy);
        nextY = interaction.originY + (interaction.originHeight - nextHeight);
      }

      const { left, top } = getPaddingOffset();
      interaction.overlay.style.transform = `translate(${left + nextX}px, ${top + nextY}px)`;
      interaction.overlay.style.width = `${nextWidth}px`;
      interaction.overlay.style.height = `${nextHeight}px`;

      editor.update(() => {
        const node = $getNodeByKey(interaction.nodeKey);
        if (node instanceof TextBoxNode) {
          node.setPosition(nextX, nextY);
          node.setSize(nextWidth, nextHeight);
        }
      });
    };

    const handlePointerUp = (): void => {
      interaction = null;
    };

    const createResizeHandle = (
      nodeKey: string,
      overlay: HTMLDivElement,
      handle: ResizeHandle
    ): HTMLDivElement => {
      const resizeHandle = document.createElement("div");
      resizeHandle.className = `textbox-overlay__resize-handle textbox-overlay__resize-handle--${handle}`;
      resizeHandle.dataset.textboxHandle = handle;
      resizeHandle.style.pointerEvents = "auto";
      resizeHandle.style.cursor = `${handle}-resize`;
      resizeHandle.addEventListener("pointerdown", (event) =>
        startResize(nodeKey, overlay, handle, event)
      );
      return resizeHandle;
    };

    const ensureOverlay = (nodeKey: string): HTMLDivElement => {
      const cached = overlayMap.get(nodeKey);
      if (cached) {
        return cached;
      }

      const container = document.createElement("div");
      container.className = "textbox-overlay";
      container.dataset.textboxOverlayFor = nodeKey;
      container.style.position = "absolute";
      container.style.pointerEvents = "none";

      const moveHandle = document.createElement("div");
      moveHandle.className = "textbox-overlay__move-handle";
      moveHandle.dataset.textboxHandle = "move";
      moveHandle.style.pointerEvents = "auto";
      moveHandle.style.cursor = "move";
      moveHandle.addEventListener("pointerdown", (event) =>
        startMove(nodeKey, container, event)
      );
      container.appendChild(moveHandle);

      (["nw", "ne", "sw", "se"] as ResizeHandle[]).forEach((handle) => {
        container.appendChild(createResizeHandle(nodeKey, container, handle));
      });

      overlayRoot.appendChild(container);
      overlayMap.set(nodeKey, container);
      return container;
    };

    const handleTextboxPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      const textboxEl = target?.closest<HTMLElement>("[data-lexical-textbox]");
      if (!textboxEl) {
        return;
      }

      const nodeKey = textboxEl.getAttribute("data-lexical-node-key");
      if (!nodeKey) {
        return;
      }

      const overlay = ensureOverlay(nodeKey);
      const tag = (target?.tagName || "").toLowerCase();
      if (tag === "span" || tag === "p") {
        return;
      }

      startMove(nodeKey, overlay, event);
    };

    syncOverlays();

    const unregisterUpdate = editor.registerUpdateListener(() => {
      syncOverlays();
    });

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    root.addEventListener("pointerdown", handleTextboxPointerDown);

    return () => {
      unregisterUpdate();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      root.removeEventListener("pointerdown", handleTextboxPointerDown);
      overlayMap.forEach((overlay) => overlay.remove());
      overlayMap.clear();
      overlayRoot.remove();
    };
  }, [editor]);

  return null;
}
