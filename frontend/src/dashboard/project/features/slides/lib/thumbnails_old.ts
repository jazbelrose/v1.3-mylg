// lib/thumbnails.ts - Thumbnail generation utilities
import html2canvas from "html2canvas";

// NOTE: we avoid importing/depending on the html2canvas option type here to
// keep this module resilient to differing html2canvas versions.

/**
 * Generate a thumbnail from a DOM element
 * @param element - The DOM element to capture
 * @param options - Optional html2canvas options
 * @returns Blob of the thumbnail image
 */
export async function generateThumbnail(
  element: HTMLElement,
  options?: {
    width?: number;
    height?: number;
    scale?: number;
  }
): Promise<Blob | null> {
    try {
      // Build options for html2canvas. `scale` is intentionally omitted here
      // to satisfy local typing rules; width/height are used to control the
      // output size instead.
      const cfg = {
        useCORS: true,
        logging: false,
        width: options?.width,
        height: options?.height,
    // Keep to width/height only; let html2canvas choose an appropriate scale.
      };

  const canvas = await html2canvas(element, cfg as unknown as Parameters<typeof html2canvas>[1]);

    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/png", 0.92);
    });
  } catch (error) {
    console.error("Failed to generate thumbnail:", error);
    return null;
  }
}

/**
 * Generate thumbnail from slide content
 * @param slideId - The slide ID to capture
 * @returns Blob of the thumbnail image
 */
export async function generateSlideThumbnail(slideId: string): Promise<Blob | null> {
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
      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    // Default to a 16:9 capture at 1280x720 unless callers provide a different
    // size by calling `generateSlideThumbnailWithSize` or `saveSlideThumb`.
    const defaultWidth = 1280;
    const defaultHeight = 720;

    return await generateThumbnail(editorElement, {
      width: defaultWidth,
      height: defaultHeight,
      scale: 1,
    });
  } catch (error) {
    console.error(`Failed to generate thumbnail for slide ${slideId}:`, error);
    return null;
  }
}

/**
 * Generate a slide thumbnail using explicit dimensions (useful when caller
 * wants a different preset like 1920x1080 or scaled thumbnails).
 */
export async function generateSlideThumbnailWithSize(
  slideId: string,
  width: number,
  height: number,
  scale = 1
): Promise<Blob | null> {
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
      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    return await generateThumbnail(editorElement, { width, height, scale });
  } catch (error) {
    console.error(`Failed to generate thumbnail for slide ${slideId}:`, error);
    return null;
  }
}

/**
 * Upload thumbnail to backend
 * @param projectId - The project ID
 * @param slideId - The slide ID
 * @param blob - The thumbnail blob
 * @returns S3 key of the uploaded thumbnail
 */
export async function uploadThumbnail(
  projectId: string,
  slideId: string,
  blob: Blob
): Promise<string> {
  try {
    // Import Storage from Amplify
    const { uploadData } = await import('@aws-amplify/storage');

    // Generate unique filename
    const { v4: uuidv4 } = await import('uuid');
    const filename = `slides/${projectId}/${slideId}-${uuidv4()}.png`;

    // Upload to S3
    const result = await uploadData({
      key: filename,
      data: blob,
      options: {
        contentType: 'image/png',
      },
    });

    // Return the public S3 URL
    const bucket = 'mylg-files-v12'; // From amplifyconfiguration.json
    return `https://${bucket}.s3.us-west-2.amazonaws.com/${filename}`;
  } catch (error) {
    console.error("Failed to upload thumbnail:", error);
    throw error;
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
  options?: { width?: number; height?: number; scale?: number }
): Promise<void> {
  try {
    let blob: Blob | null;
    if (options?.width && options?.height) {
      blob = await generateSlideThumbnailWithSize(slideId, options.width, options.height, options.scale ?? 1);
    } else {
      blob = await generateSlideThumbnail(slideId);
    }
    if (!blob) {
      console.warn("No thumbnail generated");
      return;
    }

    const thumbnailKey = await uploadThumbnail(projectId, slideId, blob);
    onSuccess?.(thumbnailKey);
  } catch (error) {
    console.error("Failed to save slide thumbnail:", error);
  }
}
