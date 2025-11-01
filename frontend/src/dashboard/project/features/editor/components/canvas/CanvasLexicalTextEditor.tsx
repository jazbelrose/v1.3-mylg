import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import { $getRoot, type EditorState, type LexicalEditor, type Klass, type LexicalNode } from "lexical";
import { type Provider } from "@lexical/yjs";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

import { YJS_WS_URL } from "@/config/realtime";

type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CanvasLexicalTextEditorProps = {
  roomId: string;
  initialState: string;
  anchorRect: AnchorRect | null;
  onUpdate: (payload: { plainText: string; serializedState: string }) => void;
  onClose: () => void;
};

type ExtendedWebsocketProvider = WebsocketProvider & {
  sharedType?: Y.Text;
};

const sanitizeInitialState = (value: string): string | null => {
  if (!value) {
    return null;
  }
  try {
    JSON.parse(value);
    return value;
  } catch (error) {
    console.warn("Failed to parse Lexical state for canvas text", error);
    return null;
  }
};

const CanvasLexicalTextEditor: React.FC<CanvasLexicalTextEditorProps> = ({
  roomId,
  initialState,
  anchorRect,
  onUpdate,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<ExtendedWebsocketProvider | null>(null);
  const initialStateRef = useRef<string | null>(sanitizeInitialState(initialState));

  useEffect(() => {
    initialStateRef.current = sanitizeInitialState(initialState);
  }, [initialState]);

  useEffect(() => {
    return () => {
      const provider = providerRef.current;
      if (provider) {
        try {
          provider.destroy();
        } catch (error) {
          console.warn("Failed to destroy Yjs provider", error);
        }
      }
      providerRef.current = null;
    };
  }, [roomId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  const handleFocusOut = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      const container = containerRef.current;
      if (!container) return;

      if (!nextTarget || !container.contains(nextTarget)) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.focus({ preventScroll: true });
    }
  }, []);

  const getProvider = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
      if (providerRef.current) {
        return providerRef.current as unknown as Provider;
      }

      let doc = yjsDocMap.get(id);
      if (!doc) {
        doc = new Y.Doc();
        yjsDocMap.set(id, doc);
      }

      const provider = new WebsocketProvider(
        YJS_WS_URL.replace(/\/$/, ""),
        id,
        doc
      ) as ExtendedWebsocketProvider;

      provider.sharedType = doc.getText("canvas-text-editor");
      providerRef.current = provider;
      return provider as unknown as Provider;
    },
    []
  );

  const initialEditorState = useCallback((editor: LexicalEditor) => {
    const state = initialStateRef.current;
    if (!state) return;

    try {
      const parsed = editor.parseEditorState(state);
      editor.setEditorState(parsed);
    } catch (error) {
      console.error("Failed to bootstrap Lexical state for canvas text", error);
    }
  }, []);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        const plainText = root.getTextContent();
        const serializedState = JSON.stringify(editorState.toJSON());
        onUpdate({ plainText, serializedState });
      });
    },
    [onUpdate]
  );

  const overlayStyle = useMemo<React.CSSProperties>(() => {
    if (!anchorRect) {
      return { display: "none" };
    }

    return {
      position: "absolute",
      left: `${anchorRect.left}px`,
      top: `${anchorRect.top}px`,
      width: `${anchorRect.width}px`,
      minHeight: `${anchorRect.height}px`,
      zIndex: 2000,
      pointerEvents: "auto",
      display: "flex",
      flexDirection: "column",
    };
  }, [anchorRect]);

  const editorShellStyle = useMemo<React.CSSProperties>(
    () => ({
      background: "rgba(20, 20, 20, 0.92)",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
      color: "#f5f5f5",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      flex: "1 1 auto",
      maxHeight: "70vh",
      overflow: "auto",
    }),
    []
  );

  const contentEditableStyle = useMemo<React.CSSProperties>(
    () => ({
      minHeight: "100px",
      outline: "none",
      width: "100%",
      fontSize: "16px",
      lineHeight: 1.5,
      color: "inherit",
    }),
    []
  );

  if (!anchorRect) {
    return null;
  }

  const composerConfig = useMemo(
    () => ({
      namespace: "canvas-text-overlay",
      onError: (error: Error) => {
        console.error("Lexical composer error", error);
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        LinkNode,
      ] as Klass<LexicalNode>[],
    }),
    []
  );

  const editorContent = (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onFocusOut={handleFocusOut}
      style={overlayStyle}
    >
      <LexicalComposer initialConfig={composerConfig}>
        <div style={editorShellStyle}>
          <RichTextPlugin
            contentEditable={<ContentEditable style={contentEditableStyle} />}
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <CollaborationPlugin
            id={roomId}
            providerFactory={getProvider}
            shouldBootstrap={true}
            initialEditorState={initialEditorState}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <OnChangePlugin onChange={handleChange} />
        </div>
      </LexicalComposer>
    </div>
  );

  return createPortal(editorContent, document.body);
};

export default CanvasLexicalTextEditor;
