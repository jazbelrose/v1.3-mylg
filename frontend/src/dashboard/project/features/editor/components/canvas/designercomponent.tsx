import React, {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  useMemo,
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
import CanvasTextLayer from "./CanvasTextLayer";
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
  data?: Record<string, unknown>;
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

interface LexicalTextData {
  type: "lexical-text";
  textId: string;
  roomId: string;
  initialContent: string | null;
  lastKnownContent?: string | null;
}

const createInitialLexicalState = (text: string): string =>
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
              text,
              type: "text",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });

const configureLexicalTextObject = (
  obj: FabricObjectLike,
  data: LexicalTextData
): void => {
  obj.data = { ...data };
  obj.id = data.textId;
  obj.name = obj.name ?? data.textId;
  obj.set?.({
    lockRotation: true,
    hasRotatingPoint: false,
    selectable: true,
    evented: true,
  });
  obj.lockMovementX = false;
  obj.lockMovementY = false;
  if (typeof (obj as { setControlsVisibility?: (value: Record<string, boolean>) => void })
    .setControlsVisibility === "function") {
    (obj as { setControlsVisibility: (value: Record<string, boolean>) => void }).setControlsVisibility({
      mtr: false,
    });
  }
};

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
    const [editingTextId, setEditingTextId] = useState<string | null>(null);

        const history = useRef<{ stack: unknown[]; index: number }>({ stack: [], index: -1 });
        const clipboard = useRef<unknown>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricCanvasRef = useRef<any>(null);
    const isRestoringHistory = useRef<boolean>(false);
    const isInitialLoad = useRef<boolean>(true);

    const { activeProject, setActiveProject } = useData();
    const projectRoomPrefix = useMemo(
      () => activeProject?.projectId ?? "default-project",
      [activeProject?.projectId]
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

    const startEditingText = useCallback(
      (textId: string) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;
        setEditingTextId(textId);
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        fabricCanvas.skipTargetFind = true;
        fabricCanvas.defaultCursor = "text";
      },
      []
    );

    const stopEditingText = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;
      setEditingTextId(null);
      fabricCanvas.defaultCursor = "default";
      applyCanvasMode(mode);
      fabricCanvas.requestRenderAll?.();
    }, [applyCanvasMode, mode]);

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
          const data = (active as FabricObjectLike).data as LexicalTextData | undefined;
          if (data?.type === "lexical-text") {
            active.set?.({ stroke: newColor });
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

    const handleTextContentChange = useCallback(
      (textId: string, json: string) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;
        const target = fabricCanvas
          .getObjects()
          .find((obj: FabricObjectLike) => {
            const data = obj.data as LexicalTextData | undefined;
            return data?.type === "lexical-text" && data.textId === textId;
          });
        if (!target) return;
        const existing = (target as FabricObjectLike).data as LexicalTextData | undefined;
        const nextData: LexicalTextData = {
          ...(existing ?? {
            type: "lexical-text",
            textId,
            roomId: `project-${projectRoomPrefix}-canvas-${textId}`,
            initialContent: json,
          }),
        };
        nextData.lastKnownContent = json;
        (target as FabricObjectLike).data = nextData as Record<string, unknown>;
        markDirty();
      },
      [markDirty, projectRoomPrefix]
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

    const reviveLexicalText = useCallback(
      (fabricObject: unknown, objectData: unknown) => {
        const obj = fabricObject as FabricObjectLike | undefined;
        if (!obj) return;
        const rawData = (
          obj?.data ?? (objectData as { data?: unknown } | undefined)?.data
        ) as Partial<LexicalTextData> | undefined;
        if (!rawData || rawData.type !== "lexical-text") return;
        const textId = rawData.textId ?? `txt-${Date.now().toString(36)}`;
        const baseContent =
          rawData.lastKnownContent ??
          rawData.initialContent ??
          createInitialLexicalState("Text");
        const data: LexicalTextData = {
          type: "lexical-text",
          textId,
          roomId: rawData.roomId ?? `project-${projectRoomPrefix}-canvas-${textId}`,
          initialContent: rawData.initialContent ?? baseContent,
          lastKnownContent: rawData.lastKnownContent ?? baseContent,
        };
        configureLexicalTextObject(obj, data);
      },
      [projectRoomPrefix]
    );

    const loadHistory = useCallback((index: number) => {
      const fabricCanvas = fabricCanvasRef.current;
      const h = history.current;
      if (!fabricCanvas || index < 0 || index >= h.stack.length) return;

      isRestoringHistory.current = true;
      fabricCanvas.loadFromJSON(
        h.stack[index],
        () => {
          fabricCanvas.renderAll();
          fabricCanvas.requestRenderAll();
          updateObjects();
          isRestoringHistory.current = false;
        },
        reviveLexicalText as never
      );
      h.index = index;
    }, [reviveLexicalText, updateObjects]);

    const updateObjects = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (fabricCanvas) {
        const objs = fabricCanvas.getObjects();
        const active = fabricCanvas.getActiveObject();
        const deriveId = (obj: FabricObjectLike, index: number) => {
          const data = obj.data as LexicalTextData | undefined;
          if (data?.textId) return data.textId;
          if (obj.id !== undefined) return obj.id;
          return index;
        };
        setSelectedId(active ? deriveId(active as FabricObjectLike, objs.indexOf(active)) : null);
        setObjects(
          objs.map((obj: FabricObjectLike, i: number) => ({
            id: deriveId(obj, i),
            name:
              obj.name ??
              ((obj.data as LexicalTextData | undefined)?.textId ?? `${obj.type}-${i}`),
            visible: obj.visible,
            locked: obj.lockMovementX && obj.lockMovementY,
            obj,
          }))
        );
      }
    }, []);

    const handleClear = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      if (editingTextId) {
        stopEditingText();
      }
      fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      saveHistory();
      updateObjects();
    }, [editingTextId, saveHistory, stopEditingText, updateObjects]);

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
                fabricCanvas?.loadFromJSON(
                  jsonObj,
                  () => {
                    fabricCanvas?.renderAll();
                    fabricCanvas?.requestRenderAll();
                    resolve();
                  },
                  reviveLexicalText as never
                );
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
    }, [
      canvasReady,
      activeProject?.projectId,
      activeProject?.canvasJson,
      setActiveProject,
      reviveLexicalText,
      updateObjects,
    ]);

    useEffect(() => {
      applyCanvasMode(mode);
    }, [mode, color, applyCanvasMode]);

    useEffect(() => {
      if (editingTextId && mode !== TOOL_MODES.SELECT) {
        stopEditingText();
      }
    }, [editingTextId, mode, stopEditingText]);

    useEffect(() => {
      if (!editingTextId) return;
      const exists = objects.some(({ obj }) => {
        const data = obj.data as LexicalTextData | undefined;
        return data?.type === "lexical-text" && data.textId === editingTextId;
      });
      if (!exists) {
        stopEditingText();
      }
    }, [editingTextId, objects, stopEditingText]);

    useEffect(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const handleDoubleClick = (event: { target?: FabricObjectLike }) => {
        const target = event.target;
        const data = target?.data as LexicalTextData | undefined;
        if (data?.type === "lexical-text") {
          changeMode(TOOL_MODES.SELECT);
          startEditingText(data.textId);
        }
      };

      const handleMouseDown = (event: { target?: FabricObjectLike }) => {
        if (!editingTextId) return;
        const target = event.target;
        const data = target?.data as LexicalTextData | undefined;
        if (!data || data.textId !== editingTextId) {
          stopEditingText();
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fabricCanvas as any).on("mouse:dblclick", handleDoubleClick);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fabricCanvas as any).on("mouse:down", handleMouseDown);

      return () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fabricCanvas as any).off("mouse:dblclick", handleDoubleClick);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fabricCanvas as any).off("mouse:down", handleMouseDown);
      };
    }, [changeMode, editingTextId, startEditingText, stopEditingText]);

    /* Drawing handlers for RECT mode (mouse events on container) */
    const handleMouseDown = (e: React.MouseEvent) => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;
      if (editingTextId) {
        stopEditingText();
      }
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

      const textId = `txt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
      const roomId = `project-${projectRoomPrefix}-canvas-${textId}`;
      const initialContent = createInitialLexicalState("Text");
      const data: LexicalTextData = {
        type: "lexical-text",
        textId,
        roomId,
        initialContent,
        lastKnownContent: initialContent,
      };

      const textRect = new fabric.Rect({
        left: 120,
        top: 120,
        width: 260,
        height: 160,
        fill: "rgba(15, 23, 42, 0.45)",
        stroke: color,
        strokeWidth: 1,
        rx: 12,
        ry: 12,
        selectable: true,
        name: textId,
      });

      configureLexicalTextObject(textRect as unknown as FabricObjectLike, data);

      fabricCanvas.add(textRect);
      fabricCanvas.setActiveObject(textRect);
      fabricCanvas.requestRenderAll();
      changeMode(TOOL_MODES.SELECT);
      startEditingText(textId);
    }, [changeMode, color, projectRoomPrefix, startEditingText]);

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
      if (editingTextId) {
        stopEditingText();
      }
      if (h.index > 0) loadHistory(h.index - 1);
    }, [editingTextId, loadHistory, stopEditingText]);

    const handleRedo = useCallback(() => {
      const h = history.current;
      if (editingTextId) {
        stopEditingText();
      }
      loadHistory(h.index + 1);
    }, [editingTextId, loadHistory, stopEditingText]);

    const handleDelete = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const active = fabricCanvas.getActiveObjects();
      if (editingTextId) {
        const editingRemoved = active.some((obj: FabricObjectLike) => {
          const data = obj.data as LexicalTextData | undefined;
          return data?.type === "lexical-text" && data.textId === editingTextId;
        });
        if (editingRemoved) {
          stopEditingText();
        }
      }
      active.forEach((obj: FabricObjectLike) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
    }, [editingTextId, stopEditingText]);

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
      const data = clonedObj.data as LexicalTextData | undefined;
      if (data?.type === "lexical-text") {
        const newId = `txt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
        const initial = data.lastKnownContent ?? data.initialContent ?? createInitialLexicalState("Text");
        const nextData: LexicalTextData = {
          ...data,
          textId: newId,
          roomId: `project-${projectRoomPrefix}-canvas-${newId}`,
          initialContent: initial,
          lastKnownContent: initial,
        };
        configureLexicalTextObject(clonedObj, nextData);
      }
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
    }, [changeMode, projectRoomPrefix]);

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
        <CanvasTextLayer
          fabricCanvasRef={fabricCanvasRef}
          editingId={editingTextId}
          selectedId={selectedId}
          onContentChange={handleTextContentChange}
          onExitEdit={stopEditingText}
        />
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









