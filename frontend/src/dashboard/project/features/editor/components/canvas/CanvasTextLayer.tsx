import React, { useCallback, useEffect, useState } from "react";
import CanvasTextEditor from "./CanvasTextEditor";
import styles from "./designer-component.module.css";

interface FabricLikeObject {
  id?: string | number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  angle?: number;
  data?: Record<string, unknown> | undefined;
  getBoundingRect?: (
    absolute?: boolean,
    calculate?: boolean
  ) => { left: number; top: number; width: number; height: number };
}

interface CanvasTextData {
  type: "lexical-text";
  textId: string;
  roomId: string;
  initialContent?: string | null;
  lastKnownContent?: string | null;
}

interface CanvasTextLayerProps {
  fabricCanvasRef: React.MutableRefObject<{
    getObjects: () => FabricLikeObject[];
    viewportTransform?: [number, number, number, number, number, number];
    requestRenderAll?: () => void;
  } | null>;
  editingId: string | null;
  selectedId: string | number | null;
  onContentChange: (textId: string, json: string) => void;
  onExitEdit: () => void;
}

interface TextBoxRenderState {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  data: CanvasTextData;
}

const getViewportTransform = (
  matrix: [number, number, number, number, number, number] | undefined
): [number, number, number, number, number, number] => {
  if (!matrix) return [1, 0, 0, 1, 0, 0];
  return matrix;
};

const CanvasTextLayer: React.FC<CanvasTextLayerProps> = ({
  fabricCanvasRef,
  editingId,
  selectedId,
  onContentChange,
  onExitEdit,
}) => {
  const [boxes, setBoxes] = useState<TextBoxRenderState[]>([]);

  const updateBoxes = useCallback(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) {
      setBoxes([]);
      return;
    }
    const objects = fabricCanvas.getObjects();
    const matrix = getViewportTransform(fabricCanvas.viewportTransform);
    const next: TextBoxRenderState[] = [];

    objects.forEach((obj) => {
      const data = obj.data as CanvasTextData | undefined;
      if (!data || data.type !== "lexical-text") return;
      const rect = obj.getBoundingRect?.(true, true);
      if (!rect) return;

      const x1 = matrix[0] * rect.left + matrix[2] * rect.top + matrix[4];
      const y1 = matrix[1] * rect.left + matrix[3] * rect.top + matrix[5];
      const x2 =
        matrix[0] * (rect.left + rect.width) +
        matrix[2] * (rect.top + rect.height) +
        matrix[4];
      const y2 =
        matrix[1] * (rect.left + rect.width) +
        matrix[3] * (rect.top + rect.height) +
        matrix[5];

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      next.push({
        key: data.textId,
        left,
        top,
        width,
        height,
        data,
      });
    });

    setBoxes(next);
  }, [fabricCanvasRef]);

  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;

    updateBoxes();
    const handlers: Array<[string, () => void]> = [
      ["after:render", updateBoxes],
      ["object:added", updateBoxes],
      ["object:modified", updateBoxes],
      ["object:removed", updateBoxes],
    ];

    handlers.forEach(([event, handler]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fabricCanvas as any).on(event, handler);
    });

    return () => {
      handlers.forEach(([event, handler]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fabricCanvas as any).off(event, handler);
      });
    };
  }, [fabricCanvasRef, updateBoxes]);

  useEffect(() => {
    updateBoxes();
  }, [updateBoxes, editingId, selectedId]);

  if (!boxes.length) {
    return null;
  }

  return (
    <div className={styles.canvasOverlay}>
      {boxes.map(({ key, left, top, width, height, data }) => {
        const isEditing = editingId === key;
        const isActive = selectedId === key;
        const className = [
          styles.lexicalTextBox,
          isActive ? styles.lexicalTextBoxActive : "",
          isEditing ? styles.lexicalTextBoxEditing : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={key}
            className={className}
            style={{
              left,
              top,
              width,
              height,
            }}
          >
            <div className={styles.lexicalTextBoxContent}>
              <CanvasTextEditor
                textId={data.textId}
                roomId={data.roomId}
                initialContent={data.lastKnownContent ?? data.initialContent}
                isEditing={isEditing}
                onChange={(json) => onContentChange(data.textId, json)}
                onExitEdit={onExitEdit}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CanvasTextLayer;
