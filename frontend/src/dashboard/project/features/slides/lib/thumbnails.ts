// lib/thumbnails.ts - Thumbnail generation and upload utilities
import html2canvas from "html2canvas";
import { uploadData } from 'aws-amplify/storage';
import { getFileUrl } from '@/shared/utils/api';
import { isUiThumbsEnabled } from './featureFlags';

// Local thumbnail cache using IndexedDB
const DB_NAME = 'slides-thumbnails';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

// Cache management constants
const MAX_CACHE_ENTRIES = 200; // Maximum number of cached thumbnails per project
const MAX_CACHE_SIZE_MB = 150; // Maximum cache size in MB

// Cache key format: slides:<projectId>:<slideId>:<contentHash>:<bgColorHash>
const makeCacheKey = (projectId: string, slideId: string, contentHash: string, bgColorHash: string) =>
  `slides:${projectId}:${slideId}:${contentHash}:${bgColorHash}`;

const warmInflightKeys = new Set<string>();
const inflightRenderMap = new Map<string, Promise<Blob | null>>();

// Cache metadata interface
interface CacheEntry {
  key: string;
  projectId: string;
  slideId: string;
  sizeBytes: number;
  lastAccessed: number;
  created: number;
}

// Get cache metadata from IndexedDB
async function getCacheMetadata(): Promise<CacheEntry[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const keysRequest = store.getAllKeys();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      keysRequest.onsuccess = () => resolve(keysRequest.result);
      keysRequest.onerror = () => reject(keysRequest.error);
    });
    
    const metadata: CacheEntry[] = [];
    
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith('slides:')) {
        try {
          const blob = await readBlob(key);
          if (blob) {
            const [, projectId, slideId] = key.split(':');
            metadata.push({
              key,
              projectId,
              slideId,
              sizeBytes: blob.size,
              lastAccessed: Date.now(),
              created: Date.now(), // Approximate
            });
          }
        } catch (error) {
          console.warn('Failed to read cache entry for metadata:', key, error);
        }
      }
    }
    
    return metadata;
  } catch (error) {
    console.warn('Failed to get cache metadata:', error);
    return [];
  }
}

// Clean up old cache entries based on LRU and size limits
async function cleanupCache(projectId?: string): Promise<void> {
  try {
    const metadata = await getCacheMetadata();
    
    // Filter by project if specified
    const relevantEntries = projectId 
      ? metadata.filter(entry => entry.projectId === projectId)
      : metadata;
    
    // Sort by last accessed (LRU)
    relevantEntries.sort((a, b) => a.lastAccessed - b.lastAccessed);
    
    // Calculate total size
    const totalSizeBytes = relevantEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;
    
    const entriesToDelete: string[] = [];
    
    // Remove entries exceeding count limit
    if (relevantEntries.length > MAX_CACHE_ENTRIES) {
      const excessCount = relevantEntries.length - MAX_CACHE_ENTRIES;
      entriesToDelete.push(...relevantEntries.slice(0, excessCount).map(e => e.key));
    }
    
    // Remove entries exceeding size limit
    if (totalSizeBytes > maxSizeBytes) {
      let currentSize = totalSizeBytes;
      for (const entry of relevantEntries) {
        if (currentSize <= maxSizeBytes) break;
        if (!entriesToDelete.includes(entry.key)) {
          entriesToDelete.push(entry.key);
          currentSize -= entry.sizeBytes;
        }
      }
    }
    
    // Delete the entries
    if (entriesToDelete.length > 0) {
      const db = await getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      await Promise.all(entriesToDelete.map(key => 
        new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      ));
      
      console.log(`Cleaned up ${entriesToDelete.length} old thumbnail cache entries`);
    }
  } catch (error) {
    console.warn('Failed to cleanup thumbnail cache:', error);
  }
}

// Initialize IndexedDB
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  return dbPromise;
}

// Generate SHA-1 hash of content for deterministic caching
export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a short hash of backgroundColor for cache key
export async function hashBackgroundColor(color: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(color);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Use only first 8 characters for shorter cache keys
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 8);
}

// Read blob from IndexedDB cache
async function readBlob(key: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn('Failed to read from thumbnail cache:', error);
    return null;
  }
}

// Write blob to IndexedDB cache
async function writeBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const request = store.put(blob, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    // Extract project ID from key and cleanup cache
    const [, projectId] = key.split(':');
    await cleanupCache(projectId);
  } catch (error) {
    console.warn('Failed to write to thumbnail cache:', error);
  }
}

// Create object URL from blob (caller must revoke when done)
function toObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

// Invalidate thumbnail cache for a specific slide
export async function invalidateThumb(projectId: string, slideId: string): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Get all keys and filter for this slide
    const keysRequest = store.getAllKeys();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      keysRequest.onsuccess = () => resolve(keysRequest.result);
      keysRequest.onerror = () => reject(keysRequest.error);
    });
    
    const slideKeys = keys.filter(key => 
      typeof key === 'string' && key.startsWith(`slides:${projectId}:${slideId}:`)
    );
    
    // Delete all matching keys
    await Promise.all(slideKeys.map(key => 
      new Promise<void>((resolve, reject) => {
        const deleteRequest = store.delete(key);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      })
    ));
  } catch (error) {
    console.warn('Failed to invalidate thumbnail cache:', error);
  }
}

// Render thumbnail offscreen with fixed dimensions
async function renderThumbnailOffscreen(
  slideId: string,
  content: string,
  width: number = 1920,
  height: number = 1080,
  backgroundColor: string = '#101112'
): Promise<Blob | null> {
  // Create offscreen container with fixed dimensions
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.backgroundColor = backgroundColor;
  container.style.overflow = 'hidden';
  container.style.zIndex = '-1';
  
  // Add data attribute for targeting
  container.setAttribute('data-slide-id', slideId);
  
  // Try to render slide content, fallback to simple text if parsing fails
  try {
    // For now, create a simple text representation
    // In a real implementation, you'd parse and render the Lexical content
    const titleMatch = content.match(/"text":"([^"]+)"/);
    const slideText = titleMatch ? titleMatch[1] : 'Slide content';
    
    container.innerHTML = `
      <div style="width: 100%; height: 100%; padding: 40px; font-family: Arial, sans-serif; font-size: 24px; line-height: 1.4; display: flex; align-items: center; justify-content: center; text-align: center;">
        <div style="max-width: 1600px;">
          ${slideText.substring(0, 200)}${slideText.length > 200 ? '...' : ''}
        </div>
      </div>
    `;
  } catch (error) {
    console.warn('Failed to parse slide content for thumbnail:', error);
    container.innerHTML = `
      <div style="width: 100%; height: 100%; padding: 40px; font-family: Arial, sans-serif; font-size: 24px; line-height: 1.4; display: flex; align-items: center; justify-content: center; color: #666;">
        Slide ${slideId}
      </div>
    `;
  }
  
  document.body.appendChild(container);
  
  try {
    // Wait for fonts to load
    await document.fonts.ready;
    
    const canvas = await html2canvas(container, {
      width,
      height,
      background: backgroundColor,
      useCORS: true,
    });
    
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.92)
    );
    
    return blob;
  } catch (error) {
    console.error('Failed to render thumbnail offscreen:', error);
    return null;
  } finally {
    // Clean up
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

// Main function: get or render thumbnail locally
export async function getOrRenderThumb({
  projectId,
  slideId,
  content,
  width = 1920,
  height = 1080,
  backgroundColor = '#101112'
}: {
  projectId: string;
  slideId: string;
  content: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
}): Promise<string | null> {
  if (!isUiThumbsEnabled()) {
    // Fallback to server thumbnails if feature flag is off
    return null;
  }
  
  try {
    // Generate content hash and background color hash
    const contentHash = await hashContent(content);
    const bgColorHash = await hashBackgroundColor(backgroundColor);
    const cacheKey = makeCacheKey(projectId, slideId, contentHash, bgColorHash);
    
    // Check cache first
    const cachedBlob = await readBlob(cacheKey);
    if (cachedBlob) {
      return toObjectURL(cachedBlob);
    }

    // Avoid duplicate renders for the same cache key
    let renderPromise = inflightRenderMap.get(cacheKey);
    if (!renderPromise) {
      renderPromise = (async () => {
        const blob = await renderThumbnailOffscreen(slideId, content, width, height, backgroundColor);
        if (!blob) {
          return null;
        }

        await writeBlob(cacheKey, blob);
        return blob;
      })();
      inflightRenderMap.set(cacheKey, renderPromise);
    }

    try {
      const blob = await renderPromise;
      if (!blob) {
        return null;
      }
      return toObjectURL(blob);
    } finally {
      inflightRenderMap.delete(cacheKey);
    }
  } catch (error) {
    console.error('Failed to get or render thumbnail:', error);
    return null;
  }
}

// Manual refresh function for all thumbnails in a project
export async function refreshAllThumbnails(projectId: string): Promise<void> {
  if (!isUiThumbsEnabled()) return;
  
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Get all keys for this project
    const keysRequest = store.getAllKeys();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      keysRequest.onsuccess = () => resolve(keysRequest.result);
      keysRequest.onerror = () => reject(keysRequest.error);
    });
    
    const projectKeys = keys.filter(key => 
      typeof key === 'string' && key.startsWith(`slides:${projectId}:`)
    );
    
    // Delete all project thumbnails
    await Promise.all(projectKeys.map(key => 
      new Promise<void>((resolve, reject) => {
        const deleteRequest = store.delete(key);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      })
    ));
    
    console.log(`Cleared ${projectKeys.length} cached thumbnails for project ${projectId}`);
  } catch (error) {
    console.warn('Failed to refresh thumbnails:', error);
  }
}

// Warm thumbnails for visible range (preload)
export async function warmThumbsForVisibleRange(
  projectId: string,
  slides: Array<{ id: string; content?: string; backgroundColor?: string }>,
  visibleStart: number = 0,
  visibleEnd: number = slides.length
): Promise<void> {
  if (!isUiThumbsEnabled()) return;
  
  const visibleSlides = slides.slice(Math.max(0, visibleStart - 2), visibleEnd + 2);

  const tasks = visibleSlides
    .filter((slide) => typeof slide.content === 'string' && slide.content.length > 0)
    .map(async (slide) => {
      const content = slide.content as string;
      const backgroundColor = slide.backgroundColor || '#101112';
      const hash = await hashContent(content);
      const bgColorHash = await hashBackgroundColor(backgroundColor);
      const cacheKey = makeCacheKey(projectId, slide.id, hash, bgColorHash);

      if (warmInflightKeys.has(cacheKey)) {
        return;
      }

      warmInflightKeys.add(cacheKey);
      try {
        const url = await getOrRenderThumb({
          projectId,
          slideId: slide.id,
          content,
          backgroundColor,
        });

        if (url) {
          // We only needed to ensure the blob is cached, so revoke immediately
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.warn(`Failed to warm thumbnail for slide ${slide.id}:`, error);
      } finally {
        warmInflightKeys.delete(cacheKey);
      }
    });

  await Promise.allSettled(tasks);
}

/**
 * Get CDN URL for an S3 key
 */
export function getCdnUrl(key: string): string {
  const cdnBase = import.meta.env.VITE_FILE_CDN || 'https://mylg-files-v12.s3.us-west-2.amazonaws.com';
  // Ensure the key has the public/ prefix for public access
  const publicKey = key.startsWith('public/') ? key : `public/${key}`;
  
  // Encode the key segments properly
  const encodedKey = publicKey
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/\+/g, '%20'))
    .join('/');
  
  return `${cdnBase}/${encodedKey}`;
}

/**
 * Upload a file to S3 using AWS Amplify Storage
 */
async function uploadFileToS3({
  file,
  key,
  contentType,
}: {
  file: File;
  key: string;
  contentType: string;
}): Promise<string> {
  try {
    await uploadData({
      key,
      data: file,
      options: {
        contentType,
        accessLevel: 'public',
      },
    });

    return key;
  } catch (error) {
    console.error('Failed to upload file to S3:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate and upload thumbnail for a DOM element
 * @param element - The DOM element to capture
 * @param projectId - The project ID
 * @param slideId - The slide ID
 * @param backgroundColor - Optional background color override
 * @returns Public S3 URL of the uploaded thumbnail
 */
export async function generateAndUploadThumbnail(
  element: HTMLElement,
  projectId: string,
  slideId: string,
  backgroundColor?: string
): Promise<string | null> {
  try {
    // Get computed background color from the slide canvas-inner element if not provided
    let bgColor = backgroundColor;
    if (!bgColor) {
      // Try to find the canvas-inner parent element which has the background color
      const canvasInner = element.closest('.slide-editor__canvas-inner') as HTMLElement;
      if (canvasInner) {
        bgColor = window.getComputedStyle(canvasInner).backgroundColor;
      }
      // Fallback to default if still not found
      if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
        bgColor = '#101112';
      }
    }
    
    const canvas = await html2canvas(element, {
      background: bgColor,
      useCORS: true,
    });

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.92)
    );

    if (!blob) return null;

    // Use consistent filename based on slideId with timestamp to avoid caching issues
    // This ensures each save generates a unique filename
    const filename = `slides/${projectId}/${slideId}-${Date.now()}.png`;
    const file = new File([blob], filename, { type: "image/png" });

    const key = await uploadFileToS3({
      file,
      key: filename,
      contentType: "image/png",
    });

  // Normalize the returned URL using the shared helper so the runtime
  // behavior matches how thumbnails are resolved on a full reload.
  // Prefix with `public/` to match persisted keys used elsewhere in the app.
  // Small delay helps avoid rare propagation timing issues with CDN/S3.
  await new Promise((res) => setTimeout(res, 300));
  return getFileUrl(`public/${key}`);
  } catch (error) {
    console.error("Failed to generate and upload thumbnail:", error);
    return null;
  }
}

/**
 * Generate thumbnail from slide content and upload to S3
 * @param slideId - The slide ID to capture
 * @param projectId - The project ID
 * @returns Public S3 URL of the uploaded thumbnail
 */
export async function generateSlideThumbnail(
  slideId: string,
  projectId: string,
  backgroundColor?: string
): Promise<string | null> {
  try {
    // Find the editor content for this slide. Different builds/styles may use
    // different class names for the editable root (e.g. `ContentEditable__root`
    // from some Lexical builds, or our local `editor-input`). Try multiple
    // selectors and do a short retry loop to handle timing/race conditions
    // where the editor hasn't mounted yet when thumbnailing is triggered.
    const selectors = [
      `.ContentEditable__root`,
      `.editor-input`,
      `[contenteditable="true"]`,
    ];

    let editorElement: HTMLElement | null = null;
    const rootSelector = `[data-slide-id="${slideId}"]`;

    // Try immediately and then a few short retries
    for (let attempt = 0; attempt < 6; attempt++) {
      for (const sel of selectors) {
        const q = document.querySelector(`${rootSelector} ${sel}`) as HTMLElement | null;
        if (q) {
          editorElement = q;
          break;
        }
      }
      if (editorElement) break;
      // small backoff before retrying
      await new Promise((res) => setTimeout(res, 50));
    }

    if (!editorElement) {
      // If we couldn't find the inner editor node, try to capture the
      // whole slide container which should have `data-slide-id` applied.
      const container = document.querySelector(rootSelector) as HTMLElement | null;
        if (container) {
        console.warn(`Inner editor element not found for slide ${slideId}, falling back to slide container`);
        return await generateAndUploadThumbnail(container, projectId, slideId, backgroundColor);
      }

      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

  return await generateAndUploadThumbnail(editorElement, projectId, slideId, backgroundColor);
  } catch (error) {
    console.error(`Failed to generate thumbnail for slide ${slideId}:`, error);
    return null;
  }
}

/**
 * Generate a slide thumbnail using explicit dimensions and upload to S3
 */
export async function generateSlideThumbnailWithSize(
  slideId: string,
  projectId: string,
  backgroundColor?: string
): Promise<string | null> {
  try {
    const selectors = [
      `.ContentEditable__root`,
      `.editor-input`,
      `[contenteditable="true"]`,
    ];

    let editorElement: HTMLElement | null = null;
    const rootSelector = `[data-slide-id="${slideId}"]`;

    for (let attempt = 0; attempt < 6; attempt++) {
      for (const sel of selectors) {
        const q = document.querySelector(`${rootSelector} ${sel}`) as HTMLElement | null;
        if (q) {
          editorElement = q;
          break;
        }
      }
      if (editorElement) break;
      await new Promise((res) => setTimeout(res, 50));
    }

    if (!editorElement) {
      // Fallback to container capture when inner editor missing
      const container = document.querySelector(rootSelector) as HTMLElement | null;
      if (container) {
        console.warn(`Inner editor element not found for slide ${slideId}, falling back to slide container`);
        return await generateAndUploadThumbnail(container, projectId, slideId, backgroundColor);
      }

      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    return await generateAndUploadThumbnail(editorElement, projectId, slideId, backgroundColor);
  } catch (error) {
    console.error(`Failed to generate thumbnail for slide ${slideId}:`, error);
    return null;
  }
}

/**
 * Generate and save thumbnail for a slide
 * @param projectId - The project ID
 * @param slideId - The slide ID
 * @param onSuccess - Callback when thumbnail is saved
 */
export async function saveSlideThumb(
  projectId: string,
  slideId: string,
  onSuccess?: (thumbnailUrl: string) => void,
  options?: { width?: number; height?: number; scale?: number; backgroundColor?: string }
): Promise<void> {
  try {
    let thumbnailUrl: string | null;
    if (options?.width && options?.height) {
      thumbnailUrl = await generateSlideThumbnailWithSize(slideId, projectId, options.backgroundColor);
    } else {
      thumbnailUrl = await generateSlideThumbnail(slideId, projectId, options?.backgroundColor);
    }
    if (!thumbnailUrl) {
      console.warn("No thumbnail generated");
      return;
    }

    onSuccess?.(thumbnailUrl);
  } catch (error) {
    console.error("Failed to save slide thumbnail:", error);
  }
}
