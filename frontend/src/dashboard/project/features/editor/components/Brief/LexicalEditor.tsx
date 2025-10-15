import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useData } from "@/app/contexts/useData";
import { Klass, LexicalNode } from "lexical";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";

import TextStylePlugin from "./plugins/TextStylePlugin";
import DraggableBlockPlugin from "./plugins/DraggableBlockPlugin";
import FloatingToolbar from "./plugins/FloatingToolbar";
import { DropdownProvider } from "./contexts/DropdownContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import DragAndDropPlugin from "./plugins/DragAndDropPlugin";
import AutoScrollToBottomPlugin from "./plugins/AutoScrollToBottomPlugin";
import DeleteImagePlugin from "./plugins/DeleteImagePlugin";
import ImageLockPlugin from "./plugins/ImageLockPlugin";
import ImageCopyPastePlugin from "./plugins/ImageCopyPastePlugin";
import YjsSyncPlugin from "./plugins/YjsSyncPlugin";

import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { Provider } from "@lexical/yjs";
import { YJS_WS_URL } from "@/config/realtime";

import "./lexical-editor.css";

import { ListNode, ListItemNode } from "@lexical/list";
import {
  ParagraphNode,
  type EditorState as LexicalEditorState,
} from "lexical";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";

import { ResizableImageNode } from "./plugins/nodes/ResizableImageNode";
import { SvgNode } from "./plugins/nodes/SvgNode";
import { FigmaEmbedNode } from "./plugins/nodes/FigmaEmbedNode";
import { LayoutContainerNode } from "./plugins/nodes/LayoutContainerNode";
import { LayoutItemNode } from "./plugins/nodes/LayoutItemNode";
import RemoveEmptyLayoutItemsOnBackspacePlugin from "./plugins/BackspacePlugin";
import ColorPlugin from "./plugins/ColorPlugin";
import FontPlugin from "./plugins/FontPlugin";
import ImagePlugin from "./plugins/ImagePlugin";
import FigmaPlugin from "./plugins/FigmaPlugin";
import SpeechToTextPlugin from "./plugins/SpeechToTextPlugin";
import { LayoutPlugin } from "./plugins/LayoutPlugin";
import ToolbarActionsPlugin from "./plugins/ToolbarActionsPlugin";
import syncCursorPositionsWithAvatars from "./utils/syncCursorAvatars";

type LexicalEditorProps = {
  onChange: (json: string) => void;
  initialContent?: unknown | null;
  registerToolbar?: (actions: unknown) => void;
};

type ActiveProjectLike = { projectId?: string } | string | null | undefined;

// Extend to allow us to stash helper props safely
interface ExtendedWebsocketProvider extends WebsocketProvider {
  sharedType?: Y.Text;
}

const LexicalEditor: React.FC<LexicalEditorProps> = ({
  onChange,
  initialContent,
  registerToolbar,
}) => {
  const { userName, userData, activeProject } = useData() as {
    userName?: string;
    userData?: { thumbnail?: string };
    activeProject?: ActiveProjectLike;
  };
  const avatarUrl = userData?.thumbnail as string | undefined;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const providerRef = useRef<ExtendedWebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);

  const initialContentRef = useRef<unknown | null>(initialContent ?? null);
  const hasScrolledToBottom = useRef<boolean>(false);

  // Memoize the project ID so it isn’t recalculated unnecessarily.
  const projectId = useMemo<string>(() => {
    const ap = activeProject;
    if (ap && typeof ap === "object" && "projectId" in ap) {
      return (ap?.projectId as string) || "default-project";
    }
    return (ap as string) || "default-project";
  }, [activeProject]);

  useEffect(() => {
    const persistence = persistenceRef.current;
    if (persistence) {
      persistence
        .destroy()
        .then(() => {
          console.log("IndexedDB cleared for project:", projectId);
        })
        .catch((err: unknown) => {
          console.error("Error clearing IndexedDB:", err);
        });
    }
  }, [projectId]);

  // If needed, you can set up the anchor element for plugins (like draggable blocks)
  useEffect(() => {
    if (editorContainerRef.current) {
      // Anchor setup (if required by plugins) could go here.
    }
  }, []);

  useEffect(() => {
    hasScrolledToBottom.current = false;
  }, [projectId]);

  // Only to trigger re-renders if you want; not otherwise used.
  // (Keep for parity with original; can be removed if truly unused.)
  const [, setYjsProvider] = useState<ExtendedWebsocketProvider | null>(null);

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

      // Create and store the persistence instance.
      const persistence = new IndexeddbPersistence(id, doc);
      persistence.on("synced", () => {
        console.log("IndexedDB synced for project:", id);
      });
      persistenceRef.current = persistence;

      const provider = new WebsocketProvider(
        YJS_WS_URL.replace(/\/$/, ""),       // base only, no trailing slash
        id,                                  // room id; y-websocket appends this
        doc
      ) as ExtendedWebsocketProvider;

      // Expose a shared text type for convenience (handy for custom plugins).
      provider.sharedType = doc.getText("lexical");

      providerRef.current = provider;
      setYjsProvider(provider);
      return provider as unknown as Provider;
    },
    []
  );

  // Memoize the LexicalComposer configuration so it’s only created once.
  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: "MyEditor",
      theme: {
        paragraph: "editor-paragraph",
        text: {
          bold: "editor-bold",
          italic: "editor-italic",
          underline: "editor-underline",
          strikethrough: "editor-strikethrough",
          code: "editor-code",
          color: "editor-text-color",
          backgroundColor: "editor-bg-color",
        },
        quote: "editor-quote",
        heading: {
          h1: "editor-heading-h1",
          h2: "editor-heading-h2",
        },
        list: {
          nested: { listitem: "editor-nested-listitem" },
          ol: "editor-list-ol",
          ul: "editor-list-ul",
          listitem: "editor-listitem",
        },
        alignment: {
          left: "editor-align-left",
          center: "editor-align-center",
          right: "editor-align-right",
          justify: "editor-align-justify",
        },
        link: "editor-link",
      },
      nodes: [
        ParagraphNode,
        ListNode,
        ListItemNode,
        LinkNode,
        HeadingNode,
        QuoteNode,
        AutoLinkNode,
        ResizableImageNode,
        SvgNode,
        FigmaEmbedNode,
        LayoutContainerNode,
        LayoutItemNode,
      ] as Klass<LexicalNode>[],
      onError: (error: Error) => console.error("Lexical Editor Error:", error),
      editorState: null,
    }),
    []
  );

  return (
    <div
      ref={editorRef}
      style={{
        maxWidth: "1920px",
        width: "100%",
        height: "100vh",
        minHeight: "800px",
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <DropdownProvider>
          <ImageLockPlugin provider={providerRef.current}>
            <div
              className="editor-container"
              ref={editorContainerRef}
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                height: "100%",
              }}
            >
              <ToolbarActionsPlugin registerToolbar={registerToolbar} />
              <ColorPlugin showToolbar={false} />
              <FontPlugin showToolbar={false} />
              <ImagePlugin showToolbarButton={false} />
              <FigmaPlugin showToolbarButton={false} />
              <LayoutPlugin />
              <SpeechToTextPlugin showToolbarButton={false} />
              <FloatingToolbar editorRef={editorRef} />

              <div
                className="content-container"
                ref={contentRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      className="editor-input"
                      style={{ position: "relative", minHeight: "100%" }}
                    />
                  }
                  ErrorBoundary={LexicalErrorBoundary}
                />

                <CollaborationPlugin
                  id={projectId}
                  providerFactory={getProvider}
                  initialEditorState={initialContentRef.current as never}
                  shouldBootstrap={true}
                  username={userName}
                  awarenessData={avatarUrl ? { avatar: avatarUrl } : undefined}
                  syncCursorPositionsFn={syncCursorPositionsWithAvatars}
                />

                <RemoveEmptyLayoutItemsOnBackspacePlugin />

                {providerRef.current && (
                  <YjsSyncPlugin provider={providerRef.current} />
                )}

                <ListPlugin />
                <LinkPlugin />
                <ClickableLinkPlugin />
                <TextStylePlugin />

                {editorContainerRef.current && (
                  <DraggableBlockPlugin anchorElem={editorContainerRef.current} />
                )}

                <DragAndDropPlugin />
                <ImageCopyPastePlugin />
                <DeleteImagePlugin />

                <AutoScrollToBottomPlugin contentRef={contentRef} />

                <OnChangePlugin
                  onChange={useCallback(
                    (editorState: LexicalEditorState) => {
                      editorState.read(() => {
                        const json = JSON.stringify(editorState.toJSON());
                        // console.log("[Editor State] Updated:", json);
                        onChange(json);
                      });
                    },
                    [onChange]
                  )}
                />
              </div>
            </div>
          </ImageLockPlugin>
        </DropdownProvider>
      </LexicalComposer>
    </div>
  );
};

export default LexicalEditor;









