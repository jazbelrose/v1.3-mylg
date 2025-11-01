import React, {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Canvas as FabricCanvas,
  PencilBrush,
  Rect,
  Image as FabricImage,
  StaticCanvas,
} from "fabric";
import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { EDIT_PROJECT_URL, apiFetch } from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import LexicalEditor from "../Brief/LexicalEditor";
import styles from "./designer-component.module.css";

/* ---------- Types ---------- */

interface DesignerComponentProps {
  style?: React.CSSProperties;
  [key: string]: unknown;
}

interface FabricObjectLike {
  id?: string | number;
  name?: string;
  visible?: boolean;
  lockMovementX?: boolean;
  lockMovementY?: boolean;
  selectable?: boolean;
  evented?: boolean;
  left?: number;
  top?: number;
  canvas?: unknown;
  set?: (props: Record<string, unknown>) => void;
  setCoords?: () => void;
  clone?: () => Promise<unknown>;
  [key: string]: unknown;
}

interface CanvasObject {
  id: string | number;
  name: string;
  obj: FabricObjectLike;
}

export interface DesignerRef {
  changeMode: (mode: string) => void;
  addText: () => void;
  triggerImageUpload: () => void;
  handleColorChange: (color: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleDelete: () => void;
  handleClear: () => void;
  handleSave: () => void;
}

/* Fabric façade (for easier mocking / tree-shaking friendliness) */
const fabric = {
  Canvas: FabricCanvas,
  PencilBrush,
  Rect,
  Image: FabricImage,
};

/* ---------- Modes ---------- */
const TOOL_MODES = {
  SELECT: "select",
  BRUSH: "brush",
  RECT: "rect",
  TEXT: "text",
  IMAGE: "image",
} as const;

const LEXICAL_TEXT_KIND = "lexical-text-frame";

type LexicalFrameData = {
  kind: typeof LEXICAL_TEXT_KIND;
  docId: string;
  initialContent?: unknown;
};

const SERIALIZE_PROPS = ["data"];

const createDocId = () =>
  `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const isLexicalTextFrame = (
  obj: FabricObjectLike | undefined
): obj is FabricObjectLike & { data: LexicalFrameData } =>
  !!obj &&
  typeof obj === "object" &&
  "data" in obj &&
  !!(obj as { data?: LexicalFrameData }).data &&
  (obj as { data?: LexicalFrameData }).data?.kind === LEXICAL_TEXT_KIND;

type TextFrameDescriptor = {
  id: string;
  docId: string;
  object: FabricObjectLike & { data: LexicalFrameData };
  initialContent?: unknown;
};

const multiplyMatrices = (a: number[], b: number[]) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const CanvasTextOverlayManager: React.FC<{
  canvasRef: React.MutableRefObject<FabricCanvas | null>;
  markDirty: () => void;
}> = ({ canvasRef, markDirty }) => {
  const [frames, setFrames] = useState<TextFrameDescriptor[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const collect = () => {
      const descriptors: TextFrameDescriptor[] = [];
      canvas.getObjects().forEach((obj, index) => {
        if (isLexicalTextFrame(obj as FabricObjectLike) && obj.visible !== false) {
          const frameObj = obj as FabricObjectLike & { data: LexicalFrameData };
          const docId = frameObj.data.docId;
          const id =
            (typeof frameObj.id === "string" || typeof frameObj.id === "number")
              ? frameObj.id.toString()
              : docId ?? `text-${index}`;
          descriptors.push({
            id,
            docId,
            object: frameObj,
            initialContent: frameObj.data?.initialContent,
          });
        }
      });
      setFrames(descriptors);
    };

    const events: string[] = [
      "object:added",
      "object:removed",
      "object:modified",
      "canvas:cleared",
    ];

    events.forEach((event) => canvas.on(event as never, collect));
    collect();

    const updateActive = () => {
      const active = canvas.getActiveObject() as FabricObjectLike | undefined;
      if (isLexicalTextFrame(active)) {
        setActiveFrameId(active.id ?? active.data.docId);
      } else {
        setActiveFrameId(null);
      }
    };
    const handleSelectionCleared = () => setActiveFrameId(null);

    canvas.on("selection:created" as never, updateActive);
    canvas.on("selection:updated" as never, updateActive);
    canvas.on("selection:cleared" as never, handleSelectionCleared);

    return () => {
      events.forEach((event) => canvas.off(event as never, collect));
      canvas.off("selection:created" as never, updateActive);
      canvas.off("selection:updated" as never, updateActive);
      canvas.off("selection:cleared" as never, handleSelectionCleared);
    };
  }, [canvasRef]);

  if (frames.length === 0) {
    return null;
  }

  return (
    <div className={styles.overlayRoot}>
      {frames.map((frame) => (
        <LexicalTextOverlay
          key={frame.id}
          frame={frame}
          canvasRef={canvasRef}
          isActive={activeFrameId === frame.object.id || activeFrameId === frame.id}
          markDirty={markDirty}
        />
      ))}
    </div>
  );
};

const LexicalTextOverlay: React.FC<{
  frame: TextFrameDescriptor;
  canvasRef: React.MutableRefObject<FabricCanvas | null>;
  isActive: boolean;
  markDirty: () => void;
}> = ({ frame, canvasRef, isActive, markDirty }) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const applyTransform = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const { object } = frame;
    if (!canvas || !overlay || !object) return;

    const viewport = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    const objectMatrix =
      typeof (object as FabricObjectLike & { calcTransformMatrix?: () => number[] }).calcTransformMatrix ===
      "function"
        ? (object as FabricObjectLike & { calcTransformMatrix: () => number[] }).calcTransformMatrix()
        : [1, 0, 0, 1, object.left ?? 0, object.top ?? 0];
    const matrix = multiplyMatrices(viewport, objectMatrix);

    overlay.style.transform = `matrix(${matrix[0]}, ${matrix[1]}, ${matrix[2]}, ${matrix[3]}, ${matrix[4]}, ${matrix[5]})`;
    overlay.style.transformOrigin = "0 0";

    const width =
      typeof object.get === "function" && object.get("width")
        ? (object.get("width") as number)
        : (object as { width?: number }).width ?? 0;
    const height =
      typeof object.get === "function" && object.get("height")
        ? (object.get("height") as number)
        : (object as { height?: number }).height ?? 0;

    overlay.style.width = `${width || 1}px`;
    overlay.style.height = `${height || 1}px`;
  }, [canvasRef, frame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sync = () => {
      applyTransform();
    };

    canvas.on("after:render" as never, sync);
    window.addEventListener("resize", sync);
    sync();

    return () => {
      canvas.off("after:render" as never, sync);
      window.removeEventListener("resize", sync);
    };
  }, [applyTransform, canvasRef]);

  useEffect(() => {
    applyTransform();
  }, [applyTransform, frame, canvasRef]);

  const handleContentChange = useCallback(
    (json: string) => {
      frame.object.data = {
        ...frame.object.data,
        initialContent: json,
      };
      markDirty();
    },
    [frame, markDirty]
  );

  return (
    <div
      ref={overlayRef}
      className={styles.overlayPane}
      style={{
        pointerEvents: isActive ? "auto" : "none",
      }}
    >
      <div className={styles.overlayContent}>
        <LexicalEditor
          roomId={frame.docId}
          initialContent={frame.initialContent}
          onChange={handleContentChange}
        />
      </div>
    </div>
  );
};

/* ---------- Defensive fabric patches ---------- */
if (!((StaticCanvas.prototype as unknown) as Record<string, unknown>)._defensivePatched) {
  const origClearContext = StaticCanvas.prototype.clearContext;
  StaticCanvas.prototype.clearContext = function (ctx: CanvasRenderingContext2D) {
    if (!ctx || typeof ctx.clearRect !== "function") return;
    return origClearContext.call(this, ctx);
  };

  const origGetContext = StaticCanvas.prototype.getContext;
  StaticCanvas.prototype.getContext = function () {
    if (!this.lowerCanvasEl || typeof this.lowerCanvasEl.getContext !== "function")
      return undefined;
    return origGetContext.call(this);
  };

  ((StaticCanvas.prototype as unknown) as Record<string, unknown>)._defensivePatched = true;
}

/* ========================================================================== */

const DesignerComponent = forwardRef<DesignerRef, DesignerComponentProps>(
  (props, ref) => {
    const { style: forwardedStyle, ...restProps } = props;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [mode, setMode] = useState<string>(TOOL_MODES.SELECT);
    const [objects, setObjects] = useState<CanvasObject[]>([]);
    const [selectedId, setSelectedId] = useState<string | number | null>(null);
    const [color, setColor] = useState<string>("#ffffff");
    const [loadingCanvas, setLoadingCanvas] = useState<boolean>(false);
    const [canvasReady, setCanvasReady] = useState<boolean>(false);
    const [isDirty, setIsDirty] = useState<boolean>(false);

    const history = useRef<{ stack: unknown[]; index: number }>({ stack: [], index: -1 });
    const clipboard = useRef<unknown>(null);
    const fabricCanvasRef = useRef<FabricCanvas | null>(null);
    const isRestoringHistory = useRef<boolean>(false);
    const isInitialLoad = useRef<boolean>(true);

    const { activeProject, setActiveProject } = useData();

    /* ---------- Save ---------- */
    const saveCanvas = useCallback(
      async (showToast = false) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas || !activeProject?.projectId) {
          if (showToast) notify("error", "No active project to save");
          return;
        }
        try {
          const canvasJson = JSON.stringify(fabricCanvas.toJSON(SERIALIZE_PROPS));
          const apiUrl = `${EDIT_PROJECT_URL}/${activeProject.projectId}`;
          // apiFetch returns parsed JSON or {} on empty; errors throw.
          console.debug('Saving canvas to:', apiUrl);
          await apiFetch(apiUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ canvasJson }),
          });
          // console.debug('Save successful:', responseData);
          setActiveProject((prev: Project | null) => (prev ? { ...prev, canvasJson } : prev));
          setIsDirty(false);
          if (showToast) notify("success", "Saved. Nice.");
        } catch (err: unknown) {
          const error = err as { message?: string };
          console.error("Failed to save canvas:", error);
          if (showToast)
            notify("error", "Can’t reach the server—your edits are safe; we’ll retry.");
        }
      },
      [activeProject, setActiveProject]
    );

    const markDirty = useCallback(() => {
      if (isInitialLoad.current) return;
      setIsDirty(true);
    }, []);

    const applyCanvasMode = useCallback(
      (nextMode: string) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;

        fabricCanvas.isDrawingMode = nextMode === TOOL_MODES.BRUSH;
        fabricCanvas.selection = nextMode === TOOL_MODES.SELECT;
        fabricCanvas.skipTargetFind = nextMode !== TOOL_MODES.SELECT;

        if (nextMode === TOOL_MODES.BRUSH) {
          if (!fabricCanvas.freeDrawingBrush) {
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
          }
          fabricCanvas.freeDrawingBrush.color = color;
          fabricCanvas.freeDrawingBrush.width = 2;
        }
      },
      [color]
    );

    const changeMode = useCallback(
      (nextMode: string) => {
        setMode(nextMode);
        applyCanvasMode(nextMode);
      },
      [applyCanvasMode]
    );

    const handleColorChange = useCallback(
      (eOrColor: React.ChangeEvent<HTMLInputElement> | string) => {
        const newColor =
          typeof eOrColor === "string" ? eOrColor : (eOrColor.target.value as string);
        setColor(newColor);

        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;

        if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush) {
          fabricCanvas.freeDrawingBrush.color = newColor;
        }

        const active = fabricCanvas.getActiveObject();
        if (active) {
          if (isLexicalTextFrame(active as FabricObjectLike)) {
            active.set({ stroke: newColor });
          } else if (active.type === "i-text") {
            active.set({ fill: newColor });
          } else {
            active.set({ stroke: newColor });
            if (active.type === "rect") {
              active.set({ fill: newColor });
            }
          }
          fabricCanvas.requestRenderAll();
          markDirty();
        }
      },
      [markDirty]
    );

    const handleSave = useCallback(() => {
      saveCanvas(true);
    }, [saveCanvas]);

    /* Save on unload if dirty */
    useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (!isDirty) return;

        if (fabricCanvasRef.current && activeProject?.projectId) {
          const canvasJson = JSON.stringify(fabricCanvasRef.current.toJSON(SERIALIZE_PROPS));
          navigator.sendBeacon(
            `${EDIT_PROJECT_URL}/${activeProject.projectId}`,
            JSON.stringify({ canvasJson })
          );
        }
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty, activeProject?.projectId]);

    /* History */
    const saveHistory = () => {
      if (isRestoringHistory.current) return;
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const json = fabricCanvas.toJSON(SERIALIZE_PROPS);
      const isEmptyCanvas = json.objects.length === 0;

      const h = history.current;
      if (h.stack.length === 0 || !isEmptyCanvas) {
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push(json);
        h.index++;
      }
    };

    const loadHistory = useCallback((index: number) => {
      const fabricCanvas = fabricCanvasRef.current;
      const h = history.current;
      if (!fabricCanvas || index < 0 || index >= h.stack.length) return;

      isRestoringHistory.current = true;
      fabricCanvas.loadFromJSON(h.stack[index], () => {
        fabricCanvas.renderAll();
        fabricCanvas.requestRenderAll();
        updateObjects();
        isRestoringHistory.current = false;
      });
      h.index = index;
    }, []);

    const updateObjects = () => {
      const fabricCanvas = fabricCanvasRef.current;
      if (fabricCanvas) {
        const objs = fabricCanvas.getObjects();
        const active = fabricCanvas.getActiveObject();
        setSelectedId(active ? (active.id ?? objs.indexOf(active)) : null);
        setObjects(
          objs.map((obj: FabricObjectLike, i: number) => ({
            id: obj.id ?? i,
            name: obj.name
              ?? (isLexicalTextFrame(obj)
                ? `Text box ${(obj.data?.docId ?? "").slice(-4)}`.trim()
                : `${obj.type}-${i}`),
            visible: obj.visible,
            locked: obj.lockMovementX && obj.lockMovementY,
            obj,
          }))
        );
      }
    };

    const handleClear = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      saveHistory();
      updateObjects();
    }, []);

    /* Init canvas */
    useLayoutEffect(() => {
      if (!containerRef.current) return;

      const canvasEl = document.createElement("canvas");
      canvasEl.style.width = "100%";
      canvasEl.style.height = "100%";
      canvasEl.style.pointerEvents = "auto";

      const container = containerRef.current;
      container.appendChild(canvasEl);
      canvasRef.current = canvasEl;

      const { clientWidth, clientHeight } = container;

      const fabricCanvas = new fabric.Canvas(canvasEl, {
        width: clientWidth,
        height: clientHeight,
        selection: true,
      });

      fabricCanvasRef.current = fabricCanvas;

      fabricCanvas.on("object:added", saveHistory);
      fabricCanvas.on("object:added", updateObjects);
      fabricCanvas.on("object:added", markDirty);

      fabricCanvas.on("object:modified", saveHistory);
      fabricCanvas.on("object:modified", updateObjects);
      fabricCanvas.on("object:modified", markDirty);

      fabricCanvas.on("object:removed", saveHistory);
      fabricCanvas.on("object:removed", updateObjects);
      fabricCanvas.on("object:removed", markDirty);

      fabricCanvas.on("selection:created", updateObjects);
      fabricCanvas.on("selection:updated", updateObjects);
      fabricCanvas.on("selection:cleared", () => setSelectedId(null));

      fabricCanvas.on("path:created", () => {
        changeMode(TOOL_MODES.SELECT);
      });

      applyCanvasMode(mode);
      setCanvasReady(true);

      const handleResize = () => {
        if (container) {
          fabricCanvas.setWidth(container.clientWidth);
          fabricCanvas.setHeight(container.clientHeight);
          fabricCanvas.renderAll();
        }
      };
      window.addEventListener("resize", handleResize);

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY;
        let zoom = fabricCanvas.getZoom();
        zoom *= 0.999 ** delta;
        zoom = Math.min(3, Math.max(0.5, zoom));
        fabricCanvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, zoom);
        e.stopPropagation();
      };
      canvasEl.addEventListener("wheel", handleWheel, { passive: false });

      /* Cleanup */
      return () => {
        window.removeEventListener("resize", handleResize);
        canvasEl.removeEventListener("wheel", handleWheel);

        const fc = fabricCanvasRef.current;
        if (fc) {
          try {
            fc.off();
            fc.dispose();
          } catch {
            /* noop */
          }
        }
        if (container && container.contains(canvasEl)) {
          container.removeChild(canvasEl);
        }
        fabricCanvasRef.current = null;
        canvasRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Load canvas data when ready / project changes */
    useEffect(() => {
      if (!canvasReady) return;
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const loadCanvas = async () => {
        setLoadingCanvas(true);
        const fabricCanvas = fabricCanvasRef.current;
        try {
          // Start with any canvas JSON already on the active project as a fallback
          let jsonString: string | null = (activeProject?.canvasJson as string | null) ?? null;

          if (activeProject?.projectId) {
            const apiUrl = `${EDIT_PROJECT_URL}/${activeProject.projectId}`;
            console.debug('Loading canvas from:', apiUrl);
            try {
              // apiFetch returns parsed JSON; will throw for non-2xx
              const data: { canvasJson?: string } = await apiFetch(apiUrl);
              jsonString = data?.canvasJson ?? jsonString;
              setActiveProject((prev: Project | null) =>
                prev ? { ...prev, canvasJson: jsonString ?? undefined } : prev
              );
            } catch (e) {
              // Network or server errors shouldn't wipe existing canvas data
              console.error('Canvas fetch failed:', e);
              notify(
                'error',
                'Failed to load canvas from server. Using local copy if available.'
              );
            }
          }

          if (jsonString) {
            let jsonObj: Record<string, unknown>;
            try {
              jsonObj =
                typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            } catch (e) {
              console.error('Failed to parse canvas JSON:', e);
              fabricCanvas?.clear();
              fabricCanvas?.renderAll();
              saveHistory();
              return;
            }

            if (
              jsonObj &&
              Array.isArray((jsonObj as { objects?: unknown[] }).objects) &&
              (jsonObj as { objects: unknown[] }).objects.length > 0
            ) {
              isRestoringHistory.current = true;
              await new Promise<void>((resolve) => {
                fabricCanvas?.loadFromJSON(jsonObj, () => {
                  fabricCanvas?.renderAll();
                  fabricCanvas?.requestRenderAll();
                  resolve();
                });
              });
              isRestoringHistory.current = false;
              updateObjects();
              saveHistory();
            } else {
              // When there's no canvas data, just clear and render without waiting
              fabricCanvas?.clear();
              fabricCanvas?.renderAll();
              saveHistory();
            }
          } else {
            fabricCanvas?.clear();
            fabricCanvas?.renderAll();
            saveHistory();
          }
        } finally {
          setLoadingCanvas(false);
          isInitialLoad.current = false;
        }
      };

      loadCanvas();
    }, [canvasReady, activeProject?.projectId, activeProject?.canvasJson, setActiveProject]);

    useEffect(() => {
      applyCanvasMode(mode);
    }, [mode, color, applyCanvasMode]);

    /* Drawing handlers for RECT mode (mouse events on container) */
    const handleMouseDown = (e: React.MouseEvent) => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;
      if (mode === TOOL_MODES.RECT) {
        const pointer = fabricCanvas.getPointer(e);
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          fill: color,
          stroke: color,
          strokeWidth: 1,
          width: 1,
          height: 1,
          originX: "left",
          originY: "top",
          selectable: true,
          name: `rect-${Date.now()}`,
        });
        (fabricCanvas as Record<string, unknown>).__drawingObject = rect;
        (fabricCanvas as Record<string, unknown>).__isDrawingRect = true;
        fabricCanvas.add(rect);
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas || !(fabricCanvas as Record<string, unknown>).__drawingObject) return;

      const pointer = fabricCanvas.getPointer(e);
      const obj = (fabricCanvas as Record<string, unknown>).__drawingObject as FabricObjectLike;

      let width = pointer.x - (obj.left ?? 0);
      let height = pointer.y - (obj.top ?? 0);

      if (width < 0) {
        obj.set({ left: pointer.x });
        width = Math.abs(width);
      }
      if (height < 0) {
        obj.set({ top: pointer.y });
        height = Math.abs(height);
      }

      obj.set({ width, height });
      obj.setCoords();
      fabricCanvas.requestRenderAll();
    };

    const handleMouseUp = () => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      if ((fabricCanvas as Record<string, unknown>).__isDrawingRect && (fabricCanvas as Record<string, unknown>).__drawingObject) {
        fabricCanvas.setActiveObject((fabricCanvas as Record<string, unknown>).__drawingObject);
        (fabricCanvas as Record<string, unknown>).__drawingObject = null;
        (fabricCanvas as Record<string, unknown>).__isDrawingRect = false;
        saveHistory();
        updateObjects();
        changeMode(TOOL_MODES.SELECT);
      }
    };

    /* Text + Image */
    const addText = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const docId = createDocId();
      const textFrame = new fabric.Rect({
        width: 320,
        height: 180,
        left: 120,
        top: 120,
        fill: "transparent",
        stroke: color,
        strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        name: `text-${Date.now()}`,
        selectable: true,
        evented: true,
        hasBorders: true,
        hasControls: true,
        lockScalingFlip: true,
        originX: "left",
        originY: "top",
        data: {
          kind: LEXICAL_TEXT_KIND,
          docId,
        } as LexicalFrameData,
      });

      (textFrame as FabricObjectLike).id = docId;

      fabricCanvas.add(textFrame);
      fabricCanvas.setActiveObject(textFrame);
      fabricCanvas.requestRenderAll();
      changeMode(TOOL_MODES.SELECT);
      markDirty();
    }, [color, changeMode, markDirty]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;

        fabric.Image.fromURL(evt.target?.result as string)
          .then((img: FabricObjectLike) => {
            img.set?.({
              left: 50,
              top: 50,
              selectable: true,
              evented: true,
              name: `img-${Date.now()}`,
            });
            fabricCanvas.add(img);
            fabricCanvas.setActiveObject(img);
            applyCanvasMode(TOOL_MODES.SELECT);
            fabricCanvas.requestRenderAll();
            changeMode(TOOL_MODES.SELECT);
          })
          .catch((err: unknown) => {
            console.error("Failed to load image", err);
            alert("Failed to load image.");
          });
      };
      reader.onerror = () => {
        console.error("Failed to read file");
        alert("Failed to load image.");
      };
      reader.readAsDataURL(file);

      e.target.value = "";
    };

    /* Undo / Redo / Delete / Copy / Paste */
    const handleUndo = useCallback(() => {
      const h = history.current;
      if (h.index > 0) loadHistory(h.index - 1);
    }, [loadHistory]);

    const handleRedo = useCallback(() => {
      const h = history.current;
      loadHistory(h.index + 1);
    }, [loadHistory]);

    const handleDelete = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const active = fabricCanvas.getActiveObjects();
      active.forEach((obj: FabricObjectLike) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
    }, []);

    const handleCopy = useCallback(async () => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;
      const active = fabricCanvas.getActiveObject();
      if (active) {
        const activeObj = active as FabricObjectLike;
        clipboard.current = await activeObj.clone?.();
      }
    }, []);

    const handlePaste = useCallback(async () => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas || !clipboard.current) return;

      const clonedObj = await (clipboard.current as FabricObjectLike).clone?.() as FabricObjectLike;
      if (!clonedObj) return;
      fabricCanvas.discardActiveObject();
      clonedObj.set?.({
        left: (clonedObj.left ?? 0) + 10,
        top: (clonedObj.top ?? 0) + 10,
        selectable: true,
      });
      if (isLexicalTextFrame(clonedObj)) {
        const newDocId = createDocId();
        clonedObj.data = {
          ...clonedObj.data,
          docId: newDocId,
        };
        clonedObj.id = newDocId;
      }
      fabricCanvas.add(clonedObj);
      fabricCanvas.setActiveObject(clonedObj);
      fabricCanvas.requestRenderAll();
      changeMode(TOOL_MODES.SELECT);
      markDirty();
    }, [changeMode, markDirty]);

    /* Global hotkeys */
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          handleRedo();
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          handleDelete();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleDelete, handleUndo, handleRedo]);

    /* Layer list helpers */
    const toggleVisibility = (obj: FabricObjectLike) => {
      const nextVisible = !obj.visible;
      obj.set?.({ visible: nextVisible });
      const canvas = obj.canvas as Record<string, unknown>;
      if (typeof canvas.requestRenderAll === 'function') {
        canvas.requestRenderAll();
      }
      if (typeof (canvas as { fire?: (event: string, data?: unknown) => void }).fire === "function") {
        (canvas as { fire: (event: string, data?: unknown) => void }).fire("object:modified", {
          target: obj,
        });
      }
      updateObjects();
      markDirty();
    };

    const toggleLock = (obj: FabricObjectLike) => {
      const locked = !(obj.lockMovementX && obj.lockMovementY);
      obj.set?.({
        lockMovementX: locked,
        lockMovementY: locked,
        selectable: !locked,
        evented: !locked,
      });
      const canvas = obj.canvas as Record<string, unknown>;
      if (typeof canvas.requestRenderAll === 'function') {
        canvas.requestRenderAll();
      }
      if (typeof (canvas as { fire?: (event: string, data?: unknown) => void }).fire === "function") {
        (canvas as { fire: (event: string, data?: unknown) => void }).fire("object:modified", {
          target: obj,
        });
      }
      updateObjects();
      markDirty();
    };

    const renameObject = (obj: FabricObjectLike, name: string) => {
      obj.set?.({ name });
      updateObjects();
      markDirty();
    };

    const selectLayer = (obj: FabricObjectLike, id: string | number) => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;
      fabricCanvas.setActiveObject(obj);
      fabricCanvas.requestRenderAll();
      setSelectedId(id);
    };

    /* Expose methods to parent */
    useImperativeHandle(
      ref,
      (): DesignerRef => ({
        changeMode,
        addText,
        triggerImageUpload: () => fileInputRef.current?.click(),
        handleColorChange: (c: string) => handleColorChange(c),
        handleUndo,
        handleRedo,
        handleCopy,
        handlePaste,
        handleDelete,
        handleClear,
        handleSave,
      }),
      [
        changeMode,
        addText,
        handleColorChange,
        handleUndo,
        handleRedo,
        handleCopy,
        handlePaste,
        handleDelete,
        handleClear,
        handleSave,
      ]
    );

    /* ---------- Render ---------- */
    return (
      <div
        {...restProps}
        style={{
          display: "flex",
          height: "100%",
          ...(forwardedStyle ?? {}),
        }}
      >
        {/* Layers panel */}
        <div className={styles.layersPanel}>
          <h4>Layers</h4>
          {objects.map(({ id, name, obj }) => (
            <div
              key={id}
              className={`${styles.layerItem} ${
                selectedId === id ? styles.layerItemSelected : ""
              }`}
              onClick={() => selectLayer(obj, id)}
            >
              <input
                style={{ flex: "1 1 auto", marginRight: "4px" }}
                value={name}
                onChange={(e) => renameObject(obj, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className={styles.button}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(obj);
                }}
                aria-label="Toggle visibility"
              >
                {obj.visible ? "👁️" : "🚫"}
              </button>
              <button
                className={styles.button}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLock(obj);
                }}
                aria-label="Toggle lock"
              >
                {obj.lockMovementX ? "🔒" : "🔓"}
              </button>
            </div>
          ))}
        </div>

        {/* Canvas column */}
        <div className={styles.canvasColumn}>
          <div className={styles.canvasStack}>
            <div
              ref={containerRef}
              className={styles.canvasContainer}
              onMouseDown={mode === TOOL_MODES.RECT ? handleMouseDown : undefined}
              onMouseMove={mode === TOOL_MODES.RECT ? handleMouseMove : undefined}
              onMouseUp={mode === TOOL_MODES.RECT ? handleMouseUp : undefined}
            >
              {loadingCanvas && <SpinnerOverlay />}
            </div>
            <CanvasTextOverlayManager canvasRef={fabricCanvasRef} markDirty={markDirty} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />
        </div>
      </div>
    );
  }
);

export default DesignerComponent;









