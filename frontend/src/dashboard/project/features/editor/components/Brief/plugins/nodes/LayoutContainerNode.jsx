import React from 'react';
import { addClassNamesToElement } from '@lexical/utils';
import { ElementNode } from 'lexical';

export class LayoutContainerNode extends ElementNode {
  constructor(templateColumns, key) {
    super(key);
    this.__templateColumns = templateColumns;
  }

  static getType() {
    return 'layout-container';
  }

  static clone(node) {
    return new LayoutContainerNode(node.__templateColumns, node.__key);
  }

  createDOM(config) {
    const dom = document.createElement('div');
    dom.style.display = 'grid'; // Add this line
    dom.style.gridTemplateColumns = this.__templateColumns;
    if (typeof config.theme.layoutContainer === 'string') {
      addClassNamesToElement(dom, config.theme.layoutContainer);
    }
    return dom;
  }

 exportDOM() {
  const element = document.createElement('div');
  element.style.display = 'grid'; // Add this line
  element.style.gridTemplateColumns = this.__templateColumns;
  element.setAttribute('data-lexical-layout-container', 'true');
  return { element };
}
  updateDOM(prevNode, dom) {
    if (prevNode.__templateColumns !== this.__templateColumns) {
      dom.style.gridTemplateColumns = this.__templateColumns;
    }
    return false;
  }

  static importDOM() {
    const priority = 2;
    return {
      div: (domNode) => {
        if (!domNode.hasAttribute('data-lexical-layout-container')) {
          return null;
        }
        return {
          conversion: $convertLayoutContainerElement,
          priority: /** @type {2} */ (2),
        };
      },
    };
  }

  static importJSON(json) {
    return $createLayoutContainerNode().updateFromJSON(json);
  }

  updateFromJSON(serializedNode) {
    return super.updateFromJSON(serializedNode).setTemplateColumns(serializedNode.templateColumns);
  }

  isShadowRoot() {
    return true;
  }

  canBeEmpty() {
    return false;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      templateColumns: this.__templateColumns,
    };
  }

  getTemplateColumns() {
    return this.getLatest().__templateColumns;
  }

  setTemplateColumns(templateColumns) {
    const self = this.getWritable();
    self.__templateColumns = templateColumns;
    return self;
  }


}

export function $createLayoutContainerNode(templateColumns = '') {
  return new LayoutContainerNode(templateColumns);
}

export function $isLayoutContainerNode(node) {
  return node instanceof LayoutContainerNode;
}

function $convertLayoutContainerElement(domNode) {
  const styleAttributes = window.getComputedStyle(domNode);
  const templateColumns = styleAttributes.getPropertyValue('grid-template-columns');
  if (templateColumns) {
    const node = $createLayoutContainerNode(templateColumns);
    return { node };
  }
  return null;
}

// React Component using JSX
const LayoutContainer = ({ templateColumns, theme }) => {
  const domNode = React.useRef(null);

  React.useEffect(() => {
    if (domNode.current) {
      domNode.current.style.gridTemplateColumns = templateColumns;
      if (typeof theme?.layoutContainer === 'string') {
        addClassNamesToElement(domNode.current, theme.layoutContainer);
      }
    }
  }, [templateColumns, theme]);

  return <div ref={domNode} data-lexical-layout-container="true" />;
};



export default LayoutContainer;








