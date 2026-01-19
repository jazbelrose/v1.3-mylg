/**
 * QuickLookModal - Full-screen file preview with navigation and zoom
 * 
 * Features:
 * - Large centered preview
 * - Left/Right navigation arrows for image galleries
 * - Zoom controls: +/-, Fit/100%, pinch-to-zoom on touch
 * - Keyboard shortcuts: Arrow keys, +/-, Escape, Space
 * - Close, Download, Copy link actions in header
 * - PDF viewer support
 * - Non-previewable files show type tile + metadata
 */

import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Link,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import { getFileUrl, fileUrlsToKeys } from '@/shared/utils/api';
import EnhancedPDFViewer from '../Shared/EnhancedPDFViewer';
import NoteEditorModal from '@/dashboard/features/messages/components/NoteEditorModal';
import type { FileItem } from './FileManagerTypes';
import { isPreviewableImage, getFilePreviewIcon } from './FileManagerUtils';
import styles from './file-manager-v2.module.css';

// Lazy load 3D viewer (optional dependency)
const ModelViewer3D = lazy(() => import('../Shared/ModelViewer3D'));

// File type categorization helpers
const is3DModel = (ext: string): boolean => {
  return ['obj', 'glb', 'gltf', 'fbx', 'stl', 'dae', '3ds', 'c4d'].includes(ext);
};

const isVectorFile = (ext: string): boolean => {
  return ['eps', 'ai', 'afdesign', 'afphoto', 'psd', 'indd'].includes(ext);
};

const isCADFile = (ext: string): boolean => {
  return ['dwg', 'dxf', 'vwx', 'skp'].includes(ext);
};

export interface QuickLookModalProps {
  /** Whether modal is visible */
  isOpen: boolean;
  /** Close callback */
  onRequestClose: () => void;
  /** List of files to navigate through */
  files: FileItem[];
  /** Current file index */
  currentIndex: number;
  /** Navigate to specific index */
  onNavigate: (index: number) => void;
  /** Download current file */
  onDownload: (file: FileItem) => void;
  /** Copy link */
  onCopyLink: (file: FileItem) => void;
  /** Delete file (optional) */
  onDelete?: (file: FileItem) => void;
  /** Project ID for text file viewing */
  projectId?: string;
  /** Whether user can edit/delete */
  canEdit?: boolean;
}

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const FIT_ZOOM = 'fit';
type ZoomLevel = number | typeof FIT_ZOOM;

export function QuickLookModal({
  isOpen,
  onRequestClose,
  files,
  currentIndex,
  onNavigate,
  onDownload,
  onCopyLink,
  onDelete,
  projectId,
  canEdit = false,
}: QuickLookModalProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(FIT_ZOOM);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  
  const imageRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  const currentFile = files[currentIndex] ?? null;
  const hasNext = currentIndex < files.length - 1;
  const hasPrev = currentIndex > 0;

  // Get resolved URL
  const resolvedUrl = useMemo(() => {
    if (!currentFile?.url) return '';
    if (currentFile.url.startsWith('blob:')) return currentFile.url;
    const [decodedKey] = fileUrlsToKeys([currentFile.url]);
    return decodedKey ? getFileUrl(decodedKey) : currentFile.url;
  }, [currentFile?.url]);

  // Determine file type
  const extension = currentFile?.fileName?.split('.').pop()?.toLowerCase() ?? '';
  const isImage = currentFile ? isPreviewableImage(currentFile) : false;
  const isPdf = extension === 'pdf';
  const isTextLike = ['txt', 'md', 'markdown', 'json', 'log', 'csv'].includes(extension);
  const is3D = is3DModel(extension);
  const isVector = isVectorFile(extension);
  const isCAD = isCADFile(extension);

  // Reset zoom when file changes
  useEffect(() => {
    setZoom(FIT_ZOOM);
    setPanOffset({ x: 0, y: 0 });
    setTextEditorOpen(false);
  }, [currentIndex]);

  // Auto-open text editor for text files
  useEffect(() => {
    if (isOpen && isTextLike && projectId) {
      setTextEditorOpen(true);
    }
  }, [isOpen, isTextLike, projectId, currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.stopPropagation();
          e.preventDefault();
          onRequestClose();
          break;
        case 'ArrowLeft':
          e.stopPropagation();
          if (hasPrev) onNavigate(currentIndex - 1);
          break;
        case 'ArrowRight':
          e.stopPropagation();
          if (hasNext) onNavigate(currentIndex + 1);
          break;
        case '+':
        case '=':
          e.stopPropagation();
          handleZoomIn();
          break;
        case '-':
          e.stopPropagation();
          handleZoomOut();
          break;
        case '0':
          e.stopPropagation();
          setZoom(FIT_ZOOM);
          setPanOffset({ x: 0, y: 0 });
          break;
        case '1':
          e.stopPropagation();
          setZoom(1);
          setPanOffset({ x: 0, y: 0 });
          break;
      }
    };

    // Use capture phase to ensure this handler runs before FileManagerV2's handler
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, currentIndex, hasNext, hasPrev, onNavigate, onRequestClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      if (prev === FIT_ZOOM) return 1.25;
      const currentIdx = ZOOM_LEVELS.findIndex((z) => z >= prev);
      const nextIdx = Math.min(currentIdx + 1, ZOOM_LEVELS.length - 1);
      return ZOOM_LEVELS[nextIdx];
    });
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      if (prev === FIT_ZOOM) return 0.75;
      const currentIdx = ZOOM_LEVELS.findIndex((z) => z >= prev);
      const prevIdx = Math.max(currentIdx - 1, 0);
      return ZOOM_LEVELS[prevIdx];
    });
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleToggleFit = useCallback(() => {
    setZoom((prev) => (prev === FIT_ZOOM ? 1 : FIT_ZOOM));
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Pan handlers (for zoomed images)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom === FIT_ZOOM || !isImage) return;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
      };
    },
    [zoom, isImage, panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.offsetX + dx,
        y: panStartRef.current.offsetY + dy,
      });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Touch handlers for pinch-to-zoom
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        pinchStartRef.current = {
          distance,
          zoom: typeof zoom === 'number' ? zoom : 1,
        };
      } else if (e.touches.length === 1 && zoom !== FIT_ZOOM) {
        // Pan start
        panStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          offsetX: panOffset.x,
          offsetY: panOffset.y,
        };
      }
    },
    [zoom, panOffset]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scale = distance / pinchStartRef.current.distance;
        const newZoom = Math.min(4, Math.max(0.25, pinchStartRef.current.zoom * scale));
        setZoom(newZoom);
      } else if (e.touches.length === 1 && panStartRef.current && zoom !== FIT_ZOOM) {
        // Pan
        const dx = e.touches[0].clientX - panStartRef.current.x;
        const dy = e.touches[0].clientY - panStartRef.current.y;
        setPanOffset({
          x: panStartRef.current.offsetX + dx,
          y: panStartRef.current.offsetY + dy,
        });
      }
    },
    [zoom]
  );

  const handleTouchEnd = useCallback(() => {
    pinchStartRef.current = null;
    panStartRef.current = null;
  }, []);

  // Navigation via swipe
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoom === FIT_ZOOM) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [zoom]);

  const handleSwipeEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!swipeStartRef.current || zoom !== FIT_ZOOM) return;

      const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeStartRef.current.y);

      // Horizontal swipe with minimal vertical movement
      if (Math.abs(dx) > 50 && dy < 50) {
        if (dx > 0 && hasPrev) {
          onNavigate(currentIndex - 1);
        } else if (dx < 0 && hasNext) {
          onNavigate(currentIndex + 1);
        }
      }

      swipeStartRef.current = null;
    },
    [zoom, hasPrev, hasNext, currentIndex, onNavigate]
  );

  // Double-tap to toggle zoom (touch)
  const lastTapRef = useRef<number>(0);
  const handleDoubleTap = useCallback(
    (e: React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        handleToggleFit();
      }
      lastTapRef.current = now;
    },
    [handleToggleFit]
  );

  // Double-click to toggle zoom (desktop)
  const handleDoubleClick = useCallback(() => {
    handleToggleFit();
  }, [handleToggleFit]);

  // Render preview content
  const renderContent = () => {
    if (!currentFile) return null;

    if (isImage) {
      const zoomValue = zoom === FIT_ZOOM ? 1 : zoom;
      const transform = zoom === FIT_ZOOM
        ? 'none'
        : `scale(${zoomValue}) translate(${panOffset.x / zoomValue}px, ${panOffset.y / zoomValue}px)`;

      return (
        <div
          ref={imageRef}
          className={`${styles.quickLookImageContainer} ${isPanning ? styles.quickLookPanning : ''}`}
          style={{ cursor: zoom === FIT_ZOOM ? 'default' : isPanning ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={(e) => {
            handleTouchStart(e);
            handleSwipeStart(e);
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => {
            handleTouchEnd();
            handleSwipeEnd(e);
            handleDoubleTap(e);
          }}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={resolvedUrl}
            alt={currentFile.fileName}
            className={styles.quickLookImage}
            style={{
              transform,
              maxWidth: zoom === FIT_ZOOM ? '100%' : 'none',
              maxHeight: zoom === FIT_ZOOM ? '100%' : 'none',
            }}
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).src = currentFile.url;
            }}
          />
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className={styles.quickLookPdfContainer}>
          <EnhancedPDFViewer
            url={currentFile.url}
            className={styles.quickLookPdf}
            title={currentFile.fileName}
            showThumbnails={false}
            onDownload={() => onDownload(currentFile)}
          />
        </div>
      );
    }

    // 3D Model preview
    if (is3D) {
      return (
        <Suspense
          fallback={
            <div className={styles.quickLookPlaceholder}>
              <div className={styles.quickLookPlaceholderIcon}>
                {getFilePreviewIcon(extension)}
              </div>
              <div className={styles.quickLookPlaceholderName}>Loading 3D viewer...</div>
            </div>
          }
        >
          <div className={styles.quickLook3DContainer}>
            <ModelViewer3D
              url={currentFile.url}
              fileName={currentFile.fileName}
              onDownload={() => onDownload(currentFile)}
              autoRotate={true}
              showControls={true}
            />
          </div>
        </Suspense>
      );
    }

    // Vector/Design files (EPS, AI, PSD, etc.) - show rich placeholder
    if (isVector || isCAD) {
      const fileTypeLabel = isVector ? 'Vector/Design' : 'CAD';
      const softwareHint = isVector
        ? 'Adobe Illustrator, Affinity Designer, or similar'
        : 'AutoCAD, SketchUp, or similar';
      
      return (
        <div className={styles.quickLookPlaceholder}>
          <div className={styles.quickLookPlaceholderIcon}>
            {getFilePreviewIcon(extension)}
          </div>
          <div className={styles.quickLookPlaceholderName}>{currentFile.fileName}</div>
          <div className={styles.quickLookPlaceholderMeta}>
            {extension.toUpperCase()} • {fileTypeLabel} file
          </div>
          <div className={styles.quickLookPlaceholderHint}>
            Open with {softwareHint}
          </div>
          <button
            type="button"
            className={styles.quickLookPlaceholderDownload}
            onClick={() => onDownload(currentFile)}
          >
            <Download size={16} />
            <span>Download to view</span>
          </button>
        </div>
      );
    }

    if (isTextLike && projectId) {
      return (
        <div className={styles.quickLookPlaceholder}>
          <div className={styles.quickLookPlaceholderIcon}>
            {getFilePreviewIcon(extension)}
          </div>
          <div className={styles.quickLookPlaceholderName}>{currentFile.fileName}</div>
          <div className={styles.quickLookPlaceholderMeta}>
            {extension.toUpperCase()} file
          </div>
          <button
            type="button"
            className={styles.quickLookPlaceholderDownload}
            onClick={() => setTextEditorOpen(true)}
          >
            <Maximize2 size={16} />
            <span>Open in editor</span>
          </button>
        </div>
      );
    }

    // Non-previewable file
    return (
      <div className={styles.quickLookPlaceholder}>
        <div className={styles.quickLookPlaceholderIcon}>
          {getFilePreviewIcon(extension)}
        </div>
        <div className={styles.quickLookPlaceholderName}>{currentFile.fileName}</div>
        <div className={styles.quickLookPlaceholderMeta}>
          {extension.toUpperCase()} file
          {currentFile.size && ` • ${formatFileSize(currentFile.size)}`}
        </div>
        <button
          type="button"
          className={styles.quickLookPlaceholderDownload}
          onClick={() => onDownload(currentFile)}
        >
          <Download size={16} />
          <span>Download to view</span>
        </button>
      </div>
    );
  };

  if (!isOpen || !currentFile) return null;

  const modal = (
    <div className={styles.quickLookOverlay} role="dialog" aria-modal="true" aria-label="File preview">
      {/* Backdrop */}
      <div className={styles.quickLookBackdrop} onClick={onRequestClose} />

      {/* Header */}
      <div className={styles.quickLookHeader}>
        <div className={styles.quickLookHeaderLeft}>
          <button
            type="button"
            className={styles.quickLookHeaderBtn}
            onClick={onRequestClose}
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
          <span className={styles.quickLookFileName}>{currentFile.fileName}</span>
        </div>

        <div className={styles.quickLookHeaderRight}>
          {/* Zoom controls (only for images) */}
          {isImage && (
            <div className={styles.quickLookZoomControls}>
              <button
                type="button"
                className={styles.quickLookHeaderBtn}
                onClick={handleZoomOut}
                aria-label="Zoom out"
              >
                <ZoomOut size={18} />
              </button>
              <span className={styles.quickLookZoomLevel}>
                {zoom === FIT_ZOOM ? 'Fit' : `${Math.round((zoom as number) * 100)}%`}
              </span>
              <button
                type="button"
                className={styles.quickLookHeaderBtn}
                onClick={handleZoomIn}
                aria-label="Zoom in"
              >
                <ZoomIn size={18} />
              </button>
              <button
                type="button"
                className={`${styles.quickLookHeaderBtn} ${zoom === 1 ? styles.active : ''}`}
                onClick={handleToggleFit}
                aria-label={zoom === FIT_ZOOM ? 'Actual size' : 'Fit to screen'}
              >
                <Maximize2 size={18} />
              </button>
            </div>
          )}

          {/* Actions */}
          <button
            type="button"
            className={styles.quickLookHeaderBtn}
            onClick={() => onDownload(currentFile)}
            aria-label="Download"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            className={styles.quickLookHeaderBtn}
            onClick={() => onCopyLink(currentFile)}
            aria-label="Copy link"
          >
            <Link size={18} />
          </button>
          {onDelete && canEdit && (
            <button
              type="button"
              className={`${styles.quickLookHeaderBtn} ${styles.quickLookHeaderBtnDanger}`}
              onClick={() => {
                onDelete(currentFile);
                onRequestClose();
              }}
              aria-label="Delete"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className={styles.quickLookContent}>
        {/* Previous button */}
        {hasPrev && (
          <button
            type="button"
            className={`${styles.quickLookNavBtn} ${styles.quickLookNavPrev}`}
            onClick={() => onNavigate(currentIndex - 1)}
            aria-label="Previous file"
          >
            <ChevronLeft size={32} />
          </button>
        )}

        {/* Preview */}
        <div className={styles.quickLookPreview}>
          {renderContent()}
        </div>

        {/* Next button */}
        {hasNext && (
          <button
            type="button"
            className={`${styles.quickLookNavBtn} ${styles.quickLookNavNext}`}
            onClick={() => onNavigate(currentIndex + 1)}
            aria-label="Next file"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>

      {/* Footer with file info */}
      <div className={styles.quickLookFooter}>
        <span className={styles.quickLookCounter}>
          {currentIndex + 1} of {files.length}
        </span>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modal, document.body)}
      {textEditorOpen && isTextLike && projectId && currentFile && (
        <NoteEditorModal
          isOpen={textEditorOpen}
          mode="open"
          projectId={projectId}
          canEdit={canEdit}
          openFile={{
            fileUrl: currentFile.url,
            fileName: currentFile.fileName,
          }}
          onRequestClose={() => setTextEditorOpen(false)}
        />
      )}
    </>
  );
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default QuickLookModal;
