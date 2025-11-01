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
import CanvasTextEditorOverlay from "./CanvasTextEditorOverlay";
import { useCanvasDoc } from "../contexts/CanvasDocProvider";
import {
  createLexicalParagraphState,
  lexicalStateToPlainText,
} from "../../utils/lexicalConversion";
import type { Text as YText, YTextEvent } from "yjs";

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

type TextEditorBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
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
  IText,
  Image: FabricImage,
};

const SERIALIZED_PROPS: string[] = ["objectId", "canvasDocKey"];

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
    const [activeTextEditor, setActiveTextEditor] = useState<
      | {
          objectId: string;
          docKey: string;
          bounds: { left: number; top: number; width: number; height: number };
          initialState: string;
        }
      | null
    >(null);

    const history = useRef<{ stack: unknown[]; index: number }>({ stack: [], index: -1 });
    const clipboard = useRef<unknown>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricCanvasRef = useRef<any>(null);
    const isRestoringHistory = useRef<boolean>(false);
    const isInitialLoad = useRef<boolean>(true);
    const textBindingsRef = useRef<
      Map<string, { yText: YText; observer: (event: YTextEvent) => void }>
    >(new Map());
    const editingTextRef = useRef<FabricObjectLike | null>(null);

    const { activeProject, setActiveProject } = useData();
    const { getText, doc } = useCanvasDoc();

    /* ---------- Save ---------- */
    const saveCanvas = useCallback(
      async (showToast = false) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas || !activeProject?.projectId) {
          if (showToast) notify("error", "No active project to save");
          return;
        }
        try {
          const canvasJson = JSON.stringify(fabricCanvas.toJSON(SERIALIZED_PROPS));
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

    const ensureObjectMetadata = useCallback((obj: FabricObjectLike) => {
      let objectId = (obj as Record<string, unknown>).objectId as string | undefined;
      if (!objectId) {
        const existingId = obj.id as string | undefined;
        objectId =
          existingId ?? `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        (obj as Record<string, unknown>).objectId = objectId;
        obj.id = obj.id ?? objectId;
      }

      let docKey = (obj as Record<string, unknown>).canvasDocKey as string | undefined;
      if (!docKey) {
        docKey = `canvas:${objectId}`;
        (obj as Record<string, unknown>).canvasDocKey = docKey;
      }

      if (obj.type === "i-text") {
        (obj as Record<string, unknown>).editable = false;
      }

      return { objectId, docKey };
    }, []);

    const detachTextBinding = useCallback((obj: FabricObjectLike) => {
      const bindingId = (obj as Record<string, unknown>).objectId as string | undefined;
      if (!bindingId) return;
      const entry = textBindingsRef.current.get(bindingId);
      if (entry) {
        entry.yText.unobserve(entry.observer);
        textBindingsRef.current.delete(bindingId);
      }
      if (editingTextRef.current === obj) {
        editingTextRef.current = null;
        setActiveTextEditor(null);
      }
    }, []);

    const ensureTextBinding = useCallback(
      (obj: FabricObjectLike) => {
        if (obj.type !== "i-text") return;

        const { objectId, docKey } = ensureObjectMetadata(obj);
        const yText = getText(docKey);
        if (!yText) return;

        const existing = textBindingsRef.current.get(objectId);
        if (existing && existing.yText === yText) {
          return;
        }

        if (existing) {
          existing.yText.unobserve(existing.observer);
          textBindingsRef.current.delete(objectId);
        }

        const syncFromDoc = () => {
          const json = yText.toString();
          if (!json) return;
          const plain = lexicalStateToPlainText(json);
          obj.set?.({ text: plain });
          obj.setCoords?.();
          (obj.canvas as { requestRenderAll?: () => void } | undefined)?.requestRenderAll?.();
        };

        if (yText.length === 0) {
          const initialState = createLexicalParagraphState((obj.text as string) || "");
          const yDoc = yText.doc;
          const seed = () => {
            if (yText.length > 0) yText.delete(0, yText.length);
            yText.insert(0, initialState);
          };
          if (yDoc) {
            yDoc.transact(seed);
          } else {
            seed();
          }
          syncFromDoc();
        } else {
          syncFromDoc();
        }

        const observer = (event: YTextEvent) => {
          if (event.transaction?.local && editingTextRef.current === obj) {
            return;
          }
          syncFromDoc();
        };

        yText.observe(observer);
        textBindingsRef.current.set(objectId, { yText, observer });
      },
      [ensureObjectMetadata, getText]
    );

    const computeTextEditorBounds = useCallback(
      (obj: FabricObjectLike): TextEditorBounds | null => {
        const fabricCanvas = fabricCanvasRef.current;
        const container = containerRef.current;
        if (!fabricCanvas || !container || !fabricCanvas.lowerCanvasEl) return null;

        const canvasEl = fabricCanvas.lowerCanvasEl as HTMLCanvasElement;
        const canvasRect = canvasEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const bounding = obj.getBoundingRect(true, true);

        const width = fabricCanvas.getWidth() || canvasRect.width;
        const height = fabricCanvas.getHeight() || canvasRect.height;
        const scaleX = canvasRect.width / width;
        const scaleY = canvasRect.height / height;

        return {
          left: canvasRect.left + bounding.left * scaleX - containerRect.left,
          top: canvasRect.top + bounding.top * scaleY - containerRect.top,
          width: bounding.width * scaleX,
          height: bounding.height * scaleY,
        };
      },
      []
    );

    const updateActiveTextEditorBounds = useCallback(() => {
      if (!editingTextRef.current) return;
      const bounds = computeTextEditorBounds(editingTextRef.current);
      if (!bounds) return;
      setActiveTextEditor((prev) => (prev ? { ...prev, bounds } : prev));
    }, [computeTextEditorBounds]);

    const closeTextEditor = useCallback(() => {
      editingTextRef.current = null;
      setActiveTextEditor(null);
    }, []);

    const commitTextEditor = useCallback(
      ({ json, plainText }: { json: string; plainText: string }) => {
        const obj = editingTextRef.current;
        if (!obj) return;

        const { docKey } = ensureObjectMetadata(obj);
        const yText = getText(docKey);
        if (yText) {
          const yDoc = yText.doc;
          const apply = () => {
            if (yText.length > 0) yText.delete(0, yText.length);
            yText.insert(0, json);
          };
          if (yDoc) {
            yDoc.transact(apply);
          } else {
            apply();
          }
        }

        obj.set?.({ text: plainText });
        obj.setCoords?.();
        fabricCanvasRef.current?.requestRenderAll();
        markDirty();
        saveHistory();
        updateObjects();
        closeTextEditor();
      },
      [closeTextEditor, ensureObjectMetadata, getText, markDirty, saveHistory, updateObjects]
    );

    const openTextEditor = useCallback(
      (obj: FabricObjectLike) => {
        if (obj.type !== "i-text") return;
        const metadata = ensureObjectMetadata(obj);
        ensureTextBinding(obj);

        const bounds = computeTextEditorBounds(obj);
        const binding = textBindingsRef.current.get(metadata.objectId);
        const yText = binding?.yText ?? getText(metadata.docKey);
        let initialState = yText?.toString() ?? "";
        if (!initialState) {
          initialState = createLexicalParagraphState((obj.text as string) || "");
        }

        editingTextRef.current = obj;
        setActiveTextEditor({
          objectId: metadata.objectId,
          docKey: metadata.docKey,
          bounds: bounds ?? { left: 0, top: 0, width: 240, height: 120 },
          initialState,
        });
      },
      [computeTextEditorBounds, ensureObjectMetadata, ensureTextBinding, getText]
    );

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
          const canvasJson = JSON.stringify(
            fabricCanvasRef.current.toJSON(SERIALIZED_PROPS)
          );
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
    const saveHistory = useCallback(() => {
      if (isRestoringHistory.current) return;
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const json = fabricCanvas.toJSON(SERIALIZED_PROPS);
      const isEmptyCanvas = json.objects.length === 0;

      const h = history.current;
      if (h.stack.length === 0 || !isEmptyCanvas) {
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push(json);
        h.index++;
      }
    }, []);

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
    }, [updateObjects]);

    const updateObjects = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      const objs = fabricCanvas.getObjects();
      const active = fabricCanvas.getActiveObject();
      const activeId = active ? ensureObjectMetadata(active as FabricObjectLike).objectId : null;

      setSelectedId(activeId ?? null);
      setObjects(
        objs.map((obj: FabricObjectLike, i: number) => {
          const { objectId } = ensureObjectMetadata(obj);
          return {
            id: objectId ?? i,
            name: obj.name ?? `${obj.type}-${i}`,
            visible: obj.visible,
            locked: Boolean(obj.lockMovementX && obj.lockMovementY),
            obj,
          };
        })
      );
    }, [ensureObjectMetadata]);

    const handleClear = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => {
        detachTextBinding(obj);
        fabricCanvas.remove(obj);
      });
      textBindingsRef.current.clear();
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      saveHistory();
      updateObjects();
    }, [detachTextBinding, saveHistory, updateObjects]);

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

      const handleObjectLifecycle = (event: unknown) => {
        const target = (event as { target?: FabricObjectLike })?.target;
        if (target) {
          ensureObjectMetadata(target);
          ensureTextBinding(target);
        }
      };

      const handleRemoved = (event: unknown) => {
        const target = (event as { target?: FabricObjectLike })?.target;
        if (target) {
          detachTextBinding(target);
        }
      };

      const handleDblClick = (event: unknown) => {
        const target = (event as { target?: FabricObjectLike })?.target;
        if (target && target.type === "i-text") {
          openTextEditor(target);
        }
      };

      fabricCanvas.on("object:added", saveHistory);
      fabricCanvas.on("object:added", updateObjects);
      fabricCanvas.on("object:added", markDirty);
      fabricCanvas.on("object:added", handleObjectLifecycle);

      fabricCanvas.on("object:modified", saveHistory);
      fabricCanvas.on("object:modified", updateObjects);
      fabricCanvas.on("object:modified", markDirty);
      fabricCanvas.on("object:modified", handleObjectLifecycle);

      fabricCanvas.on("object:removed", saveHistory);
      fabricCanvas.on("object:removed", updateObjects);
      fabricCanvas.on("object:removed", markDirty);
      fabricCanvas.on("object:removed", handleRemoved);

      fabricCanvas.on("selection:created", updateObjects);
      fabricCanvas.on("selection:updated", updateObjects);
      fabricCanvas.on("selection:cleared", () => setSelectedId(null));

      fabricCanvas.on("path:created", () => {
        changeMode(TOOL_MODES.SELECT);
      });

      fabricCanvas.on("mouse:dblclick", handleDblClick);
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
    }, [
      changeMode,
      detachTextBinding,
      ensureObjectMetadata,
      ensureTextBinding,
      markDirty,
      openTextEditor,
      saveHistory,
      updateObjects,
    ]);

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
    }, [
      canvasReady,
      activeProject?.projectId,
      activeProject?.canvasJson,
      setActiveProject,
      saveHistory,
      updateObjects,
    ]);

    useEffect(() => {
      applyCanvasMode(mode);
    }, [mode, color, applyCanvasMode]);

    useEffect(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!doc || !fabricCanvas) return;

      fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => {
        if (obj.type === "i-text") {
          ensureTextBinding(obj);
        }
      });
    }, [doc, ensureTextBinding]);

    useEffect(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas || !activeTextEditor) return;

      const handleRender = () => updateActiveTextEditorBounds();
      fabricCanvas.on("after:render", handleRender);
      window.addEventListener("resize", handleRender);

      return () => {
        fabricCanvas.off("after:render", handleRender);
        window.removeEventListener("resize", handleRender);
      };
    }, [activeTextEditor, updateActiveTextEditorBounds]);

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
        editable: false,
      });

      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      fabricCanvas.requestRenderAll();
      ensureObjectMetadata(text as FabricObjectLike);
      ensureTextBinding(text as FabricObjectLike);
      openTextEditor(text as FabricObjectLike);
      changeMode(TOOL_MODES.SELECT);
    }, [color, changeMode, ensureObjectMetadata, ensureTextBinding, openTextEditor]);

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
      active.forEach((obj: FabricObjectLike) => {
        detachTextBinding(obj);
        fabricCanvas.remove(obj);
      });
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
    }, [detachTextBinding]);

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
      if (clonedObj.type === "i-text") {
        (clonedObj as Record<string, unknown>).objectId = undefined;
        (clonedObj as Record<string, unknown>).canvasDocKey = undefined;
        ensureObjectMetadata(clonedObj);
        ensureTextBinding(clonedObj);
      }
      fabricCanvas.add(clonedObj);
      fabricCanvas.setActiveObject(clonedObj);
      fabricCanvas.requestRenderAll();
      changeMode(TOOL_MODES.SELECT);
    }, [changeMode, ensureObjectMetadata, ensureTextBinding]);

    /* Global hotkeys */
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const tag = target?.tagName;
        if (activeTextEditor) return;
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
    }, [activeTextEditor, handleDelete, handleUndo, handleRedo]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
      return () => {
        const bindings = Array.from(textBindingsRef.current.values());
        bindings.forEach(({ yText, observer }) => yText.unobserve(observer));
        textBindingsRef.current.clear();
        editingTextRef.current = null;
        setActiveTextEditor(null);
      };
    }, []);

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
            <div className={styles.textEditorOverlayRoot}>
              {activeTextEditor && (
                <CanvasTextEditorOverlay
                  bounds={activeTextEditor.bounds}
                  initialState={activeTextEditor.initialState}
                  onCommit={commitTextEditor}
                  onCancel={closeTextEditor}
                />
              )}
            </div>
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









