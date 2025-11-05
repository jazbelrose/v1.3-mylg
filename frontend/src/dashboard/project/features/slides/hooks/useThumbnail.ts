// hooks/useThumbnail.ts - Hook for managing local slide thumbnails
import { useState, useEffect, useRef } from 'react';
import { getOrRenderThumb, invalidateThumb } from '../lib/thumbnails';
import { isUiThumbsEnabled } from '../lib/featureFlags';

interface UseThumbnailOptions {
  projectId: string;
  slideId: string;
  content?: string;
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
  width = 1920,
  height = 1080,
}: UseThumbnailOptions): UseThumbnailReturn {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Keep track of current object URL to revoke it when it changes
  const currentUrlRef = useRef<string | null>(null);
  
  // Track current content hash to avoid unnecessary re-renders
  const contentRef = useRef<string | undefined>(content);

  useEffect(() => {
    // Only update if content actually changed
    if (contentRef.current !== content) {
      contentRef.current = content;
      
      // Revoke previous URL
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
      
      setThumbnailUrl(null);
      setError(null);
    }
  }, [content]);

  useEffect(() => {
    if (!isUiThumbsEnabled() || !content || !projectId || !slideId) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getOrRenderThumb({
      projectId,
      slideId,
      content,
      width,
      height,
    })
      .then((url) => {
        if (isMounted) {
          // Revoke previous URL
          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
          }
          
          currentUrlRef.current = url;
          setThumbnailUrl(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load thumbnail:', err);
          setError(err instanceof Error ? err.message : 'Failed to load thumbnail');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, slideId, content, width, height]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  const invalidate = () => {
    invalidateThumb(projectId, slideId).catch((err) => {
      console.warn('Failed to invalidate thumbnail:', err);
    });
    
    // Clear local state
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    
    setThumbnailUrl(null);
    setError(null);
  };

  return {
    thumbnailUrl,
    isLoading,
    error,
    invalidate,
  };
}