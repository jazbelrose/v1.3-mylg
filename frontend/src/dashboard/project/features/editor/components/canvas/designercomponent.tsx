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
import { useLayerStage } from "./layers/LayerStageContext";
import { fabricObjectToLayer } from "./layers/fabricTransforms";
import type { LayerEntity, LayerStageOperation } from "./layers/types";
import LayerTree from "./layers/LayerTree";
import OneSheetOverlay from "./layers/OneSheetOverlay";

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
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [mode, setMode] = useState<string>(TOOL_MODES.SELECT);
    const [selectedId, setSelectedId] = useState<string | number | null>(null);
    const [color, setColor] = useState<string>("#ffffff");
    const [loadingCanvas, setLoadingCanvas] = useState<boolean>(false);
    const [canvasReady, setCanvasReady] = useState<boolean>(false);
    const [isDirty, setIsDirty] = useState<boolean>(false);
    const [overlayOpen, setOverlayOpen] = useState<boolean>(false);

        const history = useRef<{ stack: unknown[]; index: number }>({ stack: [], index: -1 });
        const clipboard = useRef<unknown>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricCanvasRef = useRef<any>(null);
    const isRestoringHistory = useRef<boolean>(false);
    const isInitialLoad = useRef<boolean>(true);

    const { activeProject, setActiveProject } = useData();
    const {
      replaceLayers,
      commitOperations,
      pendingOperations,
      groups: layerGroups,
      setGroupOpacity,
      setGroupVisibility,
      layers: stageLayers,
    } = useLayerStage();
    const pendingOperationsRef = useRef<LayerStageOperation[]>([]);

    useEffect(() => {
      pendingOperationsRef.current = pendingOperations;
      if (!isInitialLoad.current) {
        setIsDirty(pendingOperations.length > 0);
      }
    }, [pendingOperations]);

    /* ---------- Save ---------- */
    const saveCanvas = useCallback(
      async (showToast = false) => {
        if (!activeProject?.projectId) {
          if (showToast) notify("error", "No active project to save");
          return;
        }
        await commitOperations({ silent: !showToast });
        setIsDirty(false);
      },
      [activeProject?.projectId, commitOperations]
    );

    const markDirty = useCallback(() => {
      if (!isInitialLoad.current) {
        setIsDirty(true);
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
        if (!activeProject?.projectId) return;
        if (pendingOperationsRef.current.length === 0) return;

        try {
          navigator.sendBeacon(
            `${EDIT_PROJECT_URL}/${activeProject.projectId}/layers`,
            JSON.stringify({ operations: pendingOperationsRef.current })
          );
        } catch (err) {
          console.error("Failed to persist layer operations on unload", err);
        }
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [activeProject?.projectId]);

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

    const updateObjects = () => {
      const fabricCanvas = fabricCanvasRef.current;
      if (fabricCanvas) {
        const objs = fabricCanvas.getObjects();
        const active = fabricCanvas.getActiveObject();
        const selectedKey = active ? (active.id ?? objs.indexOf(active)) : null;
        setSelectedId(
          selectedKey !== null && selectedKey !== undefined
            ? String(selectedKey)
            : null
        );

        const canvasObjects = objs.map((obj: FabricObjectLike, i: number) => {
          const rawId = obj.id ?? `layer-${i}`;
          const id = typeof rawId === "string" ? rawId : String(rawId);
          return {
            id,
            name: obj.name ?? `${obj.type}-${i}`,
            visible: obj.visible,
            locked: obj.lockMovementX && obj.lockMovementY,
            obj,
          };
        });

        const nextLayers: LayerEntity[] = canvasObjects.map(({ id, name, obj }, index) => {
          const serialized = (obj.toObject?.([
            "id",
            "name",
            "visible",
            "lockMovementX",
            "lockMovementY",
            "opacity",
            "left",
            "top",
            "width",
            "height",
            "scaleX",
            "scaleY",
            "angle",
            "fill",
            "stroke",
          ]) ?? {}) as Record<string, unknown>;
          serialized.id = id;
          serialized.name = name;

          const layer = fabricObjectToLayer(serialized, index);
          return {
            ...layer,
            id: typeof layer.id === "string" ? layer.id : String(layer.id),
            name,
            visible: obj.visible !== false,
            locked: Boolean(obj.lockMovementX && obj.lockMovementY),
            opacity: typeof obj.opacity === "number" ? obj.opacity : layer.opacity,
            order: index,
            data: {
              fabric: serialized,
            },
          };
        });

        replaceLayers(nextLayers, { silent: isInitialLoad.current });
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

    /* Layer list helpers */
    const getObjectByLayerId = useCallback(
      (layerId: string | number): FabricObjectLike | null => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return null;
        const targetId = String(layerId);
        const match = fabricCanvas
          .getObjects()
          .find((obj: FabricObjectLike) => String(obj.id ?? obj.name ?? "") === targetId);
        return match ?? null;
      },
      []
    );

    const handleLayerVisibility = useCallback(
      (layerId: string) => {
        const obj = getObjectByLayerId(layerId);
        if (!obj) return;
        obj.visible = !obj.visible;
        const canvas = obj.canvas as { requestRenderAll?: () => void } | undefined;
        canvas?.requestRenderAll?.();
        updateObjects();
        markDirty();
      },
      [getObjectByLayerId, updateObjects, markDirty]
    );

    const handleLayerLock = useCallback(
      (layerId: string) => {
        const obj = getObjectByLayerId(layerId);
        if (!obj) return;
        const locked = !(obj.lockMovementX && obj.lockMovementY);
        obj.lockMovementX = obj.lockMovementY = locked;
        obj.selectable = !locked;
        obj.evented = !locked;
        const canvas = obj.canvas as { requestRenderAll?: () => void } | undefined;
        canvas?.requestRenderAll?.();
        updateObjects();
        markDirty();
      },
      [getObjectByLayerId, updateObjects, markDirty]
    );

    const handleLayerRename = useCallback(
      (layerId: string, name: string) => {
        const obj = getObjectByLayerId(layerId);
        if (!obj) return;
        obj.name = name;
        updateObjects();
        markDirty();
      },
      [getObjectByLayerId, updateObjects, markDirty]
    );

    const handleLayerSelect = useCallback(
      (layerId: string) => {
        const obj = getObjectByLayerId(layerId);
        const fabricCanvas = fabricCanvasRef.current;
        if (!obj || !fabricCanvas) return;
        fabricCanvas.setActiveObject(obj);
        fabricCanvas.requestRenderAll();
        setSelectedId(layerId);
      },
      [getObjectByLayerId]
    );

    const handleLayerOpacity = useCallback(
      (layerId: string, opacity: number) => {
        const obj = getObjectByLayerId(layerId);
        if (!obj) return;
        obj.opacity = opacity;
        const canvas = obj.canvas as { requestRenderAll?: () => void } | undefined;
        canvas?.requestRenderAll?.();
        updateObjects();
        markDirty();
      },
      [getObjectByLayerId, updateObjects, markDirty]
    );

    const handleGroupVisibilityChange = useCallback(
      (groupId: string, visible: boolean) => {
        setGroupVisibility(groupId, visible);
        if (groupId === "canvas") {
          const fabricCanvas = fabricCanvasRef.current;
          if (!fabricCanvas) return;
          fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => {
            obj.visible = visible;
          });
          fabricCanvas.requestRenderAll();
          updateObjects();
        }
      },
      [setGroupVisibility, updateObjects]
    );

    const handleGroupOpacityChange = useCallback(
      (groupId: string, opacity: number) => {
        setGroupOpacity(groupId, opacity);
        if (groupId === "canvas") {
          const fabricCanvas = fabricCanvasRef.current;
          if (!fabricCanvas) return;
          fabricCanvas.getObjects().forEach((obj: FabricObjectLike) => {
            obj.opacity = opacity;
          });
          fabricCanvas.requestRenderAll();
          updateObjects();
        }
      },
      [setGroupOpacity, updateObjects]
    );

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
      <div style={{ display: "flex", height: "100%", position: "relative" }}>
        <OneSheetOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
        {/* Layers panel */}
        <LayerTree
          layers={stageLayers}
          groups={layerGroups}
          selectedId={selectedId}
          onSelectLayer={handleLayerSelect}
          onRenameLayer={handleLayerRename}
          onToggleVisibility={handleLayerVisibility}
          onToggleLock={handleLayerLock}
          onChangeOpacity={handleLayerOpacity}
          onGroupVisibility={handleGroupVisibilityChange}
          onGroupOpacity={handleGroupOpacityChange}
          onOpenOverlay={() => setOverlayOpen(true)}
        />

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









