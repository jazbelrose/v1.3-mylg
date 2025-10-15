import { DecoratorNode, $getNodeByKey, $copyNode } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import Moveable from "react-moveable";
import React, { useRef, useState } from "react";

export class SvgNode extends DecoratorNode {
  constructor(svg, x = 0, y = 0, width = 300, height = 200, key) {
    super(key);
    this.__svg = svg;
    this.__x = x;
    this.__y = y;
    this.__width = width;
    this.__height = height;
  }

  static getType() {
    return "svg";
  }

  static clone(node) {
    return new SvgNode(
      node.__svg,
      node.__x,
      node.__y,
      node.__width,
      node.__height,
      node.__key
    );
  }

  // getters and setters
  setX(x) {
    const writable = this.getWritable();
    writable.__x = x;
  }
  getX() {
    return this.__x;
  }

  setY(y) {
    const writable = this.getWritable();
    writable.__y = y;
  }
  getY() {
    return this.__y;
  }

  setWidth(width) {
    const writable = this.getWritable();
    writable.__width = width;
  }
  getWidth() {
    return this.__width;
  }

  setHeight(height) {
    const writable = this.getWritable();
    writable.__height = height;
  }
  getHeight() {
    return this.__height;
  }

  createDOM() {
    return document.createElement("div");
  }

  updateDOM() {
    return false;
  }

  static importJSON(serializedNode) {
    const { svg, x, y, width, height } = serializedNode;
    return $createSvgNode({ svg, x, y, width, height });
  }

  exportJSON() {
    return {
      type: "svg",
      version: 1,
      svg: this.__svg,
      x: this.__x,
      y: this.__y,
      width: this.__width,
      height: this.__height,
    };
  }

  decorate() {
    return (
      <MoveableSvg
        svg={this.__svg}
        x={this.__x}
        y={this.__y}
        width={this.__width}
        height={this.__height}
        nodeKey={this.__key}
      />
    );
  }
}

function MoveableSvg({ svg, x, y, width, height, nodeKey }) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const ref = useRef(null);
  const start = useRef({});
  const copyOnDragRef = useRef(false);
  const [localFrame, setLocalFrame] = useState(null);

  const frame = localFrame || { x, y, width, height };

  return (
    <>
      <div
        ref={ref}
        draggable
        onDragStart={(e) => {
          copyOnDragRef.current = e.ctrlKey || e.metaKey;
          e.dataTransfer.setData("lexical-image-drag", nodeKey);
          e.dataTransfer.setData(
            "lexical-image-copy",
            copyOnDragRef.current ? "1" : "0",
          );
          e.dataTransfer.effectAllowed = copyOnDragRef.current ? "copy" : "move";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) {
            setSelected(!isSelected);
          } else {
            
            setSelected(true);
          }
        }}
        style={{
          position: "absolute",
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          border: isSelected ? "2px solid blue" : "none",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <Moveable
        target={ref}
        draggable
        resizable
        keepRatio={false}
        onDragStart={(e) => {
          copyOnDragRef.current = e?.inputEvent?.ctrlKey || e?.inputEvent?.metaKey;
          start.current = { x, y };
          setLocalFrame({ x, y, width, height });
        }}
        onDrag={({ beforeTranslate }) => {
          const [dx, dy] = beforeTranslate;
          const newX = start.current.x + dx;
          const newY = start.current.y + dy;
          setLocalFrame((f) => ({ ...f, x: newX, y: newY }));
        }}
        onDragEnd={() => {
          const finalFrame = localFrame || { x, y };
          setLocalFrame(null);
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            if (copyOnDragRef.current) {
              const clone = $copyNode(node);
              clone.setX(finalFrame.x);
              clone.setY(finalFrame.y);
              node.insertAfter(clone);
            } else {
              node.setX(finalFrame.x);
              node.setY(finalFrame.y);
            }
          });
          copyOnDragRef.current = false;
        }}
        onResizeStart={() => {
          start.current = { x, y, width, height };
          setLocalFrame({ x, y, width, height });
        }}
        onResize={({ width: w, height: h, drag }) => {
          const [dx, dy] = drag.beforeTranslate;
          const newX = start.current.x + dx;
          const newY = start.current.y + dy;
          setLocalFrame((f) => ({ ...f, x: newX, y: newY, width: w, height: h }));
        }}
        onResizeEnd={() => {
          const finalFrame = localFrame || { x, y, width, height };
          setLocalFrame(null);
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            node.setWidth(finalFrame.width);
            node.setHeight(finalFrame.height);
            node.setX(finalFrame.x);
            node.setY(finalFrame.y);
          });
        }}
      />
    </>
  );
}

export function $createSvgNode({ svg, x = 0, y = 0, width = 300, height = 200 }) {
  return new SvgNode(svg, x, y, width, height);
}

export function $isSvgNode(node) {
  return node instanceof SvgNode;
}








