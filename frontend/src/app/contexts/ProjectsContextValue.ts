import type { Project, TimelineEvent } from "../../shared/utils/api";

export type DMReadStatusMap = Record<string, string>;

export interface ProjectsValue {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setUserProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loadingProfile: boolean;
  activeProject: Project | null;
  setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>;
  selectedProjects: string[];
  setSelectedProjects: React.Dispatch<React.SetStateAction<string[]>>;
  fetchProjectDetails: (projectId: string) => Promise<boolean>;
  fetchProjects: (retryCount?: number) => Promise<void>;
  fetchUserProfile: () => Promise<void>;
  fetchRecentActivity: (limit?: number) => Promise<
    Array<{
      id: string;
      type: "project" | "message";
      projectId: string;
      projectTitle: string;
      text: string;
      timestamp: string;
    }>
  >;
  opacity: number;
  setOpacity: React.Dispatch<React.SetStateAction<number>>;
  settingsUpdated: boolean;
  toggleSettingsUpdated: () => void;
  dmReadStatus: DMReadStatusMap;
  setDmReadStatus: React.Dispatch<React.SetStateAction<DMReadStatusMap>>;
  projectsError: boolean;
  updateTimelineEvents: (projectId: string, events: TimelineEvent[]) => Promise<void>;
  updateProjectFields: (projectId: string, fields: Partial<Project>) => Promise<void>;
}









