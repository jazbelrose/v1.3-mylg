/**
 * ProjectPoster - Hero visual element for Overview HUD
 * 
 * Provides visual identity without clutter. Shows:
 * 1. Latest deck cover (if exists)
 * 2. Gallery mosaic (if no deck)
 * 3. Gradient + monogram placeholder (fallback)
 * 
 * Includes overlay with project info and status chips.
 * Clickable → navigates to Slides or Gallery.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Calendar,
  Layers,
} from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { formatRelativeTime } from '../utils';
import { MiniMapTile } from './MiniMapTile';
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

interface ProjectPosterProps {
  projectId: string;
  projectTitle: string;
  projectColor?: string;
  startDate?: string;
  endDate?: string;
  coverImage?: string;
  deckVersions?: DeckVersion[];
  galleries?: Gallery[];
  // Location for map tile
  locationName?: string;
  locationCoords?: { lat: number; lng: number };
  onOpenMap?: () => void;
  // Status metrics for overlay chips
  risksCount?: number;
  tasksDueCount?: number;
  completedPercent?: number;
}

// ============================================================================
// HELPER FUNCTIONS
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
  // Use project color if available, otherwise generate from title
  if (baseColor) {
    return `linear-gradient(135deg, ${baseColor} 0%, ${adjustColor(baseColor, -30)} 100%)`;
  }
  
  // Generate consistent color from title
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 65%, 45%) 0%, hsl(${(hue + 30) % 360}, 55%, 35%) 100%)`;
}

function adjustColor(hex: string, amount: number): string {
  // Simple color adjustment - darken or lighten
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    
    if (startYear === endYear) {
      return `${formatDate(start)} – ${formatDate(end)}, ${endYear}`;
    }
    return `${formatDate(start)}, ${startYear} – ${formatDate(end)}, ${endYear}`;
  }
  
  if (start) return `Starts ${formatDate(start)}`;
  if (end) return `Due ${formatDate(end)}`;
  return '';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StatusChipProps {
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'warning' | 'success';
}

function StatusChip({ icon, label, variant = 'default' }: StatusChipProps) {
  return (
    <div className={`${styles.posterChip} ${styles[`posterChip${variant.charAt(0).toUpperCase() + variant.slice(1)}`] || ''}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

interface GalleryMosaicProps {
  images: Array<{ url?: string; thumbnail?: string }>;
}

function GalleryMosaic({ images }: GalleryMosaicProps) {
  // Take up to 6 images for mosaic
  const mosaicImages = images.slice(0, 6);
  const count = mosaicImages.length;
  
  // Different layouts based on image count
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

export function ProjectPoster({
  projectId,
  projectTitle,
  projectColor,
  startDate,
  endDate,
  coverImage,
  deckVersions = [],
  galleries = [],
  locationName,
  locationCoords,
  onOpenMap,
  risksCount = 0,
  tasksDueCount = 0,
  completedPercent,
}: ProjectPosterProps) {
  const navigate = useNavigate();
  
  // Determine what to show and where to navigate
  const posterData = useMemo(() => {
    // Priority 1: Cover image (if explicitly set)
    if (coverImage) {
      return {
        type: 'cover' as const,
        image: coverImage,
        navigateTo: 'slides',
      };
    }
    
    // Priority 2: Latest deck with thumbnail
    const deckWithThumb = deckVersions.find(d => d.thumbnail);
    if (deckWithThumb?.thumbnail) {
      return {
        type: 'deck' as const,
        image: deckWithThumb.thumbnail,
        slideCount: deckWithThumb.slideCount,
        version: deckWithThumb.version,
        navigateTo: 'slides',
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
          galleryTitle: galleryWithImages.title,
          navigateTo: 'gallery',
        };
      }
      if (galleryWithImages.thumbnail) {
        return {
          type: 'galleryThumb' as const,
          image: galleryWithImages.thumbnail,
          galleryTitle: galleryWithImages.title,
          navigateTo: 'gallery',
        };
      }
    }
    
    // Fallback: Gradient + monogram
    return {
      type: 'placeholder' as const,
      gradient: generateGradient(projectTitle, projectColor),
      monogram: getMonogram(projectTitle),
      navigateTo: 'slides', // Default to slides
    };
  }, [coverImage, deckVersions, galleries, projectTitle, projectColor]);
  
  const dateRange = useMemo(() => 
    formatDateRange(startDate, endDate), 
    [startDate, endDate]
  );
  
  const handleClick = () => {
    const path = getProjectDashboardPath(projectId, projectTitle, posterData.navigateTo);
    navigate(path);
  };
  
  // Render the visual content
  const renderVisual = () => {
    switch (posterData.type) {
      case 'cover':
      case 'deck':
      case 'galleryThumb':
        return (
          <img 
            src={posterData.image} 
            alt={projectTitle}
            className={styles.posterImage}
          />
        );
      
      case 'gallery':
        return <GalleryMosaic images={posterData.images} />;
      
      case 'placeholder':
        return (
          <div 
            className={styles.posterPlaceholder}
            style={{ background: posterData.gradient }}
          >
            <span className={styles.posterMonogram}>{posterData.monogram}</span>
          </div>
        );
    }
  };
  
  // Render deck badge if showing deck
  const renderDeckBadge = () => {
    if (posterData.type === 'deck' && posterData.slideCount) {
      return (
        <div className={styles.posterDeckBadge}>
          <Layers size={12} />
          <span>{posterData.slideCount} slides</span>
        </div>
      );
    }
    return null;
  };
  
  const handleMapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenMap?.();
  };

  // Check if we have valid coordinates for real map
  const hasValidCoords = locationCoords && 
    typeof locationCoords.lat === 'number' && 
    typeof locationCoords.lng === 'number' &&
    !isNaN(locationCoords.lat) && 
    !isNaN(locationCoords.lng);
  
  return (
    <div className={styles.projectPoster} onClick={handleClick}>
      {/* Visual Layer */}
      <div className={styles.posterVisual}>
        {renderVisual()}
        {renderDeckBadge()}
      </div>

      {/* Map Tile (top-right corner) - Real Leaflet map */}
      {hasValidCoords && (
        <div className={styles.posterMapTileWrapper} onClick={handleMapClick}>
          <MiniMapTile
            lat={locationCoords.lat}
            lng={locationCoords.lng}
            onClick={onOpenMap}
          />
        </div>
      )}
      
      {/* Overlay */}
      <div className={styles.posterOverlay}>
        {/* Project Info */}
        <div className={styles.posterInfo}>
          <h3 className={styles.posterTitle}>{projectTitle}</h3>
          {dateRange && (
            <div className={styles.posterDates}>
              <Calendar size={12} />
              <span>{dateRange}</span>
            </div>
          )}
        </div>
        
        {/* Status Chips */}
        <div className={styles.posterChips}>
          {risksCount > 0 && (
            <StatusChip 
              icon={<AlertTriangle size={12} />}
              label={`${risksCount} risk${risksCount !== 1 ? 's' : ''}`}
              variant="warning"
            />
          )}
          {tasksDueCount > 0 && (
            <StatusChip 
              icon={<Clock size={12} />}
              label={`${tasksDueCount} due`}
              variant="default"
            />
          )}
          {completedPercent !== undefined && completedPercent > 0 && (
            <StatusChip 
              icon={<CheckCircle2 size={12} />}
              label={`${Math.round(completedPercent)}%`}
              variant="success"
            />
          )}
        </div>
      </div>
      
      {/* Progress Ring (optional, shown in corner) */}
      {completedPercent !== undefined && completedPercent > 0 && (
        <div className={styles.posterProgressRing}>
          <svg viewBox="0 0 36 36">
            <path
              className={styles.progressBg}
              d="M18 2.0845
                 a 15.9155 15.9155 0 0 1 0 31.831
                 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={styles.progressFill}
              strokeDasharray={`${completedPercent}, 100`}
              d="M18 2.0845
                 a 15.9155 15.9155 0 0 1 0 31.831
                 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export default ProjectPoster;
