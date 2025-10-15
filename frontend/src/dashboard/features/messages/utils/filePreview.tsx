import React, { CSSProperties } from "react";
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

export const getThumbnailUrl = (url: string, folderKey = "chat_uploads"): string => {
  if (!url || url.startsWith("blob:")) return url;

  const normalizedUrl = normalizeFileUrl(url);
  const cacheKey = `${normalizedUrl}:${folderKey}`;
  if (thumbnailUrlCache.has(cacheKey)) {
    return thumbnailUrlCache.get(cacheKey)!;
  }

  const [decodedKey] = fileUrlsToKeys([normalizedUrl]);
  if (!decodedKey) {
    thumbnailUrlCache.set(cacheKey, normalizedUrl);
    return normalizedUrl;
  }

  const thumbnailKey = decodedKey.replace(`/${folderKey}/`, `/${folderKey}_thumbnails/`);
  if (thumbnailKey === decodedKey) {
    thumbnailUrlCache.set(cacheKey, normalizedUrl);
    return normalizedUrl;
  }

  const finalUrl = normalizeFileUrl(getFileUrl(thumbnailKey));
  thumbnailUrlCache.set(cacheKey, finalUrl);
  return finalUrl;
};

export const renderFilePreview = (file: DMFile, folderKey = "chat_uploads"): React.ReactNode => {
  const extension = file.fileName.split(".").pop()?.toLowerCase() || "";
  const commonStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  if (["jpg", "jpeg", "png"].includes(extension)) {
    const normalizedUrl = normalizeFileUrl(file.url);
    const thumbnailUrl = getThumbnailUrl(normalizedUrl, folderKey);
    const finalUrl = normalizeFileUrl(file.finalUrl || file.url);
    return <OptimisticImage tempUrl={thumbnailUrl} finalUrl={finalUrl} alt={file.fileName} />;
  }
  
  if (extension === "pdf") {
    return (
      <div style={commonStyle}>
        <FaFilePdf size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (extension === "svg") {
    return (
      <div style={commonStyle}>
        <SiSvg size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (extension === "txt") {
    return (
      <div style={commonStyle}>
        <FaFileAlt size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (["xls", "xlsx", "csv"].includes(extension)) {
    return (
      <div style={commonStyle}>
        <FaFileExcel size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (["dwg", "vwx"].includes(extension)) {
    return (
      <div style={commonStyle}>
        <FaDraftingCompass size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (["c4d", "obj"].includes(extension)) {
    return (
      <div style={commonStyle}>
        <FaCube size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (extension === "ai") {
    return (
      <div style={commonStyle}>
        <SiAdobe size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (extension === "afdesign") {
    return (
      <div style={commonStyle}>
        <SiAffinitydesigner size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }
  
  if (extension === "afpub") {
    return (
      <div style={commonStyle}>
        <SiAffinitypublisher size={50} />
        <span>{file.fileName}</span>
      </div>
    );
  }

  return (
    <div style={commonStyle}>
      <FaFileAlt size={50} />
      <span>{file.fileName}</span>
    </div>
  );
};








