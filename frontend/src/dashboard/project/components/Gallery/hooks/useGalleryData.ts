import { useCallback, useEffect, useRef, useState } from "react";

import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import { fetchGalleries } from "@/shared/utils/api";
import { Gallery, ProjectLite } from "../types";

const isBrowser = typeof window !== "undefined";

const getPendingKey = (id: string) => `pendingSlugs-${id}`;
const getRecentKey = (id: string) => `recentlyCreated-${id}`;

const sanitizeGalleries = (list: unknown): Gallery[] =>
  Array.isArray(list) ? (list as Gallery[]).filter((g) => g && Object.keys(g).length > 0) : [];

const extractGalleries = (project?: ProjectLite) => {
  const legacy = sanitizeGalleries(project?.gallery);
  const current = sanitizeGalleries(project?.galleries);
  return { legacy, current };
};

export interface GalleryDataState {
  legacyGalleries: Gallery[];
  setLegacyGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>;
  galleries: Gallery[];
  setGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>;
  pendingSlugs: string[];
  setPendingSlugs: React.Dispatch<React.SetStateAction<string[]>>;
  recentlyCreated: string[];
  setRecentlyCreated: React.Dispatch<React.SetStateAction<string[]>>;
  pendingRef: React.MutableRefObject<string[]>;
  loadGalleries: () => Promise<void>;
  activeProjectId?: string;
  activeProjectTitle?: string;
  updateProjectFields?: (id: string, payload: Record<string, unknown>) => Promise<void>;
  isAdmin: boolean;
  isBuilder: boolean;
  isDesigner: boolean;
  fetchProjects: (page?: number) => Promise<void>;
  clientGallerySlug: string | null;
  setClientGallerySlug: React.Dispatch<React.SetStateAction<string | null>>;
}

const useGalleryData = (): GalleryDataState => {
  const {
    activeProject,
    isAdmin,
    isBuilder,
    isDesigner,
    fetchProjects,
    updateProjectFields,
  } = useData();
  const { ws } = useSocket() || {};

  const [legacyGalleries, setLegacyGalleries] = useState<Gallery[]>(() => {
    if (activeProject) {
      const { legacy } = extractGalleries(activeProject);
      return legacy;
    }
    return [];
  });
  const [galleries, setGalleries] = useState<Gallery[]>(() => {
    if (activeProject) {
      const { current } = extractGalleries(activeProject);
      return current;
    }
    return [];
  });
  const [pendingSlugs, setPendingSlugs] = useState<string[]>([]);
  const [recentlyCreated, setRecentlyCreated] = useState<string[]>([]);
  const pendingRef = useRef<string[]>([]);
  const [clientGallerySlug, setClientGallerySlug] = useState<string | null>(() => {
    const slug = activeProject?.clientGallerySlug;
    return typeof slug === "string" && slug.trim() ? slug : null;
  });

  useEffect(() => {
    pendingRef.current = pendingSlugs;
  }, [pendingSlugs]);

  const loadGalleries = useCallback(async () => {
    if (!activeProject?.projectId) {
      setLegacyGalleries([]);
      setGalleries([]);
      return;
    }

    const applyLists = (legacyList: Gallery[], currentList: Gallery[]) => {
      const cleanCurrent = sanitizeGalleries(currentList);
      const currentSlugs = cleanCurrent.map((g) => g.slug);
      const inProgress = galleries.filter(
        (g) => (g.uploading || g.processing) && !currentSlugs.includes(g.slug)
      );
      const mergedCurrent = [...cleanCurrent, ...inProgress];

      mergedCurrent.forEach((g) => {
        if (g.slug && pendingRef.current.includes(g.slug)) {
          setRecentlyCreated((prev) => [...prev, g.slug!]);
          setPendingSlugs((prev) => prev.filter((s) => s !== g.slug));
          setTimeout(() => {
            setRecentlyCreated((prev) => prev.filter((s) => s !== g.slug));
          }, 10000);
        }
      });

      setLegacyGalleries(legacyList);
      setGalleries(mergedCurrent);
    };

    const { legacy, current } = extractGalleries(activeProject as ProjectLite);

    try {
      const apiGals = await fetchGalleries(activeProject.projectId);
      if (Array.isArray(apiGals)) {
        const sanitizedApi = sanitizeGalleries(apiGals);

        // When the API returns an empty list we still want to expose the legacy
        // galleries stored on the project so they remain accessible/editable.
        if (sanitizedApi.length === 0 && legacy.length > 0) {
          applyLists(legacy, []);
          return;
        }

        applyLists(legacy, sanitizedApi);
        return;
      }
    } catch (err) {
      // If the API call fails, fall back to using the cached `activeProject` data.
      // Log the error so debugging is easier when the UI shows galleries that don't exist server-side.
      console.warn('fetchGalleries failed, falling back to cached activeProject galleries', err);
    }

    applyLists(legacy, current);
  }, [activeProject, galleries]);

  useEffect(() => {
    void loadGalleries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.projectId]);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.action === "galleryCreated" && data.projectId === activeProject?.projectId) {
          void loadGalleries();
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws, activeProject?.projectId, loadGalleries]);

  useEffect(() => {
    if (!activeProject) {
      setClientGallerySlug(null);
      return;
    }

    const slug = activeProject.clientGallerySlug;
    setClientGallerySlug(typeof slug === "string" && slug.trim() ? slug : null);
  }, [activeProject]);

  useEffect(() => {
    if (!activeProject?.projectId || !isBrowser) return;
    try {
      const storedPending = JSON.parse(
        window.localStorage.getItem(getPendingKey(activeProject.projectId)) || "[]"
      );
      setPendingSlugs(storedPending);
    } catch {
      setPendingSlugs([]);
    }
    try {
      const storedRecent = JSON.parse(
        window.localStorage.getItem(getRecentKey(activeProject.projectId)) || "[]"
      );
      setRecentlyCreated(storedRecent);
    } catch {
      setRecentlyCreated([]);
    }
  }, [activeProject?.projectId]);

  useEffect(() => {
    if (!activeProject?.projectId || !isBrowser) return;
    window.localStorage.setItem(
      getPendingKey(activeProject.projectId),
      JSON.stringify(pendingSlugs)
    );
  }, [pendingSlugs, activeProject?.projectId]);

  useEffect(() => {
    if (!activeProject?.projectId || !isBrowser) return;
    window.localStorage.setItem(
      getRecentKey(activeProject.projectId),
      JSON.stringify(recentlyCreated)
    );
  }, [recentlyCreated, activeProject?.projectId]);

  return {
    legacyGalleries,
    setLegacyGalleries,
    galleries,
    setGalleries,
    pendingSlugs,
    setPendingSlugs,
    recentlyCreated,
    setRecentlyCreated,
    pendingRef,
    loadGalleries,
    activeProjectId: activeProject?.projectId,
    activeProjectTitle: activeProject?.title,
    updateProjectFields,
    isAdmin,
    isBuilder,
    isDesigner,
    fetchProjects,
    clientGallerySlug,
    setClientGallerySlug,
  };
};

export default useGalleryData;
