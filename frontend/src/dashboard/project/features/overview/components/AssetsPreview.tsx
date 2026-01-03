/**
 * AssetsPreview - Deck and Gallery previews for Overview HUD
 * 
 * Shows latest deck thumbnail with version and gallery previews.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Image } from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
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
// GALLERY PREVIEW
// ============================================================================

interface GalleryPreviewProps {
  projectId: string;
  projectTitle?: string;
  galleries: Gallery[];
}

function GalleryPreviewSection({ projectId, projectTitle, galleries }: GalleryPreviewProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/gallery'));
  };

  // Get up to 3 thumbnails from galleries
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
          if (thumbs.length >= 3) break;
        }
      }
      if (thumbs.length >= 3) break;
    }
    return thumbs;
  }, [galleries]);

  const totalImages = useMemo(() => {
    return galleries.reduce((sum, g) => sum + (g.imageCount || g.images?.length || 0), 0);
  }, [galleries]);

  if (galleries.length === 0) {
    return (
      <div className={styles.assetsSection}>
        <div className={styles.assetsSectionTitle}>Galleries</div>
        <div className={styles.assetsEmpty}>
          No galleries created yet
        </div>
        <span className={styles.healthTileCta} onClick={handleClick}>
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
      <div
        className={styles.galleryGrid}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
      >
        {thumbnails.map((thumb, idx) => (
          <img
            key={idx}
            src={thumb}
            alt={`Gallery image ${idx + 1}`}
            className={styles.galleryThumb}
          />
        ))}
        {thumbnails.length === 0 && (
          <div className={styles.galleryThumbMore}>
            <Image size={20} />
          </div>
        )}
        {totalImages > 3 && (
          <div className={styles.galleryThumbMore}>
            +{totalImages - 3}
          </div>
        )}
      </div>
      <span className={styles.healthTileCta} onClick={handleClick}>
        Open Galleries <ChevronRight size={12} />
      </span>
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
