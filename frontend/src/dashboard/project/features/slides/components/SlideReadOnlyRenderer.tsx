import React, { useMemo } from "react";
import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { Klass, LexicalNode, ParagraphNode } from "lexical";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";

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
    <div style={{ width: "100%", height: "100%" }}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="editor-input"
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
      </LexicalComposer>
    </div>
  );
};

export default SlideReadOnlyRenderer;

