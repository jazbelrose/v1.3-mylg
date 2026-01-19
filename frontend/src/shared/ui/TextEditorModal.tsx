/**
 * TextEditorModal - A simple modal for editing plain text or markdown content
 * Used for task descriptions and inline text editing
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Check, Undo2, Redo2, WrapText, Bold, Italic, List, ListOrdered, Link2 } from "lucide-react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import { CodeNode } from "@lexical/code";
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  $getRoot,
} from "lexical";
import type { Klass, LexicalNode, EditorState, LexicalEditor } from "lexical";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "./text-editor-modal.module.css";

const NODES: ReadonlyArray<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeNode,
];

const theme = {
  paragraph: styles.paragraph,
  heading: {
    h1: styles.h1,
    h2: styles.h2,
    h3: styles.h3,
  },
  list: {
    ul: styles.ul,
    ol: styles.ol,
    listitem: styles.listitem,
  },
  quote: styles.quote,
  code: styles.code,
  link: styles.link,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
    code: styles.inlineCode,
  },
};

function onLexicalError(error: Error) {
  console.error("TextEditorModal Lexical error:", error);
}

const EditorBridgePlugin: React.FC<{ onReady: (editor: LexicalEditor) => void }> = ({ onReady }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
};

const InitializeContentPlugin: React.FC<{ content: string; onInitialized: () => void }> = ({
  content,
  onInitialized,
}) => {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    editor.update(() => {
      $convertFromMarkdownString(content || "", TRANSFORMERS);
    });
    onInitialized();
  }, [editor, content, onInitialized]);

  return null;
};

export type TextEditorModalProps = {
  isOpen: boolean;
  title?: string;
  initialContent: string;
  placeholder?: string;
  onRequestClose: () => void;
  onSave: (content: string) => void;
  readOnly?: boolean;
};

export default function TextEditorModal({
  isOpen,
  title = "Edit Text",
  initialContent,
  placeholder = "Start typing...",
  onRequestClose,
  onSave,
  readOnly = false,
}: TextEditorModalProps) {
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [wrap, setWrap] = useState(true);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMarkdown(initialContent);
      setIsInitialized(false);
    }
  }, [isOpen, initialContent]);

  const handleEditorChange = useCallback((editorState: EditorState) => {
    editorState.read(() => {
      const md = $convertToMarkdownString(TRANSFORMERS);
      setMarkdown(md);
    });
  }, []);

  const handleSave = useCallback(() => {
    // Get plain text from the editor
    if (editor) {
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const text = root.getTextContent();
        onSave(text);
      });
    } else {
      onSave(markdown);
    }
    onRequestClose();
  }, [editor, markdown, onSave, onRequestClose]);

  const isDirty = markdown !== initialContent;

  const handleClose = useCallback(() => {
    if (isDirty && !readOnly) {
      const confirmDiscard = window.confirm("You have unsaved changes. Discard them?");
      if (!confirmDiscard) return;
    }
    onRequestClose();
  }, [isDirty, onRequestClose, readOnly]);

  const handleUndo = useCallback(() => {
    editor?.dispatchCommand(UNDO_COMMAND, undefined);
  }, [editor]);

  const handleRedo = useCallback(() => {
    editor?.dispatchCommand(REDO_COMMAND, undefined);
  }, [editor]);

  const handleBold = useCallback(() => {
    editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  }, [editor]);

  const handleItalic = useCallback(() => {
    editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  }, [editor]);

  const initialConfig = useMemo(
    () => ({
      namespace: "TextEditorModal",
      theme,
      nodes: NODES,
      onError: onLexicalError,
      editable: !readOnly,
    }),
    [readOnly]
  );

  // Don't render editor until modal is open to avoid stale state
  const editorKey = isOpen ? `editor-${Date.now()}` : "closed";

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      contentLabel={title}
      className={{ base: styles.modal, afterOpen: styles.modalOpen, beforeClose: "" }}
      overlayClassName={{ base: styles.overlay, afterOpen: styles.overlayOpen, beforeClose: "" }}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setWrap((w) => !w)}
              title={wrap ? "Disable word wrap" : "Enable word wrap"}
            >
              <WrapText size={18} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={handleUndo}
              title="Undo"
              disabled={readOnly}
            >
              <Undo2 size={18} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={handleRedo}
              title="Redo"
              disabled={readOnly}
            >
              <Redo2 size={18} />
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Formatting toolbar */}
        {!readOnly && (
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.toolbarButton}
              onClick={handleBold}
              title="Bold (Ctrl+B)"
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              className={styles.toolbarButton}
              onClick={handleItalic}
              title="Italic (Ctrl+I)"
            >
              <Italic size={16} />
            </button>
          </div>
        )}

        <div className={styles.editorWrapper} data-wrap={wrap}>
          {isOpen && (
            <LexicalComposer key={editorKey} initialConfig={initialConfig}>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className={styles.contentEditable}
                    aria-label="Text editor"
                  />
                }
                placeholder={<div className={styles.placeholder}>{placeholder}</div>}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <ListPlugin />
              <LinkPlugin />
              <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
              <OnChangePlugin onChange={handleEditorChange} />
              <EditorBridgePlugin onReady={setEditor} />
              <InitializeContentPlugin
                content={initialContent}
                onInitialized={() => setIsInitialized(true)}
              />
            </LexicalComposer>
          )}
        </div>

        {!readOnly && (
          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!isInitialized}
            >
              <Check size={16} />
              Save
            </button>
          </footer>
        )}
      </div>
    </Modal>
  );
}
