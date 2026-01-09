import type { OffscreenSlideCaptureOptions } from "../components/OffscreenSlideRenderer";

export type PdfExportPreset = "screen" | "high" | "print";

// Explicit preset -> capture options mapping.
// Goal: keep Screen exports small/fast while keeping High/Print crisp.
export function getPdfExportCaptureOptions(preset: PdfExportPreset): OffscreenSlideCaptureOptions {
  switch (preset) {
    case "screen":
      return {
        imageFormat: "jpeg",
        pixelRatio: 1,
        jpegQuality: 0.78,
      };
    case "high":
      return {
        imageFormat: "jpeg",
        pixelRatio: 2,
        jpegQuality: 0.9,
      };
    case "print":
      return {
        imageFormat: "png",
        pixelRatio: 3,
      };
    default:
      return {
        imageFormat: "jpeg",
        pixelRatio: 2,
        jpegQuality: 0.9,
      };
  }
}
