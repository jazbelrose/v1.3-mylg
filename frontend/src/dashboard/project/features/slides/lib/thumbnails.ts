// lib/thumbnails.ts - Thumbnail generation utilities
import html2canvas from "html2canvas";

/**
 * Generate a thumbnail from a DOM element
 * @param element - The DOM element to capture
 * @param options - Optional html2canvas options
 * @returns Data URL of the thumbnail image
 */
export async function generateThumbnail(
  element: HTMLElement,
  options?: {
    width?: number;
    height?: number;
    scale?: number;
  }
): Promise<string> {
  try {
    const canvas = await html2canvas(element, {
      scale: options?.scale || 0.5,
      useCORS: true,
      logging: false,
      width: options?.width,
      height: options?.height,
    });

    // Convert canvas to data URL
    return canvas.toDataURL("image/png", 0.8);
  } catch (error) {
    console.error("Failed to generate thumbnail:", error);
    throw error;
  }
}

/**
 * Generate thumbnail from slide content
 * @param slideId - The slide ID to capture
 * @returns Data URL of the thumbnail image
 */
export async function generateSlideThumbnail(slideId: string): Promise<string | null> {
  try {
    // Find the editor content for this slide
    const editorElement = document.querySelector(
      `[data-slide-id="${slideId}"] .ContentEditable__root`
    ) as HTMLElement;

    if (!editorElement) {
      console.warn(`Editor element not found for slide ${slideId}`);
      return null;
    }

    return await generateThumbnail(editorElement, {
      width: 240,
      height: 180,
      scale: 0.5,
    });
  } catch (error) {
    console.error(`Failed to generate thumbnail for slide ${slideId}:`, error);
    return null;
  }
}

/**
 * Upload thumbnail to backend
 * @param projectId - The project ID
 * @param slideId - The slide ID
 * @param dataUrl - The thumbnail data URL
 * @returns URL of the uploaded thumbnail
 */
export async function uploadThumbnail(
  projectId: string,
  slideId: string,
  dataUrl: string
): Promise<string> {
  try {
    // TODO: Replace with actual S3 upload endpoint
    // For now, return the data URL
    // When implementing S3 upload:
    // const blob = await (await fetch(dataUrl)).blob();
    // const uploadedUrl = await uploadToS3(blob, projectId, slideId);
    console.log(`[Slides] Would upload thumbnail for slide ${slideId} in project ${projectId}`);
    
    return dataUrl;
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
  onSuccess?: (thumbnailUrl: string) => void
): Promise<void> {
  try {
    const dataUrl = await generateSlideThumbnail(slideId);
    if (!dataUrl) {
      console.warn("No thumbnail generated");
      return;
    }

    const thumbnailUrl = await uploadThumbnail(projectId, slideId, dataUrl);
    onSuccess?.(thumbnailUrl);
  } catch (error) {
    console.error("Failed to save slide thumbnail:", error);
  }
}
