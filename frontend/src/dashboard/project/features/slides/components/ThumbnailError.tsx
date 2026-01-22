import React from 'react';
import { RefreshCw } from 'lucide-react';
import './ThumbnailError.css';

interface ThumbnailErrorProps {
  onRetry: () => void;
  message?: string;
  className?: string;
}

/**
 * Error state for slide thumbnails with retry button
 */
const ThumbnailError: React.FC<ThumbnailErrorProps> = ({ 
  onRetry, 
  message = 'Preview unavailable',
  className = '' 
}) => {
  return (
    <div className={`thumbnail-error ${className}`} role="alert">
      <div className="thumbnail-error__content">
        <p className="thumbnail-error__message">{message}</p>
        <button
          type="button"
          className="thumbnail-error__retry"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          aria-label="Retry loading thumbnail"
        >
          <RefreshCw size={16} />
          <span>Retry</span>
        </button>
      </div>
    </div>
  );
};

export default ThumbnailError;
