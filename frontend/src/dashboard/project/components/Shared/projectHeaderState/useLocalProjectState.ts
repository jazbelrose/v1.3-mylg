import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type { Project } from "@/app/contexts/DataProvider";

import {
  deriveProjectInitial,
  getCanonicalProjectPath,
  normalizeProjectFromProps,
  normalizeStatus,
  useRangeLabels,
} from "../projectHeaderUtils";

export function useLocalProjectState(activeProject: Project | null) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = "" } = useParams<{ projectId: string }>();

  const [localProject, setLocalProject] = useState<Project>(
    normalizeProjectFromProps(activeProject)
  );

  useEffect(() => {
    setLocalProject(normalizeProjectFromProps(activeProject));
  }, [activeProject]);

  useEffect(() => {
    if (!localProject?.title || !localProject.projectId) return;
    if (!projectId || localProject.projectId !== projectId) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    const canonicalPath = getCanonicalProjectPath(localProject, currentPath);
    if (canonicalPath && currentPath !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [localProject, projectId, navigate, location.pathname]);

  const projectInitial = useMemo(
    () => deriveProjectInitial(localProject?.title),
    [localProject?.title]
  );

  const displayStatus = useMemo(
    () => normalizeStatus(localProject?.status as string | number | undefined),
    [localProject?.status]
  );

  const { rangeLabel, mobileRangeLabel } = useRangeLabels(localProject);

  const resolvedProjectId = (localProject?.projectId as string | undefined) || projectId;

  return {
    localProject,
    setLocalProject,
    projectInitial,
    displayStatus,
    rangeLabel,
    mobileRangeLabel,
    resolvedProjectId,
  };
}
