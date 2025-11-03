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
import { notify } from "@/shared/ui/ToastNotifications";

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
  const [editor] = useLexicalComposerContext();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState<PermissionState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      console.error("Speech recognition error:", event);
      setListening(false);
      if (event.error === 'not-allowed') {
        notify('error', "Microphone access was denied. Please allow microphone permission and try again.");
      } else if (event.error === 'no-speech') {
        notify('info', "No speech detected. Try speaking more clearly or check your mic.");
      } else {
        notify('error', `Speech recognition error: ${event.error}`);
      }
    };

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

  const toggleListening = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      notify('error', "Speech recognition is not supported in this browser.");
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
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        notify('error', "Your browser doesn't support microphone access. Please update your browser.");
        return;
      }

      try {
        // Always request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop the stream as we only needed permission
        stream.getTracks().forEach(track => track.stop());
        setMicStatus('granted');
        
        recognition.start();
        // Don't set listening here, wait for onstart
      } catch (permissionError) {
        console.error("Microphone permission denied:", permissionError);
        setMicStatus('denied');
        notify('error', "Microphone access is required for speech recognition. Please click 'Allow' when your browser asks for microphone permission, or enable it in your browser settings.");
        return;
      }
    }
  }, [listening]);

  return (
    <SpeechContext.Provider value={{ listening, toggleListening, micStatus }}>
      {children}
    </SpeechContext.Provider>
  );
}