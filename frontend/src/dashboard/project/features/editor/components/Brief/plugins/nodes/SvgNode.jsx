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
import { applyModifierNodeSelection, getSlideNodeSelectionKeys } from "../slides/slideSelectionUtils";
import { TextBoxNode } from "./TextBoxNode";
import { ResizableImageNode } from "./ResizableImageNode";
import {
  DEFAULT_SVG_HEIGHT,
  DEFAULT_SVG_WIDTH,
  cropSvgElementToVisibleBounds,
  getSvgIntrinsicDimensions,
  resolveSvgScaledToWidth,
} from "./svgDimensions";
import rotateArrowSvgRaw from "@/assets/svg/rotate arrow.svg?raw";

const ROTATE_CURSOR_HOTSPOT = { x: 16, y: 16 };
const rotateCursorCache = new Map();

function getSvgInner(svgText) {
  const svgStart = svgText.indexOf("<svg");
  if (svgStart < 0) return "";
  const openEnd = svgText.indexOf(">", svgStart);
  if (openEnd < 0) return "";
  const closeStart = svgText.lastIndexOf("</svg>");
  if (closeStart < 0) return "";
  return svgText.slice(openEnd + 1, closeStart);
}

const rotateArrowInnerSvg = getSvgInner(rotateArrowSvgRaw);

function getRotateCursor(angleDeg, fallback = "grab") {
  const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
  const key = `${normalized}:${fallback}`;
  const cached = rotateCursorCache.get(key);
  if (cached) return cached;

  const svgMarkup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-50 -50 400 400">` +
    `<g transform="rotate(${normalized} 150 150)">` +
    rotateArrowInnerSvg +
    `</g></svg>`;

  const encoded = encodeURIComponent(svgMarkup)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  const cursorValue = `url("data:image/svg+xml,${encoded}") ${ROTATE_CURSOR_HOTSPOT.x} ${ROTATE_CURSOR_HOTSPOT.y}, ${fallback}`;

  rotateCursorCache.set(key, cursorValue);
  return cursorValue;
}

function setForcedRotateCursor(angleDeg) {
  const root = document.documentElement;
  root.style.setProperty("--mylg-rotate-cursor", getRotateCursor(angleDeg, "grab"));
  root.style.setProperty(
    "--mylg-rotate-cursor-grabbing",
    getRotateCursor(angleDeg, "grabbing")
  );
}

function clearForcedRotateCursor() {
  const root = document.documentElement;
  root.style.removeProperty("--mylg-rotate-cursor");
  root.style.removeProperty("--mylg-rotate-cursor-grabbing");
}

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
  const rotateHandleWrapperRef = useRef(null);

  const copyOnDragRef = useRef(false);
  const dragSelectionKeysRef = useRef([]);
  const dragSelectionSnapshotRef = useRef(new Map());
  const didNormalizeRef = useRef(false);
  const [isRotating, setIsRotating] = useState(false);

  // live frame (no React state)
  const frameRef = useRef({ x, y, width, height, rotation });
  const startRef = useRef({ x, y, width, height, rotation });

  const [zoom, setZoom] = useState(1);

  const moveableSyncRafRef = useRef(0);
  const moveableSyncFlagsRef = useRef({ rotateCursors: false, resizeCursors: false });
  const resizeCursorCacheRef = useRef(new Map());

  const getRotateCornerCursor = useCallback((angleDeg) => getRotateCursor(angleDeg), []);

  const getResizeCursor = useCallback((angleDeg, fallback = "auto") => {
    const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
    const key = `${normalized}:${fallback}`;
    const cached = resizeCursorCacheRef.current.get(key);
    if (cached) return cached;

    const svgMarkup =
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
      `<g transform="rotate(${normalized} 16 16)" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      `<line x1="6" y1="16" x2="26" y2="16" stroke="black" stroke-width="4"/>` +
      `<polyline points="10,12 6,16 10,20" stroke="black" stroke-width="4"/>` +
      `<polyline points="22,12 26,16 22,20" stroke="black" stroke-width="4"/>` +
      `<line x1="6" y1="16" x2="26" y2="16" stroke="white" stroke-width="2"/>` +
      `<polyline points="10,12 6,16 10,20" stroke="white" stroke-width="2"/>` +
      `<polyline points="22,12 26,16 22,20" stroke="white" stroke-width="2"/>` +
      `</g></svg>`;

    const encoded = encodeURIComponent(svgMarkup)
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");
    const cursorValue = `url("data:image/svg+xml,${encoded}") 16 16, ${fallback}`;

    resizeCursorCacheRef.current.set(key, cursorValue);
    return cursorValue;
  }, []);

  const updateResizeHandleCursors = useCallback(() => {
    const moveable = moveableRef.current;
    const controlBox = moveable?.controlBox || moveable?.getControlBoxElement?.();
    if (!controlBox) return;

    // Our custom resize cursor SVG is drawn horizontally (↔) at 0deg.
    // So: top/bottom need a 90deg rotation (↕) and left/right keep 0deg (↔).
    const offsets = {
      n: 90,
      s: 90,
      e: 0,
      w: 0,
      // Corner resize cursors: "\" is +45° from vertical, "/" is -45°.
      nw: 45,
      se: 45,
      ne: 315,
      sw: 315,
    };

    const fallbacks = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
    };

    controlBox.querySelectorAll(".moveable-control").forEach((el) => {
      const dir = el.getAttribute("data-direction");
      const offset = offsets[dir];
      if (offset == null) return;

      const cursorRotation = (frameRef.current.rotation || 0) + offset;
      el.style.cursor = getResizeCursor(cursorRotation, fallbacks[dir] || "auto");
    });
  }, [getResizeCursor]);

  const updateRotateCornerCursors = useCallback(() => {
    const moveable = moveableRef.current;
    const controlBox = moveable?.controlBox || moveable?.getControlBoxElement?.();
    if (!controlBox) return;

    controlBox.querySelectorAll(".moveable-around-control").forEach((el) => {
      const cursorRotation = frameRef.current.rotation || 0;
      el.style.cursor = getRotateCornerCursor(cursorRotation);
    });

    updateResizeHandleCursors();
  }, [getRotateCornerCursor, updateResizeHandleCursors]);

  const scheduleMoveableSync = useCallback(
    ({ rotateCursors = false, resizeCursors = false } = {}) => {
      const flags = moveableSyncFlagsRef.current;
      flags.rotateCursors = flags.rotateCursors || rotateCursors;
      flags.resizeCursors = flags.resizeCursors || resizeCursors;

      if (moveableSyncRafRef.current) return;
      moveableSyncRafRef.current = requestAnimationFrame(() => {
        moveableSyncRafRef.current = 0;
        const { rotateCursors: doRotateCursors, resizeCursors: doResizeCursors } =
          moveableSyncFlagsRef.current;
        moveableSyncFlagsRef.current = { rotateCursors: false, resizeCursors: false };

        if (doRotateCursors) {
          updateRotateCornerCursors();
        } else if (doResizeCursors) {
          updateResizeHandleCursors();
        }
      });
    },
    [updateRotateCornerCursors, updateResizeHandleCursors]
  );
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

  const captureDragSelectionSnapshot = useCallback(() => {
    editor.getEditorState().read(() => {
      const selectionKeys = getSlideNodeSelectionKeys();
      const keys =
        selectionKeys.length > 0 && selectionKeys.includes(nodeKey)
          ? selectionKeys
          : [nodeKey];

      const snapshot = new Map();
      keys.forEach((key) => {
        const node = $getNodeByKey(key);
        if (node instanceof TextBoxNode) {
          const { x: tx, y: ty } = node.getPosition();
          snapshot.set(key, { x: tx, y: ty });
        } else if (node instanceof ResizableImageNode) {
          snapshot.set(key, { x: node.getX(), y: node.getY() });
        } else if (node instanceof SvgNode) {
          snapshot.set(key, { x: node.getX(), y: node.getY() });
        }
      });

      dragSelectionKeysRef.current = keys;
      dragSelectionSnapshotRef.current = snapshot;
    });
  }, [editor, nodeKey]);

  // keep ref synced when Lexical updates props
  useLayoutEffect(() => {
    frameRef.current = { x, y, width, height, rotation };
    const el = ref.current;
    if (!el) return;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
    el.style.transformOrigin = "center center";

    if (isSelected) {
      scheduleMoveableSync({ rotateCursors: true });
    }
  }, [x, y, width, height, rotation, isSelected, scheduleMoveableSync]);

  useLayoutEffect(() => {
    return () => {
      if (moveableSyncRafRef.current) {
        cancelAnimationFrame(moveableSyncRafRef.current);
        moveableSyncRafRef.current = 0;
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
    scheduleMoveableSync({ rotateCursors: true });

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

  // compute zoom from canvas scaler (and avoid rerender loops during interactions)
  useLayoutEffect(() => {
    if (!isSelected) {
      setZoom((prev) => (prev === 1 ? prev : 1));
      return;
    }

    const el = ref.current;
    if (!el) return;
    const scaler = el.closest(".slide-editor__canvas-scaler");
    if (!scaler) return;

    let rafId = 0;
    const compute = () => {
      const transform = getComputedStyle(scaler).transform;
      let nextZoom = 1;
      if (transform && transform !== "none") {
        try {
          const matrix = new DOMMatrix(transform);
          const scale = matrix.a; // assuming uniform scale
          if (scale) nextZoom = 1 / scale;
        } catch {
          nextZoom = 1;
        }
      }
      setZoom((prev) => (Math.abs(prev - nextZoom) < 1e-6 ? prev : nextZoom));
    };

    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        compute();
      });
    };

    compute();

    const mo = new MutationObserver(schedule);
    mo.observe(scaler, { attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", schedule);

    return () => {
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isSelected]);

  useLayoutEffect(() => {
    if (!isSelected) return;
    scheduleMoveableSync({ rotateCursors: true });
  }, [isSelected, zoom, scheduleMoveableSync]);

  const applyTransform = (f) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate3d(${f.x}px, ${f.y}px, 0) rotate(${f.rotation || 0}deg)`;
    el.style.transformOrigin = "center center";
  };

  const applySize = (f) => {
    const el = ref.current;
    if (!el) return;
    el.style.width = `${f.width}px`;
    el.style.height = `${f.height}px`;
  };

  const applyFrame = (f) => {
    applySize(f);
    applyTransform(f);
  };

  const initialAngleRef = useRef(0);

  const handleRotateStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const el = ref.current;
    if (!el) return;
    
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    initialAngleRef.current = (angle * 180) / Math.PI;

    setIsRotating(true);
    startRef.current = { ...frameRef.current };

    setForcedRotateCursor(frameRef.current.rotation || 0);
    document.body.classList.add("mylg-force-rotate-cursor", "mylg-force-rotate-cursor-grabbing");
  };

  // Handle rotation via mouse move
  useLayoutEffect(() => {
    if (!isRotating) return;

    function onMouseMove(e) {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const currentDegrees = (currentAngle * 180) / Math.PI;
      
      // Calculate delta from initial angle
      const deltaRotation = currentDegrees - initialAngleRef.current;
      const newRotation = startRef.current.rotation + deltaRotation;

      const next = { ...frameRef.current, rotation: newRotation };
      frameRef.current = next;
      applyTransform(next);
      setForcedRotateCursor(next.rotation || 0);
      
      // Also update rotation handle wrapper to follow the border
      if (rotateHandleWrapperRef.current) {
        rotateHandleWrapperRef.current.style.transform = 
          `translate3d(${next.x}px, ${next.y}px, 0) rotate(${next.rotation}deg)`;
      }
    }

    function onMouseUp() {
      setIsRotating(false);
      document.body.classList.remove(
        "mylg-force-rotate-cursor",
        "mylg-force-rotate-cursor-grabbing"
      );
      clearForcedRotateCursor();
      const finalFrame = frameRef.current;
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;
        node.setX(finalFrame.x);
        node.setY(finalFrame.y);
        node.setRotation(finalFrame.rotation || 0);
      });
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.classList.remove(
        "mylg-force-rotate-cursor",
        "mylg-force-rotate-cursor-grabbing"
      );
      clearForcedRotateCursor();
    };
  }, [isRotating, editor, nodeKey]);

  return (
    <>
      <div
        ref={ref}
        onMouseDown={handlePointerDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`,
          transformOrigin: "center center",
          boxShadow: isSelected ? "0 0 0 2px rgba(76,154,255,1)" : "none", // no layout shift
          boxSizing: "border-box",
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
          willChange: "transform, width, height",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <Moveable
        ref={moveableRef}
        target={isSelected ? ref.current : null}
        draggable
        resizable={{
          renderDirections: ["nw", "n", "ne", "w", "e", "sw", "s", "se"],
          keepRatio: true,
        }}
        rotatable={false}
        origin={false}
        edge={false}
        useResizeObserver={isSelected}
        useMutationObserver={isSelected}
        throttleDrag={0}
        throttleResize={0}
        throttleRotate={0}
        zoom={zoom}
        className="moveable-no-border svg-moveable"
        controlPadding={16}
        onDragStart={(e) => {
          copyOnDragRef.current = !!(e?.inputEvent?.ctrlKey || e?.inputEvent?.metaKey);
          startRef.current = { ...frameRef.current };
          captureDragSelectionSnapshot();
        }}
        onDrag={({ beforeTranslate }) => {
          const [dx, dy] = beforeTranslate;
          const f0 = startRef.current;
          const next = { ...frameRef.current, x: f0.x + dx, y: f0.y + dy };
          frameRef.current = next;
          applyTransform(next);
          // Update rotation handle wrapper to follow
          if (rotateHandleWrapperRef.current) {
            rotateHandleWrapperRef.current.style.transform = 
              `translate3d(${next.x}px, ${next.y}px, 0) rotate(${next.rotation || 0}deg)`;
          }

          const dragKeys = dragSelectionKeysRef.current;
          if (Array.isArray(dragKeys) && dragKeys.length > 1) {
            const snapshots = dragSelectionSnapshotRef.current;
            editor.update(() => {
              const entries =
                snapshots && snapshots.size > 0
                  ? Array.from(snapshots.entries())
                  : [[nodeKey, { x: f0.x, y: f0.y }]];

              entries.forEach(([key, origin]) => {
                if (!origin) return;
                const targetNode = $getNodeByKey(key);
                if (!targetNode) return;
                const nextX = origin.x + dx;
                const nextY = origin.y + dy;
                if (targetNode instanceof TextBoxNode) {
                  targetNode.setPosition(nextX, nextY);
                } else if (targetNode instanceof ResizableImageNode) {
                  targetNode.setX(nextX);
                  targetNode.setY(nextY);
                } else if (targetNode instanceof SvgNode) {
                  targetNode.setX(nextX);
                  targetNode.setY(nextY);
                }
              });
            });
          }
        }}
        onDragEnd={() => {
          const dragKeys = dragSelectionKeysRef.current;
          dragSelectionKeysRef.current = [];
          dragSelectionSnapshotRef.current = new Map();

          if (Array.isArray(dragKeys) && dragKeys.length > 1) {
            copyOnDragRef.current = false;
            return;
          }

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
          // Force immediate control box update to prevent lag
          if (moveableRef.current) {
            moveableRef.current.updateRect();
          }
          // Update rotation handle wrapper to follow
          if (rotateHandleWrapperRef.current) {
            rotateHandleWrapperRef.current.style.transform = 
              `translate3d(${next.x}px, ${next.y}px, 0) rotate(${next.rotation || 0}deg)`;
            rotateHandleWrapperRef.current.style.width = `${next.width}px`;
            rotateHandleWrapperRef.current.style.height = `${next.height}px`;
          }
          scheduleMoveableSync({ resizeCursors: true });
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
      />

      {/* Custom rotation handle */}
      {isSelected && (
        <div
          ref={rotateHandleWrapperRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: width,
            height: height,
            transform: `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
            zIndex: 1001,
            overflow: "visible",
          }}
        >
          {/* Line connecting to handle */}
          <div
            style={{
              position: "absolute",
              top: "0",
              left: "50%",
              width: "2px",
              height: "60px",
              backgroundColor: "#4C9AFF",
              transform: "translateX(-50%) translateY(-100%)",
              pointerEvents: "none",
            }}
          />
          {/* Rotation handle dot */}
          <div
            className="mylg-rotate-handle"
            style={{
              position: "absolute",
              top: "-60px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "12px",
              height: "12px",
              backgroundColor: "#fff",
              border: "2px solid #4C9AFF",
              borderRadius: "50%",
              cursor: getRotateCursor(rotation || 0),
              pointerEvents: "all",
            }}
            onMouseDown={handleRotateStart}
            title="Rotate"
          />
        </div>
      )}
    </>
  );
}







