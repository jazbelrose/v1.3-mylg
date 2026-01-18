/**
 * FileThumb - Smart file thumbnail component
 * 
 * Features:
 * - Never shows broken image icon
 * - Auto-detects if image should be rendered via <img> or type tile
 * - Handles onError fallback gracefully
 * - Supports thumbnails for PDFs/videos if provided
 */

import React, { useState, useCallback } from 'react';
import { FileIconByType, getFileTypeInfo } from './FileIconByType';
import styles from './file-thumb.module.css';

export interface FileThumbProps {
  /** URL of the file (for images, this is the image src) */
  url?: string;
  /** Optional thumbnail URL (for PDFs, videos, etc.) */
  thumbnailUrl?: string;
  /** File name (used to extract extension) */
  fileName?: string;
  /** MIME type of the file */
  mimeType?: string;
  /** File extension override (with or without dot) */
  extension?: string;
  /** Size of the thumbnail */
  size?: 'sm' | 'md' | 'lg';
  /** Alt text for images */
  alt?: string;
  /** Additional class name */
  className?: string;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Whether to show file name below thumbnail */
  showFileName?: boolean;
  /** Maximum file name length before truncation */
  maxFileNameLength?: number;
}

// Extensions that can be rendered as images
const PREVIEWABLE_IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'svg'
];

function isPreviewableImage(fileName?: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('image/') && !mimeType.includes('heic') && !mimeType.includes('heif')) {
    return true;
  }
  
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return PREVIEWABLE_IMAGE_EXTENSIONS.includes(ext);
  }
  
  return false;
}

function getExtension(fileName?: string, extension?: string): string {
  if (extension) return extension.replace(/^\./, '').toLowerCase();
  if (fileName) return fileName.split('.').pop()?.toLowerCase() || '';
  return '';
}

function truncateFileName(name: string, maxLength: number): string {
  if (!name || name.length <= maxLength) return name;
  
  const parts = name.split('.');
  if (parts.length < 2) {
    return name.slice(0, maxLength - 3) + '...';
  }
  
  const ext = parts.pop()!;
  const base = parts.join('.');
  const availableLength = maxLength - ext.length - 4; // -4 for "..." and "."
  
  if (availableLength <= 0) {
    return name.slice(0, maxLength - 3) + '...';
  }
  
  return `${base.slice(0, availableLength)}...${ext}`;
}

export function FileThumb({
  url,
  thumbnailUrl,
  fileName,
  mimeType,
  extension,
  size = 'md',
  alt,
  className = '',
  onClick,
  showFileName = false,
  maxFileNameLength = 20,
}: FileThumbProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const handleImgError = useCallback(() => {
    setImgError(true);
  }, []);

  const handleImgLoad = useCallback(() => {
    setImgLoaded(true);
  }, []);

  const ext = getExtension(fileName, extension);
  const shouldShowImage = !imgError && isPreviewableImage(fileName, mimeType);
  const hasThumbnail = !imgError && thumbnailUrl;
  const imageUrl = thumbnailUrl || url;

  const sizeClasses = {
    sm: styles.thumbSm,
    md: styles.thumbMd,
    lg: styles.thumbLg,
  };

  const renderContent = () => {
    // Case 1: Previewable image
    if (shouldShowImage && imageUrl) {
      return (
        <div className={`${styles.imageContainer} ${!imgLoaded ? styles.imageLoading : ''}`}>
          <img
            src={imageUrl}
            alt={alt || fileName || 'File preview'}
            className={styles.thumbImage}
            onError={handleImgError}
            onLoad={handleImgLoad}
            loading="lazy"
          />
        </div>
      );
    }

    // Case 2: Has thumbnail (PDF, video poster frame, etc.)
    if (hasThumbnail) {
      return (
        <div className={`${styles.imageContainer} ${!imgLoaded ? styles.imageLoading : ''}`}>
          <img
            src={thumbnailUrl}
            alt={alt || fileName || 'File thumbnail'}
            className={styles.thumbImage}
            onError={handleImgError}
            onLoad={handleImgLoad}
            loading="lazy"
          />
          {/* Extension badge overlay for non-images */}
          <span
            className={styles.thumbnailBadge}
            style={{ backgroundColor: getFileTypeInfo(mimeType, ext).color }}
          >
            {ext.toUpperCase()}
          </span>
        </div>
      );
    }

    // Case 3: Type tile (no image available or error)
    return (
      <FileIconByType
        mimeType={mimeType}
        extension={ext}
        size={size}
        className={styles.typeTileWrapper}
      />
    );
  };

  return (
    <div
      className={`${styles.thumbContainer} ${sizeClasses[size]} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {renderContent()}
      {showFileName && fileName && (
        <div className={styles.thumbFileName} title={fileName}>
          {truncateFileName(fileName, maxFileNameLength)}
        </div>
      )}
    </div>
  );
}

export default FileThumb;
