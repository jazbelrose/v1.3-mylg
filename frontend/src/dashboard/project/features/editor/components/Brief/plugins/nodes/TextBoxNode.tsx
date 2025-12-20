import { addClassNamesToElement } from "@lexical/utils";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedElementNode,
} from "lexical";
import { ElementNode } from "lexical";

export type SerializedTextBoxNode = SerializedElementNode & {
  type: "text-box";
  version: 1;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export class TextBoxNode extends ElementNode {
  __x: number;
  __y: number;
  __width: number;
  __height: number;
  __rotation: number;

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
      node.__key
    );
  }

  constructor(
    x = 200,
    y = 200,
    width = 420,
    height = 160,
    rotation = 0,
    key?: NodeKey
  ) {
    super(key);
    this.__x = x;
    this.__y = y;
    this.__width = width;
    this.__height = height;
    this.__rotation = rotation;
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

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    addClassNamesToElement(dom, config.theme.textBox || "editor-textbox");
    dom.setAttribute("data-lexical-textbox", "true");
    dom.setAttribute("data-lexical-node-key", this.__key);
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

    const rotateHandle = document.createElement("div");
    rotateHandle.className = "textbox-rotate-handle";
    rotateHandle.setAttribute("aria-label", "Rotate text box");
    rotateHandle.textContent = "⟲";
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
    }

    if (prevNode.__width !== this.__width) {
      dom.style.width = `${this.__width}px`;
    }

    if (prevNode.__height !== this.__height) {
      dom.style.height = `${this.__height}px`;
    }
    return false;
  }

  exportDOM(_: LexicalEditor): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-lexical-textbox", "true");
    element.style.position = "absolute";
    element.style.left = "0px";
    element.style.top = "0px";
    element.style.transform = `translate3d(${this.__x}px, ${this.__y}px, 0) rotate(${this.__rotation}deg)`;
    element.style.transformOrigin = "center center";
    element.style.width = `${this.__width}px`;
    element.style.height = `${this.__height}px`;
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
    } = serializedNode;
    const node = new TextBoxNode(x, y, width, height, rotation);
    return node.updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedTextBoxNode {
    return {
      ...super.exportJSON(),
      type: "text-box",
      version: 1,
      x: this.__x,
      y: this.__y,
      width: this.__width,
      height: this.__height,
      rotation: this.__rotation,
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
  rotation?: number
): TextBoxNode {
  return new TextBoxNode(x, y, width, height, rotation);
}

export function $isTextBoxNode(node: unknown): node is TextBoxNode {
  return node instanceof TextBoxNode;
}
