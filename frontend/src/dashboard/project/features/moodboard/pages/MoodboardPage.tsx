import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import MoodboardCanvas from "../components/MoodboardCanvas";
import { useData } from "@/app/contexts/useData";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import type { Project } from "@/app/contexts/DataProvider";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import ProjectLoadingState from "@/dashboard/project/components/Shared/ProjectLoadingState";

type DetailFetchStatus = "idle" | "loading" | "success" | "error";

const projectNeedsDetailHydration = (project?: Project | null): boolean =>
  Boolean(
    project &&
      (project.description === undefined ||
        project.customFolders === undefined ||
        !Array.isArray(project.team))
  );

const MoodboardPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeProject: initialProject,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
    userId,
  } = useData();

  const [activeProject, setActiveProject] = useState<Project | null>(initialProject ?? null);
  const [detailFetchStatusById, setDetailFetchStatusById] = useState<Record<string, DetailFetchStatus>>({});

  const requestProjectDetails = useCallback(
    async (id: string | undefined | null) => {
      if (!id) return;

      let shouldFetch = false;
      setDetailFetchStatusById((prev) => {
        const current = prev[id];
        if (current === "loading" || current === "success" || current === "error") {
          return prev;
        }
        shouldFetch = true;
        return { ...prev, [id]: "loading" };
      });

      if (!shouldFetch) return;

      try {
        const success = await fetchProjectDetails(id);
        setDetailFetchStatusById((prev) => {
          const nextStatus: DetailFetchStatus = success ? "success" : "error";
          if (prev[id] === nextStatus) return prev;
          return { ...prev, [id]: nextStatus };
        });
      } catch {
        setDetailFetchStatusById((prev) => {
          if (prev[id] === "error") return prev;
          return { ...prev, [id]: "error" };
        });
      }
    },
    [fetchProjectDetails]
  );

  const resolvedProject = activeProject ?? initialProject ?? null;
  const isProjectResolved = Boolean(projectId && resolvedProject?.projectId === projectId);
  const displayProject = isProjectResolved ? resolvedProject : null;

  const coverImage = useMemo(() => resolveProjectCoverUrl(displayProject), [displayProject]);
  const projectPalette = useProjectPalette(coverImage, {
    color: displayProject?.color,
  });

  useEffect(() => {
    setActiveProject(initialProject ?? null);
  }, [initialProject]);

  useEffect(() => {
    if (!projectId) return;

    const matchingProject =
      (initialProject && initialProject.projectId === projectId ? initialProject : null) ??
      (activeProject && activeProject.projectId === projectId ? activeProject : null);

    if (matchingProject && !projectNeedsDetailHydration(matchingProject)) {
      setDetailFetchStatusById((prev) => {
        if (prev[projectId] === "success") return prev;
        return { ...prev, [projectId]: "success" };
      });
      return;
    }

    if (detailFetchStatusById[projectId] === "error") {
      return;
    }

    void requestProjectDetails(projectId);
  }, [
    projectId,
    initialProject,
    activeProject,
    detailFetchStatusById,
    requestProjectDetails,
  ]);

  useEffect(() => {
    if (!activeProject?.projectId) return;
    if (projectNeedsDetailHydration(activeProject)) return;

    const targetId = activeProject.projectId;
    setDetailFetchStatusById((prev) => {
      if (prev[targetId] === "success") return prev;
      return { ...prev, [targetId]: "success" };
    });
  }, [activeProject]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title ?? initialProject?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/moodboard")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/moodboard");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject?.title,
    initialProject?.title,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    const targetId = activeProject?.projectId;
    if (!targetId) return;
    if (targetId === projectId) return;

    void requestProjectDetails(targetId);
  }, [activeProject?.projectId, projectId, requestProjectDetails]);

  const parseStatusToNumber = useCallback((status: string | number | undefined | null) => {
    if (status === undefined || status === null) return 0;
    const str = typeof status === "string" ? status : String(status);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  }, []);

  const handleProjectDeleted = useCallback(
    (projectId: string) => {
      setProjects((prev) => prev.filter((item) => item.projectId !== projectId));
      setSelectedProjects((prev) => prev.filter((id) => id !== projectId));
      navigate("/dashboard/projects/allprojects");
    },
    [navigate, setProjects, setSelectedProjects]
  );

  const handleActiveProjectChange = useCallback((project: Project) => {
    setActiveProject(project);
  }, []);

  const showWelcomeScreen = useCallback(() => {
    navigate("/dashboard/projects");
  }, [navigate]);

  const fetchStatus = projectId ? detailFetchStatusById[projectId] : undefined;
  const needsHydration = displayProject ? projectNeedsDetailHydration(displayProject) : true;
  const showErrorState = fetchStatus === "error";
  const showLoadingState = !showErrorState && (!displayProject || (needsHydration && fetchStatus !== "success"));

  const resolvedProjectId = displayProject?.projectId ?? "";
  const currentUserId = userId ?? "";

  const board = useMemo(
    () => (
      <AnimatePresence mode="wait">
        <motion.div
          key={resolvedProjectId || "moodboard"}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.25 }}
          style={{ height: "100%" }}
        >
          <MoodboardCanvas
            projectId={resolvedProjectId}
            userId={currentUserId}
            palette={projectPalette}
          />
        </motion.div>
      </AnimatePresence>
    ),
    [currentUserId, resolvedProjectId, projectPalette]
  );

  const headerNode = displayProject ? (
    <ProjectHeader
      parseStatusToNumber={parseStatusToNumber}
      userId={currentUserId}
      onProjectDeleted={handleProjectDeleted}
      activeProject={displayProject}
      showWelcomeScreen={showWelcomeScreen}
      onActiveProjectChange={handleActiveProjectChange}
      onOpenFiles={() => {}}
      onOpenQuickLinks={() => {}}
    />
  ) : null;

  const layoutProjectId = displayProject?.projectId ?? projectId ?? undefined;
  const layoutTheme = displayProject ? projectPalette : undefined;

  const unavailableState = (
    <div
      style={{
        alignItems: "center",
        color: "var(--text-muted, #6b7280)",
        display: "flex",
        fontSize: "1rem",
        justifyContent: "center",
        minHeight: "40vh",
        padding: "2rem",
        textAlign: "center",
        width: "100%",
      }}
    >
      We're having trouble loading this project right now.
    </div>
  );

  return (
    <ProjectPageLayout
      projectId={layoutProjectId}
      theme={layoutTheme}
      header={headerNode}
    >
      {showErrorState ? unavailableState : showLoadingState ? <ProjectLoadingState /> : board}
    </ProjectPageLayout>
  );
};

export default MoodboardPage;












