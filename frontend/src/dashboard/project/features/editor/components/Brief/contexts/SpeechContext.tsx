import { createContext, useContext } from "react";

type SpeechContextValue = {
  listening: boolean;
  toggleListening: () => void;
};

export const SpeechContext = createContext<SpeechContextValue | null>(null);

export const useSpeech = (): SpeechContextValue => {
  console.log("useSpeech called");
  const ctx = useContext(SpeechContext);
  if (!ctx) {
    throw new Error("useSpeech must be used within SpeechToTextPlugin");
  }
  return ctx;
};