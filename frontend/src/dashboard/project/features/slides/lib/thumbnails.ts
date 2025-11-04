// lib/thumbnails.ts - Thumbnail generation and upload utilities
import html2canvas from "html2canvas";
import { uploadData } from 'aws-amplify/storage';

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
 * @returns Public S3 URL of the uploaded thumbnail
 */
export async function generateAndUploadThumbnail(
  element: HTMLElement,
  projectId: string,
  slideId: string
): Promise<string | null> {
  try {
    const canvas = await html2canvas(element, {
      background: "#fff",
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

    return getCdnUrl(key);
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
  projectId: string
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
        return await generateAndUploadThumbnail(container, projectId, slideId);
      }

      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    return await generateAndUploadThumbnail(editorElement, projectId, slideId);
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
  projectId: string
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
        return await generateAndUploadThumbnail(container, projectId, slideId);
      }

      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    return await generateAndUploadThumbnail(editorElement, projectId, slideId);
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
  options?: { width?: number; height?: number; scale?: number }
): Promise<void> {
  try {
    let thumbnailUrl: string | null;
    if (options?.width && options?.height) {
      thumbnailUrl = await generateSlideThumbnailWithSize(slideId, projectId);
    } else {
      thumbnailUrl = await generateSlideThumbnail(slideId, projectId);
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