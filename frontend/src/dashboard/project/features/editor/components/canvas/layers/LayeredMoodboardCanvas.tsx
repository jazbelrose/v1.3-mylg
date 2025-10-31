import React, { useCallback, useEffect, useRef } from "react";
import MoodboardCanvas, {
  type MoodboardCanvasProps,
} from "@/dashboard/project/features/moodboard/components/MoodboardCanvas";
import type { Sticker } from "@/dashboard/project/features/moodboard/types";
import { useLayerStage } from "./LayerStageContext";

interface LayeredMoodboardCanvasProps extends MoodboardCanvasProps {
  layerId?: string;
}

const DEFAULT_MOODBOARD_LAYER_ID = "moodboard-root";

const LayeredMoodboardCanvas: React.FC<LayeredMoodboardCanvasProps> = ({
  layerId = DEFAULT_MOODBOARD_LAYER_ID,
  ...rest
}) => {
  const { addLayer, updateLayer, removeLayer, registerGroup } = useLayerStage();
  const hasCreatedRef = useRef(false);

  useEffect(() => {
    registerGroup(
      {
        id: "moodboard",
        name: "Moodboard",
        opacity: 1,
        visible: true,
        layerIds: [],
      },
      { overwrite: false }
    );
  }, [registerGroup]);

  useEffect(() => {
    if (!hasCreatedRef.current) {
      addLayer({
        id: layerId,
        name: "Moodboard",
        type: "moodboard",
        order: 200,
        opacity: 1,
        visible: true,
        locked: false,
        source: "moodboard",
        data: { stickers: [] },
      });
      hasCreatedRef.current = true;
    }
    return () => {
      removeLayer(layerId, { silent: true });
      hasCreatedRef.current = false;
    };
  }, [layerId, addLayer, removeLayer]);

  const handleLayerSync = useCallback(
    (stickers: Sticker[]) => {
      updateLayer(layerId, {
        data: { stickers },
        type: "moodboard",
        source: "moodboard",
      });
    },
    [layerId, updateLayer]
  );

  return <MoodboardCanvas {...rest} onLayerSync={handleLayerSync} />;
};

export default LayeredMoodboardCanvas;

