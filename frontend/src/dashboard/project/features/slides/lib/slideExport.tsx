// lib/slideExport.ts - Slide export utilities (SVG & PDF)
// Reuses @react-pdf/renderer pattern from budget feature
import React from 'react';
import { toSvg, toPng } from 'html-to-image';
import { pdf as createPdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { Slide } from '@/app/contexts/DataProvider';
import { getFileUrl } from '@/shared/utils/api';
import SlidesPdfDocument, { type SlideImageData } from './SlidesPdfDocument';

const NATIVE_SLIDE_WIDTH = 1920;
const NATIVE_SLIDE_HEIGHT = 1080;

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * CSS selectors to find the slide capture root element
 */
const SLIDE_CAPTURE_SELECTORS = [
  '.slide-editor__canvas-inner',
  '.slide-editor__slide-frame',
  '.ContentEditable__root',
];

/**
 * Wait for all images in a DOM tree to load (or fail).
 */
async function waitForImagesToLoad(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  if (typeof document === 'undefined') return;

  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  const bgImageElements = Array.from(root.querySelectorAll('[style*="background-image"]')) as HTMLElement[];

  const imagePromises: Promise<void>[] = [];

  images.forEach((img) => {
    if (!img.src) return;
    imagePromises.push(
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        const onDone = () => {
          img.removeEventListener('load', onDone);
          img.removeEventListener('error', onDone);
          resolve();
        };
        img.addEventListener('load', onDone);
        img.addEventListener('error', onDone);
      })
    );
  });

  bgImageElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch && urlMatch[1]) {
        imagePromises.push(
          new Promise<void>((resolve) => {
            const preloadImg = new Image();
            preloadImg.onload = () => resolve();
            preloadImg.onerror = () => resolve();
            preloadImg.src = urlMatch[1];
            if (preloadImg.complete) resolve();
          })
        );
      }
    }
  });

  if (imagePromises.length === 0) return;

  await Promise.race([
    Promise.all(imagePromises),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Locate the slide capture element within the DOM
 */
async function locateSlideCaptureElement(
  slideId: string,
  attempts = 12,
  delay = 100
): Promise<HTMLElement | null> {
  if (typeof document === 'undefined') return null;

  const rootSelector = `[data-slide-id="${slideId}"]`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const container = document.querySelector(rootSelector) as HTMLElement | null;

    if (container) {
      for (const selector of SLIDE_CAPTURE_SELECTORS) {
        const target = container.querySelector(selector) as HTMLElement | null;
        if (target) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return target;
        }
      }
      // Return container if no inner element found
      return container;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Prepare element for export by creating a clean offscreen clone
 */
async function prepareElementForExport(
  element: HTMLElement,
  width: number,
  height: number,
  backgroundColor: string
): Promise<{ host: HTMLElement; clone: HTMLElement } | null> {
  if (!element || typeof document === 'undefined') return null;

  // Wait for images to load in the original element
  await waitForImagesToLoad(element, 5000);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Create an offscreen container
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

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.translate = '0 0';
  clone.style.scale = '1';
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

  // Sync images from original to clone
  syncImageSources(element, clone);

  // Hide scrollbars on textboxes for clean export
  hideScrollbarsForExport(clone);

  // Wait for layout
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  return { host, clone };
}

/**
 * Hide scrollbars and UI elements for clean export
 * Mirrors the approach used in thumbnails.ts
 */
function hideScrollbarsForExport(root: HTMLElement): void {
  // Target textbox elements which have overflow: auto by default
  const textboxes = root.querySelectorAll<HTMLElement>('.editor-textbox');
  textboxes.forEach((el) => {
    el.style.overflow = 'hidden';
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });

  // Also hide any resize/move/rotate handles
  const handles = root.querySelectorAll<HTMLElement>(
    '.textbox-resize-handle, .textbox-move-handle, .textbox-rotate-handle, .textbox-rotate-handle-line'
  );
  handles.forEach((el) => {
    el.style.display = 'none';
  });

  // Hide any selection outlines
  const selectedElements = root.querySelectorAll<HTMLElement>(
    '.editor-textbox-selected, .editor-textbox-focused'
  );
  selectedElements.forEach((el) => {
    el.classList.remove('editor-textbox-selected', 'editor-textbox-focused');
    el.style.outline = 'none';
    el.style.outlineColor = 'transparent';
  });
}

/**
 * Sync image sources from original to clone (handles React-rendered images)
 */
function syncImageSources(original: HTMLElement, clone: HTMLElement): void {
  const originalImages = Array.from(original.querySelectorAll('img')) as HTMLImageElement[];
  const cloneImages = Array.from(clone.querySelectorAll('img')) as HTMLImageElement[];

  for (let i = 0; i < Math.min(originalImages.length, cloneImages.length); i++) {
    const origImg = originalImages[i];
    const cloneImg = cloneImages[i];

    const bestSrc = origImg.currentSrc || origImg.src || origImg.getAttribute('src') || '';
    if (bestSrc && (!cloneImg.src || cloneImg.src !== bestSrc)) {
      cloneImg.src = bestSrc;
    }

    const crossorigin = origImg.getAttribute('crossorigin');
    if (crossorigin && !cloneImg.hasAttribute('crossorigin')) {
      cloneImg.setAttribute('crossorigin', crossorigin);
    }
  }

  // Sync background images
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

/**
 * Generate unique layer IDs and group names for editable SVG export
 * This creates properly named groups/layers for Affinity Designer, Illustrator, etc.
 */
function enhanceSvgForEditability(svgString: string, slideTitle: string): string {
  // Parse the SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.documentElement;

  // Only add xmlns attributes if not already present (to avoid duplication error)
  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  if (!svg.getAttribute('xmlns:xlink')) {
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }

  // Add a title element
  const existingTitle = svg.querySelector('title');
  if (existingTitle) {
    existingTitle.textContent = slideTitle;
  } else {
    const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = slideTitle;
    svg.insertBefore(title, svg.firstChild);
  }

  // Process foreignObject elements (contains HTML content from Lexical editor)
  const foreignObjects = svg.querySelectorAll('foreignObject');
  foreignObjects.forEach((fo, i) => {
    fo.setAttribute('id', `content-layer-${i + 1}`);
    fo.setAttribute('data-name', `Content Layer ${i + 1}`);
  });

  // Process image elements and wrap them in named groups
  const images = svg.querySelectorAll('image');
  images.forEach((img, i) => {
    const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', `image-layer-${i + 1}`);
    group.setAttribute('data-name', `Image ${i + 1}`);
    group.setAttribute('class', 'editable-layer');
    
    img.parentNode?.insertBefore(group, img);
    group.appendChild(img);
  });

  // Process text elements
  const textElements = svg.querySelectorAll('text');
  textElements.forEach((text, i) => {
    if (!text.getAttribute('id')) {
      text.setAttribute('id', `text-${i + 1}`);
    }
    text.setAttribute('data-name', `Text ${i + 1}`);
    text.setAttribute('class', 'editable-text');
  });

  // Wrap the main content in a named group
  const children = Array.from(svg.childNodes).filter(
    (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName !== 'defs' && (n as Element).tagName !== 'title'
  );

  if (children.length > 0) {
    const mainGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.setAttribute('id', 'slide-content');
    mainGroup.setAttribute('data-name', slideTitle || 'Slide Content');
    
    children.forEach((child) => {
      mainGroup.appendChild(child);
    });
    svg.appendChild(mainGroup);
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  const result = serializer.serializeToString(svg);

  return result;
}

export interface ExportSvgOptions {
  slideId: string;
  slideTitle?: string;
  backgroundColor?: string;
  enhanceForEditing?: boolean;
  /**
   * When true, creates a rasterized SVG that embeds a PNG image.
   * This is compatible with design software like Affinity Designer
   * which doesn't support foreignObject (HTML content in SVG).
   * Default: false (produces native SVG with foreignObject for Chrome/browser viewing)
   */
  rasterizeForDesignSoftware?: boolean;
}

/**
 * Export a single slide as SVG.
 * - Default: browser-native SVG (may include foreignObject).
 * - rasterizeForDesignSoftware: wraps a high-res PNG for maximum compatibility.
 */
export async function exportSlideAsSvg(options: ExportSvgOptions): Promise<string | null> {
  const {
    slideId,
    slideTitle = 'Slide',
    backgroundColor = '#101112',
    enhanceForEditing = true,
    rasterizeForDesignSoftware = false,
  } = options;

  const element = await locateSlideCaptureElement(slideId);
  if (!element) {
    console.error('[SlideExport] Could not find slide element for export');
    return null;
  }

  const prepared = await prepareElementForExport(
    element,
    NATIVE_SLIDE_WIDTH,
    NATIVE_SLIDE_HEIGHT,
    backgroundColor
  );

  if (!prepared) {
    console.error('[SlideExport] Could not prepare element for export');
    return null;
  }

  const { host, clone } = prepared;

  try {
    // Wait for fonts
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await waitForImagesToLoad(clone, 3000);

    // If rasterizing for design software, create a PNG-embedded SVG
    // This is compatible with Affinity Designer, Illustrator, etc.
    if (rasterizeForDesignSoftware) {
      const pngDataUrl = await toPng(clone, {
        width: NATIVE_SLIDE_WIDTH,
        height: NATIVE_SLIDE_HEIGHT,
        canvasWidth: NATIVE_SLIDE_WIDTH,
        canvasHeight: NATIVE_SLIDE_HEIGHT,
        backgroundColor,
        cacheBust: true,
        pixelRatio: 4, // High resolution
        quality: 1.0,
        skipAutoScale: true,
      });

      // Create an SVG that wraps the PNG image
      // This is fully compatible with all design software
      const safeTitleText = escapeXmlText(slideTitle);
      const safeTitleAttr = escapeXmlAttr(slideTitle);
      const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
      width="${NATIVE_SLIDE_WIDTH}" height="${NATIVE_SLIDE_HEIGHT}" 
      viewBox="0 0 ${NATIVE_SLIDE_WIDTH} ${NATIVE_SLIDE_HEIGHT}">
  <title>${safeTitleText}</title>
  <g id="slide-content" data-name="${safeTitleAttr}">
    <image id="slide-image" data-name="Slide Background" 
           width="${NATIVE_SLIDE_WIDTH}" height="${NATIVE_SLIDE_HEIGHT}" 
           href="${pngDataUrl}" xlink:href="${pngDataUrl}"/>
  </g>
</svg>`;
      return svgString;
    }

    // Generate native SVG with foreignObject (browser-compatible)
    const svgDataUrl = await toSvg(clone, {
      width: NATIVE_SLIDE_WIDTH,
      height: NATIVE_SLIDE_HEIGHT,
      canvasWidth: NATIVE_SLIDE_WIDTH,
      canvasHeight: NATIVE_SLIDE_HEIGHT,
      backgroundColor,
      cacheBust: true,
      skipAutoScale: true,
      includeQueryParams: true,
    });

    // Decode the data URL to get raw SVG string
    // Format: data:image/svg+xml;charset=utf-8,<encoded-svg>
    let svgString: string;
    if (svgDataUrl.startsWith('data:image/svg+xml')) {
      const commaIndex = svgDataUrl.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('Invalid SVG data URL format');
      }
      const encoded = svgDataUrl.substring(commaIndex + 1);
      // Decode URI-encoded SVG
      svgString = decodeURIComponent(encoded);
    } else {
      svgString = svgDataUrl;
    }

    // Enhance the SVG for editing in design software
    if (enhanceForEditing) {
      svgString = enhanceSvgForEditability(svgString, slideTitle);
    }

    return svgString;
  } catch (error) {
    console.error('[SlideExport] SVG export failed:', error);
    return null;
  } finally {
    host.remove();
  }
}

/**
 * Download a string as a file
 */
export function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export a single slide and download as SVG
 * @param rasterize - If true, embeds a high-res PNG (works in all software but no layers). If false, uses foreignObject (has layers but may not display in Affinity/Illustrator)
 */
export async function exportAndDownloadSlideSvg(
  slideId: string,
  slideTitle: string,
  backgroundColor?: string,
  rasterize: boolean = false
): Promise<boolean> {
  const svg = await exportSlideAsSvg({
    slideId,
    slideTitle,
    backgroundColor,
    enhanceForEditing: true,
    rasterizeForDesignSoftware: rasterize,
  });

  if (!svg) {
    return false;
  }

  const sanitizedTitle = (slideTitle || 'Slide').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Slide';
  const filename = `${sanitizedTitle}.svg`;
  downloadFile(svg, filename, 'image/svg+xml');
  return true;
}

/**
 * Export a single slide and download as high-resolution PNG
 * This is universally compatible with all design software
 */
export async function exportAndDownloadSlidePng(
  slideId: string,
  slideTitle: string,
  backgroundColor?: string
): Promise<boolean> {
  const dataUrl = await captureSlideAsPng(slideId, backgroundColor || '#101112');
  
  if (!dataUrl) {
    return false;
  }

  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  const sanitizedTitle = (slideTitle || 'Slide').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Slide';
  const filename = `${sanitizedTitle}.png`;
  saveAs(blob, filename);
  return true;
}

export interface ExportPdfOptions {
  slides: Slide[];
  projectName?: string;
  backgroundColor?: string;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Capture a slide element as PNG data URL for PDF embedding
 */
export async function captureSlideAsPng(
  slideId: string,
  backgroundColor: string
): Promise<string | null> {
  const element = await locateSlideCaptureElement(slideId);
  if (!element) {
    console.error('[SlideExport] Could not find slide element for PNG capture');
    return null;
  }

  const prepared = await prepareElementForExport(
    element,
    NATIVE_SLIDE_WIDTH,
    NATIVE_SLIDE_HEIGHT,
    backgroundColor
  );

  if (!prepared) {
    return null;
  }

  const { host, clone } = prepared;

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await waitForImagesToLoad(clone, 3000);

    const dataUrl = await toPng(clone, {
      width: NATIVE_SLIDE_WIDTH,
      height: NATIVE_SLIDE_HEIGHT,
      canvasWidth: NATIVE_SLIDE_WIDTH,
      canvasHeight: NATIVE_SLIDE_HEIGHT,
      backgroundColor,
      cacheBust: true,
      pixelRatio: 4, // 4x resolution for high-quality PDF export
      quality: 1.0, // Maximum PNG quality
      skipAutoScale: true,
    });

    return dataUrl;
  } catch (error) {
    console.error('[SlideExport] PNG capture failed:', error);
    return null;
  } finally {
    host.remove();
  }
}

/**
 * Convert an image URL to a base64 data URL
 */
async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      console.warn('[SlideExport] Failed to fetch image:', url);
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('[SlideExport] Failed to convert image to data URL:', error);
    return null;
  }
}

/**
 * Get the best available image for a slide:
 * 1. Try to capture from DOM (if slide is currently rendered)
 * 2. Fall back to existing thumbnail (high-res if available)
 * 3. Fall back to background image
 */
async function getSlideImage(
  slide: Slide,
  backgroundColor: string
): Promise<string | null> {
  // First try to capture from DOM (only works if slide is currently visible)
  const bg = slide.backgroundColor || backgroundColor;
  const domCapture = await captureSlideAsPng(slide.id, bg);
  if (domCapture) {
    return domCapture;
  }

  // Fall back to existing thumbnail (convert URL to data URL for PDF embedding)
  // Note: thumbnails are lower resolution, but better than nothing for non-visible slides
  if (slide.thumbnail) {
    const thumbnailUrl = getFileUrl(slide.thumbnail);
    const dataUrl = await imageUrlToDataUrl(thumbnailUrl);
    if (dataUrl) {
      console.log(`[SlideExport] Using cached thumbnail for slide ${slide.id}`);
      return dataUrl;
    }
  }

  // Fall back to background image if available
  if (slide.backgroundImage) {
    const bgImageUrl = getFileUrl(slide.backgroundImage);
    const dataUrl = await imageUrlToDataUrl(bgImageUrl);
    if (dataUrl) {
      return dataUrl;
    }
  }

  return null;
}

/**
 * Capture all slides as PNG images for PDF generation
 * Uses DOM capture for the currently visible slide, falls back to thumbnails for others
 * For best quality, ensure slide thumbnails are generated at high resolution
 */
export async function captureAllSlidesAsPng(
  slides: Slide[],
  backgroundColor: string = '#101112',
  onProgress?: (current: number, total: number) => void
): Promise<SlideImageData[]> {
  const results: SlideImageData[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    onProgress?.(i + 1, slides.length);

    const imageDataUrl = await getSlideImage(slide, backgroundColor);

    if (imageDataUrl) {
      results.push({
        slideId: slide.id,
        title: slide.title || `Slide ${i + 1}`,
        imageDataUrl,
      });
    } else {
      console.warn(`[SlideExport] Could not get image for slide ${i + 1}`);
    }
  }

  return results;
}

/**
 * Generate PDF blob from pre-captured slide images
 * This is the preferred method when using OffscreenSlideRenderer
 */
export async function generatePdfFromImages(
  slideImages: SlideImageData[],
  projectName: string = 'Presentation'
): Promise<Blob | null> {
  if (slideImages.length === 0) {
    console.error('[SlideExport] No slide images provided');
    return null;
  }

  try {
    const pdfDocument = React.createElement(SlidesPdfDocument, { 
      slideImages, 
      projectName 
    });
    
    const instance = createPdf(pdfDocument);
    const blob = await instance.toBlob();
    return blob;
  } catch (error) {
    console.error('[SlideExport] PDF generation failed:', error);
    return null;
  }
}

/**
 * Export all slides as a PDF document using @react-pdf/renderer
 * Follows the same pattern as budget invoice PDF generation
 * Note: For best quality, use OffscreenSlideRenderer + generatePdfFromImages instead
 */
export async function exportSlidesAsPdf(options: ExportPdfOptions): Promise<Blob | null> {
  const { slides, projectName = 'Presentation', backgroundColor = '#101112', onProgress } = options;

  if (slides.length === 0) {
    console.error('[SlideExport] No slides to export');
    return null;
  }

  try {
    // Capture all slides as PNG images
    // Uses DOM capture for visible slide, falls back to thumbnails for others
    const slideImages = await captureAllSlidesAsPng(slides, backgroundColor, onProgress);

    if (slideImages.length === 0) {
      console.error('[SlideExport] No slides could be captured');
      return null;
    }

    return generatePdfFromImages(slideImages, projectName);
  } catch (error) {
    console.error('[SlideExport] PDF generation failed:', error);
    return null;
  }
}

/**
 * Export all slides as PDF and download
 */
export async function exportAndDownloadSlidesPdf(
  slides: Slide[],
  projectName: string,
  onProgress?: (current: number, total: number) => void
): Promise<boolean> {
  const pdfBlob = await exportSlidesAsPdf({
    slides,
    projectName,
    onProgress,
  });

  if (!pdfBlob) {
    return false;
  }

  const sanitizedName = (projectName || 'Presentation').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Presentation';
  const filename = `${sanitizedName}.pdf`;
  saveAs(pdfBlob, filename);
  return true;
}
