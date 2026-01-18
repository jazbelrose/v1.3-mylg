/**
 * useFilesNavigation - Hook for opening files, respecting V2 feature flag
 * 
 * When files.v2.enabled is ON, navigates to /project/:id/files
 * When OFF, opens the legacy modal
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isFilesV2Enabled } from '@/shared/utils/featureFlags';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';

interface UseFilesNavigationOptions {
  projectId: string | undefined;
  projectTitle?: string | null;
  /** Callback to open legacy modal (when V2 is disabled) */
  openLegacyModal: () => void;
}

interface UseFilesNavigationResult {
  /** Open files - either navigates to V2 or opens modal */
  openFiles: () => void;
  /** Whether V2 is enabled */
  isV2Enabled: boolean;
}

export function useFilesNavigation({
  projectId,
  projectTitle,
  openLegacyModal,
}: UseFilesNavigationOptions): UseFilesNavigationResult {
  const navigate = useNavigate();
  const isV2Enabled = isFilesV2Enabled();

  const openFiles = useCallback(() => {
    if (isV2Enabled && projectId) {
      // Navigate to V2 full-page file manager
      const filesPath = getProjectDashboardPath(
        projectId,
        projectTitle ?? undefined,
        '/files'
      );
      navigate(filesPath);
    } else {
      // Open legacy modal
      openLegacyModal();
    }
  }, [isV2Enabled, projectId, projectTitle, navigate, openLegacyModal]);

  return {
    openFiles,
    isV2Enabled,
  };
}

export default useFilesNavigation;
