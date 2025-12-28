import React, { useEffect, useMemo, useRef } from "react";
import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { Klass, LexicalNode, ParagraphNode, $createParagraphNode, $getRoot } from "lexical";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import ImageLockPlugin from "@/dashboard/project/features/editor/components/Brief/plugins/ImageLockPlugin";
import { ResizableImageNode } from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/ResizableImageNode";
import { SvgNode } from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/SvgNode";
import { FigmaEmbedNode } from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/FigmaEmbedNode";
import { LayoutContainerNode } from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/LayoutContainerNode";
import { LayoutItemNode } from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/LayoutItemNode";
import { TextBoxNode } from "@/dashboard/project/features/editor/components/Brief/plugins/nodes/TextBoxNode";

import "@/dashboard/project/features/editor/components/Brief/lexical-editor.css";

type SlideReadOnlyRendererProps = {
  content?: string | null;
  contentPadding?: string | number;
};

function EditorStateSyncPlugin({ content }: { content?: string | null }): null {
  const [editor] = useLexicalComposerContext();
  const lastContentRef = useRef<string | null>(null);

  useEffect(() => {
    editor.setEditable(false);
  }, [editor]);

  useEffect(() => {
    const nextContent = typeof content === "string" && content.trim().length > 0 ? content : null;
    if (nextContent === lastContentRef.current) {
      return;
    }
    lastContentRef.current = nextContent;

    if (!nextContent) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode());
      });
      return;
    }

    try {
      editor.setEditorState(editor.parseEditorState(nextContent));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Lexical Slides Presentation: failed to parse editorState", error);
    }
  }, [content, editor]);

  return null;
}

const SlideReadOnlyRenderer: React.FC<SlideReadOnlyRendererProps> = ({
  content,
  contentPadding = "96px 120px",
}) => {
  const resolvedContentPadding = typeof contentPadding === "number" ? `${contentPadding}px` : contentPadding;

  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: "MYLGSlidesPresentation",
      editable: false,
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
      onError: (error: Error) => console.error("Lexical Slides Presentation Error:", error),
      editorState: typeof content === "string" && content.trim().length > 0 ? content : undefined,
    }),
    [content]
  );

  return (
    <div style={{ width: "100%", height: "100%", pointerEvents: "none", userSelect: "none" }}>
      <LexicalComposer initialConfig={initialConfig}>
        {/* Provide ImageLockContext so slide nodes like ResizableImageNode don't crash in read-only mode. */}
        <ImageLockPlugin provider={null}>
          <EditorStateSyncPlugin content={content} />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-input"
                data-slides-mode="true"
                tabIndex={-1}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  padding: resolvedContentPadding,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ListPlugin />
          <LinkPlugin />
          <ClickableLinkPlugin />
        </ImageLockPlugin>
      </LexicalComposer>
    </div>
  );
};

export default SlideReadOnlyRenderer;
