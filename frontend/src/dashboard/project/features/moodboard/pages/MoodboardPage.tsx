import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import CollaborativeFabricCanvas from "@/dashboard/project/features/canvas/components/CollaborativeFabricCanvas";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import { useData } from "@/app/contexts/useData";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";

const MoodboardPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { activeProject, userId } = useData();
  const quickLinksRef = React.useRef<QuickLinksRef>(null);
  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const palette = useProjectPalette(coverImage, { color: activeProject?.color });
  const resolvedProjectId = projectId ?? activeProject?.projectId;

  return (
    <ProjectPageLayout
      projectId={resolvedProjectId ?? undefined}
      theme={palette}
      header={
        <ProjectHeader
          activeProject={activeProject}
          parseStatusToNumber={() => 0}
          userId={userId}
          onActiveProjectChange={() => undefined}
          onProjectDeleted={() => undefined}
          showWelcomeScreen={() => undefined}
          onOpenFiles={() => undefined}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      }
    >
      <QuickLinksComponent ref={quickLinksRef} hideTrigger />
      {resolvedProjectId ? (
        <CollaborativeFabricCanvas
          projectId={resolvedProjectId}
          pageId="moodboard"
          documentId={`${resolvedProjectId}#moodboard`}
          backgroundColor={palette?.dominantColor ?? "#0f172a"}
          height={720}
        />
      ) : (
        <div style={{ padding: "3rem", textAlign: "center" }}>
          Select a project to load the collaborative moodboard.
        </div>
      )}
    </ProjectPageLayout>
  );
};

export default MoodboardPage;
