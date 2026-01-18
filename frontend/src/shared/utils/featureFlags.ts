/**
 * Centralized Feature Flags Utility
 * 
 * Flags can be controlled via:
 * 1. Environment variables (VITE_*)
 * 2. localStorage for dev/testing
 * 3. User/org settings (future)
 */

export interface FeatureFlags {
  'files.v2.enabled': boolean;
  // Add more flags here as needed
}

const FLAG_DEFAULTS: FeatureFlags = {
  'files.v2.enabled': false,
};

// Environment variable mapping
const ENV_OVERRIDES: Partial<Record<keyof FeatureFlags, string>> = {
  'files.v2.enabled': 'VITE_FILES_V2_ENABLED',
};

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  // 1. Check environment variable first
  const envKey = ENV_OVERRIDES[flag];
  if (envKey) {
    const envValue = import.meta.env[envKey];
    if (envValue !== undefined) {
      return envValue === 'true' || envValue === '1';
    }
  }

  // 2. Check localStorage override (for dev/testing)
  try {
    const stored = localStorage.getItem(`feature:${flag}`);
    if (stored !== null) {
      return stored === 'true';
    }
  } catch {
    // Ignore localStorage errors (SSR, private browsing, etc.)
  }

  // 3. Return default
  return FLAG_DEFAULTS[flag];
}

/**
 * Enable a feature flag (localStorage only - for dev/testing)
 */
export function enableFeature(flag: keyof FeatureFlags): void {
  try {
    localStorage.setItem(`feature:${flag}`, 'true');
  } catch {
    console.error(`Failed to enable feature: ${flag}`);
  }
}

/**
 * Disable a feature flag (localStorage only)
 */
export function disableFeature(flag: keyof FeatureFlags): void {
  try {
    localStorage.setItem(`feature:${flag}`, 'false');
  } catch {
    console.error(`Failed to disable feature: ${flag}`);
  }
}

/**
 * Reset a feature flag to default (remove localStorage override)
 */
export function resetFeature(flag: keyof FeatureFlags): void {
  try {
    localStorage.removeItem(`feature:${flag}`);
  } catch {
    console.error(`Failed to reset feature: ${flag}`);
  }
}

/**
 * Get all current feature flag states
 */
export function getAllFeatureFlags(): FeatureFlags {
  return Object.keys(FLAG_DEFAULTS).reduce((acc, key) => {
    const flag = key as keyof FeatureFlags;
    acc[flag] = isFeatureEnabled(flag);
    return acc;
  }, {} as FeatureFlags);
}

// Expose to window for easy dev toggle in console
if (typeof window !== 'undefined') {
  (window as typeof window & { featureFlags?: object }).featureFlags = {
    isEnabled: isFeatureEnabled,
    enable: enableFeature,
    disable: disableFeature,
    reset: resetFeature,
    getAll: getAllFeatureFlags,
  };
}
