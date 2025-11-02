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

/* ---------- Types ---------- */

interface DesignerComponentProps {
  style?: React.CSSProperties;
  loadFromLegacyApi?: boolean;
  initialCanvasJson?: string | null;
  onCanvasChange?: (json: string) => void;
  onSave?: (json: string) => Promise<void> | void;
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
  getCanvasJson: () => string | null;
  loadCanvasJson: (json: string, options?: { silent?: boolean }) => void;
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
    const {
      style: forwardedStyle,
      loadFromLegacyApi = true,
      initialCanvasJson = null,
      onCanvasChange,
      onSave,
      ...restProps
    } = props;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [mode, setMode] = useState<string>(TOOL_MODES.SELECT);
    const [color, setColor] = useState<string>("#ffffff");
    const [loadingCanvas, setLoadingCanvas] = useState<boolean>(false);
    const [canvasReady, setCanvasReady] = useState<boolean>(false);
    const [isDirty, setIsDirty] = useState<boolean>(false);

        const history = useRef<{ stack: unknown[]; index: number }>({ stack: [], index: -1 });
        const clipboard = useRef<unknown>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricCanvasRef = useRef<any>(null);
    const isRestoringHistory = useRef<boolean>(false);
    const isApplyingExternal = useRef<boolean>(false);
    const isInitialLoad = useRef<boolean>(true);
    const onCanvasChangeRef = useRef<typeof onCanvasChange>(onCanvasChange);
    const onSaveOverrideRef = useRef<typeof onSave>(onSave);
    const initialJsonRef = useRef<string | null>(initialCanvasJson);

    useEffect(() => {
      onCanvasChangeRef.current = onCanvasChange;
    }, [onCanvasChange]);

    useEffect(() => {
      onSaveOverrideRef.current = onSave;
    }, [onSave]);

    useEffect(() => {
      initialJsonRef.current = initialCanvasJson;
    }, [initialCanvasJson]);

    const { activeProject, setActiveProject } = useData();

    /* ---------- Save ---------- */
    const saveCanvas = useCallback(
      async (showToast = false) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) {
          if (showToast) notify("error", "Canvas not ready");
          return;
        }

        const canvasJson = JSON.stringify(fabricCanvas.toJSON());
        const customSave = onSaveOverrideRef.current;

        if (customSave) {
          try {
            await customSave(canvasJson);
            setIsDirty(false);
            if (showToast) notify("success", "Saved. Nice.");
          } catch (error) {
            console.error("Custom canvas save failed", error);
            if (showToast) notify("error", "Failed to save canvas");
          }
          return;
        }

        if (!activeProject?.projectId) {
          if (showToast) notify("error", "No active project to save");
          return;
        }

        try {
          const apiUrl = `${EDIT_PROJECT_URL}/${activeProject.projectId}`;
          await apiFetch(apiUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ canvasJson }),
          });
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
      if (isInitialLoad.current || isRestoringHistory.current || isApplyingExternal.current) return;
      setIsDirty(true);
      const callback = onCanvasChangeRef.current;
      const fabricCanvas = fabricCanvasRef.current;
      if (callback && fabricCanvas) {
        try {
          const json = JSON.stringify(fabricCanvas.toJSON());
          callback(json);
        } catch (error) {
          console.error("Failed to serialize canvas", error);
        }
      }
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

        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const json = JSON.stringify(canvas.toJSON());
        const customSave = onSaveOverrideRef.current;

        if (customSave) {
          try {
            customSave(json);
          } catch (error) {
            console.error("Custom beforeunload save failed", error);
          }
        } else if (activeProject?.projectId) {
          navigator.sendBeacon(
            `${EDIT_PROJECT_URL}/${activeProject.projectId}`,
            JSON.stringify({ canvasJson: json })
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
      if (isRestoringHistory.current || isApplyingExternal.current) return;
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

    const loadCanvasFromJson = useCallback(
      async (
        json: string | Record<string, unknown>,
        options?: { silent?: boolean }
      ) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;

        let parsed: Record<string, unknown> | string = json;
        if (typeof json === "string") {
          try {
            parsed = JSON.parse(json) as Record<string, unknown>;
          } catch (error) {
            console.error("Failed to parse canvas JSON", error);
            return;
          }
        }

        isApplyingExternal.current = true;
        await new Promise<void>((resolve) => {
          fabricCanvas.loadFromJSON(parsed, () => {
            fabricCanvas.renderAll();
            fabricCanvas.requestRenderAll();
            resolve();
          });
        });
        isApplyingExternal.current = false;
        saveHistory();
        if (!options?.silent) {
          markDirty();
        }
      },
      [markDirty]
    );

    const loadHistory = useCallback(
      (index: number) => {
        const fabricCanvas = fabricCanvasRef.current;
        const h = history.current;
        if (!fabricCanvas || index < 0 || index >= h.stack.length) return;

        isRestoringHistory.current = true;
        fabricCanvas.loadFromJSON(h.stack[index], () => {
          fabricCanvas.renderAll();
          fabricCanvas.requestRenderAll();
          isRestoringHistory.current = false;
        });
        h.index = index;
      },
      []
    );

    const handleClear = useCallback(() => {
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas) return;

      fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      saveHistory();
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
      fabricCanvas.on("object:added", markDirty);

      fabricCanvas.on("object:modified", saveHistory);
      fabricCanvas.on("object:modified", markDirty);

      fabricCanvas.on("object:removed", saveHistory);
      fabricCanvas.on("object:removed", markDirty);

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
        try {
          let jsonString: string | null = initialJsonRef.current ?? (activeProject?.canvasJson as string | null) ?? null;

          if (loadFromLegacyApi && activeProject?.projectId) {
            const apiUrl = `${EDIT_PROJECT_URL}/${activeProject.projectId}`;
            console.debug('Loading canvas from:', apiUrl);
            try {
              const data: { canvasJson?: string } = await apiFetch(apiUrl);
              jsonString = data?.canvasJson ?? jsonString;
              setActiveProject((prev: Project | null) =>
                prev ? { ...prev, canvasJson: jsonString ?? undefined } : prev
              );
            } catch (e) {
              console.error('Canvas fetch failed:', e);
              notify(
                'error',
                'Failed to load canvas from server. Using local copy if available.'
              );
            }
          }

          if (jsonString) {
            await loadCanvasFromJson(jsonString, { silent: true });
          } else {
            fabricCanvas.clear();
            fabricCanvas.renderAll();
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
      loadCanvasFromJson,
      loadFromLegacyApi,
    ]);

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

      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      const textObj = text as Record<string, unknown>;
      if (typeof textObj.enterEditing === 'function') {
        textObj.enterEditing();
      }
      const hiddenTextarea = textObj.hiddenTextarea as { focus?: () => void } | undefined;
      hiddenTextarea?.focus?.();
      fabricCanvas.requestRenderAll();
      changeMode(TOOL_MODES.SELECT);
    }, [color, changeMode]);

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
        loadCanvasJson: loadCanvasFromJson,
        getCanvasJson: () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return null;
          try {
            return JSON.stringify(canvas.toJSON());
          } catch (error) {
            console.error("Failed to serialize canvas", error);
            return null;
          }
        },
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
        loadCanvasFromJson,
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









