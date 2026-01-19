import React from "react";
import { DMFile } from "@/shared/utils/messageUtils";
import { fileUrlsToKeys, getFileUrl, normalizeFileUrl } from "@/shared/utils/api";
import OptimisticImage from "@/shared/ui/OptimisticImage";
import {
  FaFilePdf,
  FaFileExcel,
  FaFileAlt,
  FaDraftingCompass,
  FaCube,
} from "react-icons/fa";
import {
  SiAdobe,
  SiAffinitydesigner,
  SiAffinitypublisher,
  SiSvg,
} from "react-icons/si";

// Cache for thumbnail URLs to avoid recalculation
const thumbnailUrlCache = new Map<string, string>();

/**
 * Get thumbnail URL for an image file.
 * Auto-detects folder from URL path.
 * Thumbnails are WebP format stored in {folderKey}_thumbnails/
 */
export const getThumbnailUrl = (url: string, _folderKey = "chat_uploads"): string => {
  if (!url || url.startsWith("blob:")) return url;

  const normalizedUrl = normalizeFileUrl(url);
  if (thumbnailUrlCache.has(normalizedUrl)) {
    return thumbnailUrlCache.get(normalizedUrl)!;
  }

  const [decodedKey] = fileUrlsToKeys([normalizedUrl]);
  if (!decodedKey) {
    thumbnailUrlCache.set(normalizedUrl, normalizedUrl);
    return normalizedUrl;
  }

  // Auto-detect folder from path: prefix/{folderKey}/filename
  const parts = decodedKey.split('/');
  if (parts.length < 3) {
    thumbnailUrlCache.set(normalizedUrl, normalizedUrl);
    return normalizedUrl;
  }

  const fileName = parts.pop()!;
  const actualFolderKey = parts.pop()!;
  
  // Skip if already in a _thumbnails folder
  if (actualFolderKey.endsWith('_thumbnails')) {
    thumbnailUrlCache.set(normalizedUrl, normalizedUrl);
    return normalizedUrl;
  }

  // Build thumbnail path: prefix/{folderKey}_thumbnails/{fileName}.webp
  const prefix = parts.join('/');
  const thumbnailKey = `${prefix}/${actualFolderKey}_thumbnails/${fileName}.webp`;
  const finalUrl = normalizeFileUrl(getFileUrl(thumbnailKey));
  
  thumbnailUrlCache.set(normalizedUrl, finalUrl);
  return finalUrl;
};

export const renderFilePreview = (file: DMFile, folderKey = "chat_uploads"): React.ReactNode => {
  const extension = file.fileName.split(".").pop()?.toLowerCase() || "";
  const extLabel = extension ? extension.toUpperCase() : "FILE";

  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) {
    const normalizedUrl = normalizeFileUrl(file.url);
    const thumbnailUrl = getThumbnailUrl(normalizedUrl, folderKey);
    const finalUrl = normalizeFileUrl(file.finalUrl || file.url);
    return (
      <div className="chat-attachment-image">
        <OptimisticImage tempUrl={thumbnailUrl} finalUrl={finalUrl} alt={file.fileName} />
      </div>
    );
  }
  
  if (extension === "pdf") {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><FaFilePdf size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (extension === "svg") {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><SiSvg size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (extension === "txt") {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><FaFileAlt size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (["xls", "xlsx", "csv"].includes(extension)) {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><FaFileExcel size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (["dwg", "vwx"].includes(extension)) {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><FaDraftingCompass size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (["c4d", "obj"].includes(extension)) {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><FaCube size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (extension === "ai") {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><SiAdobe size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (extension === "afdesign") {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><SiAffinitydesigner size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }
  
  if (extension === "afpub") {
    return (
      <div className="chat-attachment-card">
        <div className="chat-attachment-icon"><SiAffinitypublisher size={20} /></div>
        <div className="chat-attachment-meta">
          <div className="chat-attachment-name">{file.fileName}</div>
          <div className="chat-attachment-sub">{extLabel}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-attachment-card">
      <div className="chat-attachment-icon"><FaFileAlt size={20} /></div>
      <div className="chat-attachment-meta">
        <div className="chat-attachment-name">{file.fileName}</div>
        <div className="chat-attachment-sub">{extLabel}</div>
      </div>
    </div>
  );
};








