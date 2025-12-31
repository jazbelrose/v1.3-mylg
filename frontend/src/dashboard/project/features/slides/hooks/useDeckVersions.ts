// useDeckVersions.ts - Hook for managing slide deck versions
import { useState, useCallback, useEffect, useMemo } from "react";
import { DeckVersion, DeckVersionStatus, Slide, Role } from "@/app/contexts/DataProvider";
import { useData } from "@/app/contexts/useData";
import {
  apiFetch,
  deckVersionsUrl,
  deckVersionUrl,
  setDefaultVersionUrl,
  setClientDefaultVersionUrl,
  duplicateVersionUrl,
} from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";

export interface UseDeckVersionsOptions {
  projectId: string;
  /** Auto-load versions on mount */
  autoLoad?: boolean;
}

export interface UseDeckVersionsReturn {
  /** All versions available to the current user */
  versions: DeckVersion[];
  /** Currently active version */
  activeVersion: DeckVersion | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Fetch/refresh versions from API */
  fetchVersions: () => Promise<void>;
  /** Create a new version */
  createVersion: (options: CreateVersionOptions) => Promise<DeckVersion | null>;
  /** Update an existing version */
  updateVersion: (versionId: string, updates: UpdateVersionOptions) => Promise<DeckVersion | null>;
  /** Delete a version */
  deleteVersion: (versionId: string) => Promise<boolean>;
  /** Set a version as default */
  setDefaultVersion: (versionId: string) => Promise<boolean>;
  /** Set a version as client default */
  setClientDefaultVersion: (versionId: string) => Promise<boolean>;
  /** Duplicate a version */
  duplicateVersion: (versionId: string, name?: string) => Promise<DeckVersion | null>;
  /** Switch to a different version */
  switchVersion: (versionId: string) => void;
  /** Get the default version for the current user */
  getDefaultVersionForUser: () => DeckVersion | null;
  /** Check if user can manage versions (admin/designer) */
  canManageVersions: boolean;
}

export interface CreateVersionOptions {
  name: string;
  status?: DeckVersionStatus;
  notes?: string;
  allowedRoles?: Role[];
  /** If provided, duplicate slides from this version */
  duplicateFromVersionId?: string;
  /** Initial slides if not duplicating */
  slides?: Slide[];
}

export interface UpdateVersionOptions {
  name?: string;
  status?: DeckVersionStatus;
  notes?: string;
  slides?: Slide[];
  allowedRoles?: Role[];
}

export function useDeckVersions({
  projectId,
  autoLoad = true,
}: UseDeckVersionsOptions): UseDeckVersionsReturn {
  const { isAdmin, isDesigner, isClient } = useData();
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageVersions = isAdmin || isDesigner;

  // Active version object
  const activeVersion = useMemo(
    () => versions.find((v) => v.versionId === activeVersionId) ?? null,
    [versions, activeVersionId]
  );

  // Get default version for current user
  const getDefaultVersionForUser = useCallback((): DeckVersion | null => {
    if (!versions.length) return null;

    // For clients, prefer clientDefault
    if (isClient) {
      const clientDefault = versions.find((v) => v.isClientDefault);
      if (clientDefault) return clientDefault;
    }

    // Otherwise use the default version
    const defaultVersion = versions.find((v) => v.isDefault);
    if (defaultVersion) return defaultVersion;

    // Fallback to first version
    return versions[0] ?? null;
  }, [versions, isClient]);

  // Fetch versions from API
  const fetchVersions = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch<DeckVersion[]>(deckVersionsUrl(projectId));
      setVersions(data);

      // If no active version, set default
      if (!activeVersionId || !data.some((v) => v.versionId === activeVersionId)) {
        const defaultVer = data.find((v) => {
          if (isClient && v.isClientDefault) return true;
          return v.isDefault;
        }) ?? data[0];
        if (defaultVer) {
          setActiveVersionId(defaultVer.versionId);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load versions";
      setError(message);
      console.error("Failed to fetch deck versions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, activeVersionId, isClient]);

  // Create new version
  const createVersion = useCallback(
    async (options: CreateVersionOptions): Promise<DeckVersion | null> => {
      if (!projectId) return null;

      try {
        const newVersion = await apiFetch<DeckVersion>(deckVersionsUrl(projectId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });

        setVersions((prev) => [...prev, newVersion]);
        notify("success", `Version "${newVersion.name}" created`);
        return newVersion;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create version";
        notify("error", message);
        console.error("Failed to create deck version:", err);
        return null;
      }
    },
    [projectId]
  );

  // Update version
  const updateVersion = useCallback(
    async (versionId: string, updates: UpdateVersionOptions): Promise<DeckVersion | null> => {
      if (!projectId) return null;

      try {
        const updated = await apiFetch<DeckVersion>(deckVersionUrl(projectId, versionId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        setVersions((prev) =>
          prev.map((v) => (v.versionId === versionId ? updated : v))
        );
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update version";
        notify("error", message);
        console.error("Failed to update deck version:", err);
        return null;
      }
    },
    [projectId]
  );

  // Delete version
  const deleteVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      if (!projectId) return false;

      try {
        await apiFetch(deckVersionUrl(projectId, versionId), {
          method: "DELETE",
        });

        setVersions((prev) => prev.filter((v) => v.versionId !== versionId));

        // If deleted version was active, switch to default
        if (activeVersionId === versionId) {
          const remaining = versions.filter((v) => v.versionId !== versionId);
          const newActive = remaining.find((v) => v.isDefault) ?? remaining[0];
          if (newActive) {
            setActiveVersionId(newActive.versionId);
          }
        }

        notify("success", "Version deleted");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete version";
        notify("error", message);
        console.error("Failed to delete deck version:", err);
        return false;
      }
    },
    [projectId, activeVersionId, versions]
  );

  // Set default version
  const setDefaultVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      if (!projectId) return false;

      try {
        const updated = await apiFetch<DeckVersion>(setDefaultVersionUrl(projectId, versionId), {
          method: "POST",
        });

        setVersions((prev) =>
          prev.map((v) => ({
            ...v,
            isDefault: v.versionId === versionId,
          }))
        );

        notify("success", `"${updated.name}" is now the default version`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set default version";
        notify("error", message);
        console.error("Failed to set default version:", err);
        return false;
      }
    },
    [projectId]
  );

  // Set client default version
  const setClientDefaultVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      if (!projectId) return false;

      try {
        const updated = await apiFetch<DeckVersion>(setClientDefaultVersionUrl(projectId, versionId), {
          method: "POST",
        });

        setVersions((prev) =>
          prev.map((v) => ({
            ...v,
            isClientDefault: v.versionId === versionId,
          }))
        );

        notify("success", `"${updated.name}" is now the client default version`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set client default version";
        notify("error", message);
        console.error("Failed to set client default version:", err);
        return false;
      }
    },
    [projectId]
  );

  // Duplicate version
  const duplicateVersion = useCallback(
    async (versionId: string, name?: string): Promise<DeckVersion | null> => {
      if (!projectId) return null;

      try {
        const duplicated = await apiFetch<DeckVersion>(duplicateVersionUrl(projectId, versionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        setVersions((prev) => [...prev, duplicated]);
        notify("success", `Version duplicated as "${duplicated.name}"`);
        return duplicated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to duplicate version";
        notify("error", message);
        console.error("Failed to duplicate deck version:", err);
        return null;
      }
    },
    [projectId]
  );

  // Switch active version
  const switchVersion = useCallback((versionId: string) => {
    setActiveVersionId(versionId);
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && projectId) {
      fetchVersions();
    }
  }, [autoLoad, projectId, fetchVersions]);

  return {
    versions,
    activeVersion,
    isLoading,
    error,
    fetchVersions,
    createVersion,
    updateVersion,
    deleteVersion,
    setDefaultVersion,
    setClientDefaultVersion,
    duplicateVersion,
    switchVersion,
    getDefaultVersionForUser,
    canManageVersions,
  };
}

export default useDeckVersions;
