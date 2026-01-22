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
  const status = normalizeStatus(task.status);
  if (status === "done" || status === "completed") return false;
  if (task.done === true) return false;
  if (task.completedAt != null) return false;
  return true;
}

function isTaskDone(task: Record<string, unknown>): boolean {
  const status = normalizeStatus(task.status);
  if (status === "done" || status === "completed") return true;
  if (task.done === true) return true;
  if (task.completedAt != null) return true;
  return false;
}

function shouldIncludeTask(task: Record<string, unknown>): boolean {
  // Always include actionable (non-done) tasks
  if (isTaskActionable(task)) return true;
  
  // Also include done tasks that are children of focus blocks (have focusBlockId)
  // These are needed for accurate done counts in focus block popovers
  // CommandPanel.displayTasks already suppresses focus block children from the main list
  const hasFocusBlockId = typeof task.focusBlockId === "string" && task.focusBlockId.trim() !== "";
  if (hasFocusBlockId) return true;
  
  return false;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeId(value: unknown): string | undefined {
  const s = safeString(value);
  if (!s) return undefined;
  const parts = s.split("__").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

function taskMatchesUser(task: TimelineTask, userId: string): boolean {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return false;

  const direct = normalizeId(task.assigneeId);
  if (direct && direct === normalizedUserId) return true;

  const ids = task.assigneeIds ?? [];
  for (const id of ids) {
    const normalized = normalizeId(id);
    if (normalized && normalized === normalizedUserId) return true;
  }

  const tokens = task.assigneeTokens ?? [];
  for (const token of tokens) {
    const normalized = normalizeId(token);
    if (normalized && normalized === normalizedUserId) return true;
  }

  return false;
}

export type AllEventsAndTasksPanelProps = {
  className?: string;
  selectedDayKey?: string | null;
  onOpenProject: (projectId: string) => void;
};

function extractDayKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export default function AllEventsAndTasksPanel({ className, selectedDayKey, onOpenProject }: AllEventsAndTasksPanelProps) {
  const { projects = [], allUsers = [] } = useData() as { projects: ProjectLike[]; allUsers: TeamMemberInfo[] };
  const { userId, user } = useUser();

  const todayDateKey = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("__ALL__");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("__ALL__");
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

  const assigneeOptions = useMemo(() => {
    return teamMembers
      .filter((m) => safeString(m?.userId))
      .map((m) => {
        const first = safeString(m.firstName) ?? "";
        const last = safeString(m.lastName) ?? "";
        const name = `${first} ${last}`.trim();
        return { id: m.userId, name: name || m.userId };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamMembers]);

  useEffect(() => {
    if (selectedProjectId === "__ALL__") return;
    if (projectById.has(selectedProjectId)) return;
    setSelectedProjectId("__ALL__");
  }, [projectById, selectedProjectId]);

  useEffect(() => {
    if (selectedAssigneeId === "__ALL__") return;
    if (assigneeOptions.some((o) => o.id === selectedAssigneeId)) return;
    setSelectedAssigneeId("__ALL__");
  }, [assigneeOptions, selectedAssigneeId]);

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
        if (!shouldIncludeTask(raw)) continue;
        const taskId = safeString(raw.taskId) ?? safeString(raw.id);
        if (!taskId) continue;

        rawTasksByKey.set(buildTaskKey(result.projectId, taskId), raw);

        const dueDate = safeString(raw.dueDate) ?? safeString(raw.dueAt);
        const taskDone = isTaskDone(raw);
        nextTasks.push({
          id: taskId,
          type: "task",
          title: safeString(raw.title) ?? "Untitled task",
          dueDate,
          status: taskDone ? "done" : (safeString(raw.status) ?? "todo"),
          done: taskDone,
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
    let filtered = orgData.tasks;

    if (selectedProjectId !== "__ALL__") {
      filtered = filtered.filter((t) => {
        const source = t.source as Record<string, unknown> | undefined;
        return source?.projectId === selectedProjectId;
      });
    }

    if (selectedAssigneeId !== "__ALL__") {
      filtered = filtered.filter((t) => taskMatchesUser(t, selectedAssigneeId));
    }

    if (selectedDayKey) {
      filtered = filtered.filter((t) => extractDayKey(t.dueDate) === selectedDayKey);
    }

    return filtered;
  }, [orgData.tasks, selectedAssigneeId, selectedDayKey, selectedProjectId]);

  const visibleEvents = useMemo(() => {
    let filtered = orgData.events;

    if (selectedDayKey) {
      filtered = filtered.filter((e) => safeString(e.date) === selectedDayKey);
    } else {
      // Never show past events in this org-wide feed.
      filtered = filtered.filter((e) => {
        const date = safeString(e.date);
        if (!date) return false;
        return date >= todayDateKey;
      });
    }

    if (selectedProjectId !== "__ALL__") {
      filtered = filtered.filter((e) => {
        const source = e.source as Record<string, unknown> | undefined;
        return source?.projectId === selectedProjectId;
      });
    }

    return filtered;
  }, [orgData.events, selectedDayKey, selectedProjectId, todayDateKey]);

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

  const handleCreateTask = useCallback(() => {
    setDrawerTask(null);
    setDrawerOpen(true);
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
      <CommandPanel
        title="All Events & Tasks"
        defaultTimeFilter="all"
        defaultAssigneeFilter="all"
        events={visibleEvents}
        tasks={visibleTasks}
        teamMembers={teamMembers}
        currentUserId={userId}
        currentUserEmail={user?.email}
        hideAssigneeFilter
        showSweepDone={false}
        hideCompleted={true}
        projectFilter={
          projectOptions.length
            ? {
                selectedValue: selectedProjectId,
                options: [{ value: "__ALL__", label: "All projects" }, ...projectOptions.map((p) => ({ value: p.id, label: p.name }))],
                onSelect: setSelectedProjectId,
              }
            : undefined
        }
        assigneeUserFilter={
          assigneeOptions.length
            ? {
                selectedValue: selectedAssigneeId,
                options: [{ value: "__ALL__", label: "All assignees" }, ...assigneeOptions.map((m) => ({ value: m.id, label: m.name }))],
                onSelect: setSelectedAssigneeId,
              }
            : undefined
        }
        onCreateTask={handleCreateTask}
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
        activeProjectId={selectedProjectId !== "__ALL__" ? selectedProjectId : null}
        activeProjectName={
          selectedProjectId !== "__ALL__" ? (getProjectInfo(selectedProjectId)?.name ?? undefined) : undefined
        }
        teamMembers={teamMembers}
        onClose={handleCloseDrawer}
        onCreated={handleDrawerCreated}
        onUpdated={handleDrawerUpdated}
        onDeleted={handleDrawerDeleted}
      />
    </div>
  );
}
