import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { v4 as uuid } from "uuid";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import type { DesignerRef } from "@/dashboard/project/features/editor/components/canvas/designercomponent";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import PreviewDrawer from "@/dashboard/project/features/editor/components/PreviewDrawer";
import SheetEditor, {
  type SheetDescriptor,
} from "@/dashboard/project/features/editor/components/SheetEditor";
import { useData } from "@/app/contexts/useData";
import { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";

const createInitialSheets = (project?: Project | null): SheetDescriptor[] => {
  const baseTitle = project?.title?.trim();
  const sheetName = baseTitle ? `${baseTitle} sheet` : "Main sheet";
  return [
    {
      id: project?.projectId ? `${project.projectId}-sheet` : uuid(),
      name: sheetName,
      pages: [
        {
          id: uuid(),
          name: "Page 1",
        },
      ],
    },
  ];
};

const EditorPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    activeProject: initialActiveProject,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
    userId,
    updateProjectFields,
  } = useData();

  const { ws } = useSocket();

  const [activeProject, setActiveProject] = useState<Project | null>(initialActiveProject);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });
  const designerRef = useRef<DesignerRef>(null);
  const [briefContent, setBriefContent] = useState<string>("");
  const [isBriefDirty, setIsBriefDirty] = useState(false);
  const [sheets, setSheets] = useState<SheetDescriptor[]>(() => createInitialSheets(initialActiveProject));
  const [activeSheetId, setActiveSheetId] = useState<string>(() => sheets[0]?.id ?? "");
  const [activePageId, setActivePageId] = useState<string>(() => sheets[0]?.pages[0]?.id ?? "");
  const lastProjectForSheetsRef = useRef<string | null>(initialActiveProject?.projectId ?? null);

  const handleBriefChange = useCallback((json: string) => {
    setBriefContent(json);
    setIsBriefDirty(true);
  }, []);

  const handleSelectPage = useCallback((sheetId: string, pageId: string) => {
    setActiveSheetId(sheetId);
    setActivePageId(pageId);
  }, []);

  const handleAddPage = useCallback((sheetId: string) => {
    let createdPageId: string | null = null;
    setSheets((prev) =>
      prev.map((sheet) => {
        if (sheet.id !== sheetId) return sheet;
        const newPage = {
          id: uuid(),
          name: `Page ${sheet.pages.length + 1}`,
        };
        createdPageId = newPage.id;
        return { ...sheet, pages: [...sheet.pages, newPage] };
      })
    );
    if (createdPageId) {
      setActiveSheetId(sheetId);
      setActivePageId(createdPageId);
    }
  }, []);

  const handleDuplicatePage = useCallback((sheetId: string, pageId: string) => {
    let newPageId: string | null = null;
    setSheets((prev) =>
      prev.map((sheet) => {
        if (sheet.id !== sheetId) return sheet;
        const index = sheet.pages.findIndex((page) => page.id === pageId);
        if (index === -1) return sheet;
        const original = sheet.pages[index];
        const duplicate = {
          id: uuid(),
          name: `${original.name} Copy`,
        };
        newPageId = duplicate.id;
        const pages = [...sheet.pages];
        pages.splice(index + 1, 0, duplicate);
        return { ...sheet, pages };
      })
    );
    if (newPageId) {
      setActiveSheetId(sheetId);
      setActivePageId(newPageId);
    }
  }, []);

  const handleReorderPages = useCallback((sheetId: string, fromIndex: number, toIndex: number) => {
    setSheets((prev) =>
      prev.map((sheet) => {
        if (sheet.id !== sheetId) return sheet;
        const pages = [...sheet.pages];
        if (fromIndex < 0 || fromIndex >= pages.length) return sheet;
        const safeToIndex = Math.min(pages.length - 1, Math.max(0, toIndex));
        if (safeToIndex === fromIndex) return sheet;
        const [moved] = pages.splice(fromIndex, 1);
        pages.splice(safeToIndex, 0, moved);
        return { ...sheet, pages };
      })
    );
  }, []);

  const saveBrief = useCallback(
    async (showToast = true) => {
      if (!activeProject?.projectId) {
        if (showToast) notify("error", "No active project to save");
        return;
      }
      if (!isBriefDirty) {
        if (showToast) notify("info", "Brief already saved");
        return;
      }
      try {
        await updateProjectFields(activeProject.projectId, {
          description: briefContent,
        });
        setIsBriefDirty(false);
        if (showToast) notify("success", "Saved. Nice.");
      } catch (err) {
        const error = err as { message?: string };
        console.error("Failed to save brief:", error);
        if (showToast)
          notify("error", "Can’t reach the server—your edits are safe; we’ll retry.");
      }
    },
    [activeProject?.projectId, briefContent, isBriefDirty, updateProjectFields]
  );

  useEffect(() => {
    setActiveProject(initialActiveProject);
  }, [initialActiveProject]);

  useEffect(() => {
    setBriefContent(activeProject?.description || "");
    setIsBriefDirty(false);
  }, [activeProject?.description]);

  useEffect(() => {
    const project = activeProject ?? initialActiveProject ?? null;
    const projectKey = project?.projectId ?? null;
    if (projectKey && lastProjectForSheetsRef.current === projectKey) {
      return;
    }
    if (!projectKey && lastProjectForSheetsRef.current === null && sheets.length > 0) {
      return;
    }
    const nextSheets = createInitialSheets(project);
    setSheets(nextSheets);
    setActiveSheetId(nextSheets[0]?.id ?? "");
    setActivePageId(nextSheets[0]?.pages[0]?.id ?? "");
    lastProjectForSheetsRef.current = projectKey;
  }, [activeProject, initialActiveProject, sheets.length]);

  useEffect(() => {
    if (!projectId) return;
    if (!initialActiveProject || initialActiveProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, initialActiveProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title ?? initialActiveProject?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes('/editor')) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, '/editor');
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject?.title,
    initialActiveProject?.title,
    location.pathname,
    navigate,
  ]);

  const lastFetchedId = useRef<string | null>(null);
  useEffect(() => {
    if (activeProject?.projectId && lastFetchedId.current !== activeProject.projectId) {
      lastFetchedId.current = activeProject.projectId;
      fetchProjectDetails(activeProject.projectId);
    }
  }, [activeProject?.projectId, fetchProjectDetails]);

  useEffect(() => {
    if (!ws || !activeProject?.projectId) return;
    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${activeProject.projectId}`,
    });
    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        const onOpen = () => {
          ws.send(payload);
          ws.removeEventListener("open", onOpen);
        };
        ws.addEventListener("open", onOpen);
      }
    };
    sendWhenReady();
  }, [ws, activeProject?.projectId]);

  const parseStatusToNumber = (statusString: string | number | undefined | null): number => {
    if (statusString === undefined || statusString === null) return 0;
    const str = typeof statusString === "string" ? statusString : String(statusString);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject: Project) => {
    setActiveProject(updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    setProjects((prev: Project[]) => prev.filter((p) => p.projectId !== deletedProjectId));
    setSelectedProjects((prev: string[]) => prev.filter((id) => id !== deletedProjectId));
    navigate("/dashboard/projects/allprojects");
  };

  const handleBack = () => {
    if (!projectId) {
      navigate('/dashboard/projects/allprojects');
      return;
    }

    const title = activeProject?.title ?? initialActiveProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

  const handleSelectTool = () => designerRef.current?.changeMode("select");
  const handleBrushTool = () => designerRef.current?.changeMode("brush");
  const handleRectTool = () => designerRef.current?.changeMode("rect");
  const handleTextTool = () => designerRef.current?.addText();
  const handleImageTool = () => designerRef.current?.triggerImageUpload();
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => designerRef.current?.handleColorChange(e.target.value);
  const handleUndo = () => designerRef.current?.handleUndo();
  const handleRedo = () => designerRef.current?.handleRedo();
  const handleCopy = () => designerRef.current?.handleCopy();
  const handlePaste = () => designerRef.current?.handlePaste();
  const handleDelete = () => designerRef.current?.handleDelete();
  const handleClearCanvas = () => designerRef.current?.handleClear();
  const handleSave = useCallback(() => {
    designerRef.current?.handleSave();
    void saveBrief();
  }, [saveBrief]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isBriefDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBriefDirty]);

  useEffect(() => {
    window.hasUnsavedChanges = () => isBriefDirty;
    window.unsavedChanges = isBriefDirty;
    return () => {
      delete window.hasUnsavedChanges;
      delete window.unsavedChanges;
    };
  }, [isBriefDirty]);

  return (
    <ProjectPageLayout
      projectId={projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={activeProject}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      }
    >
      <div className="designer-outer-container">
        <div className="designer-scroll-container">
          <div className="editor-content-wrapper">
            <QuickLinksComponent ref={quickLinksRef} hideTrigger />
            <FileManagerComponent
              isOpen={filesOpen}
              onRequestClose={() => setFilesOpen(false)}
              showTrigger={false}
              folder="uploads"
            />
            <div className="main-view-container">
              <SheetEditor
                sheets={sheets}
                activeSheetId={activeSheetId}
                activePageId={activePageId}
                onSelectPage={handleSelectPage}
                onAddPage={handleAddPage}
                onDuplicatePage={handleDuplicatePage}
                onReorderPages={handleReorderPages}
                designerRef={designerRef}
                briefContent={briefContent}
                onBriefChange={handleBriefChange}
                projectId={activeProject?.projectId ?? initialActiveProject?.projectId ?? projectId ?? null}
                toolbarProps={{
                  onPreview: () => setPreviewOpen(true),
                  onSelectTool: handleSelectTool,
                  onFreeDraw: handleBrushTool,
                  onAddRectangle: handleRectTool,
                  onAddText: handleTextTool,
                  onAddImage: handleImageTool,
                  onColorChange: handleColorChange,
                  onUndo: handleUndo,
                  onRedo: handleRedo,
                  onCopy: handleCopy,
                  onPaste: handlePaste,
                  onDelete: handleDelete,
                  onClearCanvas: handleClearCanvas,
                  onSave: handleSave,
                }}
              />
            </div>
            <PreviewDrawer
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              url={activeProject?.previewUrl as string}
              onExportGallery={() => console.log("Export to Gallery")}
              onExportPDF={() => console.log("Export to PDF")}
            />
          </div>
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default EditorPage;











