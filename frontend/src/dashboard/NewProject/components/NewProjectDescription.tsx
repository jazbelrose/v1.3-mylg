import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import FabricRealtimeCanvas from "@/dashboard/shared/fabric/FabricRealtimeCanvas";
import extractFabricPlainText from "@/dashboard/shared/fabric/extractFabricPlainText";
import styles from "./new-project-description.module.css";

interface NewProjectDescriptionProps {
  description: string;
  setDescription: (value: string, plainText: string) => void;
}

const DEFAULT_CANVAS_STATE = JSON.stringify({
  version: "6.0.0",
  objects: [
    {
      type: "i-text",
      text: "Tell your team what this project is about...",
      left: 320,
      top: 280,
      fill: "#1f2937",
      fontSize: 32,
      fontFamily: "Inter",
      fontWeight: "600",
    },
  ],
});

const NewProjectDescription: React.FC<NewProjectDescriptionProps> = ({
  description,
  setDescription,
}) => {
  const instanceId = useId();
  const documentIdRef = useRef<string>(`new-project:${instanceId}`);
  const [localState, setLocalState] = useState<string>(description || DEFAULT_CANVAS_STATE);

  useEffect(() => {
    if (!description) return;
    setLocalState(description);
  }, [description]);

  const handleChange = useCallback(
    (state: string, summary: string) => {
      setLocalState(state);
      const plainText = summary || extractFabricPlainText(state);
      setDescription(state, plainText);
    },
    [setDescription]
  );

  return (
    <div className={styles.descriptionContainer}>
      <FabricRealtimeCanvas
        documentId={documentIdRef.current}
        initialState={localState}
        onChange={handleChange}
        disableRealtime
        height={480}
        className={styles.canvas}
      />
    </div>
  );
};

export default NewProjectDescription;
