import React from "react";
import { GalleryVerticalEnd } from "lucide-react";

import styles from "./gallery-component.module.css";
import { getPreviewUrl } from "./GalleryUtils";
import { Gallery } from "./types";
import { getFileUrl } from "../../../../shared/utils/api";

interface GalleryTriggerProps {
  galleries: Gallery[];
  onOpenModal: () => void;
}

const useCompactGalleryLayout = () => {
  const query = '(max-width: 768px)';
  const [isCompact, setIsCompact] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(query).matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);

    const updateMatches = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsCompact(event.matches);
    };

    updateMatches(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMatches);
      return () => mediaQuery.removeEventListener('change', updateMatches);
    }

    const legacyListener = (event: MediaQueryListEvent) => updateMatches(event);
    mediaQuery.addListener(legacyListener);
    return () => mediaQuery.removeListener(legacyListener);
  }, [query]);

  return isCompact;
};

const GalleryTrigger: React.FC<GalleryTriggerProps> = ({
  galleries,
  onOpenModal,
}) => {
  const isCompact = useCompactGalleryLayout();
  const hasGalleries = galleries.length > 0;
  const maxVisibleThumbs = isCompact ? 6 : 3;
  const visibleCount = Math.min(maxVisibleThumbs, galleries.length);
  const visibleGalleries = galleries.slice(0, visibleCount);
  const hiddenCount = galleries.length - visibleCount;

  return (
    <div
      className={`dashboard-item view-gallery ${styles.galleryTrigger}`}
      onClick={onOpenModal}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenModal();
        }
      }}
    >
      {/* Two equal columns: title (left) and thumbnails (right) */}
      <div className={styles.titleColumn}>
        <div className={styles.topRow}>
          <span>Galleries</span>
         
        </div>
        {hasGalleries ? (
          <p className={styles.galleryHelperText}>
            Peek at the latest uploads or jump into the full gallery.
          </p>
        ) : (
          <p className={styles.galleryHelperText}>Create your first gallery to showcase work.</p>
        )}
      </div>

      <div className={styles.thumbsColumn}>
        {hasGalleries ? (
          <div className={styles.carouselSection}>
            <div
              className={styles.thumbnailCarousel}
              aria-label="Gallery preview thumbnails"
            >
              {visibleGalleries.map((galleryItem, idx) => {
                const previewUrl = getPreviewUrl(galleryItem);
                const galleryName = galleryItem.name?.trim() || `Gallery ${idx + 1}`;

                return (
                  <button
                    key={galleryItem.slug || idx}
                    type="button"
                    className={styles.thumbnailButton}
                    aria-label={`Open ${galleryName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenModal();
                    }}
                  >
                    {previewUrl ? (
                      <img
                        src={getFileUrl(previewUrl)}
                        alt={galleryName}
                        loading="lazy"
                      />
                    ) : (
                      <span className={styles.thumbnailPlaceholder}>
                        <GalleryVerticalEnd size={24} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className={`${styles.thumbnailButton} ${styles.moreTile}`}
                  aria-label={`View ${hiddenCount} more galleries`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenModal();
                  }}
                >
                  +{hiddenCount}
                </button>
              )}
            </div>
            <span className={`${styles.carouselEdge} ${styles.carouselEdgeLeft}`} aria-hidden="true" />
            <span className={`${styles.carouselEdge} ${styles.carouselEdgeRight}`} aria-hidden="true" />
          </div>
        ) : (
          <div className={styles.emptyState}>No galleries yet</div>
        )}
      </div>
    </div>
  );
};

export default GalleryTrigger;
