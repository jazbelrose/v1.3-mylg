// Hook to manage Yjs provider for a single slide
import { useEffect, useRef, useState } from "react";
import type { Provider } from "@lexical/yjs";
import { createSlideProvider, type SlideProvider } from "../lib/yjs";

/**
 * Hook to manage the Yjs provider for a specific slide.
 * Creates a new provider when slideId changes and cleans up the old one.
 */
export function useSlideProvider(
  projectId: string | undefined,
  slideId: string | undefined
): Provider | null {
  const [provider, setProvider] = useState<Provider | null>(null);
  const slideProviderRef = useRef<SlideProvider | null>(null);

  useEffect(() => {
    // Clean up previous provider if it exists
    if (slideProviderRef.current) {
      slideProviderRef.current.disconnect();
      slideProviderRef.current = null;
      setProvider(null);
    }

    // Don't create a provider if we don't have both IDs
    if (!projectId || !slideId) {
      return;
    }

    console.log(`[useSlideProvider] Creating provider for slide ${slideId}`);

    // Create new provider for this slide
    const slideProvider = createSlideProvider(projectId, slideId);
    slideProviderRef.current = slideProvider;
    setProvider(slideProvider.provider as unknown as Provider);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (slideProviderRef.current) {
        slideProviderRef.current.disconnect();
        slideProviderRef.current = null;
      }
    };
  }, [projectId, slideId]);

  return provider;
}
