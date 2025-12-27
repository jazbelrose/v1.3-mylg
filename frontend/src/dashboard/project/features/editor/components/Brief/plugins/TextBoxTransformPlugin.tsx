import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  ElementNode,
  type LexicalNode,
} from "lexical";
import { TextBoxNode } from "./nodes/TextBoxNode";
import { ResizableImageNode } from "./nodes/ResizableImageNode";
import { SvgNode } from "./nodes/SvgNode";
import {
  applyModifierNodeSelection,
  getSlideNodeSelectionKeys,
} from "./slides/slideSelectionUtils";
import rotateArrowSvgRaw from "@/assets/svg/rotate arrow.svg?raw";

const ROTATE_CURSOR_HOTSPOT = { x: 16, y: 16 };
const rotateCursorCache = new Map<string, string>();

function getSvgInner(svgText: string): string {
  const svgStart = svgText.indexOf("<svg");
  if (svgStart < 0) return "";
  const openEnd = svgText.indexOf(">", svgStart);
  if (openEnd < 0) return "";
  const closeStart = svgText.lastIndexOf("</svg>");
  if (closeStart < 0) return "";
  return svgText.slice(openEnd + 1, closeStart);
}

const rotateArrowInnerSvg = getSvgInner(rotateArrowSvgRaw);

function getRotateCursor(angleDeg: number, fallback: "grab" | "grabbing" = "grab"): string {
  const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
  const key = `${normalized}:${fallback}`;
  const cached = rotateCursorCache.get(key);
  if (cached) return cached;

  const svgMarkup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-50 -50 400 400">` +
    `<g transform="rotate(${normalized} 150 150)">` +
    rotateArrowInnerSvg +
    `</g></svg>`;

  const encoded = encodeURIComponent(svgMarkup)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  const cursorValue = `url("data:image/svg+xml,${encoded}") ${ROTATE_CURSOR_HOTSPOT.x} ${ROTATE_CURSOR_HOTSPOT.y}, ${fallback}`;

  rotateCursorCache.set(key, cursorValue);
  return cursorValue;
}

function setForcedRotateCursor(angleDeg: number) {
  const root = document.documentElement;
  root.style.setProperty("--mylg-rotate-cursor", getRotateCursor(angleDeg, "grab"));
  root.style.setProperty("--mylg-rotate-cursor-grabbing", getRotateCursor(angleDeg, "grabbing"));
}

function clearForcedRotateCursor() {
  const root = document.documentElement;
  root.style.removeProperty("--mylg-rotate-cursor");
  root.style.removeProperty("--mylg-rotate-cursor-grabbing");
}

type InteractionType =
  | "move"
  | "resize-left"
  | "resize-right"
  | "resize-top"
  | "resize-bottom"
  | "resize-top-left"
  | "resize-top-right"
  | "resize-bottom-left"
  | "resize-bottom-right"
  | "rotate";

type SelectionSnapshot = {
  x: number;
  y: number;
  rotation: number;
};

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
  initialSelectionKeys: string[];
  selectionKeys: string[];
  wasSelectedBeforePointerDown: boolean;
  copyGesture: boolean;
  didDuplicate: boolean;
  didInteract: boolean;
  selectionSnapshots: Map<string, SelectionSnapshot>;
};

const EDGE_THRESHOLD = 8; // px from edge that counts as "border"
const RESIZE_HANDLE_OFFSET = 20; // px from corners where center handles are
const TEXTBOX_TYPE = "text-box";

type CopyModifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "altKey"> & {
  getModifierState?: (keyArg: string) => boolean;
};

function hasCopyModifier(event?: CopyModifiers | null): boolean {
  if (!event) {
    return false;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return true;
  }
  if (typeof event.getModifierState === "function") {
    return (
      event.getModifierState("Control") ||
      event.getModifierState("Meta") ||
      event.getModifierState("Alt")
    );
  }
  return false;
}

const resizeCursorCache = new Map<number, string>();

function getElementRotationDeg(element: HTMLElement): number {
  const inlineTransform = element.style.transform || "";
  const inlineMatch = inlineTransform.match(/rotate\(([-\d.]+)deg\)/);
  const inlineRotation = inlineMatch ? parseFloat(inlineMatch[1]) : 0;

  const computedTransform = getComputedStyle(element).transform;
  if (!computedTransform || computedTransform === "none") {
    return Number.isFinite(inlineRotation) ? inlineRotation : 0;
  }

  try {
    const matrix = new DOMMatrixReadOnly(computedTransform);
    const angleDeg = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    return Number.isFinite(angleDeg) ? angleDeg : 0;
  } catch {
    return Number.isFinite(inlineRotation) ? inlineRotation : 0;
  }
}

function normalizeAxisAngleDeg(angleDeg: number): number {
  let normalized = angleDeg % 180;
  if (normalized < 0) normalized += 180;
  return normalized;
}

function getResizeAxisAngleDeg(type: InteractionType): number | null {
  switch (type) {
    case "resize-left":
    case "resize-right":
      return 0;
    case "resize-top":
    case "resize-bottom":
      return 90;
    case "resize-top-left":
    case "resize-bottom-right":
      return 45;
    case "resize-top-right":
    case "resize-bottom-left":
      return 135;
    default:
      return null;
  }
}

function getFallbackResizeCursor(axisAngleDeg: number): string {
  const normalized = normalizeAxisAngleDeg(axisAngleDeg);
  const bucket = Math.round(normalized / 45) * 45;

  switch (bucket % 180) {
    case 0:
      return "ew-resize";
    case 45:
      return "nwse-resize";
    case 90:
      return "ns-resize";
    case 135:
      return "nesw-resize";
    default:
      return "auto";
  }
}

function getRotatedResizeCursor(axisAngleDeg: number): string {
  const normalized = normalizeAxisAngleDeg(axisAngleDeg);
  const key = Math.round(normalized);
  const cached = resizeCursorCache.get(key);
  if (cached) return cached;

  const fallback = getFallbackResizeCursor(normalized);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<g transform="rotate(${normalized} 16 16)" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <line x1="6" y1="16" x2="26" y2="16" stroke="black" stroke-width="4"/>
  <polyline points="10,12 6,16 10,20" stroke="black" stroke-width="4"/>
  <polyline points="22,12 26,16 22,20" stroke="black" stroke-width="4"/>
  <line x1="6" y1="16" x2="26" y2="16" stroke="white" stroke-width="2"/>
  <polyline points="10,12 6,16 10,20" stroke="white" stroke-width="2"/>
  <polyline points="22,12 26,16 22,20" stroke="white" stroke-width="2"/>
</g>
</svg>`;

  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");

  const cursor = `url("data:image/svg+xml,${encoded}") 16 16, ${fallback}`;
  resizeCursorCache.set(key, cursor);
  return cursor;
}


function deepCloneNode(node: LexicalNode): LexicalNode | null {
  const Ctor = node.constructor as new (data: unknown) => LexicalNode;

  if (typeof Ctor.importJSON !== "function") {
    return null;
  }

  // IMPORTANT: don't use node.clone() for duplication — clone() preserves the key.
  // importJSON(exportJSON()) generates a fresh key.
  const cloned = Ctor.importJSON(node.exportJSON());

  if (node instanceof ElementNode && cloned instanceof ElementNode) {
    const childClones: LexicalNode[] = [];
    node.getChildren().forEach((child) => {
      const childClone = deepCloneNode(child);
      if (childClone) childClones.push(childClone);
    });
    if (childClones.length) cloned.append(...childClones);
  }

  return cloned;
}

function duplicateTextBoxes(
  keysToClone: string[],
  opts: { offsetX: number; offsetY: number }
): { clones: Array<{ originalKey: string; cloneKey: string }>; cloneKeys: string[] } {
  const clones: Array<{ originalKey: string; cloneKey: string }> = [];
  const cloneKeys: string[] = [];

  keysToClone.forEach((key) => {
    const node = $getNodeByKey(key);
    if (!(node instanceof TextBoxNode)) return;

    const cloneAny = deepCloneNode(node);
    if (!(cloneAny instanceof TextBoxNode)) return;
    const clone = cloneAny;

    // keep z-order: insert right after original
    node.insertAfter(clone);

    // offset so it's visible
    const { x, y } = node.getPosition();
    clone.setPosition(x + opts.offsetX, y + opts.offsetY);

    const cloneKey = clone.getKey();
    clones.push({ originalKey: key, cloneKey });
    cloneKeys.push(cloneKey);
  });

  return { clones, cloneKeys };
}

function captureNodePositions(
  keys: string[],
  update: (snapshots: Map<string, SelectionSnapshot>) => void
) {
  const snapshot = new Map<string, SelectionSnapshot>();
  keys.forEach((key) => {
    const node = $getNodeByKey(key);
    if (node instanceof TextBoxNode) {
      const { x, y } = node.getPosition();
      snapshot.set(key, { x, y, rotation: node.getRotation() });
    } else if (node instanceof ResizableImageNode) {
      snapshot.set(key, {
        x: node.getX(),
        y: node.getY(),
        rotation: node.getRotation(),
      });
    } else if (node instanceof SvgNode) {
      snapshot.set(key, {
        x: node.getX(),
        y: node.getY(),
        rotation: node.getRotation(),
      });
    }
  });
  update(snapshot);
}

export function getInteractionType(textbox: HTMLElement, event: PointerEvent, forceMove = false): InteractionType | null {
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
    if (target.classList.contains("textbox-resize-handle-top-left")) return "resize-top-left";
    if (target.classList.contains("textbox-resize-handle-top-right")) return "resize-top-right";
    if (target.classList.contains("textbox-resize-handle-bottom-left")) return "resize-bottom-left";
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
  const inTopLeftCorner =
    clientX - rect.left <= RESIZE_HANDLE_OFFSET &&
    clientY - rect.top <= RESIZE_HANDLE_OFFSET;
  const inTopRightCorner =
    rect.right - clientX <= RESIZE_HANDLE_OFFSET &&
    clientY - rect.top <= RESIZE_HANDLE_OFFSET;
  const inBottomLeftCorner =
    clientX - rect.left <= RESIZE_HANDLE_OFFSET &&
    rect.bottom - clientY <= RESIZE_HANDLE_OFFSET;
  const inBottomRightCorner =
    rect.right - clientX <= RESIZE_HANDLE_OFFSET &&
    rect.bottom - clientY <= RESIZE_HANDLE_OFFSET;

  // Priority: specific resize handles first
  if (onTopCenterHandle) return "resize-top";
  if (onBottomCenterHandle) return "resize-bottom";
  if (onLeftCenterHandle) return "resize-left";
  if (onRightCenterHandle) return "resize-right";
  if (inTopLeftCorner) return "resize-top-left";
  if (inTopRightCorner) return "resize-top-right";
  if (inBottomLeftCorner) return "resize-bottom-left";
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
    case "resize-right":
    case "resize-top":
    case "resize-bottom":
    case "resize-top-left":
    case "resize-top-right":
    case "resize-bottom-left":
    case "resize-bottom-right":
      return getFallbackResizeCursor(getResizeAxisAngleDeg(type) ?? 0);
    case "rotate": return getRotateCursor(0);
    default: return "text";
  }
}

function getCursorForInteractionWithRotation(
  type: InteractionType | null,
  rotationDeg: number
): string {
  if (!type) return "text";
  if (type === "move") return "move";
  if (type === "rotate") return getRotateCursor(rotationDeg);

  const axisAngleDeg = getResizeAxisAngleDeg(type);
  if (axisAngleDeg == null) {
    return getCursorForInteraction(type);
  }

  return getRotatedResizeCursor(axisAngleDeg + rotationDeg);
}

export default function TextBoxTransformPlugin({ scale = 1 }: { scale?: number }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }

    let interaction: Interaction | null = null;
    let wasInteracted = false;
    const copyModifierState = { current: false };
    let hoverTextbox: HTMLElement | null = null;
    const selectedElementMap = new Map<string, HTMLElement>();

    const syncSelectedElements = (nodeKeys: Set<string>, focusKeys: Set<string>) => {
      const desiredKeys = new Set<string>([...nodeKeys, ...focusKeys]);

      const keysToRemove: string[] = [];
      selectedElementMap.forEach((element, key) => {
        if (!desiredKeys.has(key)) {
          element.classList.remove("editor-textbox-selected", "editor-textbox-focused");
          keysToRemove.push(key);
        }
      });
      keysToRemove.forEach((key) => selectedElementMap.delete(key));

      desiredKeys.forEach((key) => {
        let element = selectedElementMap.get(key);
        if (!element) {
          element = root.querySelector<HTMLElement>(
            `[data-lexical-textbox="true"][data-lexical-node-key="${key}"]`
          );
          if (!element) {
            return;
          }
          selectedElementMap.set(key, element);
        }

        if (nodeKeys.has(key)) {
          element.classList.add("editor-textbox-selected");
        } else {
          element.classList.remove("editor-textbox-selected");
        }

        if (focusKeys.has(key)) {
          element.classList.add("editor-textbox-focused");
        } else {
          element.classList.remove("editor-textbox-focused");
        }
      });
    };

    const unregisterSelectionSync = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        const nodeSelectionKeys = new Set<string>();
        const focusSelectionKeys = new Set<string>();
        if (selection) {
          if ($isNodeSelection(selection)) {
            selection.getNodes().forEach((node) => {
              if (node instanceof TextBoxNode) {
                nodeSelectionKeys.add(node.getKey());
              }
            });
          } else if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const focusNode = selection.focus.getNode();
            let anchorTextBox: TextBoxNode | null = null;
            let focusTextBox: TextBoxNode | null = null;
            let current: LexicalNode | null = anchorNode;
            while (current && !anchorTextBox) {
              if (current instanceof TextBoxNode) {
                anchorTextBox = current;
              }
              current = current.getParent();
            }
            current = focusNode;
            while (current && !focusTextBox) {
              if (current instanceof TextBoxNode) {
                focusTextBox = current;
              }
              current = current.getParent();
            }
            if (
              anchorTextBox &&
              focusTextBox &&
              anchorTextBox.getKey() === focusTextBox.getKey()
            ) {
              focusSelectionKeys.add(anchorTextBox.getKey());
            }
          }
        }
        syncSelectedElements(nodeSelectionKeys, focusSelectionKeys);
      });
    });

    const syncSelectionSnapshots = (keys: string[], options: { defer?: boolean } = {}) => {
      if (!interaction) {
        return;
      }
      const normalizedKeys = keys.length > 0 ? keys : [interaction.nodeKey];
      const run = () => {
        editor.getEditorState().read(() => {
          captureNodePositions(normalizedKeys, (snapshots) => {
            interaction!.selectionSnapshots = snapshots;
          });
        });
      };

      if (options.defer) {
        queueMicrotask(run);
      } else {
        run();
      }
    };

    const resolveKeysForDuplication = (context: Interaction): string[] => {
      if (context.wasSelectedBeforePointerDown && context.initialSelectionKeys.length > 0) {
        return context.initialSelectionKeys;
      }
      if (context.selectionKeys.length > 0) {
        return context.selectionKeys.includes(context.nodeKey)
          ? context.selectionKeys
          : [...context.selectionKeys, context.nodeKey];
      }
      return [context.nodeKey];
    };

    const captureInteractionSnapshot = (targetKey: string) => {
      if (!interaction) {
        return;
      }
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(targetKey);
        if (node instanceof TextBoxNode) {
          const { x, y } = node.getPosition();
          const { width, height } = node.getSize();
          interaction!.originX = x;
          interaction!.originY = y;
          interaction!.originWidth = width;
          interaction!.originHeight = height;
          interaction!.originRotation = node.getRotation();
        }
      });
    };

    const duplicateForInteraction = (event: PointerEvent) => {
      if (!interaction || interaction.type !== "move" || !interaction.copyGesture || interaction.didDuplicate) {
        return;
      }

      editor.update(() => {
        const keysToClone = resolveKeysForDuplication(interaction!);
        const { clones, cloneKeys } = duplicateTextBoxes(keysToClone, { offsetX: 8, offsetY: 8 });
        if (cloneKeys.length === 0) {
          return;
        }

        interaction!.didDuplicate = true;
        interaction!.selectionKeys = cloneKeys;
        syncSelectionSnapshots(cloneKeys, { defer: true });

        // IMPORTANT: select the clones so their borders render during the drag
        const nodeSelection = $createNodeSelection();
        cloneKeys.forEach((k) => nodeSelection.add(k));
        $setSelection(nodeSelection);

        const mapping = new Map(clones.map(({ originalKey, cloneKey }) => [originalKey, cloneKey]));
        const replacementKey =
          mapping.get(interaction!.nodeKey) ?? cloneKeys[cloneKeys.length - 1];
        interaction!.nodeKey = replacementKey;

        const cloneNode = $getNodeByKey(replacementKey);
        if (cloneNode instanceof TextBoxNode) {
          const { x, y } = cloneNode.getPosition();
          const { width, height } = cloneNode.getSize();
          interaction!.originX = x;
          interaction!.originY = y;
          interaction!.originWidth = width;
          interaction!.originHeight = height;
          interaction!.originRotation = cloneNode.getRotation();
          interaction!.startX = event.clientX;
          interaction!.startY = event.clientY;
        }
      });
    };

    const clearHover = () => {
      if (hoverTextbox) {
        hoverTextbox.style.cursor = "";
        hoverTextbox = null;
      }
    };

    const syncCopyModifierState = (event: KeyboardEvent) => {
      copyModifierState.current = hasCopyModifier(event);
    };

    const resetCopyModifierState = () => {
      copyModifierState.current = false;
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
        const rotationDeg = getElementRotationDeg(textbox);
        hoverTextbox.style.cursor = getCursorForInteractionWithRotation(
          interactionType,
          rotationDeg
        );
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

      const interactionType = getInteractionType(textbox, event);
      if (!interactionType) {
        editor.focus();
        return;
      }

      if (interactionType === "rotate") {
        setForcedRotateCursor(getElementRotationDeg(textbox));
        document.body.classList.add(
          "mylg-force-rotate-cursor",
          "mylg-force-rotate-cursor-grabbing"
        );
      }

      const nodeKey = textbox.getAttribute("data-lexical-node-key");
      if (!nodeKey) return;

      const prevSelectionKeys = editor.getEditorState().read(() =>
        getSlideNodeSelectionKeys()
      );

      let selectionResult = {
        selectedKeys: prevSelectionKeys,
        nodeIsSelected: prevSelectionKeys.includes(nodeKey),
      };

      // Set selection in a single update to avoid race conditions with PreventRootTextPlugin
      editor.update(() => {
        selectionResult = applyModifierNodeSelection(nodeKey, event);
      });
      // Ensure the Lexical root stays focused so shortcuts like Ctrl+Z work for NodeSelection.
      editor.focus();

      const rect = textbox.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);

      const pointerCopyModifierActive = hasCopyModifier(event);
      if (pointerCopyModifierActive) {
        copyModifierState.current = true;
      }

      interaction = {
        type: interactionType,
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        originX: 0,
        originY: 0,
        originWidth: 0,
        originHeight: 0,
        originRotation: 0,
        startAngle,
        centerX,
        centerY,
        initialSelectionKeys: prevSelectionKeys,
        selectionKeys: selectionResult.selectedKeys,
        wasSelectedBeforePointerDown: prevSelectionKeys.includes(nodeKey),
        copyGesture: pointerCopyModifierActive || copyModifierState.current,
        didDuplicate: false,
        didInteract: false,
        selectionSnapshots: new Map(),
      };

      captureInteractionSnapshot(nodeKey);
      syncSelectionSnapshots(
        selectionResult.selectedKeys.length > 0 ? selectionResult.selectedKeys : [nodeKey]
      );

      if (interaction.copyGesture) {
        duplicateForInteraction(event);
      }

      (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMoveDrag = (event: PointerEvent) => {
      if (!interaction) {
        return;
      }

      // Set didInteract if there's any change (move, resize, rotate)
      if (!interaction.didInteract) {
        const dx = event.clientX - interaction.startX;
        const dy = event.clientY - interaction.startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || interaction.type === "rotate") {
          interaction.didInteract = true;
        }
      }

      if (
        interaction.type === "move" &&
        !interaction.copyGesture &&
        (hasCopyModifier(event) || copyModifierState.current)
      ) {
        interaction.copyGesture = true;
        if (hasCopyModifier(event)) {
          copyModifierState.current = true;
        }
      }

      duplicateForInteraction(event);

      const dx = (event.clientX - interaction.startX) / scale;
      const dy = (event.clientY - interaction.startY) / scale;

      editor.update(() => {
        if (interaction!.type === "move") {
          const snapshots = interaction!.selectionSnapshots;
          const entries =
            snapshots.size > 0
              ? Array.from(snapshots.entries())
              : [
                  [
                    interaction!.nodeKey,
                    {
                      x: interaction!.originX,
                      y: interaction!.originY,
                      rotation: interaction!.originRotation,
                    },
                  ],
                ];

          entries.forEach(([key, origin]) => {
            if (!origin) {
              return;
            }
            const targetNode = $getNodeByKey(key as string);
            if (!targetNode) {
              return;
            }
            const nextX = origin.x + dx;
            const nextY = origin.y + dy;
            if (targetNode instanceof TextBoxNode) {
              targetNode.setPosition(nextX, nextY);
            } else if (targetNode instanceof ResizableImageNode) {
              targetNode.setX(nextX);
              targetNode.setY(nextY);
            } else if (targetNode instanceof SvgNode) {
              targetNode.setX(nextX);
              targetNode.setY(nextY);
            }
          });
          return;
        }

        const node = $getNodeByKey(interaction!.nodeKey);
        if (!(node instanceof TextBoxNode)) return;

        let newX = interaction!.originX;
        let newY = interaction!.originY;
        let newWidth = interaction!.originWidth;
        let newHeight = interaction!.originHeight;

        switch (interaction!.type) {
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
          case "rotate": {
            const currentAngle = Math.atan2(
              event.clientY - interaction!.centerY,
              event.clientX - interaction!.centerX
            );
            const deltaRad = currentAngle - interaction!.startAngle;
            const deltaDeg = (deltaRad * 180) / Math.PI;
            setForcedRotateCursor(interaction!.originRotation + deltaDeg);
            const rotationSnapshots =
              interaction!.selectionSnapshots.size > 0
                ? interaction!.selectionSnapshots
                : new Map<string, SelectionSnapshot>([
                    [
                      interaction!.nodeKey,
                      {
                        x: interaction!.originX,
                        y: interaction!.originY,
                        rotation: interaction!.originRotation,
                      },
                    ],
                  ]);

            rotationSnapshots.forEach((snapshot, key) => {
              const targetNode = $getNodeByKey(key);
              if (!targetNode) {
                return;
              }
              const nextRotation = snapshot.rotation + deltaDeg;
              if (targetNode instanceof TextBoxNode) {
                targetNode.setRotation(nextRotation);
              } else if (targetNode instanceof ResizableImageNode) {
                targetNode.setRotation(nextRotation);
              }
            });

            return;
          }
        }

        // Enforce minimum size for resize operations
        const MIN_SIZE = 50;
        if (newWidth < MIN_SIZE || newHeight < MIN_SIZE) {
          return;
        }

        node.setPosition(newX, newY);
        node.setSize(newWidth, newHeight);
      });
    };

    const onPointerUp = () => {
      if (interaction) {
        wasInteracted = interaction.didInteract || interaction.didDuplicate;
        if (interaction.type === "rotate") {
          document.body.classList.remove(
            "mylg-force-rotate-cursor",
            "mylg-force-rotate-cursor-grabbing"
          );
          clearForcedRotateCursor();
        }
      }
      interaction = null;
    };

    // Hover detection for cursor change
    root.addEventListener("pointermove", onPointerMoveHover);
    // Drag handling
    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMoveDrag);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    const preventClickAfterInteract = (e: MouseEvent) => {
      if (wasInteracted) {
        e.preventDefault();
        e.stopPropagation();
        wasInteracted = false;
      }
    };

    window.addEventListener("click", preventClickAfterInteract);
    const modifierTargets = new Set<EventTarget>();
    if (typeof window !== "undefined") {
      modifierTargets.add(window);
    }
    if (root) {
      modifierTargets.add(root);
    }
    const ownerDocument = root.ownerDocument;
    if (ownerDocument) {
      modifierTargets.add(ownerDocument);
    }
    modifierTargets.forEach((target) => {
      target.addEventListener("keydown", syncCopyModifierState, true);
      target.addEventListener("keyup", syncCopyModifierState, true);
      target.addEventListener("blur", resetCopyModifierState, true);
    });

    return () => {
      root.removeEventListener("pointermove", onPointerMoveHover);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMoveDrag);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("click", preventClickAfterInteract);
      modifierTargets.forEach((target) => {
        target.removeEventListener("keydown", syncCopyModifierState, true);
        target.removeEventListener("keyup", syncCopyModifierState, true);
        target.removeEventListener("blur", resetCopyModifierState, true);
      });
      // cleanup hover class just in case
      if (hoverTextbox) {
        hoverTextbox.classList.remove("editor-textbox-border-hover");
      }
      document.body.classList.remove(
        "mylg-force-rotate-cursor",
        "mylg-force-rotate-cursor-grabbing"
      );
      clearForcedRotateCursor();
      syncSelectedElements(new Set(), new Set());
      selectedElementMap.clear();
      unregisterSelectionSync();
    };
  }, [editor]);

  return null;
}
