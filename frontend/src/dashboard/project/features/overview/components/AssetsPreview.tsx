/**
 * AssetsPreview - Deck and Gallery previews for Overview HUD
 * 
 * Shows latest deck thumbnail with version and gallery previews.
 * Gallery images can be clicked to open a preview carousel.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Image, X, FolderOpen, ChevronLeft as ArrowLeft, ChevronRight as ArrowRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { getFileUrl } from '@/shared/utils/api';
import { formatRelativeTime } from '../utils';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface DeckVersion {
  versionId?: string;
  title?: string;
  version?: string;
  isDefault?: boolean;
  thumbnail?: string;
  exportedAt?: string;
  createdAt?: string;
  slideCount?: number;
}

interface Gallery {
  galleryId?: string;
  title?: string;
  slug?: string;
  thumbnail?: string;
  imageCount?: number;
  images?: Array<{ thumbnailUrl?: string; url?: string }>;
}

interface AssetsPreviewProps {
  projectId: string;
  projectTitle?: string;
  deckVersions: DeckVersion[];
  galleries: Gallery[];
}

// ============================================================================
// DECK PREVIEW
// ============================================================================

interface DeckPreviewProps {
  projectId: string;
  projectTitle?: string;
  deck: DeckVersion | null;
}

function DeckPreviewSection({ projectId, projectTitle, deck }: DeckPreviewProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/slides'));
  };

  if (!deck) {
    return (
      <div className={styles.assetsSection}>
        <div className={styles.assetsSectionTitle}>Deck</div>
        <div className={styles.assetsEmpty}>
          No deck created yet
        </div>
        <span className={styles.healthTileCta} onClick={handleClick}>
          Create Slides <ChevronRight size={12} />
        </span>
      </div>
    );
  }

  return (
    <div className={styles.assetsSection}>
      <div className={styles.assetsSectionTitle}>Latest Deck</div>
      <div className={styles.deckPreview} onClick={handleClick}>
        {deck.thumbnail ? (
          <img
            src={deck.thumbnail}
            alt={deck.title || 'Deck preview'}
            className={styles.deckThumbnail}
          />
        ) : (
          <div className={styles.deckThumbnailPlaceholder}>
            <FileText size={20} />
          </div>
        )}
        <div className={styles.deckInfo}>
          <div className={styles.deckName}>{deck.title || 'Untitled Deck'}</div>
          <div className={styles.deckMeta}>
            {deck.version || 'v1'}
            {deck.slideCount !== undefined && ` • ${deck.slideCount} slides`}
            {(deck.exportedAt || deck.createdAt) && (
              ` • ${formatRelativeTime(deck.exportedAt || deck.createdAt!)}`
            )}
          </div>
        </div>
        <ChevronRight size={16} style={{ opacity: 0.5 }} />
      </div>
    </div>
  );
}

// ============================================================================
// GALLERY LIGHTBOX
// ============================================================================

interface GalleryLightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onOpenFileManager: () => void;
}

function GalleryLightbox({ images, currentIndex, onClose, onNavigate, onOpenFileManager }: GalleryLightboxProps) {
  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
  }, [currentIndex, images.length, onNavigate]);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, images.length, onNavigate]);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
      if (e.key === 'ArrowRight') onNavigate(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, onClose, onNavigate]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.lightboxOverlay} onClick={onClose}>
      <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.lightboxHeader}>
          <span className={styles.lightboxCounter}>
            {currentIndex + 1} / {images.length}
          </span>
          <div className={styles.lightboxActions}>
            <button
              type="button"
              className={styles.lightboxBtn}
              onClick={onOpenFileManager}
              title="Open in File Manager"
            >
              <FolderOpen size={18} />
              <span>Open Files</span>
            </button>
            <button
              type="button"
              className={styles.lightboxBtnClose}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className={styles.lightboxImageWrapper}>
          <img
            src={getFileUrl(images[currentIndex])}
            alt={`Gallery image ${currentIndex + 1}`}
            className={styles.lightboxImage}
          />
        </div>

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
              onClick={handlePrev}
              aria-label="Previous"
            >
              <ArrowLeft size={24} />
            </button>
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
              onClick={handleNext}
              aria-label="Next"
            >
              <ArrowRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// GALLERY PREVIEW
// ============================================================================

interface GalleryPreviewProps {
  projectId: string;
  projectTitle?: string;
  galleries: Gallery[];
}

function GalleryPreviewSection({ projectId, projectTitle, galleries }: GalleryPreviewProps) {
  const navigate = useNavigate();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handleOpenFileManager = useCallback(() => {
    setLightboxOpen(false);
    navigate(getProjectDashboardPath(projectId, projectTitle, '/gallery'));
  }, [navigate, projectId, projectTitle]);

  // Get ALL image URLs from galleries for the lightbox
  const allImages = useMemo(() => {
    const images: string[] = [];
    for (const gallery of galleries) {
      if (gallery.images) {
        for (const img of gallery.images) {
          if (img.url) {
            images.push(img.url);
          }
        }
      }
    }
    return images;
  }, [galleries]);

  // Get up to 4 thumbnails for preview grid
  const thumbnails = useMemo(() => {
    const thumbs: string[] = [];
    for (const gallery of galleries) {
      if (gallery.thumbnail) {
        thumbs.push(gallery.thumbnail);
      } else if (gallery.images) {
        for (const img of gallery.images) {
          if (img.thumbnailUrl || img.url) {
            thumbs.push(img.thumbnailUrl || img.url!);
          }
          if (thumbs.length >= 4) break;
        }
      }
      if (thumbs.length >= 4) break;
    }
    return thumbs;
  }, [galleries]);

  const totalImages = useMemo(() => {
    return galleries.reduce((sum, g) => sum + (g.imageCount || g.images?.length || 0), 0);
  }, [galleries]);

  const handleImageClick = useCallback((e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setLightboxIndex(idx);
    setLightboxOpen(true);
  }, []);

  if (galleries.length === 0) {
    return (
      <div className={styles.assetsSection}>
        <div className={styles.assetsSectionTitle}>Galleries</div>
        <div className={styles.assetsEmpty}>
          No galleries created yet
        </div>
        <span className={styles.healthTileCta} onClick={handleOpenFileManager}>
          Open Gallery <ChevronRight size={12} />
        </span>
      </div>
    );
  }

  return (
    <div className={styles.assetsSection}>
      <div className={styles.assetsSectionTitle}>
        Galleries ({galleries.length})
      </div>
      <div className={styles.galleryGrid}>
        {thumbnails.map((thumb, idx) => (
          <img
            key={idx}
            src={getFileUrl(thumb)}
            alt={`Gallery image ${idx + 1}`}
            className={styles.galleryThumb}
            onClick={(e) => handleImageClick(e, idx)}
            role="button"
            tabIndex={0}
          />
        ))}
        {thumbnails.length === 0 && (
          <div className={styles.galleryThumbMore} onClick={handleOpenFileManager}>
            <Image size={20} />
          </div>
        )}
        {totalImages > 4 && (
          <div 
            className={styles.galleryThumbMore}
            onClick={(e) => handleImageClick(e, 4)}
            role="button"
            tabIndex={0}
          >
            +{totalImages - 4}
          </div>
        )}
      </div>
      <span className={styles.healthTileCta} onClick={handleOpenFileManager}>
        Open Galleries <ChevronRight size={12} />
      </span>

      {/* Lightbox */}
      {lightboxOpen && allImages.length > 0 && (
        <GalleryLightbox
          images={allImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
          onOpenFileManager={handleOpenFileManager}
        />
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AssetsPreview({
  projectId,
  projectTitle,
  deckVersions,
  galleries,
}: AssetsPreviewProps) {
  // Find the default or latest deck
  const latestDeck = useMemo(() => {
    if (deckVersions.length === 0) return null;
    return deckVersions.find(d => d.isDefault) || deckVersions[0];
  }, [deckVersions]);

  return (
    <div className={styles.assetsCard}>
      <DeckPreviewSection
        projectId={projectId}
        projectTitle={projectTitle}
        deck={latestDeck}
      />
      <GalleryPreviewSection
        projectId={projectId}
        projectTitle={projectTitle}
        galleries={galleries}
      />
    </div>
  );
}

export default AssetsPreview;
