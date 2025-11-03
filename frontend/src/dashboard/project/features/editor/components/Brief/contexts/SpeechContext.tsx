import { createContext, useContext } from "react";

type SpeechContextValue = {
  listening: boolean;
  toggleListening: () => void;
  micStatus: PermissionState | null;
};

export const SpeechContext = createContext<SpeechContextValue | null>(null);

export const useSpeech = (): SpeechContextValue => {
  const ctx = useContext(SpeechContext);
  if (!ctx) {
    throw new Error("useSpeech must be used within SpeechToTextPlugin");
  }
  return ctx;
};