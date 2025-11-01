import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import classNames from "classnames";
import {
  Canvas as FabricCanvas,
  IText,
  Rect,
  Circle,
  Image as FabricImage,
} from "fabric";
import useFabricRealtime from "./useFabricRealtime";
import styles from "./fabric-realtime-canvas.module.css";

export interface FabricRealtimeCanvasProps {
  documentId: string;
  initialState?: string | null;
  onChange?: (state: string, summary: string) => void;
  registerToolbar?: (actions: Partial<Record<string, unknown>>) => void;
  className?: string;
  readOnly?: boolean;
  height?: number | string;
  /** When true, skips realtime sync (offline/new project flow) */
  disableRealtime?: boolean;
}

type FabricSerializableObject = {
  type: string;
  text?: string;
  fill?: string | null;
  stroke?: string | null;
  fontFamily?: string;
  fontSize?: number;
  clone?: (callback: (clone: FabricSerializableObject) => void) => void;
  set?: (props: Record<string, unknown>) => void;
};

const SERIALIZE_PROPS = ["id", "name", "type", "fill", "stroke", "text", "left", "top", "width", "height", "scaleX", "scaleY", "angle", "fontFamily", "fontSize", "fontWeight", "fontStyle", "underline", "backgroundColor", "textAlign"] as const;

type SelectionSummary = {
  fill?: string | null;
  stroke?: string | null;
  fontFamily?: string;
  fontSize?: number;
};

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toPlainText = (json: unknown): string => {
  if (!json || typeof json !== "object") return "";
  const doc = json as { objects?: FabricSerializableObject[] };
  if (!Array.isArray(doc.objects)) return "";
  return doc.objects
    .filter((item) => item.type === "i-text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
};

const parseState = (value?: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.error("Failed to parse Fabric canvas state", err);
    return null;
  }
};

const FabricRealtimeCanvas: React.FC<FabricRealtimeCanvasProps> = ({
  documentId,
  initialState,
  onChange,
  registerToolbar,
  className,
  readOnly = false,
  height = DEFAULT_HEIGHT,
  disableRealtime = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const isApplyingRemoteUpdate = useRef(false);
  const [selectionSummary, setSelectionSummary] = useState<SelectionSummary>({});

  const realtime = useFabricRealtime<Record<string, unknown>>({
    documentId: disableRealtime ? undefined : documentId,
    onRemoteState: (state) => {
      if (!canvasRef.current) return;
      try {
        const parsed =
          typeof state === "string"
            ? (JSON.parse(state) as Record<string, unknown>)
            : (state as Record<string, unknown>);
        if (!parsed) return;
        isApplyingRemoteUpdate.current = true;
        canvasRef.current.loadFromJSON(parsed, () => {
          canvasRef.current?.renderAll();
          canvasRef.current?.requestRenderAll();
          isApplyingRemoteUpdate.current = false;
          const serialized = JSON.stringify(parsed);
          const summary = toPlainText(parsed);
          onChange?.(serialized, summary);
        });
      } catch (error) {
        console.error("Failed to apply remote Fabric state", error);
        canvasRef.current?.renderAll();
        isApplyingRemoteUpdate.current = false;
      }
    },
  });

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const json = canvas.toJSON([...SERIALIZE_PROPS]);
    const serialized = JSON.stringify(json);
    const summary = toPlainText(json);
    onChange?.(serialized, summary);
    if (!disableRealtime) {
      realtime.sendState(json);
    }
  }, [onChange, disableRealtime, realtime]);

  const updateSelectionSummary = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as FabricSerializableObject | undefined;
    if (!active) {
      setSelectionSummary({});
      return;
    }
    setSelectionSummary({
      fill: active.fill,
      stroke: active.stroke,
      fontFamily: (active as IText).fontFamily ?? undefined,
      fontSize: (active as IText).fontSize ?? undefined,
    });
  }, []);

  const addTextbox = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const textbox = new IText("Double-click to edit", {
      left: DEFAULT_WIDTH / 2 - 150,
      top: DEFAULT_HEIGHT / 2 - 40,
      width: 300,
      fontSize: 24,
      fill: "#1f2933",
    });
    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    canvas.requestRenderAll();
    emitChange();
  }, [emitChange]);

  const addRectangle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = new Rect({
      left: DEFAULT_WIDTH / 2 - 100,
      top: DEFAULT_HEIGHT / 2 - 60,
      width: 200,
      height: 120,
      rx: 12,
      ry: 12,
      fill: "rgba(79, 70, 229, 0.2)",
      stroke: "#4f46e5",
      strokeWidth: 2,
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    emitChange();
  }, [emitChange]);

  const addCircle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const circle = new Circle({
      left: DEFAULT_WIDTH / 2 - 60,
      top: DEFAULT_HEIGHT / 2 - 60,
      radius: 60,
      fill: "rgba(16, 185, 129, 0.18)",
      stroke: "#0f766e",
      strokeWidth: 2,
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.requestRenderAll();
    emitChange();
  }, [emitChange]);

  const addImageFromUrl = useCallback(
    async (url?: string) => {
      if (!url) {
        const result = window.prompt("Paste an image URL");
        if (!result) return;
        url = result;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
        const scale = Math.min(
          (DEFAULT_WIDTH * 0.6) / (image.width ?? DEFAULT_WIDTH),
          (DEFAULT_HEIGHT * 0.6) / (image.height ?? DEFAULT_HEIGHT)
        );
        image.scale(clamp(scale, 0.2, 1));
        image.set({
          left: DEFAULT_WIDTH / 2 - (image.getScaledWidth?.() ?? 0) / 2,
          top: DEFAULT_HEIGHT / 2 - (image.getScaledHeight?.() ?? 0) / 2,
        });
        canvas.add(image);
        canvas.setActiveObject(image);
        canvas.requestRenderAll();
        emitChange();
      } catch (err) {
        console.error("Failed to load image", err);
        window.alert("Could not load image");
      }
    },
    [emitChange]
  );

  const deleteSelection = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (!active || active.length === 0) return;
    active.forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    emitChange();
  }, [emitChange]);

  const bringToFront = useCallback(() => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    active.bringToFront();
    canvas.requestRenderAll();
    emitChange();
  }, [emitChange]);

  const sendToBack = useCallback(() => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    active.sendToBack();
    canvas.requestRenderAll();
    emitChange();
  }, [emitChange]);

  const duplicateSelection = useCallback(async () => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    active.clone((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 24,
        top: (clone.top ?? 0) + 24,
      });
      canvas.add(clone);
      canvas.setActiveObject(clone);
      canvas.requestRenderAll();
      emitChange();
    });
  }, [emitChange]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shouldClear = window.confirm("Clear the page? This cannot be undone.");
    if (!shouldClear) return;
    canvas.getObjects().forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
    emitChange();
  }, [emitChange]);

  const setFillColor = useCallback((value: string) => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    if ("set" in active) {
      active.set({ fill: value });
    }
    canvas.requestRenderAll();
    emitChange();
    updateSelectionSummary();
  }, [emitChange, updateSelectionSummary]);

  const setStrokeColor = useCallback((value: string) => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    if ("set" in active) {
      active.set({ stroke: value });
    }
    canvas.requestRenderAll();
    emitChange();
    updateSelectionSummary();
  }, [emitChange, updateSelectionSummary]);

  const setFontFamily = useCallback((value: string) => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as IText | undefined;
    if (!canvas || !active || active.type !== "i-text") return;
    active.set({ fontFamily: value });
    canvas.requestRenderAll();
    emitChange();
    updateSelectionSummary();
  }, [emitChange, updateSelectionSummary]);

  const setFontSize = useCallback((value: number) => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as IText | undefined;
    if (!canvas || !active || active.type !== "i-text") return;
    active.set({ fontSize: clamp(value, 12, 200) });
    canvas.requestRenderAll();
    emitChange();
    updateSelectionSummary();
  }, [emitChange, updateSelectionSummary]);

  const exportState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toJSON([...SERIALIZE_PROPS]);
  }, []);

  const registerToolbarActions = useCallback(() => {
    if (!registerToolbar) return;
    registerToolbar({
      onAddText: addTextbox,
      onAddRectangle: addRectangle,
      onAddCircle: addCircle,
      onAddImage: () => addImageFromUrl(),
      onDelete: deleteSelection,
      onBringForward: bringToFront,
      onSendBackward: sendToBack,
      onCopy: duplicateSelection,
      onClearCanvas: clearCanvas,
      onFontColorChange: setFillColor,
      onBgColorChange: setStrokeColor,
      onFontChange: setFontFamily,
      onFontSizeChange: (value: number | string) => {
        const numeric = typeof value === "string" ? Number.parseInt(value, 10) : value;
        if (!Number.isNaN(numeric)) setFontSize(numeric);
      },
      __fabricExportState: exportState,
    });
  }, [
    registerToolbar,
    addTextbox,
    addRectangle,
    addCircle,
    addImageFromUrl,
    deleteSelection,
    bringToFront,
    sendToBack,
    duplicateSelection,
    clearCanvas,
    setFillColor,
    setStrokeColor,
    setFontFamily,
    setFontSize,
    exportState,
  ]);

  useEffect(() => {
    registerToolbarActions();
  }, [registerToolbarActions]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const canvasElement = document.createElement("canvas");
    canvasElement.width = DEFAULT_WIDTH;
    canvasElement.height = DEFAULT_HEIGHT;
    canvasElement.style.width = "100%";
    canvasElement.style.height = "100%";
    container.appendChild(canvasElement);

    const canvas = new FabricCanvas(canvasElement, {
      width: typeof height === "number" ? height * (DEFAULT_WIDTH / DEFAULT_HEIGHT) : DEFAULT_WIDTH,
      height: typeof height === "number" ? height : DEFAULT_HEIGHT,
      selection: !readOnly,
      preserveObjectStacking: true,
    });

    canvasRef.current = canvas;

    const applyInitial = () => {
      const parsed = parseState(initialState);
      if (parsed) {
        isApplyingRemoteUpdate.current = true;
        canvas.loadFromJSON(parsed, () => {
          canvas.renderAll();
          canvas.requestRenderAll();
          isApplyingRemoteUpdate.current = false;
          emitChange();
        });
      }
    };

    applyInitial();

    const onChange = () => {
      if (isApplyingRemoteUpdate.current) return;
      emitChange();
      updateSelectionSummary();
    };

    canvas.on("object:added", onChange);
    canvas.on("object:modified", onChange);
    canvas.on("object:removed", onChange);
    canvas.on("selection:created", updateSelectionSummary);
    canvas.on("selection:updated", updateSelectionSummary);
    canvas.on("selection:cleared", () => setSelectionSummary({}));

    return () => {
      canvas.off("object:added", onChange);
      canvas.off("object:modified", onChange);
      canvas.off("object:removed", onChange);
      canvas.dispose();
      canvasRef.current = null;
      if (container.contains(canvasElement)) {
        container.removeChild(canvasElement);
      }
    };
  }, [emitChange, height, initialState, readOnly, updateSelectionSummary]);

  const style = useMemo(() => {
    if (typeof height === "number") {
      return { height } satisfies React.CSSProperties;
    }
    return undefined;
  }, [height]);

  return (
    <div
      className={classNames(styles.canvasShell, className, {
        [styles.readOnly]: readOnly,
      })}
    >
      <div ref={containerRef} className={styles.canvas} style={style} aria-label="Fabric deck canvas" />
      <div className={styles.statusBar}>
        <span>
          {realtime.status === "connected"
            ? "Live"
            : realtime.status === "connecting"
            ? "Connecting..."
            : "Offline"}
        </span>
        {selectionSummary.fill ? (
          <span className={styles.selectionChip}>
            Fill: <span style={{ backgroundColor: selectionSummary.fill ?? "transparent" }} />
          </span>
        ) : null}
        {selectionSummary.stroke ? (
          <span className={styles.selectionChip}>
            Stroke: <span style={{ backgroundColor: selectionSummary.stroke ?? "transparent" }} />
          </span>
        ) : null}
        {selectionSummary.fontFamily ? (
          <span className={styles.selectionChip}>Font: {selectionSummary.fontFamily}</span>
        ) : null}
        {selectionSummary.fontSize ? (
          <span className={styles.selectionChip}>Size: {selectionSummary.fontSize}px</span>
        ) : null}
      </div>
    </div>
  );
};

export default FabricRealtimeCanvas;
