import React from 'react';
import './ThumbnailSkeleton.css';

interface ThumbnailSkeletonProps {
  className?: string;
}

/**
 * Skeleton loader for slide thumbnails
 * Provides visual feedback while thumbnails are loading
 */
const ThumbnailSkeleton: React.FC<ThumbnailSkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`thumbnail-skeleton ${className}`} role="status" aria-label="Loading thumbnail">
      <div className="thumbnail-skeleton__shimmer" />
      <div className="thumbnail-skeleton__content">
        <div className="thumbnail-skeleton__bar thumbnail-skeleton__bar--title" />
        <div className="thumbnail-skeleton__bar thumbnail-skeleton__bar--subtitle" />
      </div>
      <span className="sr-only">Loading preview...</span>
    </div>
  );
};

export default ThumbnailSkeleton;
