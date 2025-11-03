// lib/featureFlags.ts - Feature flags for slides mode
/**
 * Check if slides mode is enabled for a project
 * Can be extended to check user preferences, project settings, etc.
 */
export function isSlidesMode(projectId?: string): boolean {
  // For now, slides mode is enabled for all projects
  // This can be extended to check localStorage, project settings, or API flags
  if (!projectId) return false;
  
  // Check if explicitly enabled in localStorage
  try {
    const stored = localStorage.getItem(`slides-mode-${projectId}`);
    if (stored !== null) {
      return stored === "true";
    }
  } catch {
    // Ignore localStorage errors
  }
  
  // Default: enabled for all projects
  return true;
}

/**
 * Enable slides mode for a project
 */
export function enableSlidesMode(projectId: string): void {
  try {
    localStorage.setItem(`slides-mode-${projectId}`, "true");
  } catch {
    console.error("Failed to enable slides mode in localStorage");
  }
}

/**
 * Disable slides mode for a project
 */
export function disableSlidesMode(projectId: string): void {
  try {
    localStorage.setItem(`slides-mode-${projectId}`, "false");
  } catch {
    console.error("Failed to disable slides mode in localStorage");
  }
}
