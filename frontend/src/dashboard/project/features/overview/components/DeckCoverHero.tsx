/**
 * DeckCoverHero - Hero visual element with first slide as cover
 * 
 * Left 2/3: Big deck cover (first slide thumbnail)
 * - Title overlay: "Latest deck: Title · version · 2d ago"
 * - CTA: Open Deck
 * - Optional secondary: Download PDF / Share link
 * 
 * Falls back to gallery mosaic or gradient placeholder.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Presentation,
  Download,
  Share2,
  Layers,
  Calendar,
  Image
} from 'lucide-react';
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
  thumbnail?: string;
  imageCount?: number;
  images?: Array<{ url?: string; thumbnail?: string }>;
}

interface DeckCoverHeroProps {
  projectId: string;
  projectTitle: string;
  projectColor?: string;
  startDate?: string;
  endDate?: string;
  coverImage?: string;
  deckVersions?: DeckVersion[];
  galleries?: Gallery[];
  onOpenDeck?: () => void;
  onDownloadPdf?: () => void;
  onShare?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function getMonogram(title: string): string {
  if (!title) return '?';
  const words = title.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

function generateGradient(title: string, baseColor?: string): string {
  if (baseColor) {
    return `linear-gradient(135deg, ${baseColor} 0%, ${adjustColor(baseColor, -30)} 100%)`;
  }
  
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 65%, 45%) 0%, hsl(${(hue + 30) % 360}, 55%, 35%) 100%)`;
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return '';
  
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  if (start && end) {
    return `${formatDate(start)} – ${formatDate(end)}`;
  }
  
  if (start) return `Starts ${formatDate(start)}`;
  if (end) return `Due ${formatDate(end)}`;
  return '';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface GalleryMosaicProps {
  images: Array<{ url?: string; thumbnail?: string }>;
}

function GalleryMosaic({ images }: GalleryMosaicProps) {
  const mosaicImages = images.slice(0, 6);
  const count = mosaicImages.length;
  
  const getLayoutClass = () => {
    if (count <= 2) return styles.mosaicTwo;
    if (count <= 4) return styles.mosaicFour;
    return styles.mosaicSix;
  };
  
  return (
    <div className={`${styles.galleryMosaic} ${getLayoutClass()}`}>
      {mosaicImages.map((img, i) => (
        <div key={i} className={styles.mosaicImage}>
          <img 
            src={img.thumbnail || img.url} 
            alt="" 
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DeckCoverHero({
  projectId,
  projectTitle,
  projectColor,
  startDate,
  endDate,
  coverImage,
  deckVersions = [],
  galleries = [],
  onOpenDeck,
  onDownloadPdf,
  onShare,
}: DeckCoverHeroProps) {
  const navigate = useNavigate();
  
  // Determine what to show
  const heroData = useMemo(() => {
    // Priority 1: Cover image
    if (coverImage) {
      return {
        type: 'cover' as const,
        image: coverImage,
      };
    }
    
    // Priority 2: Latest deck with thumbnail
    const deckWithThumb = deckVersions.find(d => d.thumbnail);
    if (deckWithThumb?.thumbnail) {
      return {
        type: 'deck' as const,
        image: deckWithThumb.thumbnail,
        deck: deckWithThumb,
      };
    }
    
    // Priority 3: Gallery mosaic
    const galleryWithImages = galleries.find(g => 
      (g.images && g.images.length > 0) || g.thumbnail
    );
    if (galleryWithImages) {
      const images = galleryWithImages.images || [];
      if (images.length > 0) {
        return {
          type: 'gallery' as const,
          images,
        };
      }
      if (galleryWithImages.thumbnail) {
        return {
          type: 'galleryThumb' as const,
          image: galleryWithImages.thumbnail,
        };
      }
    }
    
    // Fallback: Gradient + monogram
    return {
      type: 'placeholder' as const,
      gradient: generateGradient(projectTitle, projectColor),
      monogram: getMonogram(projectTitle),
    };
  }, [coverImage, deckVersions, galleries, projectTitle, projectColor]);
  
  const latestDeck = useMemo(() => {
    return deckVersions.find(d => d.isDefault) || deckVersions[0] || null;
  }, [deckVersions]);
  
  const dateRange = useMemo(() => formatDateRange(startDate, endDate), [startDate, endDate]);
  
  const handleOpenDeck = () => {
    if (onOpenDeck) {
      onOpenDeck();
    } else {
      navigate(getProjectDashboardPath(projectId, projectTitle, '/slides'));
    }
  };
  
  const hasDeck = deckVersions.length > 0;
  
  // Deck info for overlay
  const deckInfo = useMemo(() => {
    if (!latestDeck) return null;
    
    const title = latestDeck.title || 'Untitled Deck';
    const version = latestDeck.version || 'v1';
    const timestamp = latestDeck.exportedAt || latestDeck.createdAt;
    const relTime = timestamp ? formatRelativeTime(timestamp) : null;
    
    return { title, version, relTime, slideCount: latestDeck.slideCount };
  }, [latestDeck]);
  
  // Render the visual content
  const renderVisual = () => {
    switch (heroData.type) {
      case 'cover':
      case 'deck':
      case 'galleryThumb':
        return (
          <img 
            src={heroData.image} 
            alt={projectTitle}
            className={styles.heroImage}
          />
        );
      
      case 'gallery':
        return <GalleryMosaic images={heroData.images} />;
      
      case 'placeholder':
        return (
          <div 
            className={styles.heroPlaceholder}
            style={{ background: heroData.gradient }}
          >
            <span className={styles.heroMonogram}>{heroData.monogram}</span>
          </div>
        );
    }
  };
  
  return (
    <div className={styles.deckCoverHero}>
      {/* Visual Layer */}
      <div className={styles.heroVisual}>
        {renderVisual()}
      </div>
      
      {/* Deck badge (if showing deck) */}
      {heroData.type === 'deck' && heroData.deck?.slideCount && (
        <div className={styles.heroDeckBadge}>
          <Layers size={12} />
          <span>{heroData.deck.slideCount} slides</span>
        </div>
      )}
      
      {/* Overlay */}
      <div className={styles.heroOverlay}>
        {/* Deck Info */}
        <div className={styles.heroInfo}>
          {deckInfo ? (
            <>
              <div className={styles.heroDeckLabel}>Latest deck</div>
              <h3 className={styles.heroTitle}>{deckInfo.title}</h3>
              <div className={styles.heroMeta}>
                <span>{deckInfo.version}</span>
                {deckInfo.relTime && <span>• {deckInfo.relTime}</span>}
              </div>
            </>
          ) : (
            <>
              <div className={styles.heroDeckLabel}>No deck yet</div>
              <h3 className={styles.heroTitle}>Create your first deck</h3>
              <div className={styles.heroMeta}>
                Get started with slides for {projectTitle}
              </div>
            </>
          )}
        </div>
        
        {/* Actions */}
        <div className={styles.heroActions}>
          <button
            type="button"
            className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}
            onClick={handleOpenDeck}
          >
            <Presentation size={16} />
            <span>{hasDeck ? 'Open Deck' : 'Create Deck'}</span>
          </button>
          {hasDeck && onDownloadPdf && (
            <button
              type="button"
              className={styles.heroBtn}
              onClick={onDownloadPdf}
            >
              <Download size={14} />
            </button>
          )}
          {hasDeck && onShare && (
            <button
              type="button"
              className={styles.heroBtn}
              onClick={onShare}
            >
              <Share2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeckCoverHero;
