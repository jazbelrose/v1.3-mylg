/**
 * FilesOverlay - Full overlay wrapper for FileManager V2
 * 
 * Renders FileManagerV2 as an overlay on top of the current page,
 * preserving the background context. Uses portal rendering,
 * backdrop blur, focus trap, and keyboard shortcuts (ESC to close).
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '@/app/contexts/useData';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { FileManagerV2 } from '@/dashboard/project/components/FileManager';
import styles from './files-overlay.module.css';

interface LocationState {
  backgroundLocation?: {
    pathname: string;
    search?: string;
    hash?: string;
  };
}

interface FilesOverlayProps {
  projectId: string;
}

const FilesOverlay: React.FC<FilesOverlayProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  
  const { activeProject } = useData();
  
  // Get backgroundLocation from navigation state
  const locationState = location.state as LocationState | undefined;
  const backgroundLocation = locationState?.backgroundLocation;

  const handleClose = useCallback(() => {
    if (backgroundLocation) {
      // Return to the exact location user came from
      const path = backgroundLocation.pathname + 
        (backgroundLocation.search || '') + 
        (backgroundLocation.hash || '');
      navigate(path, { replace: true });
    } else if (projectId) {
      // Fallback: go to project overview
      const overviewPath = getProjectDashboardPath(
        projectId,
        activeProject?.title ?? undefined
      );
      navigate(overviewPath, { replace: true });
    } else {
      // Last resort fallback
      navigate('/dashboard', { replace: true });
    }
  }, [backgroundLocation, projectId, activeProject?.title, navigate]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Let FileManagerV2 handle ESC for its own modals first
        // Only close if the event wasn't already handled
        if (!e.defaultPrevented) {
          handleClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose]);

  // Prevent background scroll and manage focus
  useEffect(() => {
    // Store previous focus
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    
    // Prevent body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // Focus the overlay container
    if (overlayRef.current) {
      overlayRef.current.focus();
    }

    return () => {
      // Restore body scroll
      document.body.style.overflow = originalOverflow;
      
      // Restore focus
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not the content
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  // Trap focus within the overlay
  const handleKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !overlayRef.current) return;

    const focusableElements = overlayRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift + Tab: wrap from first to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: wrap from last to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  const overlayContent = (
    <div 
      className={styles.overlayBackdrop}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={overlayRef}
        className={styles.overlayContainer}
        role="dialog"
        aria-modal="true"
        aria-label="Files"
        tabIndex={-1}
        onKeyDown={handleKeyDownTrap}
      >
        <FileManagerV2
          folder="uploads"
          displayName="Project Files"
          isOpen={true}
          onRequestClose={handleClose}
          selectionMode="none"
          fileTypeFilter="all"
          showTrigger={false}
        />
      </div>
    </div>
  );

  // Render as portal to ensure it's on top of everything
  return createPortal(overlayContent, document.body);
};

export default FilesOverlay;
