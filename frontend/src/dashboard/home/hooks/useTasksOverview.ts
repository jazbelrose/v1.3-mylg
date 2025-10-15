import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { fetchTasks } from "@/shared/utils/api";
import type { QuickCreateTaskLocation } from "../components/QuickCreateTaskModal.types";
import { getColor } from "@/shared/utils/colorUtils";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import pLimit from "@/shared/utils/pLimit";
import { endOfWeek, startOfWeek } from "@/dashboard/home/utils/dateUtils";

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

type RawTask = {
  taskId?: string;
  id?: string;
  projectId?: string;
  title?: string;
  name?: string;
  status?: string;
  dueAt?: string | number | Date;
  due_at?: string | number | Date;
  dueDate?: string | number | Date;
  due_date?: string | number | Date;
  due?: string | number | Date;
  [key: string]: unknown;
};

type TaskStatus = "todo" | "in_progress" | "done" | string;

type NormalizedTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  dueKey?: string;
  timeLabel?: string;
  completedTimeLabel?: string;
  raw: RawTask & { projectId: string };
};

export type TasksOverviewListItem = {
  id: string;
  taskId?: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  timeLabel?: string;
  completedTimeLabel?: string;
  description?: string;
  assigneeId?: string;
  address?: string;
  location?: QuickCreateTaskLocation;
  dueDateInput?: string | null;
  rawTask: RawTask & { projectId: string };
};

export type TasksOverviewEvent = {
  id: string;
  title: string;
  time?: string;
  project?: string;
  color?: string;
};

export type TasksOverviewGroup = {
  id: string;
  dayLabel: string;
  items: TasksOverviewEvent[];
};

export type TasksOverviewStats = {
  completed: number;
  dueSoon: number;
  overdue: number;
};

export type TasksOverviewProjectOption = {
  id: string;
  name: string;
  color?: string;
};

function parseDueDate(value?: unknown): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "number") {
    const byNumber = new Date(value);
    return Number.isNaN(byNumber.getTime()) ? null : byNumber;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const direct = new Date(trimmed);
    if (!Number.isNaN(direct.getTime())) {
      return direct;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const iso = new Date(`${trimmed}T00:00:00`);
      return Number.isNaN(iso.getTime()) ? null : iso;
    }
  }

  return null;
}

function toDateInputString(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
          value.getDate(),
        ).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
        parsed.getDate(),
      ).padStart(2, "0")}`;
    }
  }

  return null;
}

function normalizeTitle(value?: unknown): string {
  if (typeof value !== "string") return "Untitled task";
  const trimmed = value.trim();
  if (!trimmed) return "Untitled task";

  if (trimmed === trimmed.toUpperCase()) {
    return trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return trimmed;
}

function pickDue(raw: RawTask): { value: Date | null; key?: string; timeLabel?: string } {
  const candidate =
    raw.dueAt ?? raw.due_at ?? raw.dueDate ?? raw.due_date ?? raw.due ?? null;

  const dueDate = parseDueDate(candidate);
  if (!dueDate) {
    return { value: null, key: undefined, timeLabel: undefined };
  }

  const key = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(
    dueDate.getDate(),
  ).padStart(2, "0")}`;

  const rawString = typeof candidate === "string" ? candidate : undefined;
  const timeLabel = rawString && rawString.includes("T") ? timeFormatter.format(dueDate) : undefined;

  return { value: dueDate, key, timeLabel };
}

function pickCompletion(value: unknown): { value: Date | null; timeLabel?: string } {
  const date = parseDueDate(value);
  if (!date) {
    return { value: null, timeLabel: undefined };
  }

  const timeLabel =
    typeof value === "string" && value.includes("T") ? timeFormatter.format(date) : undefined;

  return { value: date, timeLabel };
}

export function useTasksOverview() {
  const { projects = [] } = useData() as { projects: Project[] };
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<NormalizedTask[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((project) => {
      if (project?.projectId) {
        map.set(project.projectId, project);
      }
    });
    return map;
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    const limit = pLimit(3);

    const load = async () => {
      if (!projects.length) {
        setTasks([]);
        setLoading(false);
        setError(false);
        return;
      }

      setLoading(true);
      setError(false);

      try {
        const results = await Promise.all(
          projects
            .filter((project) => project?.projectId)
            .map((project) =>
              limit(async () => {
                try {
                  const raw = await fetchTasks(project.projectId);
                  return (raw || []).map((task: RawTask, idx) => {
                    const { value: dueDate, key: dueKey, timeLabel } = pickDue(task);
                    const projectName = project.title || project.projectId;
                    const projectColor = project.color || getColor(project.projectId);
                    const id =
                      (task.taskId as string | undefined) ||
                      (task.id as string | undefined) ||
                      `${project.projectId}-${idx}`;

                    const status = typeof task.status === "string" ? task.status.toLowerCase() : "todo";
                    const title = normalizeTitle(task.title ?? task.name);
                    const completionCandidate =
                      (task as { completedAt?: unknown }).completedAt ??
                      (task as { completed_at?: unknown }).completed_at ??
                      (task as { updatedAt?: unknown }).updatedAt ??
                      (task as { updated_at?: unknown }).updated_at ??
                      null;
                    const { value: completedAt, timeLabel: completedTimeLabel } =
                      status === "done"
                        ? pickCompletion(completionCandidate)
                        : { value: null, timeLabel: undefined };
                    const rawWithProject = { ...task, projectId: project.projectId } as RawTask & {
                      projectId: string;
                    };

                    return {
                      id,
                      title,
                      status,
                      dueDate,
                      completedAt,
                      dueKey,
                      timeLabel,
                      completedTimeLabel,
                      projectId: project.projectId,
                      projectName,
                      projectColor,
                      raw: rawWithProject,
                    } satisfies NormalizedTask;
                  });
                } catch (err) {
                  console.error("Failed to fetch tasks for project", project.projectId, err);
                  return [] as NormalizedTask[];
                }
              }),
            ),
        );

        if (cancelled) return;

        setTasks(results.flat());
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load tasks overview", err);
          setTasks([]);
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [projects, reloadToken]);

  const refreshTasks = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const toListItem = useCallback(
    (task: NormalizedTask): TasksOverviewListItem => {
      const raw = task.raw;
      const dueSource =
        raw.dueDate ?? raw.due_date ?? raw.dueAt ?? raw.due_at ?? raw.due ?? null;
      const taskId =
        (typeof raw.taskId === "string" && raw.taskId) ||
        (typeof raw.id === "string" && raw.id) ||
        task.id;
      const description = typeof raw.description === "string" ? raw.description : undefined;
      const assignee =
        typeof raw.assigneeId === "string"
          ? raw.assigneeId
          : typeof (raw as { assignedTo?: unknown }).assignedTo === "string"
            ? (raw as { assignedTo?: string }).assignedTo
            : undefined;
      const address = typeof raw.address === "string" ? raw.address : undefined;

      return {
        id: task.id,
        taskId,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        completedAt: task.completedAt,
        projectId: task.projectId,
        projectName: task.projectName,
        projectColor: task.projectColor,
        timeLabel: task.timeLabel,
        completedTimeLabel: task.completedTimeLabel,
        description,
        assigneeId: assignee,
        address,
        location: raw.location as QuickCreateTaskLocation,
        dueDateInput: toDateInputString(dueSource),
        rawTask: raw,
      };
    },
    [],
  );

  const {
    completed,
    dueSoon,
    overdue,
    groups,
    primaryProjectId,
    openTasks,
    undatedTasks,
    completedThisWeek,
  } = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let completedCount = 0;
    let dueSoonCount = 0;
    let overdueCount = 0;

    const groupMap = new Map<
      string,
      {
        id: string;
        label: string;
        date: Date;
        items: Array<TasksOverviewEvent & { due: Date }>;
      }
    >();

    tasks.forEach((task) => {
      const due = task.dueDate;
      const isDone = task.status === "done";
      const completionReference = task.completedAt ?? due;

      if (
        isDone &&
        completionReference &&
        completionReference >= weekStart &&
        completionReference <= weekEnd
      ) {
        completedCount += 1;
      }

      if (!due) {
        return;
      }

      if (!isDone) {
        if (due < todayStart) {
          overdueCount += 1;
        } else if (due <= weekEnd) {
          dueSoonCount += 1;
        }
      }

      if (!isDone && due >= weekStart && due <= weekEnd) {
        const key = task.dueKey || `${due.getFullYear()}-${due.getMonth()}-${due.getDate()}`;
        let group = groupMap.get(key);
        if (!group) {
          group = {
            id: key,
            label: dayFormatter.format(due),
            date: due,
            items: [],
          };
          groupMap.set(key, group);
        }

        group.items.push({
          id: task.id,
          title: task.title,
          time: task.timeLabel,
          project: task.projectName,
          color: task.projectColor,
          due,
        });
      }
    });

    const sortedGroups: TasksOverviewGroup[] = Array.from(groupMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((group) => ({
        id: group.id,
        dayLabel: group.label,
        items: group.items
          .sort((a, b) => a.due.getTime() - b.due.getTime() || a.title.localeCompare(b.title))
          .map((item) => ({
            id: item.id,
            title: item.title,
            time: item.time,
            project: item.project,
            color: item.color,
          })),
      }));

    const sortedByUrgency = tasks
      .filter((task) => task.dueDate && task.status !== "done")
      .sort((a, b) => {
        if (!a.dueDate || !b.dueDate) return 0;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });

    const primaryProjectId = sortedByUrgency[0]?.projectId ?? tasks[0]?.projectId ?? null;

    const openTasks = sortedByUrgency.map(toListItem);

    const undatedTasks = tasks
      .filter((task) => !task.dueDate && task.status !== "done")
      .map(toListItem);

    const completedThisWeek = tasks
      .filter((task) => {
        if (task.status !== "done") {
          return false;
        }

        const completedOn = task.completedAt ?? task.dueDate;
        return Boolean(completedOn && completedOn >= weekStart && completedOn <= weekEnd);
      })
      .sort((a, b) => {
        const aCompleted = a.completedAt ?? a.dueDate;
        const bCompleted = b.completedAt ?? b.dueDate;
        if (!aCompleted || !bCompleted) {
          return 0;
        }
        return bCompleted.getTime() - aCompleted.getTime();
      })
      .map(toListItem);

    return {
      completed: completedCount,
      dueSoon: dueSoonCount,
      overdue: overdueCount,
      groups: sortedGroups,
      primaryProjectId,
      openTasks,
      undatedTasks,
      completedThisWeek,
    };
  }, [tasks, toListItem]);

  const canNavigateToProject = Boolean(primaryProjectId && projectMap.has(primaryProjectId));

  const navigateToProject = useCallback(
    (projectId?: string | null) => {
      if (!projectId) {
        navigate("/dashboard/projects/allprojects");
        return;
      }

      const project = projectMap.get(projectId);
      navigate(getProjectDashboardPath(projectId, project?.title));
    },
    [navigate, projectMap]
  );

  const handleNavigateToPrimary = useCallback(() => {
    navigateToProject(primaryProjectId);
  }, [navigateToProject, primaryProjectId]);

  const handleViewAll = useCallback(() => {
    navigate("/dashboard/tasks");
  }, [navigate]);

  const tasksById = useMemo(() => {
    const map = new Map<string, NormalizedTask>();
    tasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  const getTaskById = useCallback(
    (id: string) => {
      const entry = tasksById.get(id);
      return entry ? toListItem(entry) : undefined;
    },
    [tasksById, toListItem],
  );

  const projectOptions: TasksOverviewProjectOption[] = useMemo(
    () =>
      projects
        .filter((project): project is Project & { projectId: string } => Boolean(project?.projectId))
        .map((project) => ({
          id: project.projectId,
          name: project.title || project.projectId,
          color: project.color || getColor(project.projectId),
        })),
    [projects]
  );

  const primaryProjectName = primaryProjectId
    ? projectMap.get(primaryProjectId)?.title ?? primaryProjectId
    : undefined;

  return {
    loading,
    error,
    stats: { completed, dueSoon, overdue } satisfies TasksOverviewStats,
    groups,
    handleNavigateToPrimary,
    handleViewAll,
    canNavigateToProject,
    openTasks,
    undatedTasks,
    completedThisWeek,
    navigateToProject,
    refreshTasks,
    projectOptions,
    primaryProjectId,
    primaryProjectName,
    getTaskById,
  };
}













