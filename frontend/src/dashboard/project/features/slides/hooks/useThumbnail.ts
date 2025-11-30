// hooks/useThumbnail.ts - Hook for managing local slide thumbnails
import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrRenderThumb, invalidateThumb, hashContent, hashBackgroundColor } from '../lib/thumbnails';
import { isUiThumbsEnabled } from '../lib/featureFlags';

interface UseThumbnailOptions {
  projectId: string;
  slideId: string;
  content?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
}

interface UseThumbnailReturn {
  thumbnailUrl: string | null;
  isLoading: boolean;
  error: string | null;
  invalidate: () => void;
}

export function useThumbnail({
  projectId,
  slideId,
  content,
  backgroundColor = '#101112',
  width = 1920,
  height = 1080,
}: UseThumbnailOptions): UseThumbnailReturn {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track active object URL so we can revoke it when it is replaced
  const currentUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const lastLoadedRef = useRef<{ hash: string; refreshSeq: number } | null>(null);

  const [refreshSeq, setRefreshSeq] = useState(0);

  const decodeImage = useCallback(async (url: string) => {
    // Ensure the image data is ready before swapping the display URL
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };

      img.onload = () => {
        cleanup();
        resolve();
      };

      img.onerror = () => {
        cleanup();
        reject(new Error('Failed to decode thumbnail image'));
      };

      img.src = url;

      // Some browsers throw if decode() is awaited without onload handlers
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(() => {
            cleanup();
            resolve();
          })
          .catch(() => {
            // Fall back to onload handler
          });
      }
    });
  }, []);

  useEffect(() => {
    if (!isUiThumbsEnabled()) {
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!projectId || !slideId || typeof content !== 'string' || content.length === 0) {
      setIsLoading(false);
      return;
    }

  const currentRefreshSeq = refreshSeq;

    let cancelled = false;

    (async () => {
      try {
        const hash = await hashContent(content);
        if (cancelled) {
          return;
        }

        const alreadyLoaded = lastLoadedRef.current;
        if (alreadyLoaded && alreadyLoaded.hash === hash && alreadyLoaded.refreshSeq === currentRefreshSeq) {
          // Nothing to do; we already have the thumbnail for this hash
          setIsLoading(false);
          return;
        }

        const requestId = ++requestIdRef.current;
        setIsLoading(true);
        setError(null);

        const url = await getOrRenderThumb({
          projectId,
          slideId,
          content,
          backgroundColor,
          width,
          height,
        });

        if (!url) {
          if (requestIdRef.current === requestId && !cancelled) {
            setError('Thumbnail unavailable');
            setIsLoading(false);
          }
          return;
        }

        try {
          await decodeImage(url);
        } catch (decodeError) {
          if (requestIdRef.current === requestId && !cancelled) {
            console.warn('Thumbnail decode failed:', decodeError);
            URL.revokeObjectURL(url);
            setError('Failed to decode thumbnail');
            setIsLoading(false);
          }
          return;
        }

        if (cancelled || requestIdRef.current !== requestId) {
          URL.revokeObjectURL(url);
          return;
        }

        const previousUrl = currentUrlRef.current;
  currentUrlRef.current = url;
        lastLoadedRef.current = { hash, refreshSeq: currentRefreshSeq };
        setThumbnailUrl(url);
        setIsLoading(false);
        setError(null);

        requestAnimationFrame(() => {
          if (previousUrl && previousUrl !== url) {
            URL.revokeObjectURL(previousUrl);
          }
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load thumbnail:', err);
          setError(err instanceof Error ? err.message : 'Failed to load thumbnail');
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, slideId, content, backgroundColor, width, height, refreshSeq, decodeImage]);

  useEffect(() => () => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  }, []);

  const invalidate = useCallback(() => {
    if (!projectId || !slideId) {
      return;
    }

    invalidateThumb(projectId, slideId).catch((err) => {
      console.warn('Failed to invalidate thumbnail:', err);
    });

    lastLoadedRef.current = null;
    setRefreshSeq((seq) => seq + 1);
  }, [projectId, slideId]);

  return {
    thumbnailUrl,
    isLoading,
    error,
    invalidate,
  };
}