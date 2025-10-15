import React, { useEffect, useMemo, useState } from "react";
import ReactModal from "react-modal";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import { SiFigma } from "react-icons/si";
import { $createFigmaEmbedNode } from "./nodes/FigmaEmbedNode";
import { OPEN_FIGMA_COMMAND } from "../commands";

type Props = {
  /** Show a toolbar button that opens the modal */
  showToolbarButton?: boolean;
};

/** Basic URL sanity check to avoid inserting obvious non-URLs */
function isLikelyUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return !!u.protocol && !!u.host;
  } catch {
    return false;
  }
}

// Avoid calling setAppElement during SSR
if (typeof document !== "undefined") {
  ReactModal.setAppElement("#root");
}

export default function FigmaPlugin({ showToolbarButton = true }: Props) {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setURL] = useState("");

  // Register command so other UI can open this modal (e.g., palette/shortcut)
  useEffect(() => {
    const unregister = editor.registerCommand<void>(
      OPEN_FIGMA_COMMAND as LexicalCommand<void>,
      () => {
        setIsOpen(true);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
    return unregister;
  }, [editor]);

  const canAdd = useMemo(() => isLikelyUrl(url), [url]);

  const onAdd = () => {
    if (!canAdd) return;

    const cleanUrl = url.trim();
    editor.update(() => {
      const node = $createFigmaEmbedNode({ url: cleanUrl });
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([node]);
      } else {
        $insertNodes([node]);
      }
    });

    setURL("");
    setIsOpen(false);
  };

  return (
    <div style={{ display: "inline-block" }}>
      {showToolbarButton && (
        <button
          aria-label="Add Figma Document"
          onClick={() => setIsOpen(true)}
          className="toolbar-item"
          style={{ background: "none", border: "none", cursor: "pointer" }}
          type="button"
        >
          <SiFigma size={18} color="#777" />
        </button>
      )}

      <ReactModal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        shouldCloseOnOverlayClick
        shouldCloseOnEsc
        style={{
          overlay: {
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          },
          content: {
            background: "#0c0c0c",
            padding: "20px",
            borderRadius: "10px",
            width: "400px",
            maxWidth: "90%",
            border: "1px solid white",
            boxShadow: "0 4px 12px rgba(250,51,86,0.3)",
            inset: "unset",
            color: "white",
          },
        }}
        contentLabel="Insert Figma URL"
      >
        <div style={{ marginBottom: "15px" }}>
          <label htmlFor="figma-url" style={{ display: "block", marginBottom: 6 }}>
            Figma file URL
          </label>
          <input
            id="figma-url"
            type="url"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="https://www.figma.com/file/..."
            style={{
              width: "100%",
              padding: "10px",
              border: "1px solid white",
              borderRadius: "5px",
              background: "#1b1b1b",
              color: "white",
              marginBottom: "10px",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onAdd}
            disabled={!canAdd}
            style={{
              flex: 1,
              padding: "10px",
              background: canAdd ? "#FA3356" : "#555",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
            type="button"
          >
            Add
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              flex: 1,
              padding: "10px",
              background: "transparent",
              border: "1px solid white",
              borderRadius: "5px",
              color: "white",
              cursor: "pointer",
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </ReactModal>
    </div>
  );
}









