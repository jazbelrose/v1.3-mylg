/**
 * ThumbnailCache - In-memory cache for thumbnail load status
 * 
 * Tracks which thumbnails have successfully loaded so they can be
 * rendered instantly when scrolled back into view (no placeholder flash).
 * 
 * Key insight: Once an image is loaded, the browser has it in its cache.
 * We just need to remember to render <img> instead of placeholder.
 */

export type ThumbStatus = 'pending' | 'loaded' | 'error';

interface ThumbCacheEntry {
  status: ThumbStatus;
  loadedAt?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

// Module-level cache (persists across renders/unmounts)
const thumbCache = new Map<string, ThumbCacheEntry>();

// Signed URL cache: maps fileId -> { signedUrl, expiresAt }
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Default TTL for signed URL cache (15 minutes)
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Get the load status of a thumbnail
 */
export function getThumbStatus(key: string): ThumbStatus {
  return thumbCache.get(key)?.status ?? 'pending';
}

/**
 * Check if a thumbnail has been loaded
 */
export function isThumbLoaded(key: string): boolean {
  return thumbCache.get(key)?.status === 'loaded';
}

/**
 * Mark a thumbnail as loaded
 */
export function setThumbLoaded(key: string, naturalWidth?: number, naturalHeight?: number): void {
  thumbCache.set(key, {
    status: 'loaded',
    loadedAt: Date.now(),
    naturalWidth,
    naturalHeight,
  });
}

/**
 * Mark a thumbnail as errored
 */
export function setThumbError(key: string): void {
  thumbCache.set(key, {
    status: 'error',
    loadedAt: Date.now(),
  });
}

/**
 * Get cached entry (for dimensions, etc.)
 */
export function getThumbEntry(key: string): ThumbCacheEntry | undefined {
  return thumbCache.get(key);
}

/**
 * Clear the entire cache (for testing/debugging)
 */
export function clearThumbCache(): void {
  thumbCache.clear();
}

/**
 * Get cache size (for debugging/PerfHUD)
 */
export function getThumbCacheSize(): number {
  return thumbCache.size;
}

/**
 * Get count of loaded thumbs
 */
export function getLoadedThumbCount(): number {
  let count = 0;
  thumbCache.forEach(entry => {
    if (entry.status === 'loaded') count++;
  });
  return count;
}

// ============================================================================
// Signed URL Caching
// ============================================================================

/**
 * Get a stable cache key for a file (prefer fileId, fallback to URL path)
 */
export function getStableCacheKey(url?: string, fileId?: string): string {
  if (fileId) return fileId;
  if (!url) return '';
  
  // Strip query params to get stable key
  try {
    const urlObj = new URL(url, 'https://example.com');
    return urlObj.pathname;
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Cache a signed URL for a file
 */
export function cacheSignedUrl(fileId: string, signedUrl: string, ttlMs: number = SIGNED_URL_TTL_MS): void {
  signedUrlCache.set(fileId, {
    url: signedUrl,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Get cached signed URL if still valid
 */
export function getCachedSignedUrl(fileId: string): string | null {
  const entry = signedUrlCache.get(fileId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    signedUrlCache.delete(fileId);
    return null;
  }
  return entry.url;
}

/**
 * Clear expired signed URLs (call periodically)
 */
export function cleanupSignedUrlCache(): void {
  const now = Date.now();
  signedUrlCache.forEach((entry, key) => {
    if (now > entry.expiresAt) {
      signedUrlCache.delete(key);
    }
  });
}

// Expose for debugging
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { 
    __thumbCache: { 
      getSize: typeof getThumbCacheSize;
      getLoaded: typeof getLoadedThumbCount;
      clear: typeof clearThumbCache;
      get: typeof getThumbStatus;
    } 
  }).__thumbCache = {
    getSize: getThumbCacheSize,
    getLoaded: getLoadedThumbCount,
    clear: clearThumbCache,
    get: getThumbStatus,
  };
}
