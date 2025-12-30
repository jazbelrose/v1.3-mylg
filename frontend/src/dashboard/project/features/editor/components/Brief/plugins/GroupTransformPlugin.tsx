import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import Moveable from "react-moveable";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createNodeSelection, $getNodeByKey, $setSelection, type LexicalNode } from "lexical";
import { getGroupSelectionInfo } from "./slides/grouping";
import { setActiveGroupSelection } from "./slides/groupSelectionStore";
import { duplicateSlideNodes } from "./slides/slideSelectionUtils";

type NodeFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type Bounds = { x: number; y: number; width: number; height: number };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseCssPx(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNodeFrame(node: LexicalNode): NodeFrame | null {
  const anyNode = node as unknown as {
    getX?: () => number;
    getY?: () => number;
    getWidth?: () => number;
    getHeight?: () => number;
    getRotation?: () => number;
    getPosition?: () => { x: number; y: number };
    getSize?: () => { width: number; height: number };
  };

  const pos =
    typeof anyNode.getPosition === "function"
      ? anyNode.getPosition()
      : typeof anyNode.getX === "function" && typeof anyNode.getY === "function"
        ? { x: anyNode.getX(), y: anyNode.getY() }
        : null;

  const size =
    typeof anyNode.getSize === "function"
      ? anyNode.getSize()
      : typeof anyNode.getWidth === "function" && typeof anyNode.getHeight === "function"
        ? { width: anyNode.getWidth(), height: anyNode.getHeight() }
        : null;

  if (!pos || !size) return null;

  const rotation = typeof anyNode.getRotation === "function" ? anyNode.getRotation() : 0;
  return {
    x: isFiniteNumber(pos.x) ? pos.x : 0,
    y: isFiniteNumber(pos.y) ? pos.y : 0,
    width: isFiniteNumber(size.width) ? size.width : 0,
    height: isFiniteNumber(size.height) ? size.height : 0,
    rotation: isFiniteNumber(rotation) ? rotation : 0,
  };
}

function setNodePositionAndSize(node: LexicalNode, next: { x: number; y: number; width?: number; height?: number }) {
  const anyNode = node as unknown as {
    setX?: (value: number) => void;
    setY?: (value: number) => void;
    setWidth?: (value: number) => void;
    setHeight?: (value: number) => void;
    setPosition?: (x: number, y: number) => void;
    setSize?: (width: number, height: number) => void;
    getLocked?: () => boolean;
  };

  if (typeof anyNode.getLocked === "function" && anyNode.getLocked()) return;

  if (typeof anyNode.setPosition === "function") {
    anyNode.setPosition(next.x, next.y);
  } else if (typeof anyNode.setX === "function" && typeof anyNode.setY === "function") {
    anyNode.setX(next.x);
    anyNode.setY(next.y);
  }

  if (typeof next.width === "number" && typeof next.height === "number") {
    if (typeof anyNode.setSize === "function") {
      anyNode.setSize(next.width, next.height);
    } else if (typeof anyNode.setWidth === "function" && typeof anyNode.setHeight === "function") {
      anyNode.setWidth(next.width);
      anyNode.setHeight(next.height);
    }
  }
}

function rectToAabb(frame: NodeFrame): { minX: number; minY: number; maxX: number; maxY: number } {
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const rad = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = frame.width / 2;
  const halfH = frame.height / 2;
  const corners = [
    { dx: -halfW, dy: -halfH },
    { dx: halfW, dy: -halfH },
    { dx: halfW, dy: halfH },
    { dx: -halfW, dy: halfH },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const { dx, dy } of corners) {
    const x = cx + dx * cos - dy * sin;
    const y = cy + dx * sin + dy * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function mergeBounds(frames: NodeFrame[]): Bounds | null {
  if (frames.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const frame of frames) {
    const aabb = rectToAabb(frame);
    minX = Math.min(minX, aabb.minX);
    minY = Math.min(minY, aabb.minY);
    maxX = Math.max(maxX, aabb.maxX);
    maxY = Math.max(maxY, aabb.maxY);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  return { x: minX, y: minY, width, height };
}

function getGroupBoundsFromDom(
  root: HTMLElement,
  host: HTMLElement,
  memberKeys: string[],
  framesByKey: Map<string, NodeFrame>,
  zoom: number
): { bounds: Bounds; originOffset: { x: number; y: number } } | null {
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  if (memberKeys.length < 2) return null;

  const rootRect = root.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const computed = getComputedStyle(root);
  const paddingLeft = parseCssPx(computed.paddingLeft);
  const paddingTop = parseCssPx(computed.paddingTop);

  const rects: Array<{ key: string; rect: DOMRect }> = [];
  for (const key of memberKeys) {
    const el = root.querySelector(`[data-lexical-node-key="${key}"]`) as HTMLElement | null;
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) continue;
    rects.push({ key, rect });
  }

  if (rects.length < 2) return null;

  // Determine whether the model coordinate origin is at the root border box
  // (no padding) or at the root padding box (padding applied).
  let count = 0;
  let noPadErrX = 0;
  let padErrX = 0;
  let noPadErrY = 0;
  let padErrY = 0;

  rects.forEach(({ key, rect }) => {
    const frame = framesByKey.get(key);
    if (!frame) return;
    const domCenterX = (rect.left + rect.right) / 2;
    const domCenterY = (rect.top + rect.bottom) / 2;

    const modelCenterXNoPad = (domCenterX - rootRect.left) * zoom;
    const modelCenterYNoPad = (domCenterY - rootRect.top) * zoom;

    const frameCenterX = frame.x + frame.width / 2;
    const frameCenterY = frame.y + frame.height / 2;

    noPadErrX += (modelCenterXNoPad - frameCenterX) ** 2;
    padErrX += (modelCenterXNoPad - paddingLeft - frameCenterX) ** 2;
    noPadErrY += (modelCenterYNoPad - frameCenterY) ** 2;
    padErrY += (modelCenterYNoPad - paddingTop - frameCenterY) ** 2;
    count += 1;
  });

  const usePaddingX = count > 0 ? padErrX < noPadErrX : true;
  const usePaddingY = count > 0 ? padErrY < noPadErrY : true;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  rects.forEach(({ rect }) => {
    const left = (rect.left - rootRect.left) * zoom - (usePaddingX ? paddingLeft : 0);
    const right = (rect.right - rootRect.left) * zoom - (usePaddingX ? paddingLeft : 0);
    const top = (rect.top - rootRect.top) * zoom - (usePaddingY ? paddingTop : 0);
    const bottom = (rect.bottom - rootRect.top) * zoom - (usePaddingY ? paddingTop : 0);
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  });

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  const rootBorderOffsetX = (rootRect.left - hostRect.left) * zoom;
  const rootBorderOffsetY = (rootRect.top - hostRect.top) * zoom;

  return {
    bounds: { x: minX, y: minY, width, height },
    originOffset: {
      x: rootBorderOffsetX + (usePaddingX ? paddingLeft : 0),
      y: rootBorderOffsetY + (usePaddingY ? paddingTop : 0),
    },
  };
}

export default function GroupTransformPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const targetRef = useRef<HTMLDivElement | null>(null);
  const moveableRef = useRef<Moveable | null>(null);
  const dragOriginOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeOriginOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [zoom, setZoom] = useState(1);

  const [active, setActive] = useState<{
    groupId: string;
    memberKeys: string[];
    bounds: Bounds;
    originOffset: { x: number; y: number };
    locked: boolean;
  } | null>(null);

  const dragStartFrameRef = useRef<Bounds | null>(null);
  const dragSnapshotsRef = useRef<Map<string, NodeFrame>>(new Map());
  const activeKeysRef = useRef<string[]>([]);

  const resizeStartFrameRef = useRef<Bounds | null>(null);
  const resizeSnapshotsRef = useRef<Map<string, NodeFrame>>(new Map());

  useEffect(() => {
    const root = editor.getRootElement();
    const host = root?.parentElement ?? null;
    setPortalHost(host);
    if (!root || !host) return;
  }, [editor]);

  useEffect(() => {
    if (!portalHost) return;
    const scaler = portalHost.closest(".slide-editor__canvas-scaler") as HTMLElement | null;
    if (!scaler) return;

    let rafId = 0;
    const compute = () => {
      const transform = getComputedStyle(scaler).transform;
      let nextZoom = 1;
      if (transform && transform !== "none") {
        try {
          const matrix = new DOMMatrix(transform);
          const scale = matrix.a;
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
  }, [portalHost]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const groupSelection = getGroupSelectionInfo();
        setActiveGroupSelection(groupSelection);

        if (!groupSelection) {
          setActive((prev) => (prev === null ? prev : null));
          return;
        }

        const frames: NodeFrame[] = [];
        const framesByKey = new Map<string, NodeFrame>();
        let locked = false;
        groupSelection.memberKeys.forEach((key) => {
          const node = $getNodeByKey<LexicalNode>(key);
          if (!node) return;
          const frame = getNodeFrame(node);
          if (!frame) return;
          frames.push(frame);
          framesByKey.set(key, frame);
          const maybeLocked = node as unknown as { getLocked?: () => boolean };
          if (typeof maybeLocked.getLocked === "function" && maybeLocked.getLocked()) {
            locked = true;
          }
        });

        const root = editor.getRootElement();
        const host = root?.parentElement ?? null;
        const domResult =
          root && host ? getGroupBoundsFromDom(root, host, groupSelection.memberKeys, framesByKey, zoom) : null;

        const bounds = domResult?.bounds ?? mergeBounds(frames);
        if (!bounds) {
          setActive((prev) => (prev === null ? prev : null));
          return;
        }

        let originOffset = domResult?.originOffset;
        if (!originOffset && root && host && Number.isFinite(zoom) && zoom > 0) {
          const rootRect = root.getBoundingClientRect();
          const hostRect = host.getBoundingClientRect();
          const computed = getComputedStyle(root);
          originOffset = {
            x: (rootRect.left - hostRect.left) * zoom + parseCssPx(computed.paddingLeft),
            y: (rootRect.top - hostRect.top) * zoom + parseCssPx(computed.paddingTop),
          };
        }
        originOffset = originOffset ?? { x: 0, y: 0 };

        setActive((prev) => {
          if (
            prev &&
            prev.groupId === groupSelection.groupId &&
            prev.locked === locked &&
            prev.memberKeys.length === groupSelection.memberKeys.length &&
            prev.memberKeys.every((k, i) => k === groupSelection.memberKeys[i]) &&
            Math.abs(prev.originOffset.x - originOffset.x) < 1e-6 &&
            Math.abs(prev.originOffset.y - originOffset.y) < 1e-6 &&
            Math.abs(prev.bounds.x - bounds.x) < 1e-6 &&
            Math.abs(prev.bounds.y - bounds.y) < 1e-6 &&
            Math.abs(prev.bounds.width - bounds.width) < 1e-6 &&
            Math.abs(prev.bounds.height - bounds.height) < 1e-6
          ) {
            return prev;
          }
          return {
            groupId: groupSelection.groupId,
            memberKeys: groupSelection.memberKeys,
            bounds,
            originOffset,
            locked,
          };
        });
      });
    });
  }, [editor, zoom]);

  const targetStyle = useMemo(() => {
    if (!active) return { display: "none" } as const;
    return {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: `${active.bounds.width}px`,
      height: `${active.bounds.height}px`,
      transform: `translate3d(${active.originOffset.x + active.bounds.x}px, ${active.originOffset.y + active.bounds.y}px, 0)`,
      transformOrigin: "top left",
      background: "transparent",
      pointerEvents: active.locked ? "none" : "auto",
      zIndex: 1000,
    } as const;
  }, [active]);

  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    if (!active) return;
    // Keep Moveable in sync when the selection changes due to other interactions.
    queueMicrotask(() => {
      moveableRef.current?.updateRect?.();
    });
  }, [active]);

  if (!portalHost) return null;

  return ReactDOM.createPortal(
    <>
      <div ref={targetRef} style={targetStyle} contentEditable={false} suppressContentEditableWarning />
      <Moveable
        ref={moveableRef}
        target={active ? targetRef.current : null}
        draggable={Boolean(active && !active.locked)}
        resizable={
          active && !active.locked
            ? { renderDirections: ["nw", "n", "ne", "w", "e", "sw", "s", "se"], keepRatio: false }
            : false
        }
        rotatable={false}
        origin={false}
        edge={false}
        zoom={zoom}
        className="group-moveable"
        controlPadding={16}
        onDragStart={(e) => {
          if (!active) return;
          dragStartFrameRef.current = { ...active.bounds };
          dragOriginOffsetRef.current = { ...active.originOffset };
          activeKeysRef.current = [...active.memberKeys];
          dragSnapshotsRef.current = new Map();
          editor.getEditorState().read(() => {
            active.memberKeys.forEach((key) => {
              const node = $getNodeByKey<LexicalNode>(key);
              if (!node) return;
              const frame = getNodeFrame(node);
              if (!frame) return;
              dragSnapshotsRef.current.set(key, frame);
            });
          });

          const copyGesture = Boolean(
            (e as any)?.inputEvent?.ctrlKey || (e as any)?.inputEvent?.metaKey || (e as any)?.inputEvent?.altKey
          );
          if (!copyGesture) return;

          const snapshots = dragSnapshotsRef.current;
          let cloneKeys: string[] = [];
          let mapping: Array<{ originalKey: string; cloneKey: string }> = [];
          editor.update(() => {
            const result = duplicateSlideNodes(active.memberKeys, { offsetX: 0, offsetY: 0, selectClones: false });
            cloneKeys = result.cloneKeys;
            mapping = result.clones;
            if (cloneKeys.length > 0) {
              const nextSelection = $createNodeSelection();
              cloneKeys.forEach((k) => nextSelection.add(k));
              $setSelection(nextSelection);
            }
          });

          if (cloneKeys.length === 0) return;

          const cloneSnapshots = new Map<string, NodeFrame>();
          mapping.forEach(({ originalKey, cloneKey }) => {
            const snap = snapshots.get(originalKey);
            if (snap) cloneSnapshots.set(cloneKey, snap);
          });

          activeKeysRef.current = cloneKeys;
          dragSnapshotsRef.current = cloneSnapshots;
        }}
        onDrag={(e) => {
          const start = dragStartFrameRef.current;
          if (!start) return;
          const [dx, dy] = e.beforeTranslate;
          const nextBounds = { ...start, x: start.x + dx, y: start.y + dy };

          const target = targetRef.current;
          if (target) {
            const origin = dragOriginOffsetRef.current;
            target.style.width = `${nextBounds.width}px`;
            target.style.height = `${nextBounds.height}px`;
            target.style.transform = `translate3d(${origin.x + nextBounds.x}px, ${origin.y + nextBounds.y}px, 0)`;
          }

          const snapshots = dragSnapshotsRef.current;
          const keys = activeKeysRef.current;
          editor.update(() => {
            keys.forEach((key) => {
              const node = $getNodeByKey<LexicalNode>(key);
              const snap = snapshots.get(key);
              if (!node || !snap) return;
              setNodePositionAndSize(node, { x: snap.x + dx, y: snap.y + dy });
            });
          });
        }}
        onDragEnd={() => {
          dragStartFrameRef.current = null;
          dragSnapshotsRef.current = new Map();
          activeKeysRef.current = [];
          dragOriginOffsetRef.current = { x: 0, y: 0 };
        }}
        onResizeStart={() => {
          if (!active) return;
          resizeStartFrameRef.current = { ...active.bounds };
          resizeOriginOffsetRef.current = { ...active.originOffset };
          resizeSnapshotsRef.current = new Map();
          editor.getEditorState().read(() => {
            active.memberKeys.forEach((key) => {
              const node = $getNodeByKey<LexicalNode>(key);
              if (!node) return;
              const frame = getNodeFrame(node);
              if (!frame) return;
              resizeSnapshotsRef.current.set(key, frame);
            });
          });
        }}
        onResize={(e) => {
          const start = resizeStartFrameRef.current;
          if (!start) return;
          const dx = e.drag?.beforeTranslate?.[0] ?? 0;
          const dy = e.drag?.beforeTranslate?.[1] ?? 0;

          const nextBounds = {
            x: start.x + dx,
            y: start.y + dy,
            width: e.width,
            height: e.height,
          };

          const target = targetRef.current;
          if (target) {
            const origin = resizeOriginOffsetRef.current;
            target.style.width = `${nextBounds.width}px`;
            target.style.height = `${nextBounds.height}px`;
            target.style.transform = `translate3d(${origin.x + nextBounds.x}px, ${origin.y + nextBounds.y}px, 0)`;
          }

          const sx = start.width !== 0 ? nextBounds.width / start.width : 1;
          const sy = start.height !== 0 ? nextBounds.height / start.height : 1;

          const snapshots = resizeSnapshotsRef.current;
          editor.update(() => {
            snapshots.forEach((snap, key) => {
              const node = $getNodeByKey<LexicalNode>(key);
              if (!node) return;

              const centerX = snap.x + snap.width / 2;
              const centerY = snap.y + snap.height / 2;
              const nextCenterX = nextBounds.x + (centerX - start.x) * sx;
              const nextCenterY = nextBounds.y + (centerY - start.y) * sy;
              const nextW = Math.max(1, snap.width * sx);
              const nextH = Math.max(1, snap.height * sy);
              const nextX = nextCenterX - nextW / 2;
              const nextY = nextCenterY - nextH / 2;

              setNodePositionAndSize(node, { x: nextX, y: nextY, width: nextW, height: nextH });
            });
          });
        }}
        onResizeEnd={() => {
          resizeStartFrameRef.current = null;
          resizeSnapshotsRef.current = new Map();
          resizeOriginOffsetRef.current = { x: 0, y: 0 };
        }}
      />
    </>,
    portalHost
  );
}
