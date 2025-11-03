import React from "react";
import { useSpeech } from "../contexts/SpeechContext";
import {
  Download,
  Upload,
  Eye,
  Save,
  Mic,
  MicOff,
} from "lucide-react";

type FloatingBottomToolbarPluginProps = {
  onPreview?: () => void;
  onSave?: () => void;
};

export default function FloatingBottomToolbarPlugin({
  onPreview,
  onSave,
}: FloatingBottomToolbarPluginProps) {
  const { listening, toggleListening } = useSpeech();

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
        onClick={() => {
          console.log("Mic button clicked");
          toggleListening();
        }}
        title={listening ? "Stop Voice Input" : "Voice"}
        style={listening ? { color: "#c00" } : {}}
      >
        {listening ? <MicOff size={18} strokeWidth={1.8} /> : <Mic size={18} strokeWidth={1.8} />}
      </button>
    </div>
  );
}