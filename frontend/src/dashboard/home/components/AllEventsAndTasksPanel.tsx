import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useData } from "@/app/contexts/useData";
import { useUser } from "@/app/contexts/useUser";
import CalendarTaskDrawer from "@/dashboard/project/features/calendar/components/CalendarTaskDrawer";
import CommandPanel, {
  type TimelineEvent,
  type TimelineItem,
  type TimelineTask,
} from "@/dashboard/project/features/overview/components/CommandPanel";
import type { TeamMemberInfo, QuickCreateTaskModalProject, QuickCreateTaskModalTask } from "@/dashboard/home/components/QuickCreateTaskModal";
import { approveTask, fetchEvents, fetchTasks } from "@/shared/utils/api";
import pLimit from "@/shared/utils/pLimit";

type ProjectLike = {
  projectId: string;
  title?: string;
  thumbnails?: string[];
};

type OrgData = {
  tasks: TimelineTask[];
  events: TimelineEvent[];
  rawTasksByKey: Map<string, Record<string, unknown>>;
  isLoading: boolean;
  error: string | null;
};

function buildTaskKey(projectId: string, taskId: string): string {
  return `${projectId}:${taskId}`;
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isTaskActionable(task: Record<string, unknown>): boolean {
  if (task.archived === true) return false;
  const status = normalizeStatus(task.status);
  if (status === "done" || status === "completed" || status === "archived") return false;
  if (task.done === true) return false;
  if (task.completedAt != null) return false;
  return true;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export type AllEventsAndTasksPanelProps = {
  className?: string;
  onOpenProject: (projectId: string) => void;
};

export default function AllEventsAndTasksPanel({ className, onOpenProject }: AllEventsAndTasksPanelProps) {
  const { projects = [], allUsers = [] } = useData() as { projects: ProjectLike[]; allUsers: TeamMemberInfo[] };
  const { userId, user } = useUser();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("__ALL__");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTask, setDrawerTask] = useState<QuickCreateTaskModalTask | null>(null);

  const [orgData, setOrgData] = useState<OrgData>({
    tasks: [],
    events: [],
    rawTasksByKey: new Map(),
    isLoading: false,
    error: null,
  });

  const projectById = useMemo(() => {
    const map = new Map<string, ProjectLike>();
    projects.forEach((p) => {
      if (p?.projectId) map.set(p.projectId, p);
    });
    return map;
  }, [projects]);

  const projectOptions = useMemo(() => {
    return projects
      .filter((p) => p?.projectId)
      .map((p) => ({ id: p.projectId, name: p.title || "Untitled project" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const drawerProjects: QuickCreateTaskModalProject[] = useMemo(() => {
    return projectOptions.map((p) => ({ id: p.id, name: p.name }));
  }, [projectOptions]);

  const teamMembers: TeamMemberInfo[] = useMemo(() => {
    return Array.isArray(allUsers) ? allUsers : [];
  }, [allUsers]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const projectIds = projects.map((p) => p.projectId).filter(Boolean);
    if (!projectIds.length) return;

    setOrgData((prev) => ({ ...prev, isLoading: true, error: null }));

    const limit = pLimit(6);
    const results = await Promise.all(
      projectIds.map((projectId) =>
        limit(async () => {
          try {
            const [tasks, events] = await Promise.all([fetchTasks(projectId), fetchEvents(projectId)]);
            return { projectId, tasks, events, error: null as string | null };
          } catch (err) {
            console.error("[AllEventsAndTasksPanel] Failed to fetch items", projectId, err);
            return { projectId, tasks: [], events: [], error: "Failed to fetch some project items" };
          }
        }),
      ),
    );

    const rawTasksByKey = new Map<string, Record<string, unknown>>();
    const nextTasks: TimelineTask[] = [];
    const nextEvents: TimelineEvent[] = [];

    for (const result of results) {
      const project = projectById.get(result.projectId);
      const projectTitle = project?.title || "Project";

      for (const raw of result.tasks as Array<Record<string, unknown>>) {
        if (!isTaskActionable(raw)) continue;
        const taskId = safeString(raw.taskId) ?? safeString(raw.id);
        if (!taskId) continue;

        rawTasksByKey.set(buildTaskKey(result.projectId, taskId), raw);

        const dueDate = safeString(raw.dueDate) ?? safeString(raw.dueAt);
        nextTasks.push({
          id: taskId,
          type: "task",
          title: safeString(raw.title) ?? "Untitled task",
          dueDate,
          status: safeString(raw.status) ?? "todo",
          done: raw.done === true,
          assignedTo: safeString(raw.assignedTo),
          assigneeId: (raw.assigneeId as string | null | undefined) ?? null,
          assigneeIds: Array.isArray(raw.assigneeIds) ? (raw.assigneeIds as string[]) : undefined,
          assigneeTokens: Array.isArray(raw.assigneeTokens) ? (raw.assigneeTokens as string[]) : undefined,
          kind: safeString(raw.kind),
          startAt: safeString(raw.startAt) ?? null,
          endAt: safeString(raw.endAt) ?? null,
          plannedMinutes: typeof raw.plannedMinutes === "number" ? raw.plannedMinutes : undefined,
          order: typeof raw.order === "number" ? raw.order : undefined,
          focusBlockId: safeString(raw.focusBlockId),
          focusChildTaskIds: Array.isArray(raw.focusChildTaskIds) ? (raw.focusChildTaskIds as string[]) : undefined,
          focusChecklist: Array.isArray(raw.focusChecklist)
            ? (raw.focusChecklist as Array<{ taskId: string; title: string }>)
            : undefined,
          source: {
            ...(raw as Record<string, unknown>),
            projectId: result.projectId,
            projectTitle,
            taskId,
          },
        });
      }

      for (const ev of result.events as Array<Record<string, unknown>>) {
        const eventId = safeString(ev.id) ?? safeString(ev.eventId) ?? safeString(ev.timelineEventId);
        if (!eventId) continue;
        const date = safeString(ev.date) ?? safeString(ev.createdAt)?.slice(0, 10);
        if (!date) continue;
        nextEvents.push({
          id: eventId,
          type: "event",
          title: safeString(ev.title) ?? safeString(ev.description) ?? "Event",
          date,
          startTime: safeString(ev.startAt) ?? undefined,
          endTime: safeString(ev.endAt) ?? undefined,
          allDay: ev.allDay === true,
          source: {
            ...(ev as Record<string, unknown>),
            projectId: result.projectId,
            projectTitle,
            eventId,
          },
        });
      }
    }

    if (!isMountedRef.current) return;
    const anyError = results.some((r) => r.error);
    setOrgData({
      tasks: nextTasks,
      events: nextEvents,
      rawTasksByKey,
      isLoading: false,
      error: anyError ? "Some projects failed to load." : null,
    });
  }, [projectById, projects]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleTasks = useMemo(() => {
    if (selectedProjectId === "__ALL__") return orgData.tasks;
    return orgData.tasks.filter((t) => {
      const source = t.source as Record<string, unknown> | undefined;
      return source?.projectId === selectedProjectId;
    });
  }, [orgData.tasks, selectedProjectId]);

  const visibleEvents = useMemo(() => {
    if (selectedProjectId === "__ALL__") return orgData.events;
    return orgData.events.filter((e) => {
      const source = e.source as Record<string, unknown> | undefined;
      return source?.projectId === selectedProjectId;
    });
  }, [orgData.events, selectedProjectId]);

  const getProjectInfo = useCallback(
    (projectId: string) => {
      const p = projectById.get(projectId);
      if (!p) return null;
      return { name: p.title || "Project", thumb: p.thumbnails?.[0] };
    },
    [projectById],
  );

  const handleQuickEditTask = useCallback(
    (task: TimelineTask) => {
      const source = (task.source && typeof task.source === "object" ? (task.source as Record<string, unknown>) : null) ?? null;
      const projectId = safeString(source?.projectId) ?? "";
      if (!projectId) return;

      const raw = orgData.rawTasksByKey.get(buildTaskKey(projectId, task.id));
      const projectName = getProjectInfo(projectId)?.name ?? "Project";

      const modalTask: QuickCreateTaskModalTask = {
        taskId: task.id,
        projectId,
        projectName,
        title: safeString(raw?.title) ?? task.title ?? "",
        description: safeString(raw?.description),
        status: safeString(raw?.status) ?? task.status ?? "todo",
        dueDate: safeString(raw?.dueDate) ?? safeString(raw?.dueAt) ?? task.dueDate,
        startAt: safeString(raw?.startAt) ?? task.startAt ?? null,
        endAt: safeString(raw?.endAt) ?? task.endAt ?? null,
        address: safeString(raw?.address),
        assigneeId: (raw?.assigneeId as string | null | undefined) ?? task.assigneeId ?? null,
        assigneeIds: Array.isArray(raw?.assigneeIds) ? (raw?.assigneeIds as string[]) : task.assigneeIds,
        assigneeTokens: Array.isArray(raw?.assigneeTokens) ? (raw?.assigneeTokens as string[]) : task.assigneeTokens,
      };

      setDrawerTask(modalTask);
      setDrawerOpen(true);
    },
    [getProjectInfo, orgData.rawTasksByKey],
  );

  const handleToggleTask = useCallback(async (id: string) => {
    const match = orgData.tasks.find((t) => t.id === id);
    if (!match) return;
    const source = match.source as Record<string, unknown> | undefined;
    const projectId = safeString(source?.projectId);
    const taskId = safeString(source?.taskId) ?? match.id;
    if (!projectId || !taskId) return;

    // Optimistic: remove from visible feed (this panel only shows active items).
    setOrgData((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => !(t.id === match.id && (t.source as Record<string, unknown> | undefined)?.projectId === projectId)),
    }));

    try {
      await approveTask(projectId, taskId, { note: "" });
    } catch (err) {
      console.error("[AllEventsAndTasksPanel] Failed to mark done", err);
      void refresh();
    }
  }, [orgData.tasks, refresh]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerTask(null);
  }, []);

  const handleDrawerCreated = useCallback(() => {
    handleCloseDrawer();
    void refresh();
  }, [handleCloseDrawer, refresh]);

  const handleDrawerUpdated = useCallback(() => {
    handleCloseDrawer();
    void refresh();
  }, [handleCloseDrawer, refresh]);

  const handleDrawerDeleted = useCallback(() => {
    handleCloseDrawer();
    void refresh();
  }, [handleCloseDrawer, refresh]);

  return (
    <div className={className}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.9 }}>
          <span style={{ fontWeight: 700 }}>Project</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.92)",
              borderRadius: 10,
              padding: "6px 10px",
              fontSize: 12,
              minWidth: 220,
            }}
            aria-label="Project filter"
          >
            <option value="__ALL__">All projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {orgData.isLoading ? "Loading…" : orgData.error ? orgData.error : null}
        </div>
      </div>

      <CommandPanel
        title="All Events & Tasks"
        defaultTimeFilter="next7"
        events={visibleEvents}
        tasks={visibleTasks}
        teamMembers={teamMembers}
        currentUserId={userId}
        currentUserEmail={user?.email}
        onQuickEditTask={handleQuickEditTask}
        onToggleTask={handleToggleTask}
        showProjectIcon
        getProjectInfo={getProjectInfo}
        onOpenProject={onOpenProject}
        onEditItem={(item: TimelineItem) => {
          if (item.type === "task") {
            handleQuickEditTask(item as TimelineTask);
            return;
          }
          const source = (item.source && typeof item.source === "object" ? (item.source as Record<string, unknown>) : null) ?? null;
          const pid = safeString(source?.projectId);
          if (pid) onOpenProject(pid);
        }}
      />

      <CalendarTaskDrawer
        open={drawerOpen}
        task={drawerTask}
        projects={drawerProjects}
        teamMembers={teamMembers}
        onClose={handleCloseDrawer}
        onCreated={handleDrawerCreated}
        onUpdated={handleDrawerUpdated}
        onDeleted={handleDrawerDeleted}
      />
    </div>
  );
}
