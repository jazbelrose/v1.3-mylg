import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fabric } from "fabric";
import { useData } from "@/app/contexts/useData";
import { notify } from "@/shared/ui/ToastNotifications";
import { useFabricRealtime } from "../hooks/useFabricRealtime";
import { useFabricDocument } from "../hooks/useFabricDocument";
import type { FabricSnapshot } from "../types";
import { sanitizeSnapshot } from "../utils/fabricSerialization";

export interface CollaborativeFabricCanvasProps {
  projectId: string;
  pageId: string;
  documentId: string;
  className?: string;
  height?: number | string;
  backgroundColor?: string;
  readOnly?: boolean;
  showExport?: boolean;
}

const TOOLBAR_ACTIONS = [
  { id: "add-text", label: "Text" },
  { id: "add-rect", label: "Rectangle" },
  { id: "add-circle", label: "Circle" },
  { id: "add-image", label: "Image" },
  { id: "clear", label: "Clear" },
] as const;

const CanvasContainerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: "480px",
  borderRadius: "1rem",
  background: "#121212",
  overflow: "hidden",
};

const ToolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  padding: "0.75rem 1rem",
  alignItems: "center",
  flexWrap: "wrap",
  background: "rgba(6, 5, 12, 0.88)",
  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
};

const StatusPillStyle: React.CSSProperties = {
  padding: "0.25rem 0.75rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  border: "1px solid rgba(255,255,255,0.16)",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "0.8rem",
  fontSize: "0.9rem",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#F8FAFF",
  cursor: "pointer",
};

const exportButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  marginLeft: "auto",
  background: "linear-gradient(135deg, #6366F1 0%, #EC4899 100%)",
  border: "none",
};

const presenceColors = ["#38bdf8", "#f472b6", "#facc15", "#34d399", "#a855f7"];

const pickPresenceColor = (actorId: string) => {
  const hash = actorId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return presenceColors[hash % presenceColors.length];
};

const downloadDataUri = (dataUri: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = dataUri;
  link.download = fileName;
  link.click();
};

const CollaborativeFabricCanvas: React.FC<CollaborativeFabricCanvasProps> = ({
  projectId,
  pageId,
  documentId,
  className,
  height,
  backgroundColor,
  readOnly,
  showExport = true,
}) => {
  const { userId, userName } = useData();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [isApplyingRemote, setIsApplyingRemote] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const { document, saveSnapshot, requestExport } = useFabricDocument({
    documentId,
    projectId,
    pageId,
    userId: userId ?? undefined,
  });

  const remoteApply = useCallback(
    (snapshot: FabricSnapshot, _revision: number) => {
      const instance = fabricRef.current;
      if (!instance) return;
      setIsApplyingRemote(true);
      instance.loadFromJSON(snapshot, () => {
        instance.renderAll();
        setIsApplyingRemote(false);
      });
    },
    []
  );

  const { status, sendSnapshot, sendPresence, lastError } = useFabricRealtime({
    documentId,
    projectId,
    pageId,
    userId: userId ?? undefined,
    onRemoteSnapshot: remoteApply,
  });

  const statusLabel = useMemo(() => {
    if (lastError) return "Offline";
    switch (status) {
      case "connecting":
        return "Connecting";
      case "open":
        return "Live";
      case "error":
        return "Offline";
      default:
        return "Offline";
    }
  }, [status, lastError]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const instance = new fabric.Canvas(canvasRef.current, {
      backgroundColor: backgroundColor ?? "#0f172a",
      selection: !readOnly,
      width: canvasRef.current.parentElement?.clientWidth ?? 1280,
      height: typeof height === "number" ? height : undefined,
    });
    fabricRef.current = instance;

    const handleModified = () => {
      if (isApplyingRemote || readOnly) return;
      const snapshot = instance.toJSON();
      saveSnapshot(snapshot as FabricSnapshot).catch(err => console.error(err));
      sendSnapshot(snapshot as FabricSnapshot);
      setLastSavedAt(new Date().toISOString());
    };

    instance.on("object:added", handleModified);
    instance.on("object:modified", handleModified);
    instance.on("object:removed", handleModified);

    const handleMouseMove = (event: fabric.IEvent<Event>) => {
      if (readOnly || !event.pointer) return;
      sendPresence({
        x: event.pointer.x,
        y: event.pointer.y,
        color: pickPresenceColor(userName ?? userId ?? documentId),
      });
    };

    instance.on("mouse:move", handleMouseMove);

    return () => {
      instance.dispose();
      fabricRef.current = null;
    };
  }, [backgroundColor, documentId, height, readOnly, saveSnapshot, sendPresence, sendSnapshot, userId, userName, isApplyingRemote]);

  useEffect(() => {
    if (!document?.snapshot) return;
    const instance = fabricRef.current;
    if (!instance) return;
    setIsApplyingRemote(true);
    instance.loadFromJSON(document.snapshot, () => {
      instance.renderAll();
      setIsApplyingRemote(false);
    });
  }, [document?.snapshot]);

  const handleToolbarClick = useCallback(
    async (actionId: (typeof TOOLBAR_ACTIONS)[number]["id"]) => {
      const instance = fabricRef.current;
      if (!instance || readOnly) return;

      switch (actionId) {
        case "add-text": {
          const text = new fabric.IText("Double-click to edit", {
            left: 120,
            top: 120,
            fill: "#f8fafc",
            fontFamily: "Inter, sans-serif",
            fontSize: 28,
          });
          instance.add(text);
          instance.setActiveObject(text);
          break;
        }
        case "add-rect": {
          const rect = new fabric.Rect({
            left: 160,
            top: 160,
            width: 240,
            height: 140,
            fill: "rgba(99,102,241,0.65)",
            rx: 16,
            ry: 16,
          });
          instance.add(rect);
          instance.setActiveObject(rect);
          break;
        }
        case "add-circle": {
          const circle = new fabric.Circle({
            left: 320,
            top: 260,
            radius: 80,
            fill: "rgba(236,72,153,0.65)",
          });
          instance.add(circle);
          instance.setActiveObject(circle);
          break;
        }
        case "add-image": {
          const url = window.prompt("Image URL");
          if (!url) return;
          fabric.Image.fromURL(url, img => {
            img.set({ left: 200, top: 200, scaleX: 0.5, scaleY: 0.5 });
            instance.add(img);
            instance.setActiveObject(img);
          });
          break;
        }
        case "clear": {
          if (window.confirm("Clear this canvas?")) {
            instance.getObjects().forEach(obj => instance.remove(obj));
          }
          break;
        }
        default:
          break;
      }
      instance.requestRenderAll();
    },
    [readOnly]
  );

  const handleExport = useCallback(
    async (format: "pdf" | "static-site") => {
      const instance = fabricRef.current;
      if (!instance) return;
      setIsExporting(true);
      try {
        const snapshot = sanitizeSnapshot(instance.toJSON() as FabricSnapshot);
        if (snapshot) {
          await saveSnapshot(snapshot);
        }
        const result = await requestExport({ format, includeBackground: true, scale: 2 });
        if (result.dataUri && result.fileName) {
          downloadDataUri(result.dataUri, result.fileName);
          notify("success", `Downloaded ${result.fileName}`);
        } else if (result.url) {
          window.open(result.url, "_blank", "noopener");
        }
      } catch (err) {
        console.error("Export failed", err);
        notify("error", "We couldn’t export this canvas. Try again.");
      } finally {
        setIsExporting(false);
      }
    },
    [requestExport, saveSnapshot]
  );

  return (
    <div className={className} style={{ ...CanvasContainerStyle, height }}>
      <div style={ToolbarStyle}>
        <span style={{ ...StatusPillStyle, color: "#a5b4fc" }}>{statusLabel}</span>
        {lastSavedAt && (
          <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
            Saved {new Date(lastSavedAt).toLocaleTimeString()}
          </span>
        )}
        {TOOLBAR_ACTIONS.map(action => (
          <button
            key={action.id}
            type="button"
            style={buttonStyle}
            onClick={() => handleToolbarClick(action.id)}
            disabled={readOnly || status === "connecting"}
          >
            {action.label}
          </button>
        ))}
        {showExport && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              style={exportButtonStyle}
              disabled={isExporting}
              onClick={() => handleExport("pdf")}
            >
              {isExporting ? "Exporting…" : "Export PDF"}
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={isExporting}
              onClick={() => handleExport("static-site")}
            >
              {isExporting ? "Preparing…" : "Publish Site"}
            </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

export default CollaborativeFabricCanvas;
