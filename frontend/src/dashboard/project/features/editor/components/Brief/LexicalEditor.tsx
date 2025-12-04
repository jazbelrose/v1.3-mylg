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
import UndoBoundaryPlugin from "./plugins/UndoBoundaryPlugin";

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
import { TextBoxNode } from "./plugins/nodes/TextBoxNode";
import RemoveEmptyLayoutItemsOnBackspacePlugin from "./plugins/BackspacePlugin";
import ToolbarPlugin from "./plugins/ToolbarPlugin";
import ColorPlugin from "./plugins/ColorPlugin";
import FontPlugin from "./plugins/FontPlugin";
import ImagePlugin from "./plugins/ImagePlugin";
import VectorPlugin from "./plugins/VectorPlugin";
import FigmaPlugin from "./plugins/FigmaPlugin";
import { LayoutPlugin } from "./plugins/LayoutPlugin";
import ToolbarActionsPlugin from "./plugins/ToolbarActionsPlugin";
import TextBoxPlugin from "./plugins/TextBoxPlugin";
import TextBoxTransformPlugin from "./plugins/TextBoxTransformPlugin";
import syncCursorPositionsWithAvatars from "./utils/syncCursorAvatars";

type LexicalEditorProps = {
  onChange: (json: string) => void;
  initialContent?: unknown | null;
  docId?: string;
  registerToolbar?: (actions: unknown) => void;
  onPreview?: () => void;
  onSave?: () => void;
  showDefaultToolbar?: boolean;
  customToolbar?: React.ReactNode;
  /** Optional: disable IndexedDB/Yjs persistence for this doc */
  usePersistence?: boolean;
  /** Allow parent components to provide their own DropdownProvider */
  disableDropdownProvider?: boolean;
  /** Optional padding applied inside the editable surface */
  contentPadding?: number | string;
  /** Control overflow for the editable surface (slide uses hidden) */
  contentOverflowBehavior?: "auto" | "hidden";
  /** Clamp the editable surface height if provided */
  contentMaxHeight?: number | string;
};

type ActiveProjectLike = { projectId?: string } | string | null | undefined;

// Extend to allow us to stash helper props safely
interface ExtendedWebsocketProvider extends WebsocketProvider {
  sharedType?: Y.Text;
}

const LexicalEditor: React.FC<LexicalEditorProps> = ({
  onChange,
  initialContent,
  docId,
  registerToolbar,
  onPreview,
  onSave,
  showDefaultToolbar = true,
  customToolbar,
  usePersistence = true,
  disableDropdownProvider = false,
  contentPadding = 20,
  contentOverflowBehavior = "auto",
  contentMaxHeight,
}) => {
  const { userName, userData, activeProject } = useData() as {
    userName?: string;
    userData?: { thumbnail?: string; thumbnailUrl?: string; firstName?: string; lastName?: string; email?: string };
    activeProject?: ActiveProjectLike;
  };
  const avatarUrl = (userData?.thumbnailUrl || userData?.thumbnail) as string | undefined;

  const awarenessData = useMemo(
    () => (avatarUrl ? { avatar: avatarUrl } : undefined),
    [avatarUrl]
  );
  
  // Helper function to get user initials
  const getUserInitials = (firstName?: string, lastName?: string): string => {
    const trimmedFirst = firstName?.trim();
    const trimmedLast = lastName?.trim();
    if (trimmedFirst && trimmedLast) {
      return `${trimmedFirst[0]}${trimmedLast[0]}`.toUpperCase();
    }
    if (trimmedFirst) {
      return trimmedFirst.slice(0, 2).toUpperCase();
    }
    return "";
  };
  
  // Create a proper display name for collaboration (prefer initials for compact display)
  const displayName = (() => {
    const initials = getUserInitials(userData?.firstName, userData?.lastName);
    if (initials) return initials;
    
    if (userData?.firstName?.trim()) return userData.firstName.trim();
    if (userData?.email?.split('@')[0]) return userData.email.split('@')[0];
    return userName?.trim() || "Anonymous";
  })();

  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resolvedContentPadding =
    typeof contentPadding === "number" ? `${contentPadding}px` : contentPadding;

  const providerRef = useRef<ExtendedWebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);

  const initialContentRef = useRef<unknown | null>(null);
  const hasScrolledToBottom = useRef<boolean>(false);
  const lastDocIdRef = useRef<string | null>(null);

  // Memoize the project ID so it isn’t recalculated unnecessarily.
  const fallbackProjectId = useMemo<string>(() => {
    const ap = activeProject;
    if (ap && typeof ap === "object" && "projectId" in ap) {
      return (ap?.projectId as string) || "default-project";
    }
    return (ap as string) || "default-project";
  }, [activeProject]);

  const resolvedDocId = useMemo<string>(() => {
    const trimmedDocId = typeof docId === "string" ? docId.trim() : "";
    return trimmedDocId.length > 0 ? trimmedDocId : fallbackProjectId;
  }, [docId, fallbackProjectId]);

  // Lock initialContentRef.current after first assignment to prevent re-bootstrap
  // We intentionally lock the initial content per `resolvedDocId` (docId) so that
  // the editor/Collaboration provider isn't churned when parent props re-render or change.
  // This avoids repeatedly disconnecting/creating providers or re-injecting server
  // content when the component receives new props for the same docId.
  useEffect(() => {
    if (lastDocIdRef.current !== resolvedDocId) {
      lastDocIdRef.current = resolvedDocId;
      initialContentRef.current = initialContent ?? null;
      return;
    }

    if (initialContentRef.current === null && initialContent) {
      initialContentRef.current = initialContent;
    }
  }, [initialContent, resolvedDocId]);

  useEffect(() => {
    if (!usePersistence) return;
    const persistence = persistenceRef.current;
    if (persistence) {
      console.log("[Yjs] Destroying IndexedDB persistence for doc:", resolvedDocId);
      persistence
        .destroy()
        .then(() => {
          console.log("IndexedDB cleared for doc:", resolvedDocId);
        })
        .catch((err: unknown) => {
          console.error("Error clearing IndexedDB:", err);
        });
    }
  }, [resolvedDocId, usePersistence]);

  // Clean up provider only when the component unmounts
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        console.log("[Yjs] Cleaning up provider on unmount");
        providerRef.current.disconnect();
        providerRef.current = null;
      }
    };
  }, []);

  // If needed, you can set up the anchor element for plugins (like draggable blocks)
  useEffect(() => {
    if (editorContainerRef.current) {
      // Anchor setup (if required by plugins) could go here.
    }
  }, []);

  useEffect(() => {
    hasScrolledToBottom.current = false;
  }, [resolvedDocId]);

  // Only to trigger re-renders if you want; not otherwise used.
  // (Keep for parity with original; can be removed if truly unused.)
  const [, setYjsProvider] = useState<ExtendedWebsocketProvider | null>(null);

  const getProvider = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
      console.log("[Yjs] getProvider called for:", id);  // Confirm called only once per session/project
      // ✅ Don’t recreate the provider if we already have one for this room
      if (providerRef.current && providerRef.current.roomname === id) {
        return providerRef.current as unknown as Provider;
      }

      // ❌ Clean out old provider if room name doesn't match
      if (providerRef.current) {
        providerRef.current.disconnect();
        providerRef.current = null;
      }

      let doc = yjsDocMap.get(id);
      if (!doc) {
        doc = new Y.Doc();
        yjsDocMap.set(id, doc);
      }

      // Only wire IndexedDB when allowed
      if (usePersistence) {
        // Create and store the persistence instance.
        const persistence = new IndexeddbPersistence(id, doc);
        persistence.on("synced", () => {
          console.log("IndexedDB synced for project:", id);

          // If IndexedDB/Yjs has no content for this doc but we were given
          // an `initialContent` (from server), inject it into the shared type.
          // This prevents stale-empty IndexedDB docs from hiding server content
          // on page refresh. Do this only once per provider.
          try {
            const shared = provider.sharedType;
            const pFlag = provider as unknown as { __initialContentInjected?: boolean };
            const alreadyInjected = pFlag.__initialContentInjected;
            // Note: treat an explicit null as the only "no initial content" sentinel.
            // Previously this branch required `initialContentRef.current` to be truthy,
            // which prevented empty-string content ("") from being injected. That could
            // cause clients with an empty IndexedDB copy to hide server-provided empty
            // slide content. Use !== null so empty strings or other valid-but-falsy
            // values are respected.
            if (
              shared &&
              !alreadyInjected &&
              typeof shared.toString === "function" &&
              shared.toString().length === 0 &&
              initialContentRef.current !== null
            ) {
              const txt =
                typeof initialContentRef.current === "string"
                  ? initialContentRef.current
                  : JSON.stringify(initialContentRef.current);
              console.log("[Yjs] Injecting initial content into IndexedDB doc:", id);
              // Insert at position 0 so the shared text contains the server content
              shared.insert(0, txt);
              // Mark we injected so we don't run multiple times
              pFlag.__initialContentInjected = true;
            }
          } catch (e) {
            console.warn("[Yjs] failed to inject initial content:", e);
          }
        });
        persistenceRef.current = persistence;
      } else {
        persistenceRef.current = null;
      }

      const provider = new WebsocketProvider(
        YJS_WS_URL.replace(/\/$/, ""),       // base only, no trailing slash
        id,                                  // room id; y-websocket appends this
        doc
      ) as ExtendedWebsocketProvider;

      // Expose a shared text type for convenience (handy for custom plugins).
      provider.sharedType = doc.getText("lexical");

      // Attach lightweight debug listeners so we can observe provider state in
      // the browser console (helps distinguish client vs server/network issues).
      try {
        const anyProvider = provider as unknown as {
          on?: (event: string, cb: unknown) => void;
          wsconnected?: boolean;
          connected?: boolean;
        };

        if (typeof anyProvider.on === "function") {
          anyProvider.on("status", (ev: unknown) => {
            // y-websocket emits { status: 'connected'|'disconnected' }
            console.log("[Yjs] Provider status:", ev);
          });

          anyProvider.on("sync", (isSynced: boolean) => {
            console.log("[Yjs] Provider sync:", isSynced);
          });

          anyProvider.on("connection-close", (...args: unknown[]) => {
            const [event] = Array.isArray(args) ? args : [undefined];
            const closeEvent = Array.isArray(event)
              ? (event[0] as CloseEvent | null | undefined)
              : (event as CloseEvent | null | undefined);

            const details =
              closeEvent == null
                ? {}
                : {
                    code: closeEvent.code,
                    reason: closeEvent.reason,
                    wasClean: closeEvent.wasClean,
                  };
            console.warn("[Yjs] Provider connection closed", details);
          });

          anyProvider.on("connection-error", (...args: unknown[]) => {
            const [err] = Array.isArray(args) ? args : [undefined];
            console.error("[Yjs] Provider connection error", err);
          });
        }

        // Some provider builds expose a connected/wsconnected flag — print if present
        console.log(
          "[Yjs] Provider connection flag:",
          anyProvider.wsconnected ?? anyProvider.connected ?? undefined
        );
      } catch (e) {
        // Don't allow debug code to break the editor
        console.warn("[Yjs] failed to attach debug listeners:", e);
      }

      providerRef.current = provider;
      setYjsProvider(provider);
      return provider as unknown as Provider;
    },
    [usePersistence]
  );

  // Memoize the LexicalComposer configuration so it’s only created once.
  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: "MyEditor",
      theme: {
        paragraph: "editor-paragraph",
        text: {
          base: "editor-text",
          bold: "editor-bold",
          italic: "editor-italic",
          underline: "editor-underline",
          strikethrough: "editor-strikethrough",
          code: "editor-code",
          color: "editor-text-color",
          backgroundColor: "editor-bg-color",
        },
        style: {
          base: "",
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
        textBox: "editor-textbox",
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
        TextBoxNode,
      ] as Klass<LexicalNode>[],
      onError: (error: Error) => console.error("Lexical Editor Error:", error),
      editorState: null,
    }),
    []
  );

  const editorLayout = (
    <ImageLockPlugin provider={providerRef.current}>
      <div
        className="editor-container"
        ref={editorContainerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          height: "100%",
          borderRadius: "inherit",
        }}
      >
        <ToolbarActionsPlugin registerToolbar={registerToolbar} />
        {customToolbar ? customToolbar : showDefaultToolbar && (
          <ToolbarPlugin onPreview={onPreview} onSave={onSave} />
        )}
        <ColorPlugin showToolbar={false} />
        <FontPlugin showToolbar={false} />
        <ImagePlugin showToolbarButton={false} />
        <VectorPlugin showToolbarButton={false} />
        <FigmaPlugin showToolbarButton={false} />
        <LayoutPlugin showToolbarButton={false} />
        <TextBoxPlugin />
        <TextBoxTransformPlugin />

        <FloatingToolbar editorRef={editorRef} />

        <div
          className="content-container"
          ref={contentRef}
          style={{
            flex: 1,
            position: "relative",
            overflowY: contentOverflowBehavior,
            overflowX: "hidden",
            WebkitOverflowScrolling: contentOverflowBehavior === "auto" ? "touch" : undefined,
            borderRadius: "inherit",
            padding: 0,
            height: "100%",
            maxHeight: contentMaxHeight,
          }}
        >
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-input"
                style={{ 
                  position: "relative", 
                  minHeight: contentOverflowBehavior === "hidden" ? "100%" : "auto",
                  maxHeight: contentOverflowBehavior === "hidden" ? "100%" : undefined,
                  borderRadius: "inherit",
                  padding: resolvedContentPadding,
                  boxSizing: "border-box",
                  overflow: contentOverflowBehavior === "hidden" ? "hidden" : "visible",
                }}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          <CollaborationPlugin
            id={resolvedDocId}
            providerFactory={getProvider}
            initialEditorState={initialContentRef.current as never}
            shouldBootstrap={true}
            username={displayName}
            awarenessData={awarenessData}
            syncCursorPositionsFn={syncCursorPositionsWithAvatars}
          />

          <UndoBoundaryPlugin />

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
  );

  return (
    <div
      ref={editorRef}
      style={{
        // Allow the parent (e.g. SlideEditor) to control the visible canvas
        // size. Use full width/height of the container instead of viewport
        // fixed sizes so the editor can be constrained by wrappers.
        maxWidth: "100%",
        width: "100%",
        height: "100%",
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        {disableDropdownProvider ? (
          editorLayout
        ) : (
          <DropdownProvider>{editorLayout}</DropdownProvider>
        )}
      </LexicalComposer>
    </div>
  );
};

export default LexicalEditor;








