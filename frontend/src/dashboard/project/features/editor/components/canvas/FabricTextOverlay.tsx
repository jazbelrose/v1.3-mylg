import React, { useCallback, useEffect, useMemo } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { CollaborationPlugin, type Provider } from "@lexical/yjs";
import { $getRoot, type EditorState as LexicalEditorState } from "lexical";
import * as Y from "yjs";

import type { SharedYjsProvider } from "@/dashboard/project/features/editor/types/collaboration";

import styles from "./FabricTextOverlay.module.css";

interface FabricTextOverlayProps {
  objectId: string;
  lexicalState: string | null;
  provider?: SharedYjsProvider | null;
  position: { left: number; top: number; width: number; height: number };
  onChange: (payload: { json: string; plainText: string }) => void;
  onClose: () => void;
  userName?: string;
  avatarUrl?: string;
}

const MIN_HEIGHT = 120;

const FabricTextOverlay: React.FC<FabricTextOverlayProps> = ({
  objectId,
  lexicalState,
  provider,
  position,
  onChange,
  onClose,
  userName,
  avatarUrl,
}) => {
  const initialConfig = useMemo(() => {
    return {
      namespace: `fabric-text-${objectId}`,
      editorState: lexicalState
        ? (editor: unknown) => {
            try {
              const lexicalEditor = editor as { parseEditorState: (state: string) => unknown; setEditorState: (state: unknown) => void };
              const parsed = lexicalEditor.parseEditorState(lexicalState);
              lexicalEditor.setEditorState(parsed);
            } catch (error) {
              console.warn("Failed to hydrate Fabric text overlay state", error);
            }
          }
        : undefined,
      theme: {
        paragraph: styles.paragraph,
        text: {
          bold: styles.textBold,
          italic: styles.textItalic,
          underline: styles.textUnderline,
        },
      },
      onError: (error: Error) => console.error("Lexical overlay error", error),
    };
  }, [lexicalState, objectId]);

  const sharedType = useMemo(() => {
    if (!provider || typeof provider.getTextForObject !== "function") return null;
    try {
      return provider.getTextForObject(objectId) as Y.Text;
    } catch (error) {
      console.warn("Failed to obtain shared Y.Text for", objectId, error);
      return null;
    }
  }, [objectId, provider]);

  const providerFactory = useCallback(() => provider as unknown as Provider, [provider]);

  const handleChange = useCallback(
    (editorState: LexicalEditorState) => {
      editorState.read(() => {
        const json = JSON.stringify(editorState.toJSON());
        const plainText = $getRoot().getTextContent();
        onChange({ json, plainText });
      });
    },
    [onChange]
  );

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        minHeight: Math.max(position.height, MIN_HEIGHT),
      }}
      role="dialog"
      aria-label="Canvas text editor"
    >
      <div className={styles.header}>
        <span>Text Overlay</span>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close text editor">
          ✕
        </button>
      </div>
      <div className={styles.editorShell}>
        <LexicalComposer initialConfig={initialConfig}>
          <HistoryPlugin />
          <RichTextPlugin
            contentEditable={<ContentEditable className={styles.contentEditable} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin onChange={handleChange} />
          {provider && sharedType ? (
            <CollaborationPlugin
              id={`fabric-text-${objectId}`}
              providerFactory={providerFactory}
              shouldBootstrap={!sharedType || sharedType.length === 0}
              sharedType={sharedType}
              username={userName}
              awarenessData={avatarUrl ? { avatar: avatarUrl } : undefined}
            />
          ) : null}
        </LexicalComposer>
      </div>
    </div>
  );
};

export default FabricTextOverlay;

