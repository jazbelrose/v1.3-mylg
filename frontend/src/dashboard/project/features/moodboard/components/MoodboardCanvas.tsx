import React from "react";
import FabricRealtimeCanvas from "@/dashboard/shared/fabric/FabricRealtimeCanvas";

export interface MoodboardCanvasProps {
  projectId?: string;
  pageId?: string;
  initialState?: string | null;
}

const MoodboardCanvas: React.FC<MoodboardCanvasProps> = ({
  projectId,
  pageId = "moodboard",
  initialState,
}) => {
  const documentId = React.useMemo(
    () => `${projectId ?? "local"}:moodboard:${pageId}`,
    [projectId, pageId]
  );

  return (
    <FabricRealtimeCanvas
      documentId={documentId}
      initialState={initialState}
      className="moodboard-fabric-wrapper"
      height={720}
    />
  );
};

export default MoodboardCanvas;
