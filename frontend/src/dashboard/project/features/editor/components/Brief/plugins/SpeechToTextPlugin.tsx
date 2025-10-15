import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import { AudioOutlined, AudioFilled } from "@ant-design/icons";
import { TOGGLE_SPEECH_COMMAND } from "../commands";

/* ---------- Minimal typings for Web Speech API (and webkit fallback) ---------- */
type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type Props = {
  /** Show a toolbar button that toggles voice input */
  showToolbarButton?: boolean;
};

export default function SpeechToTextPlugin({
  showToolbarButton = true,
}: Props) {
  const [editor] = useLexicalComposerContext();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((res) => res[0].transcript)
        .join(" ");

      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(transcript + " ");
        } else {
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(transcript + " "));
          $getRoot().append(paragraph);
        }
      });
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [editor]);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      // Optional: UX nudge; keep silent in headless contexts
       
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (listening) {
      try {
        recognition.stop();
      } catch (e) {
        console.error("Speech recognition stop error:", e);
      }
      setListening(false);
    } else {
      try {
        recognition.start();
        setListening(true);
      } catch (e) {
        console.error("Speech recognition start error:", e);
      }
    }
  }, [listening]);

  useEffect(() => {
    const unregister = editor.registerCommand<void>(
      TOGGLE_SPEECH_COMMAND as LexicalCommand<void>,
      () => {
        toggleListening();
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
    return unregister;
  }, [editor, toggleListening]);

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









