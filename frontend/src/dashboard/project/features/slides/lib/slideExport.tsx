// lib/slideExport.ts - Slide export utilities (SVG & PDF)
// Reuses @react-pdf/renderer pattern from budget feature
import React from 'react';
import { toSvg, toPng } from 'html-to-image';
import { pdf as createPdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { Slide } from '@/app/contexts/DataProvider';
import SlidesPdfDocument, { type SlideImageData } from './SlidesPdfDocument';

const NATIVE_SLIDE_WIDTH = 1920;
const NATIVE_SLIDE_HEIGHT = 1080;

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

  // Wait for layout
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  return { host, clone };
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

  // Add metadata for design software compatibility
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

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
  let result = serializer.serializeToString(svg);

  // Clean up and add XML declaration for better compatibility
  result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;

  return result;
}

export interface ExportSvgOptions {
  slideId: string;
  slideTitle?: string;
  backgroundColor?: string;
  enhanceForEditing?: boolean;
}

/**
 * Export a single slide as an editable SVG with proper layers
 */
export async function exportSlideAsSvg(options: ExportSvgOptions): Promise<string | null> {
  const {
    slideId,
    slideTitle = 'Slide',
    backgroundColor = '#101112',
    enhanceForEditing = true,
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

    // Generate SVG
    let svgString = await toSvg(clone, {
      width: NATIVE_SLIDE_WIDTH,
      height: NATIVE_SLIDE_HEIGHT,
      canvasWidth: NATIVE_SLIDE_WIDTH,
      canvasHeight: NATIVE_SLIDE_HEIGHT,
      backgroundColor,
      cacheBust: true,
      skipAutoScale: true,
      // Include foreign objects for text editability
      includeQueryParams: true,
    });

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
 */
export async function exportAndDownloadSlideSvg(
  slideId: string,
  slideTitle: string,
  backgroundColor?: string
): Promise<boolean> {
  const svg = await exportSlideAsSvg({
    slideId,
    slideTitle,
    backgroundColor,
    enhanceForEditing: true,
  });

  if (!svg) {
    return false;
  }

  const sanitizedTitle = (slideTitle || 'Slide').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Slide';
  const filename = `${sanitizedTitle}.svg`;
  downloadFile(svg, filename, 'image/svg+xml');
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
      pixelRatio: 2, // Higher quality for PDF
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
 * Capture all slides as PNG images for PDF generation
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

    const bg = slide.backgroundColor || backgroundColor;
    const pngDataUrl = await captureSlideAsPng(slide.id, bg);

    if (pngDataUrl) {
      results.push({
        slideId: slide.id,
        title: slide.title || `Slide ${i + 1}`,
        imageDataUrl: pngDataUrl,
      });
    }
  }

  return results;
}

/**
 * Export all slides as a PDF document using @react-pdf/renderer
 * Follows the same pattern as budget invoice PDF generation
 */
export async function exportSlidesAsPdf(options: ExportPdfOptions): Promise<Blob | null> {
  const { slides, projectName = 'Presentation', backgroundColor = '#101112', onProgress } = options;

  if (slides.length === 0) {
    console.error('[SlideExport] No slides to export');
    return null;
  }

  try {
    // First capture all slides as PNG images
    const slideImages = await captureAllSlidesAsPng(slides, backgroundColor, onProgress);

    if (slideImages.length === 0) {
      console.error('[SlideExport] No slides could be captured');
      return null;
    }

    // Create PDF using react-pdf/renderer (same pattern as budget invoices)
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
