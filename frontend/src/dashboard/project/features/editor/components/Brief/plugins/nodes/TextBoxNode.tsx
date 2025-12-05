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
};

export class TextBoxNode extends ElementNode {
  __x: number;
  __y: number;
  __width: number;
  __height: number;

  static getType(): string {
    return "text-box";
  }

  static clone(node: TextBoxNode): TextBoxNode {
    return new TextBoxNode(
      node.__x,
      node.__y,
      node.__width,
      node.__height,
      node.__key
    );
  }

  constructor(
    x = 200,
    y = 200,
    width = 420,
    height = 160,
    key?: NodeKey
  ) {
    super(key);
    this.__x = x;
    this.__y = y;
    this.__width = width;
    this.__height = height;
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
    const writable = this.getWritable<TextBoxNode>();
    writable.__x = x;
    writable.__y = y;
  }

  setSize(width: number, height: number): void {
    const writable = this.getWritable<TextBoxNode>();
    writable.__width = width;
    writable.__height = height;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    addClassNamesToElement(dom, config.theme.textBox || "editor-textbox");
    dom.setAttribute("data-lexical-textbox", "true");
    dom.setAttribute("data-lexical-node-key", this.__key);
    dom.style.position = "absolute";
    dom.style.left = "0px";
    dom.style.top = "0px";
    dom.style.transform = `translate3d(${this.__x}px, ${this.__y}px, 0)`;
    dom.style.width = `${this.__width}px`;
    dom.style.height = `${this.__height}px`;
    dom.style.boxSizing = "border-box";
    dom.style.margin = "0";
    dom.style.willChange = "transform, width, height";

    // Add resize handles
    const handles = ["top", "right", "bottom", "left", "bottom-right"];
    handles.forEach(position => {
      const handle = document.createElement("div");
      handle.className = `textbox-resize-handle textbox-resize-handle-${position}`;
      dom.appendChild(handle);
    });

    return dom;
  }

  updateDOM(prevNode: TextBoxNode, dom: HTMLElement): boolean {
    if (prevNode.__x !== this.__x || prevNode.__y !== this.__y) {
      dom.style.transform = `translate3d(${this.__x}px, ${this.__y}px, 0)`;
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
    element.style.left = `${this.__x}px`;
    element.style.top = `${this.__y}px`;
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
    } = serializedNode;
    const node = new TextBoxNode(x, y, width, height);
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
  height?: number
): TextBoxNode {
  return new TextBoxNode(x, y, width, height);
}

export function $isTextBoxNode(node: unknown): node is TextBoxNode {
  return node instanceof TextBoxNode;
}
