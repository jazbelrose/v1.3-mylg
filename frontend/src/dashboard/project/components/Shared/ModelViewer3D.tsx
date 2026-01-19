/**
 * ModelViewer3D - 3D model viewer component
 * 
 * Uses @google/model-viewer web component for displaying 3D models.
 * Supports GLB, GLTF formats directly. OBJ files need conversion.
 * 
 * Features:
 * - Interactive 3D rotation/zoom
 * - Auto-rotate option
 * - Lighting controls
 * - AR mode on supported devices
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Download, RotateCw, Loader } from 'lucide-react';
import { getFileUrl, fileUrlsToKeys, normalizeFileUrl } from '@/shared/utils/api';
import styles from './model-viewer-3d.module.css';

// Dynamically import model-viewer web component
let modelViewerLoaded = false;

const loadModelViewer = async () => {
  if (modelViewerLoaded) return;
  try {
    await import('@google/model-viewer');
    modelViewerLoaded = true;
  } catch (err) {
    console.warn('model-viewer not available:', err);
  }
};

export interface ModelViewer3DProps {
  /** URL of the 3D model file */
  url: string;
  /** File name for display */
  fileName?: string;
  /** Optional class name */
  className?: string;
  /** Whether to auto-rotate */
  autoRotate?: boolean;
  /** Callback when download is requested */
  onDownload?: () => void;
  /** Whether to show controls */
  showControls?: boolean;
}

// Supported formats for direct viewing
const SUPPORTED_FORMATS = ['glb', 'gltf'];

// Formats that could be converted (show placeholder with info)
const CONVERTIBLE_FORMATS = ['obj', 'fbx', 'stl', 'dae', '3ds'];

const resolveModelUrl = (input: string): string => {
  if (!input) return '';
  if (input.startsWith('blob:') || input.startsWith('data:')) return input;
  const [decodedKey] = fileUrlsToKeys([input]);
  if (decodedKey) {
    return normalizeFileUrl(getFileUrl(decodedKey));
  }
  return normalizeFileUrl(input);
};

const getExtension = (fileName?: string): string => {
  if (!fileName) return '';
  return fileName.split('.').pop()?.toLowerCase() ?? '';
};

const ModelViewer3D: React.FC<ModelViewer3DProps> = ({
  url,
  fileName,
  className,
  autoRotate = true,
  onDownload,
  showControls = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelViewerAvailable, setModelViewerAvailable] = useState(modelViewerLoaded);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);

  const resolvedUrl = useMemo(() => resolveModelUrl(url), [url]);
  const extension = useMemo(() => getExtension(fileName), [fileName]);
  const isSupported = SUPPORTED_FORMATS.includes(extension);
  const isConvertible = CONVERTIBLE_FORMATS.includes(extension);

  // Load model-viewer component
  useEffect(() => {
    loadModelViewer().then(() => {
      setModelViewerAvailable(true);
    });
  }, []);

  // Handle model load events
  useEffect(() => {
    if (!modelViewerAvailable || !isSupported) return;

    const handleLoad = () => {
      setIsLoading(false);
      setError(null);
    };

    const handleError = () => {
      setIsLoading(false);
      setError('Failed to load 3D model');
    };

    const modelViewer = containerRef.current?.querySelector('model-viewer');
    if (modelViewer) {
      modelViewer.addEventListener('load', handleLoad);
      modelViewer.addEventListener('error', handleError);

      return () => {
        modelViewer.removeEventListener('load', handleLoad);
        modelViewer.removeEventListener('error', handleError);
      };
    }
  }, [modelViewerAvailable, isSupported, resolvedUrl]);

  const toggleAutoRotate = () => {
    setIsAutoRotating(prev => !prev);
  };

  // For non-supported formats, show a placeholder
  if (!isSupported) {
    return (
      <div className={`${styles.container} ${className ?? ''}`}>
        <div className={styles.placeholder}>
          <div className={styles.placeholderIcon}>
            <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" 
                stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <div className={styles.placeholderTitle}>{fileName ?? '3D Model'}</div>
          <div className={styles.placeholderInfo}>
            {extension.toUpperCase()} format
            {isConvertible && (
              <span className={styles.placeholderHint}>
                Convert to GLB for in-browser preview
              </span>
            )}
          </div>
          {onDownload && (
            <button
              type="button"
              className={styles.downloadBtn}
              onClick={onDownload}
            >
              <Download size={16} />
              <span>Download to view</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Waiting for model-viewer to load
  if (!modelViewerAvailable) {
    return (
      <div className={`${styles.container} ${className ?? ''}`}>
        <div className={styles.loading}>
          <Loader className={styles.spinner} size={32} />
          <span>Loading 3D viewer...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className ?? ''}`} ref={containerRef}>
      {/* Controls */}
      {showControls && (
        <div className={styles.controls}>
          <button
            type="button"
            className={`${styles.controlBtn} ${isAutoRotating ? styles.active : ''}`}
            onClick={toggleAutoRotate}
            aria-label={isAutoRotating ? 'Stop rotation' : 'Auto rotate'}
          >
            <RotateCw size={18} />
          </button>
          {onDownload && (
            <button
              type="button"
              className={styles.controlBtn}
              onClick={onDownload}
              aria-label="Download model"
            >
              <Download size={18} />
            </button>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className={styles.loading}>
          <Loader className={styles.spinner} size={32} />
          <span>Loading 3D model...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}

      {/* Model viewer - using dangerouslySetInnerHTML to render web component */}
      <div
        className={styles.viewerWrapper}
        dangerouslySetInnerHTML={{
          __html: `
            <model-viewer
              src="${resolvedUrl}"
              alt="${fileName ?? '3D Model'}"
              camera-controls
              ${isAutoRotating ? 'auto-rotate' : ''}
              shadow-intensity="1"
              environment-image="neutral"
              exposure="0.8"
              style="width: 100%; height: 100%;"
            >
              <div class="progress-bar hide" slot="progress-bar">
                <div class="update-bar"></div>
              </div>
            </model-viewer>
          `,
        }}
      />
    </div>
  );
};

export default ModelViewer3D;
