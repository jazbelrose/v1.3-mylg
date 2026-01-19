/**
 * FileThumb - Smart file thumbnail component
 * 
 * Features:
 * - Never shows broken image icon
 * - Auto-detects if image should be rendered via <img> or type tile
 * - Handles onError fallback gracefully
 * - Supports thumbnails for PDFs/videos if provided
 * - Memoized for performance with virtualized lists
 * - Integrates with thumbnail cache to prevent reload flash
 */

import React, { useState, useCallback, memo } from 'react';
import { FileIconByType, getFileTypeInfo } from './FileIconByType';
import styles from './file-thumb.module.css';

// Direct import of thumbnail cache (no lazy loading - was causing issues)
import {
  isThumbLoaded,
  setThumbLoaded,
  setThumbError,
} from '@/dashboard/project/components/FileManager/utils/thumbnailCache';

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
  /** Cache key for thumbnail status (if provided, integrates with thumb cache) */
  cacheKey?: string;
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
  cacheKey,
}: FileThumbProps) {
  // DEBUG: Log unconditionally for first 3 renders
  if (typeof window !== 'undefined') {
    const key = '__fileThumbCallCount';
    const count = ((window as unknown as Record<string, number>)[key] || 0);
    if (count < 3) {
      (window as unknown as Record<string, number>)[key] = count + 1;
      console.warn('[FileThumb] CALLED #' + (count + 1), { fileName, thumbnailUrl: thumbnailUrl?.slice(0, 80), url: url?.slice(0, 80) });
    }
  }
  
  // Check if already loaded from cache (instant render, no loading state)
  const cachedLoaded = cacheKey ? isThumbLoaded(cacheKey) : false;
  
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(cachedLoaded);
  // Track if thumbnail failed so we can fall back to original
  const [thumbFailed, setThumbFailed] = useState(false);

  const handleImgError = useCallback(() => {
    // If we were trying thumbnail and it failed, try the original URL
    if (thumbnailUrl && !thumbFailed && url) {
      console.log('[FileThumb] Thumbnail failed, falling back:', { fileName, thumbnailUrl: thumbnailUrl?.slice(0, 80) });
      setThumbFailed(true);
      // Don't set imgError yet - we'll try the fallback
      return;
    }
    
    setImgError(true);
    // Update cache
    if (cacheKey) {
      setThumbError(cacheKey);
    }
  }, [cacheKey, thumbnailUrl, thumbFailed, url, fileName]);

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgLoaded(true);
    // Update cache with dimensions
    if (cacheKey) {
      const img = e.currentTarget;
      setThumbLoaded(cacheKey, img.naturalWidth, img.naturalHeight);
    }
  }, [cacheKey]);

  const ext = getExtension(fileName, extension);
  const shouldShowImage = !imgError && isPreviewableImage(fileName, mimeType);
  const hasThumbnail = !imgError && thumbnailUrl && !thumbFailed;
  // Use thumbnail if available and not failed, otherwise fall back to original URL
  const imageUrl = (hasThumbnail ? thumbnailUrl : url) || url;
  
  // Debug: Log EVERY image to trace what's happening
  if (typeof window !== 'undefined' && shouldShowImage && thumbnailUrl) {
    const logKey = '__fileThumbDebugCount';
    const count = ((window as unknown as Record<string, number>)[logKey] || 0);
    if (count < 5) {
      (window as unknown as Record<string, number>)[logKey] = count + 1;
      console.log('[FileThumb] Render #' + (count + 1) + ':', {
        fileName,
        hasThumbnail,
        thumbFailed,
        imgError,
        thumbnailUrl: thumbnailUrl?.slice(0, 100),
        actualImageUrl: imageUrl?.slice(0, 100),
        usingThumbnail: imageUrl === thumbnailUrl
      });
    }
  }

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
            decoding="async"
            // @ts-expect-error - fetchpriority is valid but not in React types yet
            fetchpriority="low"
            width={size === 'sm' ? 48 : size === 'md' ? 80 : 120}
            height={size === 'sm' ? 48 : size === 'md' ? 80 : 120}
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
            decoding="async"
            // @ts-expect-error - fetchpriority is valid but not in React types yet
            fetchpriority="low"
            width={size === 'sm' ? 48 : size === 'md' ? 80 : 120}
            height={size === 'sm' ? 48 : size === 'md' ? 80 : 120}
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

// Custom comparison for memo - only re-render when visual props change
function arePropsEqual(prev: FileThumbProps, next: FileThumbProps): boolean {
  return (
    prev.url === next.url &&
    prev.thumbnailUrl === next.thumbnailUrl &&
    prev.fileName === next.fileName &&
    prev.mimeType === next.mimeType &&
    prev.extension === next.extension &&
    prev.size === next.size &&
    prev.className === next.className &&
    prev.showFileName === next.showFileName &&
    prev.cacheKey === next.cacheKey
  );
}

// Memoized version for use in virtualized lists
const MemoizedFileThumb = memo(FileThumb, arePropsEqual);

export { MemoizedFileThumb };
export default FileThumb;
