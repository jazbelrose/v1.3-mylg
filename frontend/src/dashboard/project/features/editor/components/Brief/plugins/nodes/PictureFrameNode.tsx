import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { uploadData } from "aws-amplify/storage";
import Moveable from "react-moveable";
import {
  DecoratorNode,
  $getNodeByKey,
  $createNodeSelection,
  $setSelection,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";

import { ProjectsContext } from "@/app/contexts/ProjectsContext";
import { S3_PUBLIC_BASE, getFileUrl } from "@/shared/utils/api";
import {
  applyModifierNodeSelection,
  duplicateSlideNodes,
  getSlideNodeSelectionKeys,
} from "../slides/slideSelectionUtils";

export type PictureFrameFitMode = "cover" | "contain";

export type PictureFrameBorder = {
  enabled: boolean;
  width: number;
  color: string;
};

export type SerializedPictureFrameNode = {
  type: "picture-frame";
  version: 2;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  imageSrc: string | null;
  fit: PictureFrameFitMode;
  radius: number;
  positionX: number;
  positionY: number;
  border: PictureFrameBorder;
  background: string;
  locked?: boolean;
};

const DEFAULT_FRAME_WIDTH = 320;
const DEFAULT_FRAME_HEIGHT = 240;
const DEFAULT_RADIUS = 16;
const DEFAULT_FIT: PictureFrameFitMode = "cover";
const DEFAULT_POSITION = { x: 50, y: 50 };
const DEFAULT_BORDER: PictureFrameBorder = { enabled: false, width: 2, color: "#ffffff" };
const DEFAULT_BACKGROUND = "#2a2c2f";

const encodeS3Key = (key: string = "") =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\+/g, "%20"))
    .join("/");

async function uploadImageFileToS3PublicUrl(file: File, projectId: string): Promise<string | null> {
  const key = `projects/${projectId}/lexical/${file.name}`;
  try {
    await uploadData({
      key,
      data: file,
      options: { accessLevel: "public" },
    });
    const publicKey = key.startsWith("public/") ? key : `public/${key}`;
    return `${S3_PUBLIC_BASE}${encodeS3Key(publicKey)}`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("PictureFrame: upload failed, falling back to local preview", err);
    return null;
  }
}

function isImageFile(file: File): boolean {
  const type = file.type?.toLowerCase() ?? "";
  if (type.startsWith("image/")) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Boolean(ext && ["png", "jpg", "jpeg", "gif", "webp"].includes(ext));
}

function getStackablePosition(node: LexicalNode): { x: number; y: number } | null {
  const anyNode = node as unknown as {
    getX?: () => number;
    getY?: () => number;
    getPosition?: () => { x: number; y: number };
  };
  if (typeof anyNode.getPosition === "function") {
    return anyNode.getPosition();
  }
  if (typeof anyNode.getX === "function" && typeof anyNode.getY === "function") {
    return { x: anyNode.getX(), y: anyNode.getY() };
  }
  return null;
}

function setStackablePosition(node: LexicalNode, x: number, y: number): void {
  const anyNode = node as unknown as {
    setX?: (value: number) => void;
    setY?: (value: number) => void;
    setPosition?: (x: number, y: number) => void;
    getLocked?: () => boolean;
  };
  if (typeof anyNode.getLocked === "function" && anyNode.getLocked()) {
    return;
  }
  if (typeof anyNode.setPosition === "function") {
    anyNode.setPosition(x, y);
    return;
  }
  if (typeof anyNode.setX === "function" && typeof anyNode.setY === "function") {
    anyNode.setX(x);
    anyNode.setY(y);
  }
}

export class PictureFrameNode extends DecoratorNode<React.ReactNode> {
  __x: number;
  __y: number;
  __width: number;
  __height: number;
  __rotation: number;
  __imageSrc: string | null;
  __fit: PictureFrameFitMode;
  __radius: number;
  __positionX: number;
  __positionY: number;
  __border: PictureFrameBorder;
  __background: string;
  __locked: boolean;

  static getType(): string {
    return "picture-frame";
  }

  static clone(node: PictureFrameNode): PictureFrameNode {
    return new PictureFrameNode(
      node.__x,
      node.__y,
      node.__width,
      node.__height,
      node.__rotation,
      node.__imageSrc,
      node.__fit,
      node.__radius,
      { x: node.__positionX, y: node.__positionY },
      node.__border,
      node.__background,
      node.__key,
      node.__locked
    );
  }

  constructor(
    x = 0,
    y = 0,
    width = DEFAULT_FRAME_WIDTH,
    height = DEFAULT_FRAME_HEIGHT,
    rotation = 0,
    imageSrc: string | null = null,
    fit: PictureFrameFitMode = DEFAULT_FIT,
    radius = DEFAULT_RADIUS,
    position: { x: number; y: number } = DEFAULT_POSITION,
    border: PictureFrameBorder = DEFAULT_BORDER,
    background: string = DEFAULT_BACKGROUND,
    key?: NodeKey,
    locked = false
  ) {
    super(key);
    this.__x = x;
    this.__y = y;
    this.__width = width;
    this.__height = height;
    this.__rotation = rotation;
    this.__imageSrc = imageSrc;
    this.__fit = fit;
    this.__radius = radius;
    this.__positionX = Number.isFinite(position?.x) ? position.x : DEFAULT_POSITION.x;
    this.__positionY = Number.isFinite(position?.y) ? position.y : DEFAULT_POSITION.y;
    this.__border = border;
    this.__background = background;
    this.__locked = locked;
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  getX(): number {
    return this.__x;
  }
  getY(): number {
    return this.__y;
  }
  getWidth(): number {
    return this.__width;
  }
  getHeight(): number {
    return this.__height;
  }
  getRotation(): number {
    return this.__rotation;
  }

  setX(x: number): void {
    this.getWritable().__x = x;
  }
  setY(y: number): void {
    this.getWritable().__y = y;
  }
  setWidth(width: number): void {
    this.getWritable().__width = width;
  }
  setHeight(height: number): void {
    this.getWritable().__height = height;
  }
  setRotation(rotation: number): void {
    this.getWritable().__rotation = rotation;
  }

  getImageSrc(): string | null {
    return this.__imageSrc;
  }
  setImageSrc(src: string | null): void {
    this.getWritable().__imageSrc = src;
  }

  getFit(): PictureFrameFitMode {
    return this.__fit;
  }
  setFit(fit: PictureFrameFitMode): void {
    this.getWritable().__fit = fit;
  }

  getRadius(): number {
    return this.__radius;
  }
  setRadius(radius: number): void {
    this.getWritable().__radius = Math.max(0, Number(radius) || 0);
  }

  getImagePosition(): { x: number; y: number } {
    return { x: this.__positionX, y: this.__positionY };
  }

  setImagePosition(position: Partial<{ x: number; y: number }>): void {
    const writable = this.getWritable();
    if (typeof position.x === "number" && Number.isFinite(position.x)) {
      writable.__positionX = Math.max(0, Math.min(100, position.x));
    }
    if (typeof position.y === "number" && Number.isFinite(position.y)) {
      writable.__positionY = Math.max(0, Math.min(100, position.y));
    }
  }

  getBorder(): PictureFrameBorder {
    return { ...this.__border };
  }
  setBorder(border: Partial<PictureFrameBorder>): void {
    const writable = this.getWritable();
    writable.__border = { ...writable.__border, ...border };
  }

  getBackground(): string {
    return this.__background;
  }
  setBackground(background: string): void {
    this.getWritable().__background = background;
  }

  getLocked(): boolean {
    return this.__locked;
  }
  setLocked(locked: boolean): void {
    this.getWritable().__locked = locked;
  }

  static importJSON(serializedNode: SerializedPictureFrameNode): PictureFrameNode {
    return new PictureFrameNode(
      Number(serializedNode.x) || 0,
      Number(serializedNode.y) || 0,
      Number(serializedNode.width) || DEFAULT_FRAME_WIDTH,
      Number(serializedNode.height) || DEFAULT_FRAME_HEIGHT,
      Number(serializedNode.rotation) || 0,
      typeof serializedNode.imageSrc === "string" ? serializedNode.imageSrc : null,
      (serializedNode.fit === "contain" ? "contain" : "cover") as PictureFrameFitMode,
      Number.isFinite(Number(serializedNode.radius)) ? Number(serializedNode.radius) : DEFAULT_RADIUS,
      {
        x: Number.isFinite(Number((serializedNode as any).positionX))
          ? Number((serializedNode as any).positionX)
          : DEFAULT_POSITION.x,
        y: Number.isFinite(Number((serializedNode as any).positionY))
          ? Number((serializedNode as any).positionY)
          : DEFAULT_POSITION.y,
      },
      typeof serializedNode.border === "object" && serializedNode.border
        ? {
            enabled: Boolean(serializedNode.border.enabled),
            width: Number(serializedNode.border.width) || DEFAULT_BORDER.width,
            color: String(serializedNode.border.color || DEFAULT_BORDER.color),
          }
        : DEFAULT_BORDER,
      typeof serializedNode.background === "string" ? serializedNode.background : DEFAULT_BACKGROUND,
      undefined,
      Boolean(serializedNode.locked)
    );
  }

  exportJSON(): SerializedPictureFrameNode {
    return {
      type: "picture-frame",
      version: 2,
      x: this.__x,
      y: this.__y,
      width: this.__width,
      height: this.__height,
      rotation: this.__rotation,
      imageSrc: this.__imageSrc,
      fit: this.__fit,
      radius: this.__radius,
      positionX: this.__positionX,
      positionY: this.__positionY,
      border: this.__border,
      background: this.__background,
      locked: this.__locked,
    };
  }

  decorate(): React.ReactNode {
    return (
      <PictureFrameComponent
        nodeKey={this.__key}
        x={this.__x}
        y={this.__y}
        width={this.__width}
        height={this.__height}
        rotation={this.__rotation}
        imageSrc={this.__imageSrc ? getFileUrl(this.__imageSrc) : null}
        fit={this.__fit}
        radius={this.__radius}
        positionX={this.__positionX}
        positionY={this.__positionY}
        border={this.__border}
        background={this.__background}
        locked={this.__locked}
      />
    );
  }
}

export function $createPictureFrameNode(options: Partial<Omit<SerializedPictureFrameNode, "type" | "version">> = {}) {
  return new PictureFrameNode(
    options.x ?? 0,
    options.y ?? 0,
    options.width ?? DEFAULT_FRAME_WIDTH,
    options.height ?? DEFAULT_FRAME_HEIGHT,
    options.rotation ?? 0,
    options.imageSrc ?? null,
    (options.fit ?? DEFAULT_FIT) as PictureFrameFitMode,
    options.radius ?? DEFAULT_RADIUS,
    {
      x: typeof (options as any).positionX === "number" ? (options as any).positionX : DEFAULT_POSITION.x,
      y: typeof (options as any).positionY === "number" ? (options as any).positionY : DEFAULT_POSITION.y,
    },
    options.border ?? DEFAULT_BORDER,
    options.background ?? DEFAULT_BACKGROUND,
    undefined,
    Boolean(options.locked)
  );
}

export function $isPictureFrameNode(node: LexicalNode | null | undefined): node is PictureFrameNode {
  return node instanceof PictureFrameNode;
}

function PictureFrameComponent({
  nodeKey,
  x,
  y,
  width,
  height,
  rotation,
  imageSrc,
  fit,
  radius,
  positionX,
  positionY,
  border,
  background,
  locked,
}: {
  nodeKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  imageSrc: string | null;
  fit: PictureFrameFitMode;
  radius: number;
  positionX: number;
  positionY: number;
  border: PictureFrameBorder;
  background: string;
  locked: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const projectsCtx = useContext(ProjectsContext);
  const activeProject = projectsCtx?.activeProject ?? null;
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const ref = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef({ x, y, width, height, rotation });
  const startRef = useRef({ x, y, width, height, rotation });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  const suppressedToggleOnPointerDownRef = useRef(false);
  const suppressedToggleModifiersRef = useRef<
    | null
    | {
        ctrlKey: boolean;
        metaKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
      }
  >(null);

  const copyDragActiveRef = useRef(false);
  const copyDragCloneKeysRef = useRef<string[]>([]);
  const copyDragCloneSnapshotRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const panStartRef = useRef({ clientX: 0, clientY: 0, posX: DEFAULT_POSITION.x, posY: DEFAULT_POSITION.y });

  const dragSelectionKeysRef = useRef<string[]>([]);
  const dragSelectionSnapshotRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    frameRef.current = { x, y, width, height, rotation };
  }, [x, y, width, height, rotation]);

  const isSlideLocked = Boolean(locked);

  const captureDragSelectionSnapshot = useCallback(() => {
    editor.getEditorState().read(() => {
      const keys = getSlideNodeSelectionKeys();
      const normalizedKeys = keys.length > 0 ? keys : [nodeKey];
      const snapshot = new Map<string, { x: number; y: number }>();
      normalizedKeys.forEach((key) => {
        const node = $getNodeByKey<LexicalNode>(key);
        if (!node) return;
        const pos = getStackablePosition(node);
        if (!pos) return;
        snapshot.set(key, pos);
      });
      dragSelectionKeysRef.current = normalizedKeys;
      dragSelectionSnapshotRef.current = snapshot;
    });
  }, [editor, nodeKey]);

  const applyTransform = useCallback((f: typeof frameRef.current) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate3d(${f.x}px, ${f.y}px, 0) rotate(${f.rotation || 0}deg)`;
    el.style.transformOrigin = "center center";
  }, []);

  const applySize = useCallback((f: typeof frameRef.current) => {
    const el = ref.current;
    if (!el) return;
    el.style.width = `${f.width}px`;
    el.style.height = `${f.height}px`;
  }, []);

  const applyFrame = useCallback(
    (f: typeof frameRef.current) => {
      applySize(f);
      applyTransform(f);
    },
    [applySize, applyTransform]
  );

  // Keep Moveable controls usable under zoom.
  useEffect(() => {
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
  }, [isSelected]);

  const handlePointerDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const modifiers = {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      };
      const suppressToggle = Boolean((modifiers.ctrlKey || modifiers.metaKey) && isSelected);
      suppressedToggleOnPointerDownRef.current = suppressToggle;
      suppressedToggleModifiersRef.current = suppressToggle ? modifiers : null;

      editor.focus();
      editor.update(() => {
        if (suppressToggle) {
          applyModifierNodeSelection(nodeKey, { ...modifiers, ctrlKey: false, metaKey: false });
        } else {
          applyModifierNodeSelection(nodeKey, modifiers);
        }
      });
    },
    [editor, isSelected, nodeKey]
  );

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!suppressedToggleOnPointerDownRef.current) return;
    suppressedToggleOnPointerDownRef.current = false;
    const modifiers = suppressedToggleModifiersRef.current;
    suppressedToggleModifiersRef.current = null;
    if (!modifiers) return;
    editor.focus();
    editor.update(() => {
      applyModifierNodeSelection(nodeKey, modifiers);
    });
  }, [editor, nodeKey]);

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;

      // Dragging the image right should reveal more of the left side (and vice-versa).
      const nextX = panStartRef.current.posX - (dx / rect.width) * 100;
      const nextY = panStartRef.current.posY - (dy / rect.height) * 100;

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof PictureFrameNode) {
          node.setImagePosition({ x: nextX, y: nextY });
        }
      });
    };

    const onUp = () => {
      setIsPanning(false);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editor, isPanning, nodeKey]);

  useEffect(() => {
    const root = editor.getRootElement();
    const target: HTMLElement | Window = root ?? window;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSelected || isSlideLocked) return;

      // Let slide-level z-order shortcuts (Ctrl/?[ and Ctrl/?]) bubble so SlideEditor can handle them.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const isBracketRight = event.key === "]" || event.code === "BracketRight";
        const isBracketLeft = event.key === "[" || event.code === "BracketLeft";
        if (isBracketRight || isBracketLeft) {
          return;
        }
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;

      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        const selectionKeys = getSlideNodeSelectionKeys();
        const keys = selectionKeys.length > 0 ? selectionKeys : [nodeKey];
        for (const key of keys) {
          const node = $getNodeByKey<LexicalNode>(key);
          if (!node) continue;
          if (typeof (node as unknown as { getLocked?: () => boolean }).getLocked === "function") {
            if ((node as unknown as { getLocked: () => boolean }).getLocked()) continue;
          }
          const type = node.getType();
          if (!["picture-frame", "resizable-image", "image", "svg", "text-box"].includes(type)) {
            continue;
          }
          node.remove();
        }
      });
    };

    target.addEventListener("keydown", handleKeyDown, true);
    return () => {
      target.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editor, isSelected, isSlideLocked, nodeKey]);

  const handlePanStartCapture = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      if (isSlideLocked) return;
      if (!event.altKey) return;
      if (!imageSrc) return;

      // Capture phase to prevent Moveable from starting a drag before React handlers run.
      event.preventDefault();
      event.stopPropagation();

      editor.focus();
      editor.update(() => {
        applyModifierNodeSelection(nodeKey, event);
      });

      setIsPanning(true);
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        posX: Number.isFinite(positionX) ? positionX : DEFAULT_POSITION.x,
        posY: Number.isFinite(positionY) ? positionY : DEFAULT_POSITION.y,
      };
    },
    [editor, imageSrc, isSlideLocked, nodeKey, positionX, positionY]
  );

  const resolveDroppedSrc = useCallback(
    async (file: File): Promise<string> => {
      const projectId = activeProject?.projectId ?? null;
      if (projectId) {
        const uploaded = await uploadImageFileToS3PublicUrl(file, projectId);
        if (uploaded) return uploaded;
      }
      return URL.createObjectURL(file);
    },
    [activeProject?.projectId]
  );

  const onDragOverCapture = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDropCapture = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isSlideLocked) return;

      const files = Array.from(e.dataTransfer?.files || []);
      const file = files.find((f) => isImageFile(f));
      if (!file) return;

      const src = await resolveDroppedSrc(file);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof PictureFrameNode) {
          node.setImageSrc(src);
        }
      });
    },
    [editor, isSlideLocked, nodeKey, resolveDroppedSrc]
  );

  const borderCss = useMemo(() => {
    if (!border?.enabled) return "none";
    const w = Number(border.width) || 0;
    const c = border.color || "#ffffff";
    return `${Math.max(0, w)}px solid ${c}`;
  }, [border]);

  const placeholderStyle = useMemo(() => {
    return {
      backgroundColor: background || DEFAULT_BACKGROUND,
      backgroundImage:
        "linear-gradient(45deg, rgba(255,255,255,0.07) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.07) 75%, rgba(255,255,255,0.07)), " +
        "linear-gradient(45deg, rgba(255,255,255,0.07) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.07) 75%, rgba(255,255,255,0.07))",
      backgroundPosition: "0 0, 10px 10px",
      backgroundSize: "20px 20px",
    } as const;
  }, [background]);

  const showSelectedOutline = isSelected && !isSlideLocked;

  return (
    <div onDragOverCapture={onDragOverCapture} onDropCapture={onDropCapture}>
      <div
        ref={ref}
        data-lexical-node-key={nodeKey}
        onMouseDownCapture={handlePanStartCapture}
        onMouseDown={handlePointerDown}
        onClick={handleClick}
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`,
          transformOrigin: "center center",
          userSelect: "none",
          touchAction: "none",
          outline: showSelectedOutline ? "2px solid rgba(76,154,255,1)" : "none",
          outlineOffset: 0,
          cursor: isSlideLocked ? "not-allowed" : isPanning ? "grabbing" : imageSrc ? "grab" : "default",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: `${Math.max(0, radius)}px`,
            overflow: "hidden",
            border: borderCss,
            boxSizing: "border-box",
            background: placeholderStyle.backgroundColor,
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Picture Frame"
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: fit,
                objectPosition: `${Math.max(0, Math.min(100, positionX))}% ${Math.max(0, Math.min(100, positionY))}%`,
                pointerEvents: "none",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                ...placeholderStyle,
              }}
            />
          )}
        </div>
        {isSlideLocked && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              pointerEvents: "none",
            }}
          >
            Locked
          </div>
        )}
      </div>

      {showSelectedOutline && (
        <Moveable
          target={ref.current}
          draggable={!isSlideLocked}
          resizable={{
            renderDirections: ["nw", "n", "ne", "w", "e", "sw", "s", "se"],
            keepRatio: false,
          }}
          rotatable={false}
          origin={false}
          edge={false}
          useResizeObserver={true}
          useMutationObserver={true}
          throttleDrag={0}
          throttleResize={0}
          throttleRotate={0}
          zoom={zoom}
          className="moveable-no-border svg-moveable"
          controlPadding={16}
          onDragStart={(e) => {
            startRef.current = { ...frameRef.current };
            captureDragSelectionSnapshot();

            suppressedToggleOnPointerDownRef.current = false;
            suppressedToggleModifiersRef.current = null;

            copyDragActiveRef.current = false;
            copyDragCloneKeysRef.current = [];
            copyDragCloneSnapshotRef.current = new Map();

            const copyGesture = Boolean(e?.inputEvent?.ctrlKey || e?.inputEvent?.metaKey);
            if (!copyGesture) return;

            const dragKeys = dragSelectionKeysRef.current;
            if (!Array.isArray(dragKeys) || dragKeys.length === 0) return;

            const dragSnapshots = dragSelectionSnapshotRef.current;
            let cloneKeys: string[] = [];
            let mapping: Array<{ originalKey: string; cloneKey: string }> = [];
            editor.update(() => {
              const result = duplicateSlideNodes(dragKeys, {
                offsetX: 0,
                offsetY: 0,
                selectClones: false,
              });
              cloneKeys = result.cloneKeys;
              mapping = result.clones;
            });

            const cloneSnapshots = new Map<string, { x: number; y: number }>();
            mapping.forEach(({ originalKey, cloneKey }) => {
              const origin = dragSnapshots.get(originalKey);
              if (!origin) return;
              cloneSnapshots.set(cloneKey, origin);
            });

            copyDragActiveRef.current = true;
            copyDragCloneKeysRef.current = cloneKeys;
            copyDragCloneSnapshotRef.current = cloneSnapshots;
          }}
          onDrag={(e) => {
            const [dx, dy] = e.beforeTranslate;

            if (copyDragActiveRef.current) {
              const cloneKeys = copyDragCloneKeysRef.current;
              const cloneSnapshots = copyDragCloneSnapshotRef.current;
              if (!Array.isArray(cloneKeys) || cloneKeys.length === 0) return;
              editor.update(() => {
                cloneKeys.forEach((key) => {
                  const origin = cloneSnapshots.get(key);
                  if (!origin) return;
                  const node = $getNodeByKey<LexicalNode>(key);
                  if (!node) return;
                  setStackablePosition(node, origin.x + dx, origin.y + dy);
                });
              });
              return;
            }

            const next = {
              ...frameRef.current,
              x: startRef.current.x + dx,
              y: startRef.current.y + dy,
            };
            frameRef.current = next;
            applyTransform(next);

            const dragKeys = dragSelectionKeysRef.current;
            const snapshots = dragSelectionSnapshotRef.current;
            editor.update(() => {
              dragKeys.forEach((key) => {
                const origin = snapshots.get(key);
                if (!origin) return;
                const node = $getNodeByKey<LexicalNode>(key);
                if (!node) return;
                setStackablePosition(node, origin.x + dx, origin.y + dy);
              });
            });
          }}
          onDragEnd={(e) => {
            const cloneKeys = copyDragCloneKeysRef.current;
            const wasCopyDrag = copyDragActiveRef.current;

            dragSelectionKeysRef.current = [];
            dragSelectionSnapshotRef.current = new Map();
            copyDragCloneKeysRef.current = [];
            copyDragCloneSnapshotRef.current = new Map();
            copyDragActiveRef.current = false;

            if (wasCopyDrag) {
              if (Array.isArray(cloneKeys) && cloneKeys.length > 0) {
                editor.update(() => {
                  const sel = $createNodeSelection();
                  cloneKeys.forEach((k) => sel.add(k));
                  $setSelection(sel);
                });
              }
              return;
            }

            // For non-copy drags, the live editor.update() calls already commit positions.
            // Reset the local frame ref to the latest props on the next render.
            void e;
          }}
          onResizeStart={() => {
            startRef.current = { ...frameRef.current };
          }}
          onResize={(e) => {
            const nextWidth = Math.max(10, e.width);
            const nextHeight = Math.max(10, e.height);
            const [dx, dy] = e.drag.beforeTranslate;
            const next = {
              ...frameRef.current,
              width: nextWidth,
              height: nextHeight,
              x: startRef.current.x + dx,
              y: startRef.current.y + dy,
            };
            frameRef.current = next;
            applyFrame(next);

            editor.update(() => {
              const node = $getNodeByKey(nodeKey);
              if (!(node instanceof PictureFrameNode)) return;
              node.setWidth(nextWidth);
              node.setHeight(nextHeight);
              node.setX(next.x);
              node.setY(next.y);
            });
          }}
        />
      )}
    </div>
  );
}
