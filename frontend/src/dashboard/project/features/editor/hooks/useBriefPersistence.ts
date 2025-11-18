import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "@/app/contexts/useData";

type UseBriefPersistenceOptions = {
  projectId?: string;
  content: string;
  enabled?: boolean;
  initialServerContent?: string; // activeProject.description
  debounceMs?: number;
};

export function useBriefPersistence({
  projectId,
  content,
  enabled = true,
  initialServerContent = "",
  debounceMs = 2000,
}: UseBriefPersistenceOptions) {
  const { updateProjectFields } = useData();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const lastSavedRef = useRef<string>(initialServerContent);
  const timeoutIdRef = useRef<number | null>(null);

  // Keep "last saved" in sync when we refetch the project from API
  useEffect(() => {
    lastSavedRef.current = initialServerContent;
  }, [initialServerContent]);

  const clearTimer = () => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  };

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!enabled || !projectId) return false;

    // Nothing new to save
    if (content === lastSavedRef.current) {
      setHasPendingChanges(false);
      return false;
    }

    clearTimer();
    setIsSaving(true);
    setError(null);

    try {
      await updateProjectFields(projectId, { description: content });
      lastSavedRef.current = content;
      setHasPendingChanges(false);
      return true;
    } catch (err) {
      const e = err as Error;
      console.error("[BriefPersistence] Failed to save brief:", e);
      setError(e);
      // still pending; user's edits are in memory/Yjs
      setHasPendingChanges(true);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [content, enabled, projectId, updateProjectFields]);

  // Debounced auto-save whenever content changes
  useEffect(() => {
    if (!enabled || !projectId) return;

    // If content == lastSaved, clear pending + timer
    if (content === lastSavedRef.current) {
      setHasPendingChanges(false);
      clearTimer();
      return;
    }

    setHasPendingChanges(true);
    clearTimer();

    timeoutIdRef.current = window.setTimeout(() => {
      void performSave();
    }, debounceMs);

    return () => {
      clearTimer();
    };
  }, [content, enabled, projectId, debounceMs, performSave]);

  // Manual "save now" (for Ctrl+S / toolbar)
  const saveNow = useCallback(async (): Promise<boolean> => {
    return performSave();
  }, [performSave]);

  return {
    isSaving,
    error,
    hasPendingChanges,
    saveNow,
  };
}