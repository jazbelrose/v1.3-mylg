/**
 * FilesPage - Full-page FileManager V2 route
 * 
 * This is a dedicated page for the new file manager experience.
 * Route: /project/:projectId/files
 */

import React, { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import { FileManagerV2 } from "@/dashboard/project/components/FileManager";
import styles from "./files-page.module.css";

const FilesPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const {
    activeProject,
    user,
  } = useData();

  const handleShowWelcome = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const handleOpenFiles = useCallback(() => {
    // Already on files page
  }, []);

  const handleOpenQuickLinks = useCallback(() => {
    // Could open a quick links modal
  }, []);

  if (!projectId || !activeProject) {
    return (
      <div className={styles.loadingContainer}>
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div className={styles.filesPageContainer}>
      <ProjectHeader
        activeProject={activeProject}
        onActiveProjectChange={() => {}}
        parseStatusToNumber={() => 0}
        showWelcomeScreen={handleShowWelcome}
        onProjectDeleted={() => navigate("/dashboard")}
        userId={(user?.id as string) || ""}
        onOpenFiles={handleOpenFiles}
        onOpenQuickLinks={handleOpenQuickLinks}
      />
      
      <main className={styles.filesPageMain}>
        {/* FileManagerV2 handles its own state internally via hooks */}
        <FileManagerV2
          folder="uploads"
          displayName="Project Files"
          isOpen={true}
          onRequestClose={() => {}}
          selectionMode="none"
          fileTypeFilter="all"
          showTrigger={false}
        />
      </main>
    </div>
  );
};

export default FilesPage;
