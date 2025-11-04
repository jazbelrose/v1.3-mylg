// Hook to manage slide persistence to backend
import { useCallback, useRef } from "react";
import { notify } from "@/shared/ui/ToastNotifications";
import type { Slide, Project } from "@/shared/utils/api";

interface UseSlidePersistenceOptions {
  projectId: string;
  updateProjectFields: (projectId: string, fields: Partial<Project>) => Promise<void>;
  onSlidesUpdate?: (slides: Slide[]) => void;
}

const SAVE_DEBOUNCE_MS = 2000;

/**
 * Hook to manage saving slides to the backend with debouncing
 */
export function useSlidePersistence({
  projectId,
  updateProjectFields,
  onSlidesUpdate,
}: UseSlidePersistenceOptions) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const saveSlide = useCallback(
    async (slideId: string, content: string, slides: Slide[]) => {
      try {
        const updatedSlides = slides.map((s) =>
          s.id === slideId
            ? { ...s, content, updatedAt: new Date().toISOString() }
            : s
        );

        // Save to backend
        await updateProjectFields(projectId, { slides: updatedSlides });
        
        console.log(`[Slides] Saved slide ${slideId} to project ${projectId}`);
        
        if (onSlidesUpdate) {
          onSlidesUpdate(updatedSlides);
        }

        return updatedSlides;
      } catch (err) {
        console.error(`[Slides] Failed to save slide ${slideId}:`, err);
        const error = err as Error;
        notify("error", error.message || "Failed to save slide");
        throw err;
      }
    },
    [projectId, updateProjectFields, onSlidesUpdate]
  );

  const debouncedSave = useCallback(
    (slideId: string, content: string, slides: Slide[]) => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout
      saveTimeoutRef.current = setTimeout(() => {
        saveSlide(slideId, content, slides);
      }, SAVE_DEBOUNCE_MS);
    },
    [saveSlide]
  );

  const saveImmediately = useCallback(
    (slideId: string, content: string, slides: Slide[]) => {
      // Clear any pending debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      return saveSlide(slideId, content, slides);
    },
    [saveSlide]
  );

  return {
    debouncedSave,
    saveImmediately,
  };
}
