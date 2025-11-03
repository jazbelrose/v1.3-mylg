import React from "react";
import { AudioOutlined, AudioFilled } from "@ant-design/icons";
import { useSpeech } from "../contexts/SpeechContext";

/* ---------- Minimal typings for Web Speech API (and webkit fallback) ---------- */
// Speech recognition types are declared in SpeechProvider.tsx

type Props = {
  /** Show a toolbar button that toggles voice input */
  showToolbarButton?: boolean;
};

export default function SpeechToTextPlugin({
  showToolbarButton = true,
}: Props) {
  const { listening, toggleListening } = useSpeech();

  if (!showToolbarButton) return null;

  return (
    <button
      type="button"
      onClick={toggleListening}
      className="toolbar-item"
      aria-label={listening ? "Stop Voice Input" : "Start Voice Input"}
      title={listening ? "Stop Voice Input" : "Start Voice Input"}
    >
      {listening ? (
        <AudioFilled style={{ fontSize: 18, color: "#c00" }} />
      ) : (
        <AudioOutlined style={{ fontSize: 18, color: "#777" }} />
      )}
    </button>
  );
}









