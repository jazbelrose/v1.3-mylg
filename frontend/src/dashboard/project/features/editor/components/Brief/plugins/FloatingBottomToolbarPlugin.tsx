import React from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TOGGLE_SPEECH_COMMAND } from "../commands";
import {
  Download,
  Upload,
  Eye,
  Save,
  Mic,
} from "lucide-react";

type FloatingBottomToolbarPluginProps = {
  onPreview?: () => void;
  onSave?: () => void;
};

export default function FloatingBottomToolbarPlugin({
  onPreview,
  onSave,
}: FloatingBottomToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();

  return (
    <div
      className="floating-toolbar"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "#111",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "8px",
        display: "flex",
        gap: "10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 1000,
      }}
    >
      <button className="toolbar-btn" title="Import">
        <Download size={18} strokeWidth={1.8} />
      </button>
      <button className="toolbar-btn" title="Export">
        <Upload size={18} strokeWidth={1.8} />
      </button>
      <button className="toolbar-btn" onClick={onPreview} title="Preview">
        <Eye size={18} strokeWidth={1.8} />
      </button>
      <button className="toolbar-btn" onClick={onSave} title="Save">
        <Save size={18} strokeWidth={1.8} />
      </button>
      <button
        className="toolbar-btn"
        onClick={() => editor.dispatchCommand(TOGGLE_SPEECH_COMMAND, undefined)}
        title="Voice"
      >
        <Mic size={18} strokeWidth={1.8} />
      </button>
    </div>
  );
}