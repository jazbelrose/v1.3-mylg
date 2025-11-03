// hooks/useSlideProvider.ts - Hook to get Yjs provider for a specific slide
import { useEffect, useRef } from "react";
import { Provider } from "@lexical/yjs";
import { getSlideProvider, disconnectSlideProvider } from "../lib/yjs";

/**
 * Hook to get a Yjs provider for a specific slide
 * Automatically connects on mount and disconnects on unmount or slide change
 */
export function useSlideProvider(slideId: string | null): Provider | null {
  const providerRef = useRef<Provider | null>(null);
  const currentSlideIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!slideId) {
      return;
    }

    // If we're already connected to this slide, don't reconnect
    if (currentSlideIdRef.current === slideId) {
      return;
    }

    // Disconnect from previous slide if any
    if (currentSlideIdRef.current) {
      disconnectSlideProvider(currentSlideIdRef.current);
    }

    console.log(`[Slides] Connecting to slide: ${slideId}`);
    const slideProvider = getSlideProvider(slideId);
    providerRef.current = slideProvider.provider as unknown as Provider;
    currentSlideIdRef.current = slideId;

    // Cleanup on unmount
    return () => {
      if (currentSlideIdRef.current) {
        disconnectSlideProvider(currentSlideIdRef.current);
        currentSlideIdRef.current = null;
      }
    };
  }, [slideId]);

  return providerRef.current;
}
