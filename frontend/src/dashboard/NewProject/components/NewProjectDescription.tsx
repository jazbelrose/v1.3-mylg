import React, { useEffect, useMemo, useState } from "react";
import styles from "./new-project-description.module.css";

interface NewProjectDescriptionProps {
  description: string;
  setDescription: (value: string, plainText: string) => void;
}

const collectLexicalText = (node: unknown): string => {
  if (!node) return "";
  if (Array.isArray(node)) {
    return node.map((item) => collectLexicalText(item)).filter(Boolean).join(" ");
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.text === "string") parts.push(obj.text);
    if (Array.isArray(obj.children)) parts.push(collectLexicalText(obj.children));
    if (Array.isArray(obj.rows)) parts.push(collectLexicalText(obj.rows));
    if (Array.isArray(obj.cells)) parts.push(collectLexicalText(obj.cells));
    return parts.filter(Boolean).join(" ");
  }
  return "";
};

const lexicalToPlainText = (value: string): string => {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { root?: unknown; text?: string };
    if (parsed && typeof parsed.text === "string") {
      return parsed.text;
    }
    if (parsed && parsed.root) {
      return collectLexicalText(parsed.root);
    }
  } catch {
    /* ignore malformed lexical payloads */
  }
  return value;
};

const NewProjectDescription: React.FC<NewProjectDescriptionProps> = ({
  description,
  setDescription,
}) => {
  const initialValue = useMemo(() => lexicalToPlainText(description), [description]);
  const [value, setValue] = useState<string>(initialValue);

  useEffect(() => {
    setValue(lexicalToPlainText(description));
  }, [description]);

  return (
    <div className={styles.descriptionContainer}>
      <div className={styles.editorWrapper}>
        <div className={styles.editorInner}>
          <textarea
            className={styles.editorInput}
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value;
              setValue(nextValue);
              setDescription(nextValue, nextValue);
            }}
            placeholder="Describe your project in a few words"
            aria-label="Project description"
          />
        </div>
      </div>
    </div>
  );
};

export default NewProjectDescription;
