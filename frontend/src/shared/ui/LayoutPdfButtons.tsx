import React from 'react';
import { LayoutGrid, FileDown, ArrowLeft } from 'lucide-react';
import styles from './layout-pdf-buttons.module.css';
import { getFileUrl } from '../utils/api';

interface LayoutPdfButtonsProps {
  useMasonryLayout?: boolean;
  onToggleLayout?: () => void;
  downloadUrl?: string;
  isPdf?: boolean;
  className?: string;
  onBack?: () => void;
  backLabel?: string;
}

const LayoutPdfButtons: React.FC<LayoutPdfButtonsProps> = ({
  useMasonryLayout = false,
  onToggleLayout = () => {},
  downloadUrl = '',
  isPdf = true,
  className = '',
  onBack,
  backLabel = 'Back to dashboard',
}) => (
  <div className={`${styles.container} ${className}`.trim()}>
    {onBack && (
      <button type="button" onClick={onBack} className={styles.actionButton}>
        <ArrowLeft size={16} />
        <span>{backLabel}</span>
      </button>
    )}
    <div className={styles.actionGroup}>
      <div className={styles.layoutToggle}>
        <button
          type="button"
          onClick={onToggleLayout}
          className={styles.actionButton}
        >
          <LayoutGrid size={16} />
          <span>{useMasonryLayout ? 'Grid Layout' : 'Masonry Layout'}</span>
        </button>
      </div>
      {downloadUrl && (
        <a href={getFileUrl(downloadUrl)} download className={styles.actionButton}>
          <FileDown size={16} />
          <span>{isPdf ? 'Download PDF' : 'Download SVG'}</span>
        </a>
      )}
    </div>
  </div>
);

export default LayoutPdfButtons;










