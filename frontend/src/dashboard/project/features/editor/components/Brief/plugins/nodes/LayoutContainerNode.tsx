import { addClassNamesToElement } from '@lexical/utils';
import { ElementNode, DOMConversionMap, DOMExportOutput, LexicalEditor, EditorConfig, SerializedElementNode } from 'lexical';
import { $createLayoutContainerNode, $convertLayoutContainerElement } from './LayoutContainerUtils';

export class LayoutContainerNode extends ElementNode {
  __templateColumns: string;

  constructor(templateColumns: string, key?: string) {
    super(key);
    this.__templateColumns = templateColumns;
  }

  static getType(): string {
    return 'layout-container';
  }

  static clone(node: LayoutContainerNode): LayoutContainerNode {
    return new LayoutContainerNode(node.__templateColumns, node.__key);
  }

  afterCloneFrom(prevNode: this): void {
    if (prevNode instanceof LayoutContainerNode) {
      this.__templateColumns = prevNode.__templateColumns;
    }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');
    dom.style.display = 'grid';
    dom.style.gridTemplateColumns = this.__templateColumns;
    if (typeof config.theme.layoutContainer === 'string') {
      addClassNamesToElement(dom, config.theme.layoutContainer);
    }
    return dom;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exportDOM(_: LexicalEditor): DOMExportOutput {
    const element = document.createElement('div');
    element.style.display = 'grid';
    element.style.gridTemplateColumns = this.__templateColumns;
    element.setAttribute('data-lexical-layout-container', 'true');
    return { element };
  }

  updateDOM(prevNode: LayoutContainerNode, dom: HTMLElement): boolean {
    if (prevNode.__templateColumns !== this.__templateColumns) {
      dom.style.gridTemplateColumns = this.__templateColumns;
    }
    return false;
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-layout-container')) {
          return null;
        }
        return {
          conversion: $convertLayoutContainerElement,
          priority: 2 as const,
        };
      },
    };
  }

  static importJSON(json: SerializedElementNode & { templateColumns: string }): LayoutContainerNode {
    return $createLayoutContainerNode().updateFromJSON(json);
  }

  updateFromJSON(serializedNode: SerializedElementNode & { templateColumns: string }): this {
    return super.updateFromJSON(serializedNode).setTemplateColumns(serializedNode.templateColumns);
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  exportJSON(): SerializedElementNode & { templateColumns: string } {
    return {
      ...super.exportJSON(),
      templateColumns: this.__templateColumns,
    };
  }

  getTemplateColumns(): string {
    return this.getLatest().__templateColumns;
  }

  setTemplateColumns(templateColumns: string): this {
    const self = this.getWritable();
    self.__templateColumns = templateColumns;
    return self;
  }
}

export { $createLayoutContainerNode, $isLayoutContainerNode } from './LayoutContainerUtils';









