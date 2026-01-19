import { FaCube, FaDraftingCompass, FaFileAlt, FaFileExcel, FaFilePdf } from "react-icons/fa";
import { SiAdobe, SiHtml5, SiSvg } from "react-icons/si";
import { fileUrlsToKeys, getFileUrl, normalizeFileUrl } from "@/shared/utils/api";
import type { FileItem } from "./FileManagerTypes";

export const encodeS3Key = (key: string = "") =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\+/g, "%20"))
    .join("/");

export const getFileKind = (fileName: string | undefined): string => {
  if (!fileName) return "";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "svg") return "svg";
  if (["html", "htm"].includes(ext)) return "html";
  if (ext === "txt") return "text";
  if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet";
  if (["dwg", "vwx"].includes(ext)) return "drawing";
  if (["c4d", "obj"].includes(ext)) return "model";
  if (["ai", "afdesign"].includes(ext)) return "adobe";
  return ext;
};

/**
 * Get the thumbnail URL for an image file.
 * Thumbnails are stored in a parallel `_thumbnails/` folder structure as WebP.
 * 
 * Example:
 *   Original:  public/projects/abc123/uploads/photo.jpg
 *   Thumbnail: public/projects/abc123/uploads_thumbnails/photo.jpg.webp
 * 
 * @param url - The original file URL
 * @param _folderKey - Deprecated, folder is now auto-detected from URL
 * @returns The thumbnail URL, or undefined if no thumbnail path can be derived
 */
export const getThumbnailUrl = (url: string, _folderKey?: string): string | undefined => {
  if (!url || url.startsWith("blob:")) return undefined;

  const [decodedKey] = fileUrlsToKeys([url]);
  if (!decodedKey) {
    return undefined;
  }

  // Auto-detect the folder from the path
  // Pattern: public/projects/{projectId}/{folderKey}/filename
  // Or: projects/{projectId}/{folderKey}/filename
  const parts = decodedKey.split('/');
  if (parts.length < 3) {
    return undefined;
  }

  // Find the folder that contains the file (second-to-last segment)
  const fileName = parts.pop()!;
  const actualFolderKey = parts.pop()!;
  
  // Skip if already in a _thumbnails folder
  if (actualFolderKey.endsWith('_thumbnails')) {
    return undefined;
  }

  // Build thumbnail path: prefix/{folderKey}_thumbnails/{fileName}.webp
  const prefix = parts.join('/');
  const thumbnailKey = `${prefix}/${actualFolderKey}_thumbnails/${fileName}.webp`;
  
  return normalizeFileUrl(getFileUrl(thumbnailKey));
};

/**
 * Check if a file is an image that would have a generated thumbnail
 */
export const hasGeneratedThumbnail = (fileName: string): boolean => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
};

export const truncateFileName = (fileName?: string, maxLength = 12) => {
  if (!fileName) return "";
  const parts = fileName.split(".");
  if (parts.length < 2) return fileName;
  const extension = parts.pop()!;
  const baseName = parts.join(".");
  if (baseName.length <= maxLength) return `${baseName}.${extension}`;
  return `${baseName.substring(0, maxLength)}(..).${extension}`;
};

export const isPreviewableImage = (file: FileItem) => {
  const ext = file.fileName.split(".").pop()?.toLowerCase();
  return Boolean(ext && ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico"].includes(ext));
};

export const getFilePreviewIcon = (extension: string | undefined) => {
  const ext = extension?.toLowerCase();
  if (!ext) return <FaFileAlt size={50} color="blue" />;
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)) {
    return null;
  }
  if (ext === "pdf") return <FaFilePdf size={50} color="red" />;
  if (ext === "svg") return <SiSvg size={50} color="purple" />;
  if (ext === "html") return <SiHtml5 size={50} color="orange" />;
  if (ext === "txt") return <FaFileAlt size={50} color="gray" />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FaFileExcel size={50} color="green" />;
  if (["dwg", "vwx"].includes(ext)) return <FaDraftingCompass size={50} color="brown" />;
  if (["c4d", "obj"].includes(ext)) return <FaCube size={50} color="purple" />;
  if (["ai", "afdesign"].includes(ext)) return <SiAdobe size={50} color="orange" />;
  return <FaFileAlt size={50} color="blue" />;
};









