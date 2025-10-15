import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProjectPageLayout, ProjectHeader, TimelineChart, QuickLinksComponent, FileManager as FileManagerComponent } from '@/dashboard/project/components';
import ProjectCalendar from './ProjectCalendar';
import { useData } from '@/app/contexts/useData';
import { useSocket } from '@/app/contexts/SocketContext';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { BudgetProvider } from '@/dashboard/project/features/budget/context/BudgetProvider';
import type { Project } from '@/app/contexts/DataProvider';
import type { QuickLinksRef } from '@/dashboard/project/components';
import { useProjectPalette } from '@/dashboard/project/hooks/useProjectPalette';
import { resolveProjectCoverUrl } from '@/dashboard/project/utils/theme';

type TimelineMode = 'overview' | 'agenda';

type ProjectCalendarProject = {
  projectId: string;
  title?: string;
  color?: string;
  dateCreated?: string;
  productionStart?: string;
  finishline?: string;
  timelineEvents?: Array<{
    id: string;
    eventId?: string;
    date: string;
    description?: string;
    hours?: number | string;
    budgetItemId?: string | null;
    createdAt?: string;
    payload?: Record<string, unknown>;
  }>;
  address?: string;
  company?: string;
  clientName?: string;
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  clientAddress?: string;
  invoiceBrandPhone?: string;
  clientPhone?: string;
  clientEmail?: string;
};

const CalendarPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    activeProject: initialActiveProject,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
    userId,
  } = useData();

  const { ws } = useSocket();

  const [activeProject, setActiveProject] = useState<Project | null>(
    (initialActiveProject as Project) || null
  );
  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef | null>(null);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('overview');
  const [timelineDate, setTimelineDate] = useState<string | null>(null);

  useEffect(() => {
    setActiveProject((initialActiveProject as Project) || null);
  }, [initialActiveProject]);

  useEffect(() => {
    if (!projectId) return;
    if (!initialActiveProject || (initialActiveProject as Project).projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, initialActiveProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title =
      (activeProject as Project | null)?.title || (initialActiveProject as Project | null)?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes('/calendar')) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, '/calendar');
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject,
    initialActiveProject,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (!ws || !activeProject?.projectId) return;

    const payload = JSON.stringify({
      action: 'setActiveConversation',
      conversationId: `project#${activeProject.projectId}`,
    });

    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        const onOpen = () => {
          ws.send(payload);
          ws.removeEventListener('open', onOpen);
        };
        ws.addEventListener('open', onOpen);
      }
    };

    sendWhenReady();
  }, [ws, activeProject?.projectId]);

  const parseStatusToNumber = (statusString?: string | number | null) => {
    if (statusString === undefined || statusString === null) return 0;
    const str = typeof statusString === 'string' ? statusString : String(statusString);
    const num = parseFloat(str.replace('%', ''));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject: Project) => {
    setActiveProject(updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    setProjects((prev: Project[]) => prev.filter((p) => p.projectId !== deletedProjectId));
    setSelectedProjects((prev: string[]) => prev.filter((id) => id !== deletedProjectId));
    navigate('/dashboard/projects/allprojects');
  };

  const handleBack = () => {
    if (!projectId) {
      navigate('/dashboard/projects/allprojects');
      return;
    }

    const title =
      (activeProject as Project | null)?.title || (initialActiveProject as Project | null)?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });

  return (
    <ProjectPageLayout
      projectId={activeProject?.projectId}
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
      <QuickLinksComponent ref={quickLinksRef} hideTrigger />
      <FileManagerComponent
        isOpen={filesOpen}
        onRequestClose={() => setFilesOpen(false)}
        showTrigger={false}
        folder="uploads"
      />

      <div className="dashboard-layout calendar-layout" style={{ paddingBottom: '5px' }}>
        <BudgetProvider projectId={activeProject?.projectId}>
          <ProjectCalendar
            project={activeProject as ProjectCalendarProject}
            initialFlashDate={null}
            onDateSelect={(d: string) => {
              setTimelineDate(d);
            }}
          />
        </BudgetProvider>
        <TimelineChart
          project={activeProject as {
            color?: string;
            productionStart?: string;
            dateCreated?: string;
            timelineEvents?: Array<{
              date: string;
              hours?: number | string;
              description?: string;
              phase?: string;
              type?: string;
              start?: Date | number;
              startHour?: number;
            }>;
          }}
          mode={timelineMode}
          selectedDate={timelineDate || undefined}
          onModeChange={setTimelineMode}
          onDateChange={setTimelineDate}
        />
      </div>
    </ProjectPageLayout>
  );
};

export default CalendarPage;











