// src/app/contexts/ProjectsProvider.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  PropsWithChildren,
} from "react";
import { v4 as uuid } from "uuid";
import pLimit from "../../shared/utils/pLimit";
import { useAuth } from "./useAuth";
import {
  fetchProjectsFromApi,
  fetchProjectById,
  fetchEvents,
  updateTimelineEvents as updateTimelineEventsApi,
  updateProjectFields as updateProjectFieldsApi,
  apiFetch,
  GET_PROJECT_MESSAGES_URL,
} from "../../shared/utils/api";
import { getWithTTL, setWithTTL, DEFAULT_TTL } from "../../shared/utils/storageWithTTL";
import { ProjectsContext } from "./ProjectsContext";
import type { ProjectsValue, DMReadStatusMap } from "./ProjectsContextValue";
import type { Project, TimelineEvent, Message } from "./DataProvider";
import { getDevPreviewData, isPreviewModeEnabled, subscribeToPreviewMode } from "@/shared/utils/devPreview";

const PreviewProjectsProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const preview = getDevPreviewData();
  const [projects, setProjects] = useState<Project[]>(preview.projects);
  const [activeProject, setActiveProject] = useState<Project | null>(preview.projects[0] ?? null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [opacity, setOpacity] = useState(1);
  const [settingsUpdated, setSettingsUpdated] = useState(false);
  const [dmReadStatus, setDmReadStatus] = useState<DMReadStatusMap>({});
  const [projectsError] = useState(false);
  const toggleSettingsUpdated = () => setSettingsUpdated((prev) => !prev);

  const fetchProjectDetails = async (projectId: string): Promise<boolean> => {
    const project = preview.projects.find((p) => p.projectId === projectId) ?? null;
    setActiveProject(project);
    return Boolean(project);
  };

  const fetchProjects = async () => {
    setProjects(preview.projects);
  };

  const fetchUserProfile = async () => undefined;

  const fetchRecentActivity = async () => preview.recentActivity;

  const updateTimelineEvents = async (projectId: string, events: TimelineEvent[]): Promise<void> => {
    setProjects((prevState) =>
      prevState.map((project) =>
        project.projectId === projectId ? { ...project, timelineEvents: events } : project
      )
    );
  };

  const updateProjectFields = async (projectId: string, fields: Partial<Project>): Promise<void> => {
    setProjects((prevState) =>
      prevState.map((project) =>
        project.projectId === projectId ? { ...project, ...fields } : project
      )
    );
  };

  const value: ProjectsValue = {
    projects,
    setProjects,
    setUserProjects: setProjects,
    isLoading: false,
    setIsLoading: () => undefined,
    loadingProfile: false,
    activeProject,
    setActiveProject,
    selectedProjects,
    setSelectedProjects,
    fetchProjectDetails,
    fetchProjects,
    fetchUserProfile,
    fetchRecentActivity,
    opacity,
    setOpacity,
    settingsUpdated,
    toggleSettingsUpdated,
    dmReadStatus,
    setDmReadStatus,
    projectsError,
    updateTimelineEvents,
    updateProjectFields,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
};

const mergeProjectWithFallback = (
  primary: Project,
  fallback?: Project | null
): Project => {
  if (!fallback) return primary;

  const merged: Project = { ...fallback, ...primary };

  (Object.keys(primary) as Array<keyof Project>).forEach((key) => {
    if (primary[key] === undefined && fallback[key] !== undefined) {
      merged[key] = fallback[key] as never;
    }
  });

  if (primary.timelineEvents !== undefined) {
    merged.timelineEvents = primary.timelineEvents;
  } else if (fallback.timelineEvents !== undefined && merged.timelineEvents === undefined) {
    merged.timelineEvents = fallback.timelineEvents;
  }

  if (Array.isArray(primary.thumbnails)) {
    merged.thumbnails = primary.thumbnails;
  } else if (
    (primary.thumbnails === undefined || primary.thumbnails === null) &&
    Array.isArray(fallback.thumbnails)
  ) {
    merged.thumbnails = fallback.thumbnails;
  }

  return merged;
};

const projectNeedsDetailHydration = (project: Project | null | undefined): project is Project =>
  Boolean(project) && (project.description === undefined || project.customFolders === undefined);

const RegularProjectsProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { userId } = useAuth();

  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [loadingProfile] = useState(false);

  const [activeProject, setActiveProject] = useState<Project | null>(() => {
    try {
      const stored = localStorage.getItem("dashboardActiveProject");
      return stored ? (JSON.parse(stored) as Project) : null;
    } catch {
      return null;
    }
  });

  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [projectsViewState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("dashboardViewState");
      if (!stored) return "projects-overview";
      if (stored === "welcome") return "projects-overview";
      if (stored === "projects") return "projects-list";
      return stored;
    } catch {
      return "projects-overview";
    }
  });

  const [opacity, setOpacity] = useState(0);
  const [settingsUpdated, setSettingsUpdated] = useState(false);

  const detailCacheRef = useRef<Map<string, Project>>(new Map());
  const detailInFlightRef = useRef(new Map<string, Promise<Project | null>>());
  const detailLimiterRef = useRef<ReturnType<typeof pLimit>>(pLimit(3));

  const [dmReadStatus, setDmReadStatus] = useState<DMReadStatusMap>(() => {
    const stored = getWithTTL("dmReadStatus");
    return stored && typeof stored === "object" ? (stored as DMReadStatusMap) : {};
  });

  useEffect(() => {
    setWithTTL("dmReadStatus", dmReadStatus, DEFAULT_TTL);
  }, [dmReadStatus]);

  // Persist UI bits
  useEffect(() => {
    try {
      localStorage.setItem("dashboardViewState", projectsViewState);
    } catch {
      /* ignore */
    }
  }, [projectsViewState]);

  useEffect(() => {
    try {
      if (activeProject) {
        localStorage.setItem("dashboardActiveProject", JSON.stringify(activeProject));
      } else {
        localStorage.removeItem("dashboardActiveProject");
      }
    } catch {
      /* ignore */
    }
  }, [activeProject]);

  // Helpers for event IDs
  const addIdsToEvents = useCallback((events: TimelineEvent[]) => {
    let changed = false;
    const seen = new Set<string>();
    const withIds: TimelineEvent[] = [];

    events.forEach((ev) => {
      let id = ev.id;
      if (!id) {
        id = uuid();
        changed = true;
      }
      if (seen.has(id)) {
        changed = true;
        return; // skip duplicates
      }
      seen.add(id);
      withIds.push(ev.id === id ? ev : { ...ev, id });
    });

    return { events: withIds, changed };
  }, []);

  const ensureProjectsHaveEventIds = useCallback(async (items: Project[]) => {
    const limit = pLimit(3) as <T>(fn: () => Promise<T>) => Promise<T>;
    const updated: Project[] = new Array(items.length);
    const tasks: Array<Promise<void>> = [];

    items.forEach((p, idx) => {
      if (!Array.isArray(p.timelineEvents)) {
        updated[idx] = p;
        return;
      }
      const { events, changed } = addIdsToEvents(p.timelineEvents);
      if (changed) {
        tasks.push(
          limit(async () => {
            try {
              await updateTimelineEventsApi(p.projectId, events);
            } catch (err) {
              console.error("Error persisting event ids", err);
            }
            updated[idx] = { ...p, timelineEvents: events };
          })
        );
      } else {
        updated[idx] = p;
      }
    });

    await Promise.all(tasks);
    return updated;
  }, [addIdsToEvents]);

  const toggleSettingsUpdated = () => setSettingsUpdated((prev) => !prev);

  const fetchProjectDetailLimited = useCallback(
    async (projectId: string, fallback: Project | null = null): Promise<Project | null> => {
      if (!projectId) return fallback;

      const cached = detailCacheRef.current.get(projectId);
      if (cached && !projectNeedsDetailHydration(cached)) {
        return cached;
      }

      const existing = detailInFlightRef.current.get(projectId);
      if (existing) {
        return existing;
      }

      const run = detailLimiterRef.current(async () => {
        const cachedAgain = detailCacheRef.current.get(projectId);
        if (cachedAgain && !projectNeedsDetailHydration(cachedAgain)) {
          return cachedAgain;
        }

        try {
          const fetched = await fetchProjectById(projectId);
          if (!fetched) return fallback;

          let merged = mergeProjectWithFallback(fetched, fallback ?? undefined);

          if (!Array.isArray(merged.timelineEvents)) {
            if (Array.isArray(fallback?.timelineEvents)) {
              merged = { ...merged, timelineEvents: fallback.timelineEvents };
            } else {
              try {
                const events = await fetchEvents(projectId);
                merged = { ...merged, timelineEvents: events as TimelineEvent[] };
              } catch (err) {
                console.error("Failed to fetch events during detail hydration", err);
                merged = { ...merged, timelineEvents: [] as TimelineEvent[] };
              }
            }
          }

          detailCacheRef.current.set(projectId, merged);
          return merged;
        } catch (err) {
          console.error("fetchProjectDetailLimited error", err);
          return fallback;
        }
      }).finally(() => {
        detailInFlightRef.current.delete(projectId);
      });

      detailInFlightRef.current.set(projectId, run);
      return run;
    },
    []
  );

  const hydrateProject = useCallback(
    async (proj: Project): Promise<Project> => {
      if (!proj?.projectId) return proj;

      let hydrated = proj;
      const cacheKey = `project-${proj.projectId}`;

      const cachedDetail = detailCacheRef.current.get(proj.projectId);
      if (cachedDetail) {
        hydrated = mergeProjectWithFallback(hydrated, cachedDetail);
      }

      if (projectNeedsDetailHydration(hydrated)) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as Project;
            hydrated = mergeProjectWithFallback(hydrated, parsed);
          }
        } catch {
          /* ignore */
        }
      }

      if (projectNeedsDetailHydration(hydrated)) {
        const detail = await fetchProjectDetailLimited(proj.projectId, hydrated);
        if (detail) {
          hydrated = mergeProjectWithFallback(detail, hydrated);
        }
      }

      try {
        localStorage.setItem(cacheKey, JSON.stringify(hydrated));
      } catch {
        /* ignore */
      }

      detailCacheRef.current.set(proj.projectId, hydrated);
      return hydrated;
    },
    [fetchProjectDetailLimited]
  );
  // Projects (debounced-ish)
  const lastFetchRef = useRef(0);
  const fetchProjects = useCallback<ProjectsValue["fetchProjects"]>(
    async (retryCount = 0) => {
      const now = Date.now();
      if (now - lastFetchRef.current < 2000 && retryCount === 0) return;
      lastFetchRef.current = now;

      setIsLoading(true);
      try {
        console.log('Fetching projects for userId:', userId);
        const dataItems = await fetchProjectsFromApi(userId);
        console.log('Received dataItems:', dataItems);
        
        const limit = pLimit(3) as <T>(fn: () => Promise<T>) => Promise<T>;

        const withEvents = await Promise.all(
          (Array.isArray(dataItems) ? (dataItems as Project[]) : []).map((p) =>
            limit(async () => {
              try {
                const events = await fetchEvents(p.projectId);
                return { ...p, timelineEvents: events as TimelineEvent[] };
              } catch (err) {
                console.error("Failed to fetch events", err);
                return { ...p, timelineEvents: [] as TimelineEvent[] };
              }
            })
          )
        );

        const withIds = await ensureProjectsHaveEventIds(withEvents);
        if (!withIds || !Array.isArray(withIds)) {
          console.error("Invalid data received:", dataItems);
          setProjects([]);
          setUserProjects([]);
          return;
        }


        const detailed = await Promise.all(withIds.map((proj) => hydrateProject(proj)));


        setProjects(detailed);
        setUserProjects(detailed);
        setActiveProject((prev) => {
          if (!prev) return prev;
          const updated = detailed.find((p) => p.projectId === prev.projectId);
          return updated ?? prev;
        });
      } catch (error) {
        console.error("Error fetching projects:", error);
        setProjectsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, ensureProjectsHaveEventIds, hydrateProject]
  );

  useEffect(() => {
    if (!userId) return;
    fetchProjects();
  }, [userId, fetchProjects]);

  // Single project details
  const fetchProjectDetails = useCallback<ProjectsValue["fetchProjectDetails"]>(
    async (projectId) => {
      if (!projects || !Array.isArray(projects)) {
        console.error("Projects data is not available yet.");
        return false;
      }

      let project = projects.find((p) => p.projectId === projectId) || null;

      if (projectNeedsDetailHydration(project)) {
        try {
          const cached = localStorage.getItem(`project-${projectId}`);
          if (cached) {
            const parsed = JSON.parse(cached) as Project;
            project = mergeProjectWithFallback(project, parsed);
          }
        } catch {
          /* ignore */
        }
      }

      const hydrated = await hydrateProject(
        project ?? ({ projectId } as Project)
      );

      if (!hydrated || !hydrated.projectId) {
        console.error(`Project with projectId: ${projectId} not found`);
        setActiveProject((prev) => (prev?.projectId === projectId ? null : prev));
        return false;
      }

      let patched: Project = hydrated;
      if (!Array.isArray(patched.team)) {
        patched = { ...patched, team: [] };
      }
      if (!Array.isArray(patched.timelineEvents)) {
        try {
          const events = (await fetchEvents(projectId)) as TimelineEvent[];
          patched = { ...patched, timelineEvents: events };
        } catch (err) {
          console.error("Failed to fetch events", err);
          patched = { ...patched, timelineEvents: [] as TimelineEvent[] };
        }
      }
      if (Array.isArray(patched.timelineEvents)) {
        const { events, changed } = addIdsToEvents(patched.timelineEvents);
        if (changed) {
          patched = { ...patched, timelineEvents: events };
          updateTimelineEventsApi(projectId, events).catch((err: unknown) => {
            console.error("Error persisting event ids", err);
          });
        }
      }

      detailCacheRef.current.set(projectId, patched);
      setActiveProject(patched);
      setProjects((prev) => {
        if (!Array.isArray(prev)) return prev;
        const idx = prev.findIndex((p) => p.projectId === projectId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = patched;
          return updated;
        }
        return [...prev, patched];
      });
      try {
        localStorage.setItem(`project-${projectId}`, JSON.stringify(patched));
      } catch {
        /* ignore */
      }
      return true;
    },
    [projects, addIdsToEvents, hydrateProject]
  );

  // Placeholder for fetchUserProfile - moved to AuthDataProvider
  const fetchUserProfile = useCallback(async () => {
    // This is now handled by AuthDataProvider
    console.log("fetchUserProfile called from ProjectsProvider - should use AuthDataProvider");
  }, []);

  // Update timeline
  const updateTimelineEvents = useCallback(async (projectId: string, events: TimelineEvent[]) => {
    const { events: withIds } = addIdsToEvents(events);
    try {
      await updateTimelineEventsApi(projectId, withIds);
      setActiveProject((prev) =>
        prev && prev.projectId === projectId ? { ...prev, timelineEvents: withIds } : prev
      );
      setProjects((prev) =>
        Array.isArray(prev)
          ? prev.map((p) => (p.projectId === projectId ? { ...p, timelineEvents: withIds } : p))
          : prev
      );
      setUserProjects((prev) =>
        Array.isArray(prev)
          ? prev.map((p) => (p.projectId === projectId ? { ...p, timelineEvents: withIds } : p))
          : prev
      );
    } catch (error) {
      console.error("Error updating timeline events:", error);
    }
  }, [addIdsToEvents]);

  // Generic project field update
  const updateProjectFields = async (projectId: string, fields: Partial<Project>) => {
    try {
      await updateProjectFieldsApi(projectId, fields);
      let mergedProject: Project | undefined;
      const merge = <T extends Project | null | undefined>(project: T): T => {
        if (!project || project.projectId !== projectId) return project;
        const updated: Project = { ...project };
        Object.entries(fields).forEach(([key, value]) => {
          if (key === "thumbnails" && Array.isArray(value)) {
            const prevThumbs = Array.isArray(project.thumbnails) ? project.thumbnails : [];
            updated.thumbnails = Array.from(new Set([...(value as string[]), ...prevThumbs]));
          } else {
            updated[key] = value as never;
          }
        });
        mergedProject = updated;
        return updated as T;
      };

      setActiveProject((prev) => merge(prev));
      setProjects((prev) => (Array.isArray(prev) ? prev.map((p) => merge(p)) : prev));
      setUserProjects((prev) => (Array.isArray(prev) ? prev.map((p) => merge(p)) : prev));

      if (mergedProject) {
        try {
          localStorage.setItem(`project-${projectId}`, JSON.stringify(mergedProject));
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.error("Error updating project fields:", error);
    }
  };

  // Recent activity
  const fetchRecentActivity = useCallback<ProjectsValue["fetchRecentActivity"]>(
    async (limit = 10) => {
      try {
        const events: Awaited<ReturnType<ProjectsValue["fetchRecentActivity"]>> = [];
        const projectsList = Array.isArray(userProjects) ? userProjects : [];

        for (const project of projectsList) {
          const projectTitle = project.title || "Project";
          const timeline = Array.isArray(project.timelineEvents) ? project.timelineEvents : [];
          timeline.forEach((ev) => {
            const ts = (ev.date || ev.timestamp) as string | undefined;
            if (!ts) return;
            events.push({
              id: `proj-${project.projectId}-${ev.id || uuid()}`,
              type: "project",
              projectId: project.projectId,
              projectTitle,
              text: ev.title || "Project updated",
              timestamp: ts,
            });
          });

          try {
            const msgs = await apiFetch<Message[] | unknown>(
              `${GET_PROJECT_MESSAGES_URL}?projectId=${project.projectId}`
            );
            if (Array.isArray(msgs)) {
              msgs.forEach((m) => {
                if (!m.timestamp) return;
                events.push({
                  id: `msg-${m.messageId || m.optimisticId}`,
                  type: "message",
                  projectId: project.projectId,
                  projectTitle,
                  text: m.text || m.body || m.content || "New message",
                  timestamp: m.timestamp,
                });
              });
            }
          } catch (err) {
            console.error("Failed to fetch messages for activity", err);
          }
        }

        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return events.slice(0, limit);
      } catch (err) {
        console.error("fetchRecentActivity error", err);
        return [];
      }
    },
    [userProjects]
  );

  const projectsValue = useMemo<ProjectsValue>(
    () => ({
      projects: userProjects,
      setProjects,
      setUserProjects,
      isLoading,
      setIsLoading,
      loadingProfile,
      activeProject,
      setActiveProject,
      selectedProjects,
      setSelectedProjects,
      fetchProjectDetails,
      fetchProjects,
      fetchUserProfile,
      fetchRecentActivity,
      opacity,
      setOpacity,
      settingsUpdated,
      toggleSettingsUpdated,
      dmReadStatus,
      setDmReadStatus,
      projectsError,
      updateTimelineEvents,
      updateProjectFields,
    }),
    [
      userProjects,
      isLoading,
      loadingProfile,
      activeProject,
      selectedProjects,
      fetchProjectDetails,
      fetchProjects,
      fetchUserProfile,
      fetchRecentActivity,
      opacity,
      settingsUpdated,
      dmReadStatus,
      projectsError,
      updateTimelineEvents,
    ]
  );

  return (
    <ProjectsContext.Provider value={projectsValue}>
      {children}
    </ProjectsContext.Provider>
  );
};

export const ProjectsProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [previewMode, setPreviewMode] = useState<boolean>(() => isPreviewModeEnabled());

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return subscribeToPreviewMode(() => {
      setPreviewMode(isPreviewModeEnabled());
    });
  }, []);

  if (previewMode) {
    return <PreviewProjectsProvider>{children}</PreviewProjectsProvider>;
  }

  return <RegularProjectsProvider>{children}</RegularProjectsProvider>;
};
