import React, { useCallback, useEffect, useRef } from "react";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import { useLayerStage } from "./LayerStageContext";

type BaseLexicalProps = React.ComponentProps<typeof LexicalEditor>;

interface LayeredLexicalEditorProps extends BaseLexicalProps {
  layerId?: string;
  flatten?: boolean;
}

const DEFAULT_LAYER_ID = "brief-root";

const LayeredLexicalEditor: React.FC<LayeredLexicalEditorProps> = ({
  layerId = DEFAULT_LAYER_ID,
  flatten = false,
  onChange,
  initialContent,
  ...rest
}) => {
  const { addLayer, updateLayer, removeLayer, registerGroup } = useLayerStage();
  const hasCreatedRef = useRef(false);

  useEffect(() => {
    registerGroup(
      {
        id: "brief",
        name: "Brief",
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
        name: "Brief",
        type: "brief",
        order: -100,
        opacity: 1,
        visible: true,
        locked: false,
        source: "lexical",
        data: { content: initialContent ?? null, flatten },
      });
      hasCreatedRef.current = true;
    } else {
      updateLayer(
        layerId,
        {
          data: { content: initialContent ?? null, flatten },
        },
        { silent: true }
      );
    }

    return () => {
      removeLayer(layerId, { silent: true });
      hasCreatedRef.current = false;
    };
  }, [layerId, initialContent, flatten, addLayer, updateLayer, removeLayer]);

  const handleChange = useCallback(
    (json: string) => {
      onChange?.(json);
      updateLayer(layerId, {
        data: { content: json, flatten },
      });
    },
    [layerId, flatten, onChange, updateLayer]
  );

  return <LexicalEditor {...rest} initialContent={initialContent} onChange={handleChange} />;
};

export default LayeredLexicalEditor;

