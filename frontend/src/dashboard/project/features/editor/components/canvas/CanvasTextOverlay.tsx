import React, { useCallback, useMemo, useRef } from "react";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type EditorState } from "lexical";
import {
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  BLUR_COMMAND,
} from "lexical";
import { mergeRegister } from "@lexical/utils";

import styles from "./canvas-text-overlay.module.css";

interface CanvasTextOverlayProps {
  objectId: string;
  bounds: { left: number; top: number; width: number; height: number };
  initialState: string | null;
  onCommit: (json: string, plainText: string) => void;
  onCancel: () => void;
}

const defaultEditorState = () => {
  const editorState = {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: "",
              type: "text",
              version: 1,
            },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
  return JSON.stringify(editorState);
};

const CanvasCommitPlugin: React.FC<{
  onCommitRequest: () => void;
  onCancel: () => void;
}> = ({ onCommitRequest, onCancel }) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event?: KeyboardEvent) => {
          event?.preventDefault();
          onCancel();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event?: KeyboardEvent) => {
          if (event && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onCommitRequest();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          onCommitRequest();
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, onCancel, onCommitRequest]);

  return null;
};

const CanvasTextOverlay: React.FC<CanvasTextOverlayProps> = ({
  bounds,
  objectId,
  initialState,
  onCommit,
  onCancel,
}) => {
  const latestState = useRef<EditorState | null>(null);

  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: `canvas-text-${objectId}`,
      editable: true,
      onError: (error: Error) => console.error("Lexical canvas text error", error),
      editorState: (editor) => {
        const stateToLoad = initialState ?? defaultEditorState();
        editor.setEditorState(editor.parseEditorState(stateToLoad));
      },
      nodes: [],
      theme: {
        paragraph: styles.paragraph,
      },
    }),
    [initialState, objectId]
  );

  const handleCommit = useCallback(() => {
    const editorState = latestState.current;
    if (!editorState) {
      onCommit(defaultEditorState(), "");
      return;
    }

    let payload: { json: string; text: string } | null = null;
    editorState.read(() => {
      payload = {
        json: JSON.stringify(editorState.toJSON()),
        text: $getRoot().getTextContent(),
      };
    });
    if (payload) {
      onCommit(payload.json, payload.text);
    }
  }, [onCommit]);

  const overlayStyle = useMemo(
    () => ({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    }),
    [bounds.height, bounds.left, bounds.top, bounds.width]
  );

  return (
    <div className={styles.overlay} style={overlayStyle}>
      <LexicalComposer initialConfig={initialConfig}>
        <CanvasCommitPlugin onCommitRequest={handleCommit} onCancel={onCancel} />
        <HistoryPlugin />
        <RichTextPlugin
          contentEditable={
            <ContentEditable className={styles.editable} spellCheck={false} />
          }
          ErrorBoundary={({ error }) => {
            console.error("Lexical overlay error", error);
            return <div className={styles.error}>Unable to render editor</div>;
          }}
        />
        <OnChangePlugin
          onChange={(state: EditorState) => {
            latestState.current = state;
          }}
        />
      </LexicalComposer>
    </div>
  );
};

export default CanvasTextOverlay;

