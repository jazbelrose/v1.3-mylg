import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
} from "lexical";
import { SpeechContext } from "../contexts/SpeechContext";

/* ---------- Minimal typings for Web Speech API (and webkit fallback) ---------- */
type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};
type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
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
  children: React.ReactNode;
};

export default function SpeechProvider({ children }: Props) {
  console.log("SpeechProvider mounted");
  const [editor] = useLexicalComposerContext();
  console.log("Editor:", editor);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    console.log("SpeechProvider useEffect running");
    if (typeof window === "undefined") {
      console.log("Window is undefined, skipping");
      return;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      console.log("Speech recognition not supported");
      return;
    }

    console.log("Creating speech recognition");
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      console.log("Speech recognition started");
      setListening(true);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      console.error("Speech recognition error:", event);
      setListening(false);
      if (event.error === 'not-allowed') {
        alert("Microphone permission is required for speech recognition. Please allow microphone access and try again.");
      }
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      console.log("Speech recognition result:", event);
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((res) => res[0].transcript)
        .join(" ");

      console.log("Transcript:", transcript);
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
      console.log("Speech recognition ended");
      setListening(false);
    };

    recognitionRef.current = recognition;
    console.log("Speech recognition created and stored");

    return () => {
      console.log("Cleaning up speech recognition");
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [editor]);

  const toggleListening = useCallback(() => {
    console.log("toggleListening called, current listening:", listening);
    const recognition = recognitionRef.current;
    if (!recognition) {
      console.log("No speech recognition available");
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (listening) {
      console.log("Stopping speech recognition");
      try {
        recognition.stop();
      } catch (e) {
        console.error("Speech recognition stop error:", e);
      }
      setListening(false);
    } else {
      console.log("Starting speech recognition");
      try {
        recognition.start();
        // Don't set listening here, wait for onstart
      } catch (e) {
        console.error("Speech recognition start error:", e);
      }
    }
  }, [listening]);

  return (
    <SpeechContext.Provider value={{ listening, toggleListening }}>
      {children}
    </SpeechContext.Provider>
  );
}