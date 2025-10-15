import React from 'react';
import { DecoratorNode } from 'lexical';
import { getFileUrl } from '@/shared/utils/api';

export class FileEmbedNode extends DecoratorNode {
  constructor(url, name, key) {
    super(key);
    this.__url = url;
    this.__name = name;
  }

  static getType() {
    return 'file-embed';
  }

  static clone(node) {
    return new FileEmbedNode(node.__url, node.__name, node.__key);
  }

  createDOM() {
    return document.createElement('span');
  }

  updateDOM() {
    return false;
  }

  static importJSON(serializedNode) {
    const { url, name } = serializedNode;
    return $createFileEmbedNode({ url, name });
  }

  exportJSON() {
    return {
      type: 'file-embed',
      version: 1,
      url: this.__url,
      name: this.__name,
    };
  }

  getUrl() {
    return this.__url;
  }

  getName() {
    return this.__name;
  }

  decorate() {
    const name = this.__name || this.__url.split('/').pop();
    return (
      <a href={getFileUrl(this.__url)} target="_blank" rel="noopener noreferrer">
        {name}
      </a>
    );
  }
}

export function $createFileEmbedNode({ url, name }) {
  return new FileEmbedNode(url, name);
}









