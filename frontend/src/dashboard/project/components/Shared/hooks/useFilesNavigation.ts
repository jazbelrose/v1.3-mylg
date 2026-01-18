/**
 * useFilesNavigation - Hook for opening FileManager V2 overlay
 * 
 * Always navigates to /project/:id/files with backgroundLocation state,
 * which renders as an overlay on top of the current page.
 */

import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';

interface UseFilesNavigationOptions {
  projectId: string | undefined;
  projectTitle?: string | null;
}

interface UseFilesNavigationResult {
  /** Open files overlay - navigates to /files with backgroundLocation */
  openFiles: () => void;
}

export function useFilesNavigation({
  projectId,
  projectTitle,
}: UseFilesNavigationOptions): UseFilesNavigationResult {
  const navigate = useNavigate();
  const location = useLocation();

  const openFiles = useCallback(() => {
    if (!projectId) return;
    
    // Navigate to files route with backgroundLocation for overlay pattern
    const filesPath = getProjectDashboardPath(
      projectId,
      projectTitle ?? undefined,
      '/files'
    );
    
    // Pass current location as backgroundLocation so the overlay
    // renders on top of the current page and can return here on close
    navigate(filesPath, { 
      state: { 
        backgroundLocation: location 
      } 
    });
  }, [projectId, projectTitle, navigate, location]);

  return {
    openFiles,
  };
}

export default useFilesNavigation;
