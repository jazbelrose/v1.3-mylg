import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type EditorState } from "lexical";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";

import styles from "./designer-component.module.css";
import { lexicalStateToPlainText } from "../../utils/lexicalConversion";

const AutoFocusPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.focus(() => {
      const root = editor.getRootElement();
      root?.scrollIntoView({ block: "nearest" });
    });
  }, [editor]);

  return null;
};

const handleError = (error: Error) => {
  console.error("Lexical canvas editor error", error);
};

export interface CanvasTextEditorOverlayProps {
  bounds: { left: number; top: number; width: number; height: number };
  initialState: string;
  onCommit: (payload: { json: string; plainText: string }) => void;
  onCancel: () => void;
}

const CanvasTextEditorOverlay: React.FC<CanvasTextEditorOverlayProps> = ({
  bounds,
  initialState,
  onCommit,
  onCancel,
}) => {
  const initialPlainText = useMemo(() => lexicalStateToPlainText(initialState), [initialState]);

  const latestStateRef = useRef<{ json: string; plainText: string }>({
    json: initialState,
    plainText: initialPlainText,
  });

  const initialConfig = useMemo(
    () => ({
      namespace: "FabricCanvasText",
      theme: {
        paragraph: "canvas-text-editor-paragraph",
      },
      editable: true,
      editorState: initialState,
      onError: handleError,
      nodes: [],
    }),
    [initialState]
  );

  const handleSave = useCallback(() => {
    onCommit(latestStateRef.current);
  }, [onCommit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSave();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, onCancel]);

  return (
    <div
      className={styles.textEditorOverlay}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: Math.max(bounds.width, 220),
        minHeight: Math.max(bounds.height, 120),
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <RichTextPlugin
            contentEditable={<ContentEditable className={styles.textEditorSurface} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <OnChangePlugin
            onChange={(editorState: EditorState) => {
              let plainText = "";
              editorState.read(() => {
                plainText = $getRoot().getTextContent();
              });
              latestStateRef.current = {
                json: JSON.stringify(editorState.toJSON()),
                plainText,
              };
            }}
          />
        </div>
      </LexicalComposer>

      <div className={styles.textEditorActions}>
        <button className={styles.textEditorButton} type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={`${styles.textEditorButton} ${styles.textEditorButtonPrimary}`}
          type="button"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default CanvasTextEditorOverlay;
