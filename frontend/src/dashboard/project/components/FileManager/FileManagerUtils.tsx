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

export const getThumbnailUrl = (url: string, key: string) => {
  if (!url || url.startsWith("blob:")) return url;

  const [decodedKey] = fileUrlsToKeys([url]);
  if (!decodedKey) {
    return normalizeFileUrl(url);
  }

  const thumbnailKey = decodedKey.replace(`/${key}/`, `/${key}_thumbnails/`);
  if (thumbnailKey === decodedKey) {
    return normalizeFileUrl(url);
  }

  return normalizeFileUrl(getFileUrl(thumbnailKey));
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
  return Boolean(ext && ["jpg", "jpeg", "png"].includes(ext));
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









