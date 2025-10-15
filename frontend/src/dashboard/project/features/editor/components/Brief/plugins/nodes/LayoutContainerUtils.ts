import { DOMConversionOutput, LexicalNode } from 'lexical';
import { LayoutContainerNode } from './LayoutContainerNode';

export function $createLayoutContainerNode(templateColumns: string = ''): LayoutContainerNode {
  return new LayoutContainerNode(templateColumns);
}

export function $isLayoutContainerNode(
  node: LexicalNode | null | undefined
): node is LayoutContainerNode {
  return node instanceof LayoutContainerNode;
}

export function $convertLayoutContainerElement(domNode: HTMLElement): DOMConversionOutput | null {
  const styleAttributes = window.getComputedStyle(domNode);
  const templateColumns = styleAttributes.getPropertyValue('grid-template-columns');
  if (templateColumns) {
    const node = $createLayoutContainerNode(templateColumns);
    return { node };
  }
  return null;
}









