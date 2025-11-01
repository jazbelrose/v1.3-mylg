import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/app/contexts/useData";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { Provider } from "@lexical/yjs";
import { ParagraphNode } from "lexical";
import {
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { YJS_WS_URL } from "@/config/realtime";

import "@/shared/styles/components/editor.css";

type CanvasTextEditorProps = {
  textId: string;
  roomId: string;
  initialContent?: string | null;
  isEditing: boolean;
  onChange: (json: string) => void;
  onExitEdit: () => void;
  placeholder?: string;
};

type ExtendedProvider = WebsocketProvider & { sharedType?: Y.Text };

type ProviderCache = Map<string, Y.Doc>;

const ensureProviderUrl = (url: string): string => url.replace(/\/$/, "");

const sanitizeInitialState = (initialContent?: string | null): string | null => {
  if (!initialContent) return null;
  try {
    JSON.parse(initialContent);
    return initialContent;
  } catch {
    return null;
  }
};

const CanvasEditorBehaviorPlugin: React.FC<{ isEditing: boolean; onExitEdit: () => void }>
  = ({ isEditing, onExitEdit }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(isEditing);
    if (isEditing) {
      requestAnimationFrame(() => {
        editor.focus();
      });
    }
  }, [editor, isEditing]);

  useEffect(() => {
    if (!isEditing) return undefined;
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        onExitEdit();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, isEditing, onExitEdit]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return undefined;

    const handleBlur = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (!next || !root.contains(next)) {
        onExitEdit();
      }
    };

    root.addEventListener("blur", handleBlur, true);
    return () => {
      root.removeEventListener("blur", handleBlur, true);
    };
  }, [editor, onExitEdit]);

  return null;
};

const CanvasTextEditor: React.FC<CanvasTextEditorProps> = ({
  textId,
  roomId,
  initialContent,
  isEditing,
  onChange,
  onExitEdit,
  placeholder = "Start typing…",
}) => {
  const { userName, userData } = useData() as {
    userName?: string;
    userData?: { thumbnail?: string };
  };

  const avatarUrl = userData?.thumbnail;
  const [provider, setProvider] = useState<ExtendedProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);

  useEffect(() => {
    return () => {
      provider?.destroy();
      persistenceRef.current?.destroy().catch(() => undefined);
    };
  }, [provider]);

  const getProvider = useCallback(
    (id: string, docMap: ProviderCache): Provider => {
      const normalizedId = roomId || id;
      let doc = docMap.get(normalizedId);
      if (!doc) {
        doc = new Y.Doc();
        docMap.set(normalizedId, doc);
      }

      if (!persistenceRef.current) {
        const persistence = new IndexeddbPersistence(normalizedId, doc);
        persistenceRef.current = persistence;
      }

      const wsProvider = new WebsocketProvider(
        ensureProviderUrl(YJS_WS_URL),
        normalizedId,
        doc
      ) as ExtendedProvider;
      wsProvider.sharedType = doc.getText("lexical");
      setProvider(wsProvider);
      return wsProvider as unknown as Provider;
    },
    [roomId]
  );

  const initialConfig = useMemo(
    () => ({
      namespace: `canvas-text-${textId}`,
      theme: {
        paragraph: "canvas-lexical-paragraph",
      },
      nodes: [ParagraphNode],
      onError: (error: Error) => console.error("Lexical canvas error", error),
      editable: false,
    }),
    [textId]
  );

  const sanitizedInitial = useMemo(() => sanitizeInitialState(initialContent), [initialContent]);

  return (
    <div className="canvas-lexical-editor" style={{ width: "100%" }}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="editor-input"
              style={{
                outline: "none",
                border: "none",
                padding: "12px",
                width: "100%",
                background: "transparent",
                color: "inherit",
                fontSize: "14px",
                lineHeight: 1.4,
              }}
              aria-label="Canvas text editor"
            />
          }
          placeholder={<div className="editor-placeholder">{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin
          onChange={useCallback(
            (editorState) => {
              editorState.read(() => {
                onChange(JSON.stringify(editorState.toJSON()));
              });
            },
            [onChange]
          )}
        />
        <CanvasEditorBehaviorPlugin isEditing={isEditing} onExitEdit={onExitEdit} />
        <CollaborationPlugin
          id={roomId}
          providerFactory={getProvider}
          initialEditorState={sanitizedInitial as never}
          username={userName ?? "Anonymous"}
          shouldBootstrap
          awarenessData={avatarUrl ? { avatar: avatarUrl } : undefined}
        />
      </LexicalComposer>
    </div>
  );
};

export default CanvasTextEditor;
