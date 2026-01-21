/**
 * useTextAssist - AI text assistance for Magic Layout text blocks
 * 
 * Provides actions for:
 * - Generate text from images (describes/captions images)
 * - Shorten text
 * - Expand text
 * - Make editorial (professional prose style)
 * - Convert to bullet list
 * 
 * Currently stubbed - will connect to AI backend in future.
 */

import { useState, useCallback } from "react";

export type TextAssistAction =
  | "generate-from-images"
  | "shorten"
  | "expand"
  | "make-editorial"
  | "bullet-list";

interface TextAssistState {
  isLoading: boolean;
  error: string | null;
  lastAction: TextAssistAction | null;
}

interface UseTextAssistReturn {
  isLoading: boolean;
  error: string | null;
  runAction: (
    action: TextAssistAction,
    text: string,
    images?: string[]
  ) => Promise<string>;
  clearError: () => void;
}

/**
 * Hook for AI text assistance
 */
export function useTextAssist(): UseTextAssistReturn {
  const [state, setState] = useState<TextAssistState>({
    isLoading: false,
    error: null,
    lastAction: null,
  });

  const runAction = useCallback(
    async (
      action: TextAssistAction,
      text: string,
      images?: string[]
    ): Promise<string> => {
      setState({ isLoading: true, error: null, lastAction: action });

      try {
        // Simulate processing delay for now
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Stub implementations - return transformed text
        let result: string;

        switch (action) {
          case "generate-from-images":
            if (!images || images.length === 0) {
              result = "No images provided for description.";
            } else {
              result = `[AI-generated description of ${images.length} image(s) would appear here]`;
            }
            break;

          case "shorten": {
            // Simple stub: take first half of words
            const words = text.split(/\s+/);
            result = words.slice(0, Math.max(1, Math.floor(words.length / 2))).join(" ");
            if (result !== text) result += "...";
            break;
          }

          case "expand":
            // Simple stub: add placeholder expansion
            result = `${text}\n\n[Additional AI-generated content would expand on the above themes and ideas.]`;
            break;

          case "make-editorial":
            // Simple stub: capitalize first letter of each sentence
            result = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, p1, p2) =>
              p1 + p2.toUpperCase()
            );
            break;

          case "bullet-list": {
            // Simple stub: split by sentences and make bullets
            const sentences = text
              .split(/[.!?]+/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            result = sentences.map((s) => `• ${s}`).join("\n");
            break;
          }

          default:
            result = text;
        }

        setState({ isLoading: false, error: null, lastAction: action });
        return result;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Text assist failed";
        setState({ isLoading: false, error: errorMsg, lastAction: action });
        return text; // Return original on error
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    isLoading: state.isLoading,
    error: state.error,
    runAction,
    clearError,
  };
}

export default useTextAssist;
