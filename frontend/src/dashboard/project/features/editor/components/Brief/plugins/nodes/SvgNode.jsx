import {
  DecoratorNode,
  $getNodeByKey,
  $copyNode,
  $createNodeSelection,
  $setSelection,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import Moveable from "react-moveable";
import React, { useRef, useState, useLayoutEffect } from "react";
import { applyModifierNodeSelection } from "../slides/slideSelectionUtils";
import {
  DEFAULT_SVG_HEIGHT,
  DEFAULT_SVG_WIDTH,
  cropSvgElementToVisibleBounds,
  getSvgIntrinsicDimensions,
  resolveSvgScaledToWidth,
} from "./svgDimensions";

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
  setSvg(svg) {
    const writable = this.getWritable();
    writable.__svg = svg;
  }
  getSvg() {
    return this.__svg;
  }

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
    return new SvgNode(svg, x, y, width, height);
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
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const ref = useRef(null);

  const copyOnDragRef = useRef(false);
  const didNormalizeRef = useRef(false);

  // live frame (no React state)
  const frameRef = useRef({ x, y, width, height });
  const startRef = useRef({ x, y, width, height });

  const [zoom, setZoom] = useState(1);
  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const modifiers = {
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };
    editor.focus();
    editor.update(() => {
      applyModifierNodeSelection(nodeKey, modifiers);
    });
  };

  // keep ref synced when Lexical updates props
  useLayoutEffect(() => {
    frameRef.current = { x, y, width, height };
    const el = ref.current;
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }, [x, y, width, height]);

  // Crop the SVG to its visible geometry and fit the node box to the resulting aspect ratio.
  useLayoutEffect(() => {
    if (didNormalizeRef.current) return;

    const el = ref.current?.querySelector("svg");
    if (!el) {
      didNormalizeRef.current = true;
      return;
    }

    const svgEl = el;
    const alreadyCropped =
      svgEl.getAttribute("data-mylg-crop") === "visible-2" ||
      svg.includes('data-mylg-crop="visible-2"');

    let desired = null;
    let didCrop = false;

    if (!alreadyCropped) {
      const bounds = cropSvgElementToVisibleBounds(svgEl, { pad: 1, markAttr: true });
      if (bounds) {
        desired = { width: bounds.width, height: bounds.height };
        didCrop = true;
      }
    }

    if (!desired) {
      const intrinsic = getSvgIntrinsicDimensions(svg);
      if (intrinsic && intrinsic.width > 0 && intrinsic.height > 0) {
        desired = intrinsic;
      }
    }

    if (!desired) {
      didNormalizeRef.current = true;
      return;
    }

    const desiredRatio = desired.width / desired.height;
    const currentRatio = width > 0 && height > 0 ? width / height : NaN;
    if (!Number.isFinite(desiredRatio) || !Number.isFinite(currentRatio)) {
      didNormalizeRef.current = true;
      return;
    }

    // If already close enough, don't touch it (avoid unexpected tiny nudges).
    const ratioDelta = Math.abs(currentRatio - desiredRatio) / desiredRatio;
    if (ratioDelta < 0.01) {
      didNormalizeRef.current = true;
      if (didCrop) {
        const serialized = new XMLSerializer().serializeToString(svgEl);
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (!node) return;
          node.setSvg(serialized);
        });
      }
      return;
    }

    // Prefer the smaller change: adjust height based on width, or width based on height.
    const nextHeightFromWidth = width / desiredRatio;
    const nextWidthFromHeight = height * desiredRatio;
    const changeHeight = Math.abs(nextHeightFromWidth - height);
    const changeWidth = Math.abs(nextWidthFromHeight - width);

    let nextWidth = width;
    let nextHeight = height;
    if (changeHeight <= changeWidth) {
      nextHeight = nextHeightFromWidth;
    } else {
      nextWidth = nextWidthFromHeight;
    }

    nextWidth = Math.max(1, Math.round(nextWidth));
    nextHeight = Math.max(1, Math.round(nextHeight));

    // If we're still on the legacy default, prefer scaling from a sane default width.
    if (width === DEFAULT_SVG_WIDTH && height === DEFAULT_SVG_HEIGHT) {
      const scaled = resolveSvgScaledToWidth(svg, DEFAULT_SVG_WIDTH, DEFAULT_SVG_HEIGHT);
      nextWidth = Math.max(1, Math.round(scaled.width));
      nextHeight = Math.max(1, Math.round(scaled.height));
    }

    if (nextWidth === Math.round(width) && nextHeight === Math.round(height)) {
      didNormalizeRef.current = true;
      return;
    }

    didNormalizeRef.current = true;

    // Update DOM immediately to keep Moveable + border aligned in the same frame.
    const immediate = { ...frameRef.current, width: nextWidth, height: nextHeight };
    frameRef.current = immediate;
    applyFrame(immediate);

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!node) return;
      if (didCrop) {
        const serialized = new XMLSerializer().serializeToString(svgEl);
        node.setSvg(serialized);
      }
      node.setWidth(nextWidth);
      node.setHeight(nextHeight);
    });
  }, [editor, nodeKey, svg, width, height]);

  // keep svg sized to box (and don't rerun on every pixel move)
  useLayoutEffect(() => {
    const svgEl = ref.current?.querySelector("svg");
    if (!svgEl) return;
    svgEl.setAttribute("width", "100%");
    svgEl.setAttribute("height", "100%");
    svgEl.style.width = "100%";
    svgEl.style.height = "100%";
    svgEl.style.display = "block";
    if (!svgEl.hasAttribute("preserveAspectRatio")) {
      svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
  }, [svg]);

  // compute zoom from canvas scaler
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scaler = el.closest('.slide-editor__canvas-scaler');
    if (!scaler) return;
    const transform = getComputedStyle(scaler).transform;
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrix(transform);
      const scale = matrix.a; // assuming uniform scale
      setZoom(1 / scale);
    } else {
      setZoom(1);
    }
  });

  const applyFrame = (f) => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${f.x}px`;
    el.style.top = `${f.y}px`;
    el.style.width = `${f.width}px`;
    el.style.height = `${f.height}px`;
  };

  return (
    <>
      <div
        ref={ref}
        onMouseDown={handlePointerDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height,
          boxShadow: isSelected ? "0 0 0 2px rgba(76,154,255,1)" : "none", // no layout shift
          boxSizing: "border-box",
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <Moveable
        target={isSelected ? ref : null}
        draggable
        resizable
        keepRatio={true}              // <-- constrained to original ratio
        origin={false}
        edge={false}
        renderDirections={["nw", "ne", "sw", "se"]}
        useResizeObserver={false}
        useMutationObserver={false}
        throttleDrag={0}
        throttleResize={0}
        zoom={zoom}
        className="moveable-no-border"
        style={{ display: isSelected ? "block" : "none" }}
        onDragStart={(e) => {
          copyOnDragRef.current = !!(e?.inputEvent?.ctrlKey || e?.inputEvent?.metaKey);
          startRef.current = { ...frameRef.current };
        }}
        onDrag={({ beforeTranslate }) => {
          const [dx, dy] = beforeTranslate;
          const f0 = startRef.current;
          const next = { ...frameRef.current, x: f0.x + dx, y: f0.y + dy };
          frameRef.current = next;
          applyFrame(next);
        }}
        onDragEnd={() => {
          const finalFrame = frameRef.current;
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            if (copyOnDragRef.current) {
              const clone = $copyNode(node);
              clone.setX(finalFrame.x);
              clone.setY(finalFrame.y);
              node.insertAfter(clone);
              const sel = $createNodeSelection();
              sel.add(clone.getKey());
              $setSelection(sel);
            } else {
              node.setX(finalFrame.x);
              node.setY(finalFrame.y);
            }
          });
          copyOnDragRef.current = false;
        }}
        onResizeStart={() => {
          startRef.current = { ...frameRef.current };
        }}
        onResize={({ width: w, height: h, drag }) => {
          const [dx, dy] = drag.beforeTranslate;
          const f0 = startRef.current;
          const next = {
            ...frameRef.current,
            x: f0.x + dx,
            y: f0.y + dy,
            width: w,
            height: h,
          };
          frameRef.current = next;
          applyFrame(next);
        }}
        onResizeEnd={() => {
          const finalFrame = frameRef.current;
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            node.setX(finalFrame.x);
            node.setY(finalFrame.y);
            node.setWidth(finalFrame.width);
            node.setHeight(finalFrame.height);
          });
        }}
      />
    </>
  );
}







