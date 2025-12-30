import { addClassNamesToElement } from "@lexical/utils";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  NodeKey,
  SerializedElementNode,
} from "lexical";
import { ElementNode } from "lexical";
import {
  DEFAULT_IMAGE_BORDER_RADIUS,
  mergeBorderRadius,
  borderRadiusToCss,
  type ImageBorderRadiusState,
} from "./imageBorderRadius";

export type SerializedTextBoxNode = SerializedElementNode & {
  type: "text-box";
  version: 2;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  borderRadius?: ImageBorderRadiusState;
  border?: {
    enabled: boolean;
    width: number;
    color: string;
  };
  locked?: boolean;
};

const DEFAULT_SLIDE_NODE_BORDER = { enabled: false, width: 2, color: "#ffffff" } as const;

export class TextBoxNode extends ElementNode {
  __x: number;
  __y: number;
  __width: number;
  __height: number;
  __rotation: number;
  __borderRadius: ImageBorderRadiusState;
  __border: { enabled: boolean; width: number; color: string };
  __locked: boolean;

  static getType(): string {
    return "text-box";
  }

  static clone(node: TextBoxNode): TextBoxNode {
    return new TextBoxNode(
      node.__x,
      node.__y,
      node.__width,
      node.__height,
      node.__rotation,
      node.__borderRadius,
      node.__border,
      node.__key,
      node.__locked
    );
  }

  constructor(
    x = 200,
    y = 200,
    width = 420,
    height = 160,
    rotation = 0,
    borderRadius: ImageBorderRadiusState = { ...DEFAULT_IMAGE_BORDER_RADIUS },
    border: { enabled: boolean; width: number; color: string } = { ...DEFAULT_SLIDE_NODE_BORDER },
    key?: NodeKey,
    locked = false
  ) {
    super(key);
    this.__x = x;
    this.__y = y;
    this.__width = width;
    this.__height = height;
    this.__rotation = rotation;
    this.__borderRadius = mergeBorderRadius(DEFAULT_IMAGE_BORDER_RADIUS, borderRadius);
    this.__border =
      border && typeof border === "object"
        ? {
            enabled: Boolean(border.enabled),
            width: Math.max(0, Number(border.width) || 0),
            color:
              typeof border.color === "string" && border.color.trim()
                ? border.color.trim()
                : DEFAULT_SLIDE_NODE_BORDER.color,
          }
        : { ...DEFAULT_SLIDE_NODE_BORDER };
    this.__locked = locked;
  }

  getPosition(): { x: number; y: number } {
    const self = this.getLatest();
    return { x: self.__x, y: self.__y };
  }

  getSize(): { width: number; height: number } {
    const self = this.getLatest();
    return { width: self.__width, height: self.__height };
  }

  setPosition(x: number, y: number): void {
    const writable = this.getWritable();
    writable.__x = x;
    writable.__y = y;
  }

  setSize(width: number, height: number): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  getRotation(): number {
    const self = this.getLatest();
    return self.__rotation;
  }

  setRotation(rotation: number): void {
    const writable = this.getWritable();
    writable.__rotation = rotation;
  }

  getLocked(): boolean {
    const self = this.getLatest();
    return self.__locked;
  }

  getBorder(): { enabled: boolean; width: number; color: string } {
    const self = this.getLatest();
    return { ...self.__border };
  }

  getBorderRadius(): ImageBorderRadiusState {
    const self = this.getLatest();
    return { ...self.__borderRadius };
  }

  setBorderRadius(updates: Partial<ImageBorderRadiusState>): void {
    if (this.getLocked()) return;
    const writable = this.getWritable();
    writable.__borderRadius = mergeBorderRadius(writable.__borderRadius, updates);
  }

  setBorder(updates: Partial<{ enabled: boolean; width: number; color: string }>): void {
    if (this.getLocked()) return;
    const writable = this.getWritable();
    const next = { ...writable.__border };
    if (typeof updates.enabled === "boolean") next.enabled = updates.enabled;
    if (typeof updates.width !== "undefined") next.width = Math.max(0, Number(updates.width) || 0);
    if (typeof updates.color === "string" && updates.color.trim()) next.color = updates.color.trim();
    writable.__border = next;
  }

  setLocked(locked: boolean): void {
    const writable = this.getWritable();
    writable.__locked = locked;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    addClassNamesToElement(dom, config.theme.textBox || "editor-textbox");
    dom.setAttribute("data-lexical-textbox", "true");
    dom.setAttribute("data-lexical-node-key", this.__key);
    dom.setAttribute("data-slide-locked", this.__locked ? "true" : "false");
    dom.style.position = "absolute";
    dom.style.left = "0px";
    dom.style.top = "0px";
    dom.style.transform = `translate3d(${this.__x}px, ${this.__y}px, 0) rotate(${this.__rotation}deg)`;
    dom.style.transformOrigin = "center center";
    dom.style.width = `${this.__width}px`;
    dom.style.height = `${this.__height}px`;
    dom.style.boxSizing = "border-box";
    dom.style.margin = "0";
    dom.style.willChange = "transform, width, height";
    dom.style.setProperty("--mylg-selection-rotation", `${this.__rotation}deg`);

    dom.style.borderRadius = borderRadiusToCss(this.__borderRadius);

    const borderStyle =
      this.__border.enabled && this.__border.width > 0
        ? `${this.__border.width}px solid ${this.__border.color}`
        : "none";
    dom.style.border = borderStyle;

    // Add move handles (thin edge strips) first so resize handles sit on top
    const moveHandles = ["top", "right", "bottom", "left"];
    moveHandles.forEach((pos) => {
      const handle = document.createElement("div");
      handle.className = `textbox-move-handle textbox-move-handle-${pos}`;
      dom.appendChild(handle);
    });

    // Add resize handles (edge centers + corners)
    const resizeHandles = [
      "top",
      "right",
      "bottom",
      "left",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ];
    resizeHandles.forEach((position) => {
      const handle = document.createElement("div");
      handle.className = `textbox-resize-handle textbox-resize-handle-${position}`;
      dom.appendChild(handle);
    });

    const rotateLine = document.createElement("div");
    rotateLine.className = "textbox-rotate-handle-line";
    dom.appendChild(rotateLine);

    const rotateHandle = document.createElement("div");
    rotateHandle.className = "textbox-rotate-handle";
    rotateHandle.setAttribute("aria-label", "Rotate text box");
    dom.appendChild(rotateHandle);

    return dom;
  }

  updateDOM(prevNode: TextBoxNode, dom: HTMLElement): boolean {
    if (
      prevNode.__x !== this.__x ||
      prevNode.__y !== this.__y ||
      prevNode.__rotation !== this.__rotation
    ) {
      dom.style.transform = `translate3d(${this.__x}px, ${this.__y}px, 0) rotate(${this.__rotation}deg)`;
      dom.style.setProperty("--mylg-selection-rotation", `${this.__rotation}deg`);
    }

    if (prevNode.__width !== this.__width) {
      dom.style.width = `${this.__width}px`;
    }

    if (prevNode.__height !== this.__height) {
      dom.style.height = `${this.__height}px`;
    }

    if (prevNode.__locked !== this.__locked) {
      dom.setAttribute("data-slide-locked", this.__locked ? "true" : "false");
    }

    if (
      prevNode.__border.enabled !== this.__border.enabled ||
      prevNode.__border.width !== this.__border.width ||
      prevNode.__border.color !== this.__border.color
    ) {
      const borderStyle =
        this.__border.enabled && this.__border.width > 0
          ? `${this.__border.width}px solid ${this.__border.color}`
          : "none";
      dom.style.border = borderStyle;
    }

    if (
      prevNode.__borderRadius.topLeft !== this.__borderRadius.topLeft ||
      prevNode.__borderRadius.topRight !== this.__borderRadius.topRight ||
      prevNode.__borderRadius.bottomRight !== this.__borderRadius.bottomRight ||
      prevNode.__borderRadius.bottomLeft !== this.__borderRadius.bottomLeft
    ) {
      dom.style.borderRadius = borderRadiusToCss(this.__borderRadius);
    }
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-lexical-textbox", "true");
    element.style.position = "absolute";
    element.style.left = "0px";
    element.style.top = "0px";
    element.style.transform = `translate3d(${this.__x}px, ${this.__y}px, 0) rotate(${this.__rotation}deg)`;
    element.style.transformOrigin = "center center";
    element.style.width = `${this.__width}px`;
    element.style.height = `${this.__height}px`;
    element.style.borderRadius = borderRadiusToCss(this.__borderRadius);
    const borderStyle =
      this.__border.enabled && this.__border.width > 0
        ? `${this.__border.width}px solid ${this.__border.color}`
        : "none";
    element.style.border = borderStyle;
    element.style.boxSizing = "border-box";
    return { element };
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-textbox")) {
          return null;
        }
        return {
          conversion: () => {
            const { left, top, width, height } = domNode.style;
            const parsedLeft = parseFloat(left);
            const parsedTop = parseFloat(top);
            const parsedWidth = parseFloat(width);
            const parsedHeight = parseFloat(height);

            const node = $createTextBoxNode(
              Number.isFinite(parsedLeft) ? parsedLeft : undefined,
              Number.isFinite(parsedTop) ? parsedTop : undefined,
              Number.isFinite(parsedWidth) ? parsedWidth : undefined,
              Number.isFinite(parsedHeight) ? parsedHeight : undefined
            );

            return { node };
          },
          priority: 2 as const,
        };
      },
    };
  }

  static importJSON(serializedNode: SerializedTextBoxNode): TextBoxNode {
    const {
      x = 200,
      y = 200,
      width = 420,
      height = 160,
      rotation = 0,
      borderRadius,
      border,
      locked = false,
    } = serializedNode;
    const normalizedBorder =
      border && typeof border === "object"
        ? {
            enabled: Boolean(border.enabled),
            width: Math.max(0, Number(border.width) || 0),
            color:
              typeof border.color === "string" && border.color.trim()
                ? border.color.trim()
                : DEFAULT_SLIDE_NODE_BORDER.color,
          }
        : { ...DEFAULT_SLIDE_NODE_BORDER };
    const normalizedBorderRadius = mergeBorderRadius(DEFAULT_IMAGE_BORDER_RADIUS, borderRadius);
    const node = new TextBoxNode(
      x,
      y,
      width,
      height,
      rotation,
      normalizedBorderRadius,
      normalizedBorder,
      undefined,
      locked
    );
    return node.updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedTextBoxNode {
    return {
      ...super.exportJSON(),
      type: "text-box",
      version: 2,
      x: this.__x,
      y: this.__y,
      width: this.__width,
      height: this.__height,
      rotation: this.__rotation,
      borderRadius: this.__borderRadius,
      border: this.__border,
      locked: this.__locked,
    };
  }

  canBeEmpty(): boolean {
    return false;
  }
}

export function $createTextBoxNode(
  x?: number,
  y?: number,
  width?: number,
  height?: number,
  rotation?: number,
  locked?: boolean,
  border?: { enabled: boolean; width: number; color: string },
  borderRadius?: ImageBorderRadiusState
): TextBoxNode {
  const normalizedBorder =
    border && typeof border === "object"
      ? {
          enabled: Boolean(border.enabled),
          width: Math.max(0, Number(border.width) || 0),
          color:
            typeof border.color === "string" && border.color.trim()
              ? border.color.trim()
              : DEFAULT_SLIDE_NODE_BORDER.color,
        }
      : { ...DEFAULT_SLIDE_NODE_BORDER };
  const normalizedBorderRadius = mergeBorderRadius(DEFAULT_IMAGE_BORDER_RADIUS, borderRadius);
  return new TextBoxNode(
    x,
    y,
    width,
    height,
    rotation,
    normalizedBorderRadius,
    normalizedBorder,
    undefined,
    locked ?? false
  );
}

export function $isTextBoxNode(node: unknown): node is TextBoxNode {
  return node instanceof TextBoxNode;
}
