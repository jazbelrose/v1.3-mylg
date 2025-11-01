import React from "react";
import { useParams } from "react-router-dom";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import { useData } from "@/app/contexts/useData";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import MoodboardCanvas from "../components/MoodboardCanvas";

const MoodboardPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { activeProject, fetchProjectDetails, userId, setActiveProject } = useData();

  React.useEffect(() => {
    if (!projectId) return;
    if (!activeProject || activeProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails]);

  const coverImage = React.useMemo(
    () => resolveProjectCoverUrl(activeProject),
    [activeProject]
  );
  const palette = useProjectPalette(coverImage, { color: activeProject?.color });

  if (!projectId || !activeProject) {
    return null;
  }

  return (
    <ProjectPageLayout
      projectId={projectId}
      theme={palette}
      header={
        <ProjectHeader
          activeProject={activeProject}
          userId={userId}
          parseStatusToNumber={() => 0}
          onActiveProjectChange={setActiveProject}
        />
      }
    >
      <MoodboardCanvas
        projectId={projectId}
        initialState={(activeProject as { moodboardCanvas?: string }).moodboardCanvas}
      />
    </ProjectPageLayout>
  );
};

export default MoodboardPage;
