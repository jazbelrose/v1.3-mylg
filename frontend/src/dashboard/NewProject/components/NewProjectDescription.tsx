import React, { useCallback, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import {
  $createParagraphNode,
  $getRoot,
  Klass,
  LexicalNode,
  type EditorState,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import styles from "./new-project-description.module.css";

interface NewProjectDescriptionProps {
  description: string;
  setDescription: (value: string, plainText: string) => void;
}

const Placeholder: React.FC = () => (
  <div className={styles.placeholder}>Describe your project in a few words</div>
);

const ExternalStatePlugin: React.FC<{
  description: string;
  lastEmittedValueRef: React.MutableRefObject<string | null>;
}> = ({ description, lastEmittedValueRef }) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    if (description === lastEmittedValueRef.current) {
      return;
    }

    if (!description) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode());
        root.selectEnd();
      });
      lastEmittedValueRef.current = description;
      return;
    }

    try {
      const editorState = editor.parseEditorState(description);
      editor.setEditorState(editorState);
      lastEmittedValueRef.current = description;
    } catch (error) {
      console.error("Failed to parse project description", error);
    }
  }, [description, editor, lastEmittedValueRef]);

  return null;
};

const NewProjectDescription: React.FC<NewProjectDescriptionProps> = ({
  description,
  setDescription,
}) => {
  const lastEmittedValueRef = useRef<string | null>(description ?? null);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const root = $getRoot();
        const plainText = root.getTextContent();
        const json = JSON.stringify(editorState.toJSON());
        lastEmittedValueRef.current = json;
        setDescription(json, plainText);
      });
    },
    [setDescription]
  );

  const theme = useMemo(
    () => ({
      paragraph: styles.paragraph,
      list: {
        listitem: styles.listItem,
        ul: styles.unorderedList,
        ol: styles.orderedList,
      },
      text: {
        bold: styles.textBold,
        italic: styles.textItalic,
        underline: styles.textUnderline,
      },
      link: styles.link,
    }),
    []
  );

  const initialConfig = useMemo(
    () => ({
      namespace: "new-project-description",
      theme,
      onError: (error: Error) => console.error("Lexical Editor Error:", error),
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        LinkNode,
      ] as Klass<LexicalNode>[],
      editorState: description || null,
    }),
    [description, theme]
  );

  return (
    <div className={styles.descriptionContainer}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className={styles.editorWrapper}>
          <div className={styles.editorInner}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={styles.editorInput}
                  aria-label="Project description"
                />
              }
              placeholder={<Placeholder />}
            />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <ExternalStatePlugin
              description={description}
              lastEmittedValueRef={lastEmittedValueRef}
            />
            <OnChangePlugin onChange={handleChange} />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
};

export default NewProjectDescription;









