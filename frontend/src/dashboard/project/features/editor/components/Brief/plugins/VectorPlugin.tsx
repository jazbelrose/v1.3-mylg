import React, { useState, useRef } from "react";
import ReactModal from "react-modal";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodes, $getSelection, $isRangeSelection } from "lexical";
import { $createSvgNode } from "./nodes/SvgNode";
import NodeIndexOutlined from "@ant-design/icons/lib/icons/NodeIndexOutlined";

type Props = {
  /** Show the toolbar button that opens the SVG modal (default: true) */
  showToolbarButton?: boolean;
};

// Bind modal to the app element for accessibility (avoid during SSR)
if (typeof document !== "undefined") {
  ReactModal.setAppElement("#root");
}

export default function VectorPlugin({ showToolbarButton = true }: Props) {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [svgText, setSvgText] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileRead = (f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setSvgText(String(e.target?.result ?? ""));
    reader.readAsText(f);
  };

  const onAddSvg = () => {
    const raw = svgText.trim();
    if (!raw) return;

    editor.update(() => {
      const node = $createSvgNode({ svg: raw, width: 300, height: 200 });
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([node]);
      } else {
        $insertNodes([node]);
      }
    });

    // reset UI
    setSvgText("");
    setFile(null);
    setIsOpen(false);
  };

  return (
    <div style={{ display: "inline-block" }}>
      {showToolbarButton && (
        <button
          aria-label="Add SVG"
          onClick={() => setIsOpen(true)}
          className="toolbar-item"
          style={{ background: "none", border: "none", cursor: "pointer" }}
          type="button"
        >
          <NodeIndexOutlined style={{ fontSize: 18, color: "#777" }} />
        </button>
      )}

      <input
        type="file"
        accept=".svg"
        ref={inputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          if (f) {
            setFile(f);
            handleFileRead(f);
          }
          // allow re-selecting the same file
          e.currentTarget.value = "";
        }}
      />

      <ReactModal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
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
        contentLabel="Insert SVG"
        shouldCloseOnOverlayClick
        shouldCloseOnEsc
      >
        <div style={{ marginBottom: "15px" }}>
          <textarea
            value={svgText}
            onChange={(e) => setSvgText(e.target.value)}
            placeholder="Paste SVG markup or upload file"
            rows={6}
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
          <button
            type="button"
            style={{
              width: "100%",
              padding: "10px",
              background: "#1b1b1b",
              border: "1px solid white",
              borderRadius: "5px",
              color: "white",
              cursor: "pointer",
            }}
            onClick={() => inputRef.current?.click()}
          >
            {file ? file.name : "Upload SVG"}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={onAddSvg}
            disabled={!svgText.trim()}
            style={{
              flex: 1,
              padding: "10px",
              background: svgText.trim() ? "#FA3356" : "#555",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: svgText.trim() ? "pointer" : "not-allowed",
              marginRight: "10px",
            }}
          >
            Add SVG
          </button>
          <button
            type="button"
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
          >
            Cancel
          </button>
        </div>
      </ReactModal>
    </div>
  );
}









