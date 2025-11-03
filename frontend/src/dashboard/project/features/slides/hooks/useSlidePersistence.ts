// hooks/useSlidePersistence.ts - Handle saving slide content to backend
import { useState, useCallback, useRef, useEffect } from "react";
import { notify } from "@/shared/ui/ToastNotifications";

interface UseSlidePersistenceOptions {
  projectId: string;
  slideId: string;
  onSaveSuccess?: () => void;
}

interface UseSlidePersistenceReturn {
  isSaving: boolean;
  isDirty: boolean;
  saveSlide: (content: string, showToast?: boolean) => Promise<void>;
  markDirty: () => void;
}

export function useSlidePersistence({
  projectId,
  slideId,
  onSaveSuccess,
}: UseSlidePersistenceOptions): UseSlidePersistenceReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const contentRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (isDirty && contentRef.current) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveSlide(contentRef.current, false);
      }, 2000);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isDirty, slideId, saveSlide]);

  const saveSlide = useCallback(
    async (content: string, showToast = true) => {
      if (!projectId || !slideId) {
        if (showToast) notify("error", "Missing project or slide ID");
        return;
      }

      contentRef.current = content;
      
      if (isSaving) {
        console.log("[Slides] Save already in progress, skipping");
        return;
      }

      setIsSaving(true);
      try {
        // TODO: Replace with actual API call once backend endpoint is ready
        // For now, just simulate a save
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        console.log(`[Slides] Saved slide ${slideId} content:`, content.substring(0, 100));
        
        setIsDirty(false);
        if (showToast) notify("success", "Slide saved");
        onSaveSuccess?.();
      } catch (err) {
        const error = err as { message?: string };
        console.error("[Slides] Failed to save slide:", error);
        if (showToast) {
          notify("error", "Failed to save slide. Your edits are safe locally.");
        }
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, slideId, isSaving, onSaveSuccess]
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  return {
    isSaving,
    isDirty,
    saveSlide,
    markDirty,
  };
}
