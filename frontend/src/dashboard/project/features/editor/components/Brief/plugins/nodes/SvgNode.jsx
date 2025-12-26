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
import React, { useCallback, useRef, useState, useLayoutEffect } from "react";
import { applyModifierNodeSelection } from "../slides/slideSelectionUtils";
import {
  DEFAULT_SVG_HEIGHT,
  DEFAULT_SVG_WIDTH,
  cropSvgElementToVisibleBounds,
  getSvgIntrinsicDimensions,
  resolveSvgScaledToWidth,
} from "./svgDimensions";

export class SvgNode extends DecoratorNode {
  constructor(svg, x = 0, y = 0, width = 300, height = 200, rotation = 0, key) {
    super(key);
    this.__svg = svg;
    this.__x = x;
    this.__y = y;
    this.__width = width;
    this.__height = height;
    this.__rotation = rotation;
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
      node.__rotation,
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

  setRotation(rotation) {
    const writable = this.getWritable();
    writable.__rotation = rotation;
  }
  getRotation() {
    return this.__rotation;
  }

  createDOM() {
    return document.createElement("div");
  }

  updateDOM() {
    return false;
  }

  static importJSON(serializedNode) {
    const { svg, x, y, width, height, rotation = 0 } = serializedNode;
    return new SvgNode(svg, x, y, width, height, rotation);
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
      rotation: this.__rotation,
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
        rotation={this.__rotation}
        nodeKey={this.__key}
      />
    );
  }
}

function MoveableSvg({ svg, x, y, width, height, rotation, nodeKey }) {
  const [editor] = useLexicalComposerContext();
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const ref = useRef(null);
  const moveableRef = useRef(null);

  const copyOnDragRef = useRef(false);
  const didNormalizeRef = useRef(false);

  // live frame (no React state)
  const frameRef = useRef({ x, y, width, height, rotation });
  const startRef = useRef({ x, y, width, height, rotation });

  const [zoom, setZoom] = useState(1);

  const rotateCursorCacheRef = useRef(new Map());
  const rotateCursorRafRef = useRef(0);

  const getRotateCornerCursor = useCallback((angleDeg) => {
    const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
    const cached = rotateCursorCacheRef.current.get(normalized);
    if (cached) return cached;

    const svgMarkup =
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
      `<g transform="rotate(${normalized} 16 16)">` +
      `<path d="M16 6 A10 10 0 0 1 26 16" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M16 6 A10 10 0 0 1 26 16" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M20 6 L13 2 L13 10 Z" fill="white"/>` +
      `<path d="M19 6 L14 3 L14 9 Z" fill="black"/>` +
      `<path d="M26 20 L22 13 L30 13 Z" fill="white"/>` +
      `<path d="M26 19 L23 14 L29 14 Z" fill="black"/>` +
      `</g></svg>`;

    const encoded = encodeURIComponent(svgMarkup);
    const cursorValue = `url("data:image/svg+xml,${encoded}") 16 16, grab`;

    rotateCursorCacheRef.current.set(normalized, cursorValue);
    return cursorValue;
  }, []);

  const updateRotateCornerCursors = useCallback(() => {
    const moveable = moveableRef.current;
    const controlBox = moveable?.controlBox || moveable?.getControlBoxElement?.();
    if (!controlBox) return;

    const cornerOffsets = {
      ne: 0,
      se: 90,
      sw: 180,
      nw: 270,
    };

    controlBox.querySelectorAll(".moveable-around-control").forEach((el) => {
      const dir = el.getAttribute("data-direction");
      const offset = cornerOffsets[dir];
      if (offset == null) return;

      const cursorRotation = (frameRef.current.rotation || 0) + offset;
      el.style.cursor = getRotateCornerCursor(cursorRotation);
    });
  }, [getRotateCornerCursor]);

  const scheduleRotateCornerCursorUpdate = useCallback(() => {
    if (rotateCursorRafRef.current) {
      cancelAnimationFrame(rotateCursorRafRef.current);
    }
    rotateCursorRafRef.current = requestAnimationFrame(() => {
      rotateCursorRafRef.current = 0;
      updateRotateCornerCursors();
    });
  }, [updateRotateCornerCursors]);
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
    frameRef.current = { x, y, width, height, rotation };
    const el = ref.current;
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.transform = `rotate(${rotation}deg)`;
    el.style.transformOrigin = "center center";

    if (isSelected) {
      scheduleRotateCornerCursorUpdate();
    }
  }, [x, y, width, height, rotation, isSelected, scheduleRotateCornerCursorUpdate]);

  useLayoutEffect(() => {
    return () => {
      if (rotateCursorRafRef.current) {
        cancelAnimationFrame(rotateCursorRafRef.current);
        rotateCursorRafRef.current = 0;
      }
    };
  }, []);

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
    el.style.transform = `rotate(${f.rotation || 0}deg)`;
    el.style.transformOrigin = "center center";
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
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center center",
          boxShadow: isSelected ? "0 0 0 2px rgba(76,154,255,1)" : "none", // no layout shift
          boxSizing: "border-box",
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <Moveable
        ref={moveableRef}
        target={isSelected ? ref : null}
        draggable
        resizable={{
          renderDirections: ["nw", "ne", "sw", "se"],
          keepRatio: true,
        }}
        rotatable={true}
        // Resize when pointer is directly on the corner handle (moveable-control),
        // rotate when pointer is just outside it (moveable-around-control).
        rotateAroundControls={true}
        origin={false}
        edge={false}
        useResizeObserver={false}
        useMutationObserver={false}
        throttleDrag={0}
        throttleResize={0}
        throttleRotate={0}
        zoom={zoom}
        className="moveable-no-border svg-moveable"
        controlPadding={32}
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
              clone.setRotation(finalFrame.rotation || 0);
              node.insertAfter(clone);
              const sel = $createNodeSelection();
              sel.add(clone.getKey());
              $setSelection(sel);
            } else {
              node.setX(finalFrame.x);
              node.setY(finalFrame.y);
              node.setRotation(finalFrame.rotation || 0);
            }
          });
          copyOnDragRef.current = false;
        }}
        onResizeStart={(e) => {
          startRef.current = { ...frameRef.current };
          // Default is proportional (keepRatio: true), but allow free resize via Alt.
          if (e?.inputEvent?.altKey && typeof e.setKeepRatio === "function") {
            e.setKeepRatio(false);
          }
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
            node.setRotation(finalFrame.rotation || 0);
          });
        }}
        onRotateStart={() => {
          startRef.current = { ...frameRef.current };
        }}
        onRotate={({ beforeRotate, drag }) => {
          const [dx, dy] = drag?.beforeTranslate ?? [0, 0];
          const f0 = startRef.current;
          const next = {
            ...frameRef.current,
            x: f0.x + dx,
            y: f0.y + dy,
            rotation: beforeRotate,
          };
          frameRef.current = next;
          applyFrame(next);
          scheduleRotateCornerCursorUpdate();
        }}
        onRotateEnd={() => {
          const finalFrame = frameRef.current;
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            node.setX(finalFrame.x);
            node.setY(finalFrame.y);
            node.setRotation(finalFrame.rotation || 0);
          });
        }}
      />
    </>
  );
}







