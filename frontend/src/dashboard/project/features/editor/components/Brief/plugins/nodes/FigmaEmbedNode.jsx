import { DecoratorNode } from "lexical";
import React from "react";

export class FigmaEmbedNode extends DecoratorNode {
  constructor(url, key) {
    super(key);
    this.__url = url;
  }

  static getType() {
    return "figma";
  }

  static clone(node) {
    return new FigmaEmbedNode(node.__url, node.__key);
  }

  createDOM() {
    return document.createElement("div");
  }

  updateDOM() {
    return false;
  }

  static importJSON(serializedNode) {
    const { url } = serializedNode;
    return $createFigmaEmbedNode({ url });
  }

  exportJSON() {
    return {
      type: "figma",
      version: 1,
      url: this.__url,
    };
  }

  setURL(url) {
    const writable = this.getWritable();
    writable.__url = url;
  }

  getURL() {
    return this.__url;
  }

  decorate() {
    return <FigmaEmbed url={this.__url} />;
  }
}

function FigmaEmbed({ url }) {
  const embedUrl = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
  return (
    <iframe
      src={embedUrl}
      style={{ width: "100%", height: "450px", border: "none" }}
      allowFullScreen
      title="Figma Embed"
    />
  );
}

export function $createFigmaEmbedNode({ url }) {
  return new FigmaEmbedNode(url);
}

export function $isFigmaEmbedNode(node) {
  return node instanceof FigmaEmbedNode;
}








