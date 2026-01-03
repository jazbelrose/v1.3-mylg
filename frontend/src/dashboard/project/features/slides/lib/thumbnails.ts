// lib/thumbnails.ts - Thumbnail generation and upload utilities
import { toBlob } from 'html-to-image';
import { uploadData } from 'aws-amplify/storage';
import { getFileUrl, THUMBNAILS_URL, apiFetch } from '@/shared/utils/api';
import React from 'react';
import { createRoot } from 'react-dom/client';
import SlideReadOnlyRenderer from '../components/SlideReadOnlyRenderer';
import { isUiThumbsEnabled } from './featureFlags';

const NATIVE_SLIDE_WIDTH = 1920;
const NATIVE_SLIDE_HEIGHT = 1080;
const DEFAULT_THUMB_WIDTH = 320;
const DEFAULT_THUMB_HEIGHT = 180;

function isJsdomEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

function resolveThumbnailCaptureRoot(element: HTMLElement): HTMLElement {
  return (
    (element.closest('.slide-editor__canvas-inner') as HTMLElement | null) ??
    (element.closest('.slide-editor__slide-frame') as HTMLElement | null) ??
    element
  );
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * Wait for all images in a DOM tree to load (or fail).
 * This includes both img elements and background images.
 * @param root - The root element to search for images
 * @param timeoutMs - Maximum time to wait for images (default 5000ms)
 */
async function waitForImagesToLoad(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  if (typeof document === 'undefined') return;

  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];

  // Also find elements with background images (picture frames, slide backgrounds).
  // Include the root element's computed background image as well (not always inline).
  const bgImageElements = Array.from(root.querySelectorAll('[style*="background-image"]')) as HTMLElement[];
  const rootComputedBg = typeof window !== 'undefined' ? window.getComputedStyle(root).backgroundImage : '';

  const imagePromises: Promise<void>[] = [];
  
  // Wait for img elements
  images.forEach((img) => {
    // Skip images without a src
    if (!img.src) return;
    
    imagePromises.push(
      (async () => {
        if (img.complete && img.naturalWidth > 0) {
          try {
            if (typeof img.decode === 'function') {
              await img.decode();
            }
          } catch {
            // ignore decode failures; onload already happened
          }
          return;
        }

        await new Promise<void>((resolve) => {
          const onDone = () => {
            img.removeEventListener('load', onDone);
            img.removeEventListener('error', onDone);
            resolve();
          };
          img.addEventListener('load', onDone);
          img.addEventListener('error', onDone);
        });

        try {
          if (typeof img.decode === 'function') {
            await img.decode();
          }
        } catch {
          // ignore
        }
      })()
    );
  });
  
  // Wait for background images by preloading them
  const preloadBgImage = (bgImage: string) => {
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (!urlMatch || !urlMatch[1]) return;
    const url = urlMatch[1];
    imagePromises.push(
      new Promise<void>((resolve) => {
        const preloadImg = new Image();
        preloadImg.decoding = 'async';
        preloadImg.onload = () => resolve();
        preloadImg.onerror = () => resolve();
        preloadImg.src = url;
        if (preloadImg.complete) resolve();
      })
    );
  };

  if (rootComputedBg && rootComputedBg !== 'none') {
    preloadBgImage(rootComputedBg);
  }

  bgImageElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      preloadBgImage(bgImage);
    }
  });
  
  if (imagePromises.length === 0) return;

  await Promise.race([
    Promise.all(imagePromises),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function downscalePngBlob(
  blob: Blob,
  targetWidth: number,
  targetHeight: number,
  backgroundColor: string
): Promise<Blob> {
  if (typeof document === 'undefined') return blob;

  // Prefer createImageBitmap when available (faster + avoids DOM image decode quirks).
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      const out = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      return out ?? blob;
    } finally {
      bitmap.close?.();
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve) => {
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
        resolve();
      };
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    return out ?? blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function prepareNodeForThumbnailCapture(root: HTMLElement) {
  const touched: Array<{
    el: HTMLElement;
    overflow: string;
    scrollTop: number;
    scrollLeft: number;
  }> = [];

  const svgReplacements: Array<{
    parent: Node;
    original: SVGElement;
    replacement: HTMLImageElement;
  }> = [];

  // Target textbox elements which have overflow: auto by default
  const nodes = root.querySelectorAll<HTMLElement>('.editor-textbox');

  nodes.forEach((el) => {
    touched.push({
      el,
      overflow: el.style.overflow,
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
    });

    // kill scrollbars for the capture (this is what removes them)
    el.style.overflow = 'hidden';

    // optional: ensure we capture from the top-left of the text
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });

  // also ensure the root itself doesn't show scrollbars in the snapshot
  const rootPrevOverflow = root.style.overflow;
  root.style.overflow = 'hidden';
  const body = typeof document !== "undefined" ? document.body : null;
  body?.classList.add("thumbnail-capture");

  // Workaround: html-to-image can fail to rasterize inline <svg> reliably across browsers.
  // Convert them to <img src="data:image/svg+xml,..."> for the duration of the capture.
  const svgs = root.querySelectorAll<SVGElement>('svg');
  svgs.forEach((svgEl) => {
    const parent = svgEl.parentNode;
    if (!parent) return;
    try {
      const serialized = new XMLSerializer().serializeToString(svgEl);
      if (!serialized || !serialized.includes('<svg')) return;
      const img = document.createElement('img');
      img.decoding = 'async';
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      parent.replaceChild(img, svgEl);
      svgReplacements.push({ parent, original: svgEl, replacement: img });
    } catch {
      // If serialization fails, keep the original SVG.
    }
  });

  return () => {
    body?.classList.remove("thumbnail-capture");
    root.style.overflow = rootPrevOverflow;
    for (const { parent, original, replacement } of svgReplacements) {
      try {
        if (parent.contains(replacement)) {
          parent.replaceChild(original, replacement);
        }
      } catch {
        // ignore best-effort restore
      }
    }
    for (const t of touched) {
      t.el.style.overflow = t.overflow;
      t.el.scrollTop = t.scrollTop;
      t.el.scrollLeft = t.scrollLeft;
    }
  };
}

const SLIDE_CAPTURE_SELECTORS = [
  ".slide-editor__slide-frame",
  ".slide-editor__canvas-inner",
  ".ContentEditable__root",
  ".editor-input",
  "[contenteditable=\"true\"]",
];

type SlideCaptureResult = {
  element: HTMLElement | null;
  container: HTMLElement | null;
};

async function locateSlideCaptureElement(
  slideId: string,
  attempts = 12,
  delay = 100
): Promise<SlideCaptureResult> {
  if (typeof document === "undefined") {
    return { element: null, container: null };
  }

  const rootSelector = `[data-slide-id="${slideId}"]`;
  
  for (let attempt = 0; attempt < attempts; attempt++) {
    const container = document.querySelector(rootSelector) as HTMLElement | null;
    
    if (container) {
      for (const selector of SLIDE_CAPTURE_SELECTORS) {
        const target = container.querySelector(selector) as HTMLElement | null;
        if (target) {
          // Found the element - wait a bit more for React to finish rendering children
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { element: target, container };
        }
      }
    }
    
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Last attempt - return whatever container we can find
  const container = document.querySelector(rootSelector) as HTMLElement | null;
  return { element: container, container };
}

/**
 * Ensure all images in the clone have their sources properly copied from the original element.
 * This handles cases where React-rendered images have their src set via state/props
 * and may not be in the DOM attribute when cloned.
 */
function syncImageSources(original: HTMLElement, clone: HTMLElement): void {
  const originalImages = Array.from(original.querySelectorAll('img')) as HTMLImageElement[];
  const cloneImages = Array.from(clone.querySelectorAll('img')) as HTMLImageElement[];
  
  // Match images by index (assumes same structure)
  for (let i = 0; i < Math.min(originalImages.length, cloneImages.length); i++) {
    const origImg = originalImages[i];
    const cloneImg = cloneImages[i];
    
    // Get the best available source from the original image
    const bestSrc = origImg.currentSrc || origImg.src || origImg.getAttribute('src') || '';
    
    // Determine if this is a network image (needs CORS handling)
    // Only force CORS for URLs that actually go over the network (http/https or protocol-relative)
    const isNetworkSrc =
      typeof bestSrc === 'string' &&
      (/^https?:\/\//i.test(bestSrc) || bestSrc.startsWith('//'));
    
    // IMPORTANT: Set crossorigin BEFORE setting src to prevent canvas tainting.
    // If original had crossorigin, copy it; otherwise default to "anonymous" for network images.
    if (isNetworkSrc) {
      const origCross = origImg.getAttribute('crossorigin');
      const desired = origCross || 'anonymous';
      
      if (!cloneImg.hasAttribute('crossorigin')) {
        cloneImg.setAttribute('crossorigin', desired);
      }
      // Also set the DOM property (helps in some browsers/libraries)
      (cloneImg as HTMLImageElement).crossOrigin = desired;
    }
    
    // Now sync the src (after crossorigin is set)
    if (bestSrc && (!cloneImg.src || cloneImg.src !== bestSrc)) {
      cloneImg.src = bestSrc;
    }
    
    // Mark loaded status for debugging
    if (origImg.complete && origImg.naturalWidth > 0) {
      cloneImg.setAttribute('data-loaded', 'true');
    }
  }
  
  // Also sync background images from computed styles
  const originalElements = Array.from(original.querySelectorAll('*')) as HTMLElement[];
  const cloneElements = Array.from(clone.querySelectorAll('*')) as HTMLElement[];
  
  for (let i = 0; i < Math.min(originalElements.length, cloneElements.length); i++) {
    const origEl = originalElements[i];
    const cloneEl = cloneElements[i];
    
    const computedStyle = window.getComputedStyle(origEl);
    const bgImage = computedStyle.backgroundImage;
    
    if (bgImage && bgImage !== 'none' && !cloneEl.style.backgroundImage) {
      cloneEl.style.backgroundImage = bgImage;
      cloneEl.style.backgroundSize = computedStyle.backgroundSize;
      cloneEl.style.backgroundPosition = computedStyle.backgroundPosition;
      cloneEl.style.backgroundRepeat = computedStyle.backgroundRepeat;
    }
  }
}

async function captureElementBlob(
  element: HTMLElement,
  width: number,
  height: number,
  backgroundColor: string,
  retryCount = 3
): Promise<Blob | null> {
  if (!element) return null;

  if (typeof document === "undefined") return null;

  const captureRoot = resolveThumbnailCaptureRoot(element);

  // CRITICAL: Wait for images in the ORIGINAL element to load BEFORE cloning.
  // This ensures picture frame images are fully loaded before we capture.
  await waitForImagesToLoad(captureRoot, 5000);
  
  // Give React an extra moment to update any state after images load
  await nextAnimationFrame();
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Capture from a clean, offscreen clone so parent transforms (zoom/fit scaling)
  // don't affect layout/position in the snapshot.
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.backgroundColor = backgroundColor;
  host.style.overflow = 'hidden';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';

  const clone = captureRoot.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  // These are separate properties in modern CSS; safe no-ops elsewhere.
  clone.style.translate = '0 0';
  clone.style.scale = '1';
  // zoom is non-standard but can exist in some engines.
  clone.style.zoom = '1';
  clone.style.transformOrigin = '0 0';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = 'none';
  clone.style.maxHeight = 'none';
  clone.style.margin = '0';
  clone.style.position = 'relative';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.boxSizing = 'border-box';
  clone.style.overflow = 'hidden';

  host.appendChild(clone);
  document.body.appendChild(host);

  // Sync image sources from original to clone (handles React-rendered images)
  syncImageSources(captureRoot, clone);

  // Give the browser a beat to lay out the clone before snapshotting.
  await nextAnimationFrame();
  await nextAnimationFrame();

  const restore = prepareNodeForThumbnailCapture(clone);
  let lastError: unknown = null;
  
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      await waitForImagesToLoad(clone, 5000);
      
      // Additional wait on retry attempts to allow images more time to load
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        // Re-sync images on retry in case they loaded in the original
        syncImageSources(captureRoot, clone);
        await waitForImagesToLoad(clone, 5000);
      }
      
      const blob = await toBlob(clone, {
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        backgroundColor,
        quality: 0.92,
        includeQueryParams: true,
        cacheBust: true,
        pixelRatio: 1,
      });
      
      if (blob && blob.size > 1000) {
        // Success - got a meaningful blob
        restore();
        host.remove();
        return blob;
      }
      
      // Blob too small, might be empty - retry
      lastError = new Error('Thumbnail blob too small, likely failed to capture content');
    } catch (error) {
      lastError = error;
      console.warn(`Thumbnail capture attempt ${attempt + 1} failed:`, error);
    }
    
    // Wait before retry
    if (attempt < retryCount) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  
  console.error("Failed to capture thumbnail element after retries:", lastError);
  restore();
  host.remove();
  return null;
}

// Local thumbnail cache using IndexedDB
const DB_NAME = 'slides-thumbnails';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

// Cache management constants
const MAX_CACHE_ENTRIES = 200; // Maximum number of cached thumbnails per project
const MAX_CACHE_SIZE_MB = 150; // Maximum cache size in MB

// Cache key format: slides:<projectId>:<slideId>:<contentHash>:<bgColorHash>
const makeCacheKey = (
  projectId: string,
  slideId: string,
  contentHash: string,
  bgColorHash: string,
  bgImageHash: string
) => `slides:${projectId}:${slideId}:${contentHash}:${bgColorHash}:${bgImageHash}`;

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

export async function hashBackgroundImage(backgroundImage: string): Promise<string> {
  if (!backgroundImage) return 'none';
  const encoder = new TextEncoder();
  const data = encoder.encode(backgroundImage);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
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
  backgroundColor: string = '#101112',
  backgroundImage?: string | null
): Promise<Blob | null> {
  if (typeof document === "undefined") {
    return null;
  }
  if (typeof document !== "undefined") {
    const { element, container: slideContainer } = await locateSlideCaptureElement(slideId);
    if (element) {
      const capturedBlob = await captureElementBlob(element, width, height, backgroundColor);
      if (capturedBlob) {
        return capturedBlob;
      }
      console.warn(`Thumbnail capture: failed to capture slide ${slideId}, falling back to placeholder render.`);
    } else if (slideContainer) {
      console.warn(`Thumbnail capture: editor element not found for slide ${slideId}, falling back to placeholder render.`);
    }
  }

  // True offscreen render for slides that were never mounted in the editor DOM.
  // This is critical for stable thumbnails: relying on locateSlideCaptureElement()
  // only works for visited slides.
  // Avoid rendering Lexical in unit tests (jsdom) — it is heavy and may not be fully supported there.
  if (isJsdomEnvironment()) {
    console.warn(`Thumbnail capture: skipping Lexical offscreen render in jsdom for slide ${slideId}`);
  } else {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.backgroundColor = backgroundColor;
  container.style.overflow = 'hidden';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';

  if (backgroundImage) {
    container.style.backgroundImage = `url(${getFileUrl(backgroundImage)})`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';
  }

  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    root.render(
      React.createElement(
        'div',
        {
          style: {
            width: '100%',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
          },
        },
        React.createElement(SlideReadOnlyRenderer, { content, contentPadding: '96px 120px' })
      )
    );

    await nextAnimationFrame();
    await nextAnimationFrame();
    await waitForImagesToLoad(container, 8000);

    const capturedBlob = await captureElementBlob(container, width, height, backgroundColor);
    if (capturedBlob) {
      return capturedBlob;
    }
  } catch (error) {
    console.warn('Thumbnail capture: offscreen React render failed, falling back to placeholder render:', error);
  } finally {
    try {
      root.unmount();
    } catch {
      // ignore
    }
    container.remove();
  }
  }

  // Fallback to simple text representation if capturing the DOM failed
  const placeholder = document.createElement('div');
  placeholder.style.position = 'fixed';
  placeholder.style.left = '-10000px';
  placeholder.style.top = '0';
  placeholder.style.width = `${width}px`;
  placeholder.style.height = `${height}px`;
  placeholder.style.backgroundColor = backgroundColor;
  placeholder.style.overflow = 'hidden';
  placeholder.style.zIndex = '-1';
  placeholder.setAttribute('data-slide-id', slideId);

  try {
    const titleMatch = content.match(/"text":"([^"]+)"/);
    const slideText = titleMatch ? titleMatch[1] : 'Slide content';
    placeholder.innerHTML = `
      <div style="width: 100%; height: 100%; padding: 40px; font-family: Arial, sans-serif; font-size: 24px; line-height: 1.4; display: flex; align-items: center; justify-content: center; text-align: center;">
        <div style="max-width: 1600px;">
          ${slideText.substring(0, 200)}${slideText.length > 200 ? '...' : ''}
        </div>
      </div>
    `;
  } catch (error) {
    console.warn('Failed to parse slide content for thumbnail:', error);
    placeholder.innerHTML = `
      <div style="width: 100%; height: 100%; padding: 40px; font-family: Arial, sans-serif; font-size: 24px; line-height: 1.4; display: flex; align-items: center; justify-content: center; color: #666;">
        Slide ${slideId}
      </div>
    `;
  }

  document.body.appendChild(placeholder);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const blob = await toBlob(placeholder, {
          canvasWidth: width,
          canvasHeight: height,
          backgroundColor,
          quality: 0.92,
          includeQueryParams: true,
        });
        if (blob) {
          return blob;
        }
      } catch (error) {
        lastError = error;
        if (attempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }
    }

    console.error('Failed to render thumbnail offscreen:', lastError);

    // Valid 1x1 transparent PNG (base64) as a last-resort placeholder.
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XGZ0sAAAAASUVORK5CYII=';
    let bytes: ArrayBuffer;
    if (typeof atob === 'function') {
      const binary = atob(b64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        arr[i] = binary.charCodeAt(i);
      }
      bytes = arr.buffer;
    } else {
      bytes = new ArrayBuffer(0);
    }
    return new Blob([bytes], { type: 'image/png' });
  } catch (error) {
    console.error('Failed to render thumbnail offscreen:', error);
    return new Blob([], { type: 'image/png' });
  } finally {
    placeholder.remove();
  }
}

// Main function: get or render thumbnail locally
export async function getOrRenderThumb({
  projectId,
  slideId,
  content,
  backgroundImage,
  width = 1920,
  height = 1080,
  backgroundColor = '#101112'
}: {
  projectId: string;
  slideId: string;
  content: string;
  backgroundImage?: string | null;
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
    const bgImageHash = await hashBackgroundImage(backgroundImage ?? '');
    const cacheKey = makeCacheKey(projectId, slideId, contentHash, bgColorHash, bgImageHash);
    
    // Check cache first
    const cachedBlob = await readBlob(cacheKey);
    if (cachedBlob) {
      return toObjectURL(cachedBlob);
    }

    // Avoid duplicate renders for the same cache key
    let renderPromise = inflightRenderMap.get(cacheKey);
    if (!renderPromise) {
      renderPromise = (async () => {
        const blob = await renderThumbnailOffscreen(slideId, content, width, height, backgroundColor, backgroundImage ?? null);
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
  slides: Array<{ id: string; content?: string; backgroundColor?: string; backgroundImage?: string | null }>,
  visibleStart: number = 0,
  visibleEnd: number = slides.length
): Promise<void> {
  if (!isUiThumbsEnabled()) return;
  
  const visibleSlides = slides.slice(Math.max(0, visibleStart - 2), visibleEnd + 2);

  const candidates = visibleSlides.filter((slide) => typeof slide.content === 'string' && slide.content.length > 0);
  if (candidates.length === 0) return;

  let index = 0;
  const concurrency = Math.min(2, candidates.length);

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const slide = candidates[index++];
      if (!slide) return;

      const content = slide.content as string;
      const backgroundColor = slide.backgroundColor || '#101112';
      const backgroundImage = slide.backgroundImage ?? null;
      const hash = await hashContent(content);
      const bgColorHash = await hashBackgroundColor(backgroundColor);
      const bgImageHash = await hashBackgroundImage(backgroundImage ?? '');
      const cacheKey = makeCacheKey(projectId, slide.id, hash, bgColorHash, bgImageHash);

      if (warmInflightKeys.has(cacheKey)) {
        continue;
      }

      warmInflightKeys.add(cacheKey);
      try {
        const url = await getOrRenderThumb({
          projectId,
          slideId: slide.id,
          content,
          backgroundImage,
          backgroundColor,
        });

        if (url) {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.warn(`Failed to warm thumbnail for slide ${slide.id}:`, error);
      } finally {
        warmInflightKeys.delete(cacheKey);
      }
    }
  });

  await Promise.allSettled(workers);
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
    if (typeof document === 'undefined') return null;

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
    
    // Wait for fonts to load
    await document.fonts?.ready;

    const captureRoot = resolveThumbnailCaptureRoot(element);
    const fullSizeBlob =
      (await captureElementBlob(
        captureRoot,
        NATIVE_SLIDE_WIDTH,
        NATIVE_SLIDE_HEIGHT,
        bgColor
      )) ?? null;
    if (!fullSizeBlob) return null;

    // Store thumbnails at 320x180 regardless of current editor zoom/fit scaling.
    const blob = await downscalePngBlob(fullSizeBlob, DEFAULT_THUMB_WIDTH, DEFAULT_THUMB_HEIGHT, bgColor);

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
 * @param backgroundColor - Optional background color
 * @param content - Optional Lexical JSON content for server-side generation
 * @returns Public S3 URL of the uploaded thumbnail
 */
export async function generateSlideThumbnail(
  slideId: string,
  projectId: string,
  backgroundColor?: string,
  content?: string,
  backgroundImage?: string
): Promise<string | null> {
  const timings: Record<string, number> = { start: Date.now() };
  
  // Try server-side thumbnail generation first if content is provided
  if (content) {
    try {
      console.log(`[Thumbnails] Attempting server-side generation for slide ${slideId}${backgroundImage ? ' (with background image)' : ''}`);
      timings.serverStart = Date.now();
      const response = await apiFetch<{ url: string }>(THUMBNAILS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lexicalJson: JSON.parse(content),
          projectId,
          slideId,
          width: 320,
          height: 180,
          backgroundColor,
          backgroundImage,
        }),
      });
      timings.serverDone = Date.now();
      if (response.url) {
        console.log(`[Thumbnails] Server-side generation successful for slide ${slideId} in ${timings.serverDone - timings.serverStart}ms`);
        return response.url;
      }
    } catch (error) {
      console.warn(`[Thumbnails] Server-side generation failed for slide ${slideId}, falling back to client-side:`, error);
    }
  }

  // Fallback to client-side generation
  try {
    const clientStart = Date.now();
    console.log(`[Thumbnails] Starting client-side generation for slide ${slideId}`);
    
    const { element: editorElement, container: slideContainer } = await locateSlideCaptureElement(slideId);
    console.log(`[Thumbnails] Element located in ${Date.now() - clientStart}ms`);
    
    if (!editorElement) {
      if (slideContainer) {
        console.warn(`Editor element not found for slide ${slideId}, falling back to slide container`);
        const result = await generateAndUploadThumbnail(slideContainer, projectId, slideId, backgroundColor);
        console.log(`[Thumbnails] Client-side generation completed in ${Date.now() - clientStart}ms`);
        return result;
      }
      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    if (editorElement === slideContainer && slideContainer) {
      console.warn(`Inner editor element not found for slide ${slideId}, falling back to slide container`);
    }

    const result = await generateAndUploadThumbnail(editorElement, projectId, slideId, backgroundColor);
    console.log(`[Thumbnails] Client-side generation completed in ${Date.now() - clientStart}ms`);
    return result;
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
  backgroundColor?: string,
  content?: string,
  backgroundImage?: string
): Promise<string | null> {
  const timings: Record<string, number> = { start: Date.now() };
  
  // Try server-side thumbnail generation first if content is provided
  if (content) {
    try {
      console.log(`[Thumbnails] Attempting server-side generation for slide ${slideId}${backgroundImage ? ' (with background image)' : ''}`);
      timings.serverStart = Date.now();
      const response = await apiFetch<{ url: string }>(THUMBNAILS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lexicalJson: JSON.parse(content),
          projectId,
          slideId,
          width: 320,
          height: 180,
          backgroundColor,
          backgroundImage,
        }),
      });
      timings.serverDone = Date.now();
      if (response.url) {
        console.log(`[Thumbnails] Server-side generation successful for slide ${slideId} in ${timings.serverDone - timings.serverStart}ms`);
        return response.url;
      }
    } catch (error) {
      console.warn(`[Thumbnails] Server-side generation failed for slide ${slideId}, falling back to client-side:`, error);
    }
  }

  // Fallback to client-side generation
  try {
    const clientStart = Date.now();
    console.log(`[Thumbnails] Starting client-side generation (with size) for slide ${slideId}`);
    
    const { element: editorElement, container: slideContainer } = await locateSlideCaptureElement(slideId);
    console.log(`[Thumbnails] Element located in ${Date.now() - clientStart}ms`);
    
    if (!editorElement) {
      if (slideContainer) {
        console.warn(`Editor element not found for slide ${slideId}, falling back to slide container`);
        const result = await generateAndUploadThumbnail(slideContainer, projectId, slideId, backgroundColor);
        console.log(`[Thumbnails] Client-side generation completed in ${Date.now() - clientStart}ms`);
        return result;
      }
      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    if (editorElement === slideContainer && slideContainer) {
      console.warn(`Inner editor element not found for slide ${slideId}, falling back to slide container`);
    }

    const result = await generateAndUploadThumbnail(editorElement, projectId, slideId, backgroundColor);
    console.log(`[Thumbnails] Client-side generation completed in ${Date.now() - clientStart}ms`);
    return result;
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
 * @param options - Options including content for server-side generation
 */
export async function saveSlideThumb(
  projectId: string,
  slideId: string,
  onSuccess?: (thumbnailUrl: string) => void,
  options?: { width?: number; height?: number; scale?: number; backgroundColor?: string; content?: string; backgroundImage?: string }
): Promise<void> {
  try {
    let thumbnailUrl: string | null;
    if (options?.width && options?.height) {
      thumbnailUrl = await generateSlideThumbnailWithSize(
        slideId,
        projectId,
        options.backgroundColor,
        options.content,
        options.backgroundImage
      );
    } else {
      thumbnailUrl = await generateSlideThumbnail(
        slideId,
        projectId,
        options?.backgroundColor,
        options.content,
        options.backgroundImage
      );
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

export const __thumbsTesting = {
  renderThumbnailOffscreen,
};
