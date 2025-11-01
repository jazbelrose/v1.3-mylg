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
  IText,
  Image as FabricImage,
  StaticCanvas,
} from "fabric";
import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { EDIT_PROJECT_URL, apiFetch } from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import styles from "./designer-component.module.css";
import CanvasTextOverlay from "./CanvasTextOverlay";
import {
  getCanvasTextSnapshot,
  setCanvasTextSnapshot,
  subscribeToCanvasText,
  removeCanvasTextSnapshot,
} from "../../collaboration/projectCollaboration";

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

const generateObjectId = (): string => `canvas-obj-${Date.now()}-${Math.round(Math.random() * 1e4)}`;

const isTextObject = (obj: FabricObjectLike): obj is FabricObjectLike & { text?: string } =>
  Boolean((obj as { type?: string }).type === "i-text" || (obj as { text?: unknown }).text);

const extractPlainText = (json: string | null): string => {
  if (!json) return "";
  try {
    const parsed = JSON.parse(json) as { root?: { children?: unknown[] } };
    const visit = (node: unknown): string => {
      if (!node) return "";
      if (typeof node !== "object") return "";
      const obj = node as { type?: string; text?: string; children?: unknown[] };
      if (obj.type === "text" && typeof obj.text === "string") {
        return obj.text;
      }
      if (Array.isArray(obj.children)) {
        return obj.children.map(visit).join(" ").trim();
      }
      return "";
    };
    const root = (parsed?.root as { children?: unknown[] }) ?? null;
    if (!root || !Array.isArray(root.children)) return "";
    return root.children.map(visit).join(" ").replace(/\s+/g, " ").trim();
  } catch (error) {
    console.warn("Failed to parse Lexical JSON for canvas text", error);
    return "";
  }
};

const createInitialLexicalState = (seedText: string): string =>
  JSON.stringify({
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: seedText,
              type: "text",
              version: 1,
            },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });

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
  IText,
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
    const [textOverlayState, setTextOverlayState] = useState<{
      objectId: string;
      bounds: { left: number; top: number; width: number; height: number };
      initialState: string | null;
    } | null>(null);

        const history = useRef<{ stack: unknown[]; index: number }>({ stack: [], index: -1 });
        const clipboard = useRef<unknown>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricCanvasRef = useRef<any>(null);
    const isRestoringHistory = useRef<boolean>(false);
    const isInitialLoad = useRef<boolean>(true);
    const overlayTargetRef = useRef<FabricObjectLike | null>(null);
    const textSubscriptions = useRef<Map<string, () => void>>(new Map());

    const { activeProject, setActiveProject } = useData();

    const ensureObjectId = useCallback((obj: FabricObjectLike): string => {
      if (obj.id === undefined || obj.id === null || obj.id === "") {
        const newId = generateObjectId();
        obj.id = newId;
        if (typeof obj.set === "function") {
          obj.set({ id: newId });
        }
        return newId;
      }
      return String(obj.id);
    }, []);

    const computeOverlayBounds = useCallback(
      (obj: FabricObjectLike) => {
        const fabricCanvas = fabricCanvasRef.current;
        const canvasEl = canvasRef.current;
        const container = containerRef.current;
        if (!fabricCanvas || !canvasEl || !container) return null;
        if (typeof (obj as { getBoundingRect?: unknown }).getBoundingRect !== "function") {
          return null;
        }
        const rect = (obj as unknown as { getBoundingRect: (absolute: boolean, calc: boolean) => {
          left: number;
          top: number;
          width: number;
          height: number;
        } }).getBoundingRect(true, true);

        const viewport = fabricCanvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
        const zoom = fabricCanvas.getZoom();
        const canvasRect = canvasEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const offsetLeft = canvasRect.left - containerRect.left;
        const offsetTop = canvasRect.top - containerRect.top;

        const left = rect.left * zoom + viewport[4] + offsetLeft;
        const top = rect.top * zoom + viewport[5] + offsetTop;
        const width = rect.width * zoom;
        const height = rect.height * zoom;
        return { left, top, width, height };
      },
      []
    );

    const openTextOverlay = useCallback(
      (target: FabricObjectLike) => {
        if (!isTextObject(target)) return;
        const bounds = computeOverlayBounds(target);
        if (!bounds) return;

        const projectId = activeProject?.projectId ?? null;
        const objectId = ensureObjectId(target);
        let initialState: string | null = null;
        if (projectId) {
          initialState = getCanvasTextSnapshot(projectId, objectId);
          if (!initialState) {
            const seed = (target as { text?: string }).text ?? "";
            initialState = createInitialLexicalState(seed);
            setCanvasTextSnapshot(projectId, objectId, initialState);
          }
        } else {
          const seed = (target as { text?: string }).text ?? "";
          initialState = createInitialLexicalState(seed);
        }

        overlayTargetRef.current = target;
        setTextOverlayState({ objectId, bounds, initialState });
      },
      [
        activeProject?.projectId,
        computeOverlayBounds,
        ensureObjectId,
      ]
    );

    /* ---------- Save ---------- */
    const saveCanvas = useCallback(
      async (showToast = false) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas || !activeProject?.projectId) {
          if (showToast) notify("error", "No active project to save");
          return;
        }
        try {
          const canvasJson = JSON.stringify(fabricCanvas.toJSON());
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
          if (active.type === "i-text") {
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
          const canvasJson = JSON.stringify(fabricCanvasRef.current.toJSON());
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

      const json = fabricCanvas.toJSON();
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

    const updateObjects = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      const projectId = activeProject?.projectId;
      if (!fabricCanvas) return;

      const objs = fabricCanvas.getObjects();
      const active = fabricCanvas.getActiveObject();
      setSelectedId(active ? (active.id ?? objs.indexOf(active)) : null);
      setObjects(
        objs.map((obj: FabricObjectLike, i: number) => ({
          id: obj.id ?? i,
          name: obj.name ?? `${obj.type}-${i}`,
          visible: obj.visible,
          locked: obj.lockMovementX && obj.lockMovementY,
          obj,
        }))
      );

      if (projectId) {
        const seen = new Set<string>();
        objs.forEach((obj: FabricObjectLike) => {
          if (!isTextObject(obj)) return;
          const objectId = ensureObjectId(obj);
          seen.add(objectId);

          if (!textSubscriptions.current.has(objectId)) {
            const unsubscribe = subscribeToCanvasText(projectId, objectId, (json) => {
              if (overlayTargetRef.current === obj) return;
              const nextText = extractPlainText(json);
              if (typeof (obj as { set?: unknown }).set === "function") {
                (obj as { set: (props: Record<string, unknown>) => void }).set({
                  text: nextText,
                });
              } else {
                (obj as { text?: string }).text = nextText;
              }
              fabricCanvas.requestRenderAll();
            });
            textSubscriptions.current.set(objectId, unsubscribe);
          }

          const existingSnapshot = getCanvasTextSnapshot(projectId, objectId);
          if (!existingSnapshot) {
            const seed = (obj as { text?: string }).text ?? "";
            setCanvasTextSnapshot(projectId, objectId, createInitialLexicalState(seed));
          }
        });

        textSubscriptions.current.forEach((unsubscribe, objectId) => {
          if (!seen.has(objectId)) {
            unsubscribe();
            textSubscriptions.current.delete(objectId);
            removeCanvasTextSnapshot(projectId, objectId);
          }
        });
        if (
          overlayTargetRef.current &&
          !objs.includes(overlayTargetRef.current as never)
        ) {
          overlayTargetRef.current = null;
          setTextOverlayState(null);
        }
      }

      if (overlayTargetRef.current) {
        const bounds = computeOverlayBounds(overlayTargetRef.current);
        if (bounds) {
          setTextOverlayState((prev) =>
            prev ? { ...prev, bounds } : prev
          );
        }
      }
    }, [
      activeProject?.projectId,
      computeOverlayBounds,
      ensureObjectId,
      setObjects,
      setSelectedId,
    ]);

    const commitTextOverlay = useCallback(
      (json: string, plainText: string) => {
        const target = overlayTargetRef.current;
        if (!target || !textOverlayState) return;
        const projectId = activeProject?.projectId ?? null;
        if (projectId) {
          setCanvasTextSnapshot(projectId, textOverlayState.objectId, json);
        }
        if (typeof (target as { set?: unknown }).set === "function") {
          (target as { set: (props: Record<string, unknown>) => void }).set({
            text: plainText,
          });
        } else {
          (target as { text?: string }).text = plainText;
        }
        target.setCoords?.();
        fabricCanvasRef.current?.requestRenderAll();
        markDirty();
        saveHistory();
        updateObjects();
        overlayTargetRef.current = null;
        setTextOverlayState(null);
      },
      [
        activeProject?.projectId,
        markDirty,
        saveHistory,
        textOverlayState,
        updateObjects,
      ]
    );

    const cancelTextOverlay = useCallback(() => {
      overlayTargetRef.current = null;
      setTextOverlayState(null);
    }, []);

    const handleClear = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      const projectId = activeProject?.projectId;
      if (!fabricCanvas) return;

      fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => {
        if (projectId && isTextObject(obj)) {
          const objectId = ensureObjectId(obj);
          removeCanvasTextSnapshot(projectId, objectId);
          const unsubscribe = textSubscriptions.current.get(objectId);
          if (unsubscribe) {
            unsubscribe();
            textSubscriptions.current.delete(objectId);
          }
        }
        fabricCanvas.remove(obj);
      });
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      saveHistory();
      updateObjects();
    }, [activeProject?.projectId, ensureObjectId]);

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

      fabricCanvas.on("mouse:dblclick", (evt: { target?: FabricObjectLike | null }) => {
        if (evt?.target) {
          openTextOverlay(evt.target);
        }
      });

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
          if (overlayTargetRef.current) {
            const bounds = computeOverlayBounds(overlayTargetRef.current);
            if (bounds) {
              setTextOverlayState((prev) =>
                prev ? { ...prev, bounds } : prev
              );
            }
          }
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
        if (overlayTargetRef.current) {
          const bounds = computeOverlayBounds(overlayTargetRef.current);
          if (bounds) {
            setTextOverlayState((prev) =>
              prev ? { ...prev, bounds } : prev
            );
          }
        }
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
    }, [changeMode, computeOverlayBounds, markDirty, updateObjects]);

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
      return () => {
        textSubscriptions.current.forEach((unsubscribe) => unsubscribe());
        textSubscriptions.current.clear();
      };
    }, []);

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

      const text = new fabric.IText("Text", {
        left: 100,
        top: 100,
        selectable: true,
        name: `text-${Date.now()}`,
        fill: color,
      });
      (text as unknown as { editable?: boolean }).editable = false;

      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      fabricCanvas.requestRenderAll();

      openTextOverlay(text as unknown as FabricObjectLike);
      changeMode(TOOL_MODES.SELECT);
    }, [
      changeMode,
      color,
      openTextOverlay,
    ]);

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
      fabricCanvas.add(clonedObj);
      fabricCanvas.setActiveObject(clonedObj);
      fabricCanvas.requestRenderAll();
      changeMode(TOOL_MODES.SELECT);
    }, [changeMode]);

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
      obj.visible = !obj.visible;
      const canvas = obj.canvas as Record<string, unknown>;
      if (typeof canvas.requestRenderAll === 'function') {
        canvas.requestRenderAll();
      }
      updateObjects();
      markDirty();
    };

    const toggleLock = (obj: FabricObjectLike) => {
      const locked = !(obj.lockMovementX && obj.lockMovementY);
      obj.lockMovementX = obj.lockMovementY = locked;
      obj.selectable = !locked;
      obj.evented = !locked;
      const canvas = obj.canvas as Record<string, unknown>;
      if (typeof canvas.requestRenderAll === 'function') {
        canvas.requestRenderAll();
      }
      updateObjects();
      markDirty();
    };

    const renameObject = (obj: FabricObjectLike, name: string) => {
      obj.name = name;
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            ref={containerRef}
            className={styles.canvasContainer}
            onMouseDown={mode === TOOL_MODES.RECT ? handleMouseDown : undefined}
            onMouseMove={mode === TOOL_MODES.RECT ? handleMouseMove : undefined}
            onMouseUp={mode === TOOL_MODES.RECT ? handleMouseUp : undefined}
          >
            {loadingCanvas && <SpinnerOverlay />}
            {textOverlayState && (
              <CanvasTextOverlay
                key={textOverlayState.objectId}
                objectId={textOverlayState.objectId}
                bounds={textOverlayState.bounds}
                initialState={textOverlayState.initialState}
                onCommit={commitTextOverlay}
                onCancel={cancelTextOverlay}
              />
            )}
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









