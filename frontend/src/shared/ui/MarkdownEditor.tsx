import React, { useEffect, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import { CodeNode } from "@lexical/code";
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import type { Klass, LexicalNode, EditorState } from "lexical";

import styles from "./markdown-editor.module.css";

const Placeholder = ({ text }: { text: string }) => <div className={styles.placeholder}>{text}</div>;

const ExternalMarkdownPlugin: React.FC<{
  markdown: string;
  lastAppliedRef: React.MutableRefObject<string | null>;
}> = ({ markdown, lastAppliedRef }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (markdown === lastAppliedRef.current) return;
    editor.update(() => {
      $convertFromMarkdownString(markdown || "", TRANSFORMERS);
    });
    lastAppliedRef.current = markdown;
  }, [editor, lastAppliedRef, markdown]);

  return null;
};

export type MarkdownEditorProps = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel?: string;
};

export default function MarkdownEditor({
  initialMarkdown,
  onChange,
  placeholder = "Write…",
  ariaLabel = "Markdown editor",
}: MarkdownEditorProps) {
  const lastAppliedRef = useRef<string | null>(null);

  const theme = useMemo(
    () => ({
      paragraph: styles.paragraph,
      text: {
        bold: styles.bold,
        italic: styles.italic,
        underline: styles.underline,
      },
      link: styles.link,
      list: {
        listitem: styles.listItem,
        ul: styles.ul,
        ol: styles.ol,
      },
    }),
    [],
  );

  const editorConfig = useMemo(
    () => ({
      namespace: "markdown-editor",
      theme,
      onError: (err: Error) => console.error("Lexical error", err),
      // Required for MarkdownShortcutPlugin(TRANSFORMERS), e.g. code block transformer needs CodeNode.
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode] as Klass<LexicalNode>[],
    }),
    [theme],
  );

  return (
    <div className={styles.container}>
      <LexicalComposer initialConfig={editorConfig}>
        <div className={styles.inner}>
          <RichTextPlugin
            contentEditable={<ContentEditable className={styles.input} aria-label={ariaLabel} />}
            placeholder={<Placeholder text={placeholder} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <ExternalMarkdownPlugin markdown={initialMarkdown} lastAppliedRef={lastAppliedRef} />
          <OnChangePlugin
            onChange={(editorState: EditorState) => {
              editorState.read(() => {
                const md = $convertToMarkdownString(TRANSFORMERS);
                // Mark as already applied so controlled parent updates don't cause a re-import loop.
                lastAppliedRef.current = md;
                onChange(md);
              });
            }}
          />
        </div>
      </LexicalComposer>
    </div>
  );
}
