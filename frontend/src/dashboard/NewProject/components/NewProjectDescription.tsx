import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import styles from "./new-project-description.module.css";

interface NewProjectDescriptionProps {
  description: string;
  setDescription: (value: string, plainText: string) => void;
}

const DEFAULT_SNAPSHOT = JSON.stringify({
  version: "6.0.0",
  objects: [],
});

const getPlainText = (canvas: fabric.Canvas): string => {
  return canvas
    .getObjects()
    .map(obj => {
      if ("text" in obj && typeof (obj as fabric.Textbox).text === "string") {
        return (obj as fabric.Textbox).text;
      }
      if ("name" in obj && typeof obj.name === "string") {
        return obj.name;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
};

const parseSnapshot = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (err) {
    console.warn("Failed to parse stored project description", err);
    return null;
  }
};

const NewProjectDescription: React.FC<NewProjectDescriptionProps> = ({
  description,
  setDescription,
}) => {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastSnapshotRef = useRef<string>(description || DEFAULT_SNAPSHOT);

  const ensureCanvas = useCallback(() => {
    if (!canvasElementRef.current) return null;
    if (canvasRef.current) return canvasRef.current;
    const canvas = new fabric.Canvas(canvasElementRef.current, {
      backgroundColor: "#101827",
      width: canvasElementRef.current.parentElement?.clientWidth ?? 720,
      height: 200,
      selection: true,
    });
    canvasRef.current = canvas;
    return canvas;
  }, []);

  const emitSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snapshot = JSON.stringify(canvas.toJSON());
    if (snapshot === lastSnapshotRef.current) return;
    lastSnapshotRef.current = snapshot;
    setDescription(snapshot, getPlainText(canvas));
  }, [setDescription]);

  useEffect(() => {
    const canvas = ensureCanvas();
    if (!canvas) return;

    const handleModified = () => {
      emitSnapshot();
    };

    canvas.on("object:added", handleModified);
    canvas.on("object:modified", handleModified);
    canvas.on("object:removed", handleModified);

    setIsLoaded(true);

    return () => {
      canvas.off("object:added", handleModified);
      canvas.off("object:modified", handleModified);
      canvas.off("object:removed", handleModified);
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [emitSnapshot, ensureCanvas]);

  useEffect(() => {
    const canvas = ensureCanvas();
    if (!canvas || !isLoaded) return;

    const snapshot = parseSnapshot(description) ?? parseSnapshot(DEFAULT_SNAPSHOT);
    if (!snapshot) return;

    canvas.loadFromJSON(snapshot, () => {
      canvas.renderAll();
      lastSnapshotRef.current = JSON.stringify(canvas.toJSON());
    });
  }, [description, ensureCanvas, isLoaded]);

  const addText = useCallback(() => {
    const canvas = ensureCanvas();
    if (!canvas) return;
    const text = new fabric.Textbox("Describe your project", {
      left: 40,
      top: 40,
      width: 320,
      fill: "#f8fafc",
      fontSize: 20,
      fontFamily: "Inter, sans-serif",
      editable: true,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    emitSnapshot();
  }, [ensureCanvas, emitSnapshot]);

  const clearCanvas = useCallback(() => {
    const canvas = ensureCanvas();
    if (!canvas) return;
    if (!canvas.getObjects().length) return;
    canvas.getObjects().forEach(obj => canvas.remove(obj));
    emitSnapshot();
  }, [ensureCanvas, emitSnapshot]);

  const containerClass = useMemo(() => styles.descriptionContainer, []);

  return (
    <div className={containerClass}>
      <div className={styles.toolbar}>
        <span>Project Canvas</span>
        <div className={styles.toolbarButtons}>
          <button type="button" onClick={addText}>
            Add Text
          </button>
          <button type="button" onClick={clearCanvas}>
            Clear
          </button>
        </div>
      </div>
      <div className={styles.canvasWrapper}>
        <canvas ref={canvasElementRef} aria-label="Project description canvas" />
      </div>
    </div>
  );
};

export default NewProjectDescription;
