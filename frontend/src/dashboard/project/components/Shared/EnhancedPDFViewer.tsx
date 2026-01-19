/**
 * EnhancedPDFViewer - Full-featured PDF viewer with multi-page navigation
 * 
 * Features:
 * - Multi-page navigation (prev/next, page input)
 * - Zoom controls
 * - Full-screen mode
 * - Page thumbnails sidebar (optional)
 * - Keyboard shortcuts
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCw,
} from 'lucide-react';
import { normalizeFileUrl, getFileUrl, fileUrlsToKeys } from '@/shared/utils/api';
import styles from './enhanced-pdf-viewer.module.css';

// Set the worker (required by pdf.js)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export interface EnhancedPDFViewerProps {
  /** URL of the PDF file */
  url: string;
  /** Optional class name */
  className?: string;
  /** Title for accessibility */
  title?: string;
  /** Initial page number (1-based) */
  initialPage?: number;
  /** Initial zoom level (1 = 100%) */
  initialZoom?: number;
  /** Whether to show page thumbnails sidebar */
  showThumbnails?: boolean;
  /** Callback when download is requested */
  onDownload?: () => void;
  /** Whether to show the toolbar */
  showToolbar?: boolean;
}

type PDFDocumentProxy = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM = 1;

const resolvePdfUrl = (input: string): string => {
  if (!input) return '';
  if (input.startsWith('blob:') || input.startsWith('data:')) return input;
  // Handle S3 keys
  const [decodedKey] = fileUrlsToKeys([input]);
  if (decodedKey) {
    return normalizeFileUrl(getFileUrl(decodedKey));
  }
  return normalizeFileUrl(input);
};

const EnhancedPDFViewer: React.FC<EnhancedPDFViewerProps> = ({
  url,
  className,
  title = 'PDF Viewer',
  initialPage = 1,
  initialZoom = DEFAULT_ZOOM,
  showThumbnails = false,
  onDownload,
  showToolbar = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(initialZoom);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState(String(initialPage));
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const resolvedUrl = useMemo(() => resolvePdfUrl(url), [url]);

  // Load PDF document
  useEffect(() => {
    if (!resolvedUrl) return;

    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);

      try {
        loadingTask = pdfjsLib.getDocument(resolvedUrl);
        const pdfDoc = await loadingTask.promise;
        
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(Math.min(initialPage, pdfDoc.numPages));
        setPageInputValue(String(Math.min(initialPage, pdfDoc.numPages)));

        // Generate thumbnails if requested
        if (showThumbnails) {
          const thumbs: string[] = [];
          for (let i = 1; i <= Math.min(pdfDoc.numPages, 20); i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 0.2 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (context) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: context, viewport }).promise;
              thumbs.push(canvas.toDataURL());
            }
          }
          if (!cancelled) {
            setThumbnails(thumbs);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setError('Failed to load PDF');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDocument();

    return () => {
      cancelled = true;
      if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch {
          /* noop */
        }
      }
    };
  }, [resolvedUrl, initialPage, showThumbnails]);

  // Render current page
  useEffect(() => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || currentPage < 1 || currentPage > totalPages) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate viewport with zoom and rotation
        const viewport = page.getViewport({ scale: zoom * 1.5, rotation });

        // Set canvas dimensions
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Render page
        await page.render({
          canvasContext: context,
          viewport,
        }).promise;
      } catch (err) {
        console.error('Page render error:', err);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [currentPage, totalPages, zoom, rotation]);

  // Navigation handlers
  const goToPage = useCallback((page: number) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
    setPageInputValue(String(newPage));
  }, [totalPages]);

  const handlePrevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const handleNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const handlePageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  }, []);

  const handlePageInputBlur = useCallback(() => {
    const page = parseInt(pageInputValue, 10);
    if (!isNaN(page)) {
      goToPage(page);
    } else {
      setPageInputValue(String(currentPage));
    }
  }, [pageInputValue, currentPage, goToPage]);

  const handlePageInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageInputBlur();
    }
  }, [handlePageInputBlur]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const currentIdx = ZOOM_LEVELS.findIndex(z => z >= prev);
      const nextIdx = Math.min(currentIdx + 1, ZOOM_LEVELS.length - 1);
      return ZOOM_LEVELS[nextIdx] ?? prev;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const currentIdx = ZOOM_LEVELS.findIndex(z => z >= prev);
      const prevIdx = Math.max(currentIdx - 1, 0);
      return ZOOM_LEVELS[prevIdx] ?? prev;
    });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in input
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          handlePrevPage();
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          handleNextPage();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut, handleRotate]);

  if (error) {
    return (
      <div className={`${styles.container} ${className ?? ''}`}>
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className ?? ''}`} ref={containerRef}>
      {/* Toolbar */}
      {showToolbar && (
        <div className={styles.toolbar}>
          {/* Page navigation */}
          <div className={styles.pageNav}>
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || isLoading}
              className={styles.toolbarBtn}
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            
            <div className={styles.pageInfo}>
              <input
                type="text"
                value={pageInputValue}
                onChange={handlePageInputChange}
                onBlur={handlePageInputBlur}
                onKeyDown={handlePageInputKeyDown}
                className={styles.pageInput}
                aria-label="Current page"
              />
              <span className={styles.pageSeparator}>/</span>
              <span className={styles.totalPages}>{totalPages}</span>
            </div>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages || isLoading}
              className={styles.toolbarBtn}
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={styles.toolbarDivider} />

          {/* Zoom controls */}
          <div className={styles.zoomControls}>
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_LEVELS[0]}
              className={styles.toolbarBtn}
              aria-label="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            
            <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
            
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              className={styles.toolbarBtn}
              aria-label="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
          </div>

          <div className={styles.toolbarDivider} />

          {/* Additional controls */}
          <button
            type="button"
            onClick={handleRotate}
            className={styles.toolbarBtn}
            aria-label="Rotate"
          >
            <RotateCw size={18} />
          </button>

          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className={styles.toolbarBtn}
              aria-label="Download PDF"
            >
              <Download size={18} />
            </button>
          )}
        </div>
      )}

      {/* Main content area */}
      <div className={styles.content}>
        {/* Thumbnails sidebar */}
        {showThumbnails && thumbnails.length > 0 && (
          <div className={styles.thumbnailsSidebar}>
            {thumbnails.map((thumb, index) => (
              <button
                key={index}
                type="button"
                className={`${styles.thumbnail} ${currentPage === index + 1 ? styles.thumbnailActive : ''}`}
                onClick={() => goToPage(index + 1)}
              >
                <img src={thumb} alt={`Page ${index + 1}`} />
                <span className={styles.thumbnailNumber}>{index + 1}</span>
              </button>
            ))}
          </div>
        )}

        {/* Canvas area */}
        <div className={styles.canvasWrapper}>
          {isLoading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Loading PDF...</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            title={title}
          />
        </div>
      </div>
    </div>
  );
};

export default EnhancedPDFViewer;
