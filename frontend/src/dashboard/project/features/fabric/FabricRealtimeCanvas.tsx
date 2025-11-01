import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { fabric } from "fabric";
import { FABRIC_API_BASE, FABRIC_WS_URL } from "@/config/fabricRealtime";

export type FabricCanvasMode = "select" | "brush" | "rect";

export interface FabricRealtimeCanvasHandle {
  changeMode: (mode: FabricCanvasMode) => void;
  addText: () => void;
  addRectangle: () => void;
  triggerImageUpload: () => void;
  handleColorChange: (color: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleDelete: () => void;
  handleClear: () => void;
  handleSave: () => Promise<void>;
  exportAsImage: (type?: "png" | "jpeg", quality?: number) => string | null;
  exportAsPdf: (filename?: string) => Promise<void>;
  exportAsHtml: () => string | null;
  getDocumentId: () => string;
}

export interface FabricRealtimeCanvasProps {
  documentId: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  className?: string;
  style?: React.CSSProperties;
  accentColor?: string;
}

type HistoryState = {
  past: string[];
  future: string[];
};

const MAX_HISTORY = 50;

const createClientId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const serializeCanvas = (canvas: fabric.Canvas | null) => {
  if (!canvas) return null;
  return JSON.stringify(
    canvas.toJSON(["id", "name", "data", "rx", "ry", "selectable"])
  );
};

const loadFromSerialized = async (
  canvas: fabric.Canvas,
  payload: string,
  after?: () => void
) =>
  new Promise<void>((resolve, reject) => {
    canvas.loadFromJSON(payload, () => {
      canvas.renderAll();
      after?.();
      resolve();
    }, (error) => {
      if (error) {
        reject(error);
      }
    });
  });

const buildWsUrl = (documentId: string, clientId: string) => {
  const base = FABRIC_WS_URL;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}documentId=${encodeURIComponent(documentId)}&clientId=${encodeURIComponent(clientId)}`;
};

const FabricRealtimeCanvas = forwardRef<FabricRealtimeCanvasHandle, FabricRealtimeCanvasProps>(
  (
    {
      documentId,
      width = 1280,
      height = 720,
      backgroundColor = "#ffffff",
      className,
      style,
      accentColor = "#2563eb",
    },
    ref
  ) => {
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pendingSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingStateRef = useRef<{ content: string; revision: number } | null>(null);
    const isHydratingRef = useRef(false);
    const historyRef = useRef<HistoryState>({ past: [], future: [] });
    const currentSnapshotRef = useRef<string | null>(null);
    const clipboardRef = useRef<fabric.Object | fabric.Group | null>(null);
    const brushColorRef = useRef<string>(accentColor);
    const modeRef = useRef<FabricCanvasMode>("select");
    const drawingRectRef = useRef<{
      rect: fabric.Rect;
      originX: number;
      originY: number;
    } | null>(null);
    const clientIdRef = useRef<string>(createClientId());
    const [isReady, setIsReady] = useState(false);
    const [isOnline, setIsOnline] = useState(false);
    const [lastSync, setLastSync] = useState<Date | null>(null);

    const captureSnapshot = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas || isHydratingRef.current) return null;
      const serialized = serializeCanvas(canvas);
      if (!serialized || serialized === currentSnapshotRef.current) return null;
      const history = historyRef.current;
      history.past = [...history.past, serialized].slice(-MAX_HISTORY);
      history.future = [];
      currentSnapshotRef.current = serialized;
      pendingStateRef.current = { content: serialized, revision: Date.now() };
      if (!isHydratingRef.current) {
        if (pendingSyncRef.current) {
          clearTimeout(pendingSyncRef.current);
        }
        pendingSyncRef.current = setTimeout(() => {
          void flushPendingSync();
        }, 250);
      }
      return serialized;
    }, []);

    const flushPendingSync = useCallback(async () => {
      const canvas = fabricRef.current;
      const ws = wsRef.current;
      const payload = pendingStateRef.current;
      if (!canvas || !payload || !ws) return;
      if (ws.readyState !== WebSocket.OPEN) {
        // retry later once socket opens
        if (pendingSyncRef.current) {
          clearTimeout(pendingSyncRef.current);
        }
        pendingSyncRef.current = setTimeout(() => {
          void flushPendingSync();
        }, 500);
        return;
      }
      ws.send(
        JSON.stringify({
          action: "sync",
          documentId,
          content: payload.content,
          revision: payload.revision,
          clientId: clientIdRef.current,
        })
      );
      pendingStateRef.current = null;
      setLastSync(new Date());
    }, [documentId]);

    const persistDocument = useCallback(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const content = serializeCanvas(canvas);
      if (!content) return;
      try {
        await fetch(`${FABRIC_API_BASE}/documents/${encodeURIComponent(documentId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            revision: Date.now(),
          }),
        });
        setLastSync(new Date());
      } catch (error) {
        console.error("Failed to persist document", error);
      }
    }, [documentId]);

    const restoreSnapshot = useCallback(
      async (snapshot: string | null, opts?: { skipHistory?: boolean }) => {
        const canvas = fabricRef.current;
        if (!canvas || !snapshot) return;
        isHydratingRef.current = true;
        try {
          await loadFromSerialized(canvas, snapshot, () => {
            currentSnapshotRef.current = snapshot;
          });
          if (!opts?.skipHistory) {
            historyRef.current.past = [...historyRef.current.past, snapshot].slice(-MAX_HISTORY);
            historyRef.current.future = [];
          }
        } catch (error) {
          console.error("Failed to restore snapshot", error);
        } finally {
          isHydratingRef.current = false;
          canvas.renderAll();
        }
      },
      []
    );

    const handleUndo = useCallback(() => {
      const history = historyRef.current;
      if (history.past.length <= 1) return;
      const current = history.past.pop();
      if (!current) return;
      history.future = [current, ...history.future].slice(0, MAX_HISTORY);
      const previous = history.past[history.past.length - 1];
      void restoreSnapshot(previous, { skipHistory: true });
    }, [restoreSnapshot]);

    const handleRedo = useCallback(() => {
      const history = historyRef.current;
      if (history.future.length === 0) return;
      const next = history.future.shift();
      if (!next) return;
      history.past = [...history.past, next].slice(-MAX_HISTORY);
      void restoreSnapshot(next, { skipHistory: true });
    }, [restoreSnapshot]);

    const handleDelete = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();
      if (!activeObjects || activeObjects.length === 0) return;
      activeObjects.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      captureSnapshot();
    }, [captureSnapshot]);

    const handleClear = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.clear();
      canvas.setBackgroundColor(backgroundColor, () => {
        canvas.renderAll();
      });
      captureSnapshot();
    }, [backgroundColor, captureSnapshot]);

    const handleCopy = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      activeObject.clone((cloned: fabric.Object) => {
        clipboardRef.current = cloned;
      });
    }, []);

    const handlePaste = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas || !clipboardRef.current) return;
      clipboardRef.current.clone((clonedObj: fabric.Object) => {
        clonedObj.set({
          left: (clonedObj.left ?? 0) + 16,
          top: (clonedObj.top ?? 0) + 16,
          evented: true,
        });
        canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj);
        canvas.requestRenderAll();
        captureSnapshot();
      });
    }, [captureSnapshot]);

    const handleColorChange = useCallback(
      (color: string) => {
        brushColorRef.current = color;
        const canvas = fabricRef.current;
        if (!canvas) return;
        if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush.color = color;
        }
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
          if ("set" in activeObject) {
            if ("fill" in activeObject) {
              activeObject.set("fill", color);
            }
            if ("stroke" in activeObject) {
              activeObject.set("stroke", color);
            }
          }
          canvas.requestRenderAll();
        }
      },
      []
    );

    const changeMode = useCallback(
      (mode: FabricCanvasMode) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        modeRef.current = mode;
        if (mode === "brush") {
          canvas.isDrawingMode = true;
          if (!canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
          }
          canvas.freeDrawingBrush.color = brushColorRef.current;
          canvas.freeDrawingBrush.width = 4;
        } else {
          canvas.isDrawingMode = false;
        }
        if (mode === "select") {
          canvas.selection = true;
        } else {
          canvas.selection = false;
          canvas.discardActiveObject();
        }
      },
      []
    );

    const addRectangle = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const rect = new fabric.Rect({
        left: canvas.getWidth() / 2 - 50,
        top: canvas.getHeight() / 2 - 50,
        width: 120,
        height: 80,
        fill: "rgba(0,0,0,0)",
        stroke: brushColorRef.current,
        strokeWidth: 3,
        rx: 8,
        ry: 8,
      });
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.requestRenderAll();
      captureSnapshot();
    }, [captureSnapshot]);

    const addText = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const text = new fabric.IText("Double click to edit", {
        left: canvas.getWidth() / 2 - 80,
        top: canvas.getHeight() / 2 - 20,
        fill: brushColorRef.current,
        fontSize: 28,
        fontFamily: "Inter, sans-serif",
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
      captureSnapshot();
    }, [captureSnapshot]);

    const triggerImageUpload = useCallback(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          if (typeof dataUrl !== "string") return;
          fabric.Image.fromURL(dataUrl, (img) => {
            const canvas = fabricRef.current;
            if (!canvas) return;
            img.set({
              left: canvas.getWidth() / 2 - img.getScaledWidth() / 2,
              top: canvas.getHeight() / 2 - img.getScaledHeight() / 2,
            });
            if (img.getScaledWidth() > canvas.getWidth()) {
              const scale = canvas.getWidth() / img.getScaledWidth();
              img.scale(scale * 0.9);
            }
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            captureSnapshot();
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }, [captureSnapshot]);

    useEffect(() => {
      const canvasElement = canvasElementRef.current;
      if (!canvasElement) return;
      const canvas = new fabric.Canvas(canvasElement, {
        backgroundColor,
        preserveObjectStacking: true,
        selection: true,
      });
      canvas.setWidth(width);
      canvas.setHeight(height);
      fabricRef.current = canvas;

      const handleChange = () => {
        captureSnapshot();
      };

      canvas.on("object:added", handleChange);
      canvas.on("object:modified", handleChange);
      canvas.on("object:removed", handleChange);

      const handleMouseDown = (event: fabric.IEvent<MouseEvent>) => {
        if (modeRef.current !== "rect" || !canvas) return;
        const pointer = canvas.getPointer(event.e);
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 1,
          height: 1,
          fill: "rgba(0,0,0,0)",
          stroke: brushColorRef.current,
          strokeWidth: 2,
          selectable: false,
          evented: false,
        });
        drawingRectRef.current = {
          rect,
          originX: pointer.x,
          originY: pointer.y,
        };
        canvas.add(rect);
      };

      const handleMouseMove = (event: fabric.IEvent<MouseEvent>) => {
        if (modeRef.current !== "rect") return;
        const state = drawingRectRef.current;
        const rect = state?.rect;
        if (!rect || !canvas) return;
        const pointer = canvas.getPointer(event.e);
        const widthDelta = pointer.x - (state?.originX ?? 0);
        const heightDelta = pointer.y - (state?.originY ?? 0);
        rect.set({
          width: Math.abs(widthDelta),
          height: Math.abs(heightDelta),
          left: Math.min(pointer.x, state.originX),
          top: Math.min(pointer.y, state.originY),
        });
        canvas.requestRenderAll();
      };

      const handleMouseUp = () => {
        if (modeRef.current !== "rect") return;
        const state = drawingRectRef.current;
        const rect = state?.rect;
        drawingRectRef.current = null;
        if (!rect || !canvas) return;
        rect.set({ selectable: true, evented: true });
        canvas.setActiveObject(rect);
        canvas.requestRenderAll();
        captureSnapshot();
      };

      canvas.on("mouse:down", handleMouseDown);
      canvas.on("mouse:move", handleMouseMove);
      canvas.on("mouse:up", handleMouseUp);

      return () => {
        canvas.off("object:added", handleChange);
        canvas.off("object:modified", handleChange);
        canvas.off("object:removed", handleChange);
        canvas.off("mouse:down", handleMouseDown);
        canvas.off("mouse:move", handleMouseMove);
        canvas.off("mouse:up", handleMouseUp);
        canvas.dispose();
        fabricRef.current = null;
      };
    }, [backgroundColor, captureSnapshot, height, width]);

    useEffect(() => {
      const controller = new AbortController();
      const loadInitial = async () => {
        try {
          const response = await fetch(
            `${FABRIC_API_BASE}/documents/${encodeURIComponent(documentId)}`,
            { signal: controller.signal }
          );
          if (!response.ok) {
            throw new Error(`Failed to load document: ${response.status}`);
          }
          const payload = await response.json();
          const content = typeof payload?.content === "string" ? payload.content : null;
          if (content && fabricRef.current) {
            await restoreSnapshot(content, { skipHistory: true });
          }
          const initial = serializeCanvas(fabricRef.current);
          if (initial) {
            historyRef.current = { past: [initial], future: [] };
            currentSnapshotRef.current = initial;
          }
          setIsReady(true);
        } catch (error) {
          if ((error as Error)?.name === "AbortError") return;
          console.error("Failed to initialize fabric document", error);
          setIsReady(true);
        }
      };
      void loadInitial();
      return () => {
        controller.abort();
      };
    }, [documentId, restoreSnapshot]);

    useEffect(() => {
      const connect = () => {
        const wsUrl = buildWsUrl(documentId, clientIdRef.current);
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;
        socket.onopen = () => {
          setIsOnline(true);
          if (pendingStateRef.current) {
            void flushPendingSync();
          }
        };
        socket.onclose = () => {
          setIsOnline(false);
          if (socket.readyState !== WebSocket.CLOSED) {
            setTimeout(connect, 1000);
          }
        };
        socket.onerror = (event) => {
          console.error("Fabric realtime socket error", event);
        };
        socket.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data ?? "{}");
            if (data.action !== "sync") return;
            if (data.documentId !== documentId) return;
            if (data.clientId && data.clientId === clientIdRef.current) return;
            if (typeof data.content !== "string") return;
            await restoreSnapshot(data.content, { skipHistory: true });
            const snapshot = serializeCanvas(fabricRef.current);
            if (snapshot) {
              historyRef.current.past = [...historyRef.current.past, snapshot].slice(-MAX_HISTORY);
              currentSnapshotRef.current = snapshot;
            }
            setLastSync(new Date());
          } catch (error) {
            console.error("Failed to process realtime update", error);
          }
        };
      };
      connect();
      return () => {
        wsRef.current?.close();
        wsRef.current = null;
      };
    }, [documentId, flushPendingSync, restoreSnapshot]);

    useEffect(() => () => {
      if (pendingSyncRef.current) {
        clearTimeout(pendingSyncRef.current);
        pendingSyncRef.current = null;
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        changeMode,
        addText,
        addRectangle,
        triggerImageUpload,
        handleColorChange,
        handleUndo,
        handleRedo,
        handleCopy,
        handlePaste,
        handleDelete,
        handleClear,
        handleSave: persistDocument,
        exportAsImage: (type = "png", quality = 1) => {
          const canvas = fabricRef.current;
          if (!canvas) return null;
          return canvas.toDataURL({ format: type, quality, multiplier: 2 });
        },
        exportAsPdf: async (filename = `${documentId}.pdf`) => {
          const canvas = fabricRef.current;
          if (!canvas) return;
          const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
          const { jsPDF } = await import("jspdf");
          const pdf = new jsPDF({
            orientation: canvas.getWidth() > canvas.getHeight() ? "l" : "p",
            unit: "px",
            format: [canvas.getWidth(), canvas.getHeight()],
          });
          pdf.addImage(
            dataUrl,
            "PNG",
            0,
            0,
            canvas.getWidth(),
            canvas.getHeight()
          );
          pdf.save(filename);
        },
        exportAsHtml: () => {
          const canvas = fabricRef.current;
          if (!canvas) return null;
          const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
          return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${documentId}</title></head><body style="margin:0;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUrl}" alt="${documentId}" style="max-width:100%;height:auto;box-shadow:0 24px 48px rgba(15,23,42,0.24);border-radius:24px;"/></body></html>`;
        },
        getDocumentId: () => documentId,
      }),
      [
        addRectangle,
        addText,
        changeMode,
        documentId,
        handleClear,
        handleColorChange,
        handleCopy,
        handleDelete,
        handlePaste,
        handleRedo,
        handleUndo,
        persistDocument,
        triggerImageUpload,
      ]
    );

    useEffect(() => {
      brushColorRef.current = accentColor;
    }, [accentColor]);

    const statusText = useMemo(() => {
      if (!isReady) return "Loading";
      if (!isOnline) return "Offline";
      if (!lastSync) return "Connected";
      return `Synced ${lastSync.toLocaleTimeString()}`;
    }, [isOnline, isReady, lastSync]);

    return (
      <div
        className={className}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          ...style,
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, rgba(15,23,42,0.04), rgba(148,163,184,0.12))",
            padding: "24px",
          }}
        >
          <canvas
            ref={canvasElementRef}
            width={width}
            height={height}
            style={{
              backgroundColor,
              borderRadius: "20px",
              boxShadow: "0 20px 55px rgba(15,23,42,0.22)",
            }}
          />
        </div>
        <div
          style={{
            fontSize: "12px",
            padding: "8px 16px",
            color: isOnline ? "#0f172a" : "#dc2626",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255,255,255,0.8)",
            borderTop: "1px solid rgba(148,163,184,0.2)",
          }}
        >
          <span>{statusText}</span>
          <span style={{ fontWeight: 600 }}>Fabric realtime</span>
        </div>
      </div>
    );
  }
);

FabricRealtimeCanvas.displayName = "FabricRealtimeCanvas";

export default FabricRealtimeCanvas;
