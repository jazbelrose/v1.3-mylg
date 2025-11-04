import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { useData } from "@/app/contexts/useData";
import type { Slide } from "@/shared/types/slides";
import { useSocket } from "@/app/contexts/useSocket";

export function useSlides(projectId?: string) {
  const { activeProject, updateProjectFields } = useData();
  const projId = projectId || (activeProject?.projectId as string | undefined);

  const slides: Slide[] = useMemo(() => {
    return (activeProject?.slides as Slide[] | undefined) || [];
  }, [activeProject?.slides]);

  const storageKey = useMemo(() => (projId ? `slides-active-${projId}` : undefined), [projId]);
  const [activeSlideId, setActiveSlideId] = useState<string | undefined>(() => {
    if (!storageKey) return undefined;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved || undefined;
    } catch {
      return undefined;
    }
  });

  // Ensure an active slide is selected when slides change
  useEffect(() => {
    if (!slides?.length) return;
    if (!activeSlideId || !slides.find((s) => s.id === activeSlideId)) {
      setActiveSlideId(slides[0].id);
    }
  }, [slides, activeSlideId]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (activeSlideId) localStorage.setItem(storageKey, activeSlideId);
    } catch {/* ignore */}
  }, [activeSlideId, storageKey]);

  const { ws } = useSocket();

  const addSlide = useCallback(async () => {
    if (!projId) return;
    const newSlide: Slide = { id: uuid(), title: `Slide ${slides.length + 1}` };
    const next = [...slides, newSlide];
    try {
      await updateProjectFields(projId, { slides: next });
      setActiveSlideId(newSlide.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "slidesUpdated", projectId: projId, type: "add", slideId: newSlide.id }));
      }
    } catch (err) {
      console.error("Failed to add slide", err);
    }
  }, [projId, slides, updateProjectFields]);

  const deleteSlide = useCallback(async (slideId: string) => {
    if (!projId) return;
    const next = slides.filter((s) => s.id !== slideId);
    try {
      await updateProjectFields(projId, { slides: next });
      if (activeSlideId === slideId) {
        setActiveSlideId(next[0]?.id);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "slidesUpdated", projectId: projId, type: "delete", slideId }));
      }
    } catch (err) {
      console.error("Failed to delete slide", err);
    }
  }, [projId, slides, activeSlideId, updateProjectFields, ws]);

  const renameSlide = useCallback(async (slideId: string, title: string) => {
    if (!projId) return;
    const next = slides.map((s) => (s.id === slideId ? { ...s, title } : s));
    try {
      await updateProjectFields(projId, { slides: next });
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "slidesUpdated", projectId: projId, type: "rename", slideId, title }));
      }
    } catch (err) {
      console.error("Failed to rename slide", err);
    }
  }, [projId, slides, updateProjectFields, ws]);

  const activeSlide = useMemo(() => slides.find((s) => s.id === activeSlideId), [slides, activeSlideId]);

  return {
    slides,
    activeSlide,
    activeSlideId,
    setActiveSlideId,
    addSlide,
    deleteSlide,
    renameSlide,
  } as const;
}
