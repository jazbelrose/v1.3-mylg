import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { X } from "lucide-react";
import styles from "./budget-work-panel-modal.module.css";
import type { Task } from "@/shared/utils/api";
import { createTask, updateTask } from "@/shared/utils/api";
import {
  BUDGET_TASK_LINK_TYPES,
  countTasksLinkedToBudgetItem,
  getTaskLinkTypeForBudgetItem,
  getPrimaryBudgetLineItemId,
  getSecondaryBudgetLinks,
  inferBudgetTaskLinkTypeFromTitle,
  taskHasBudgetLink,
  type BudgetTaskLinkType,
} from "@/shared/utils/budgetTaskLinks";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type BudgetLineLike = {
  budgetItemId: string;
  elementKey?: string;
  elementId?: string;
  description?: string;
};

export type BudgetWorkPanelModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  projectId: string;
  lineItem: BudgetLineLike | null;
  tasks: Task[];
  onTasksChange: (nextTasks: Task[]) => void;
  initialFocusGroup?: BudgetTaskLinkType | null;
};

const normalizeOwnerLabel = (task: Task): string => {
  if (typeof task.assigneeId === "string" && task.assigneeId.trim()) return task.assigneeId.trim();
  if (Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0) {
    const first = task.assigneeIds.find((id) => typeof id === "string" && id.trim());
    if (first) return first.trim();
  }
  return "—";
};

const normalizeDueLabel = (task: Task): string => {
  const due = typeof task.dueDate === "string" && task.dueDate.trim()
    ? task.dueDate.trim()
    : typeof task.dueAt === "string" && task.dueAt.trim()
      ? task.dueAt.trim()
      : "";
  if (!due) return "—";
  return due.slice(0, 10);
};

export default function BudgetWorkPanelModal({
  isOpen,
  onRequestClose,
  projectId,
  lineItem,
  tasks,
  onTasksChange,
  initialFocusGroup = null,
}: BudgetWorkPanelModalProps) {
  const budgetItemId = lineItem?.budgetItemId ?? "";

  const [createTitle, setCreateTitle] = useState("");
  const [createLinkType, setCreateLinkType] = useState<BudgetTaskLinkType>("build");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkType, setLinkType] = useState<BudgetTaskLinkType>("build");
  const [isSaving, setIsSaving] = useState(false);

  const linkedTasks = useMemo(() => {
    if (!budgetItemId) return [];
    return tasks.filter((t) => taskHasBudgetLink(t, budgetItemId));
  }, [budgetItemId, tasks]);

  const linkedCount = useMemo(
    () => (budgetItemId ? countTasksLinkedToBudgetItem(tasks, budgetItemId) : 0),
    [budgetItemId, tasks],
  );

  const grouped = useMemo(() => {
    const out: Record<string, Task[]> = {};
    BUDGET_TASK_LINK_TYPES.forEach((t) => {
      out[t.id] = [];
    });
    out.other = [];

    linkedTasks.forEach((task) => {
      const type = getTaskLinkTypeForBudgetItem(task, budgetItemId) ?? "other";
      (out[type] ?? out.other).push(task);
    });

    return out;
  }, [budgetItemId, linkedTasks]);

  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!isOpen) return;
    if (!initialFocusGroup) return;
    const el = groupRefs.current[initialFocusGroup] ?? null;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [initialFocusGroup, isOpen, budgetItemId]);

  const availableToLink = useMemo(() => {
    if (!budgetItemId) return [];
    const q = linkQuery.trim().toLowerCase();
    const pool = tasks.filter((t) => !taskHasBudgetLink(t, budgetItemId));
    if (!q) return pool.slice(0, 12);
    return pool
      .filter((t) => (t.title || "").toLowerCase().includes(q))
      .slice(0, 12);
  }, [budgetItemId, linkQuery, tasks]);

  const applyTaskUpdateInMemory = useCallback(
    (updated: Task) => {
      onTasksChange(
        tasks.map((t) => (t.taskId && updated.taskId && t.taskId === updated.taskId ? { ...t, ...updated } : t)),
      );
    },
    [onTasksChange, tasks],
  );

  const handleCreate = useCallback(async () => {
    if (!projectId || !budgetItemId) return;
    const title = createTitle.trim();
    if (!title) return;

    setIsSaving(true);
    try {
      const created = await createTask({
        projectId,
        title,
        status: "todo",
        primaryBudgetLineItemId: budgetItemId,
        budgetLinkType: createLinkType,
      });
      onTasksChange([created, ...tasks]);
      setCreateTitle("");
      setCreateLinkType(inferBudgetTaskLinkTypeFromTitle(title));
    } finally {
      setIsSaving(false);
    }
  }, [budgetItemId, createLinkType, createTitle, onTasksChange, projectId, tasks]);

  const handleLinkTask = useCallback(
    async (task: Task) => {
      if (!projectId || !budgetItemId || !task.taskId) return;

      const primaryId = getPrimaryBudgetLineItemId(task);
      const existingSecondary = getSecondaryBudgetLinks(task);
      const hasSecondary = existingSecondary.some((l) => l.budgetLineItemId === budgetItemId);

      setIsSaving(true);
      try {
        if (!primaryId) {
          const updated = await updateTask({
            projectId,
            taskId: task.taskId,
            title: task.title ?? "",
            primaryBudgetLineItemId: budgetItemId,
            budgetLinkType: linkType,
          });
          applyTaskUpdateInMemory(updated);
          return;
        }

        if (primaryId === budgetItemId) {
          if (!task.budgetLinkType) {
            const updated = await updateTask({
              projectId,
              taskId: task.taskId,
              title: task.title ?? "",
              budgetLinkType: linkType,
            });
            applyTaskUpdateInMemory(updated);
          }
          return;
        }

        if (hasSecondary) return;
        const now = new Date().toISOString();
        const updated = await updateTask({
          projectId,
          taskId: task.taskId,
          title: task.title ?? "",
          budgetLinks: [...existingSecondary, { budgetLineItemId: budgetItemId, linkType, createdAt: now }],
        });
        applyTaskUpdateInMemory(updated);
      } finally {
        setIsSaving(false);
      }
    },
    [applyTaskUpdateInMemory, budgetItemId, linkType, projectId],
  );

  const handleUnlinkTask = useCallback(
    async (task: Task) => {
      if (!projectId || !budgetItemId || !task.taskId) return;

      const primaryId = getPrimaryBudgetLineItemId(task);
      const existingSecondary = getSecondaryBudgetLinks(task);
      const nextSecondary = existingSecondary.filter((l) => l && l.budgetLineItemId !== budgetItemId);

      const updates: Partial<Task> = {};
      if (primaryId === budgetItemId) {
        updates.primaryBudgetLineItemId = null;
        updates.budgetLinkType = null;
      }
      if (existingSecondary.length !== nextSecondary.length) {
        updates.budgetLinks = nextSecondary;
      }

      if (Object.keys(updates).length === 0) return;

      setIsSaving(true);
      try {
        const updated = await updateTask({
          projectId,
          taskId: task.taskId,
          title: task.title ?? "",
          ...updates,
        });
        applyTaskUpdateInMemory(updated);
      } finally {
        setIsSaving(false);
      }
    },
    [applyTaskUpdateInMemory, budgetItemId, projectId],
  );

  const lineLabel = useMemo(() => {
    if (!lineItem) return "";
    const key = typeof lineItem.elementKey === "string" && lineItem.elementKey.trim() ? lineItem.elementKey.trim() : "";
    const desc = typeof lineItem.description === "string" && lineItem.description.trim() ? lineItem.description.trim() : "";
    return [key, desc].filter(Boolean).join(" • ");
  }, [lineItem]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      className={styles.modal}
      overlayClassName={styles.overlay}
      closeTimeoutMS={180}
      contentLabel="Work panel"
    >
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Work (Tasks)</div>
          <div className={styles.subtitle}>
            {lineLabel ? (
              <>
                <span className={styles.subtitleStrong}>{lineLabel}</span>
                <span className={styles.subtitleMuted}> • </span>
              </>
            ) : null}
            <span className={styles.subtitleMuted}>{linkedCount} linked</span>
          </div>
        </div>
        <button type="button" className={styles.close} onClick={onRequestClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Create task</div>
          <div className={styles.row}>
            <input
              className={styles.input}
              value={createTitle}
              onChange={(e) => {
                const next = e.target.value;
                setCreateTitle(next);
                if (next.trim().length >= 3) {
                  setCreateLinkType(inferBudgetTaskLinkTypeFromTitle(next));
                }
              }}
              placeholder="e.g. Confirm pipe & drape quote"
              disabled={!budgetItemId || isSaving}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
            <select
              className={styles.select}
              value={createLinkType}
              onChange={(e) => setCreateLinkType(e.target.value as BudgetTaskLinkType)}
              disabled={!budgetItemId || isSaving}
            >
              {BUDGET_TASK_LINK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void handleCreate()}
              disabled={!budgetItemId || isSaving || createTitle.trim().length === 0}
            >
              Create
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>Link existing</div>
          <div className={styles.row}>
            <input
              className={styles.input}
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="Search tasks…"
              disabled={!budgetItemId || isSaving}
            />
            <select
              className={styles.select}
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as BudgetTaskLinkType)}
              disabled={!budgetItemId || isSaving}
            >
              {BUDGET_TASK_LINK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.linkResults}>
            {availableToLink.length === 0 ? (
              <div className={styles.emptyHint}>No matching tasks.</div>
            ) : (
              availableToLink.map((t) => (
                <button
                  key={t.taskId ?? t.title}
                  type="button"
                  className={styles.linkResultRow}
                  onClick={() => void handleLinkTask(t)}
                  disabled={isSaving}
                  title="Link task"
                >
                  <span className={styles.linkResultTitle}>{t.title || "Untitled task"}</span>
                  <span className={styles.linkResultMeta}>
                    {t.status ? t.status.replace(/_/g, " ") : "todo"} • {normalizeOwnerLabel(t)} • {normalizeDueLabel(t)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>Linked tasks</div>
          <div className={styles.groups}>
            {BUDGET_TASK_LINK_TYPES.map((group) => (
              <div
                key={group.id}
                className={styles.group}
                ref={(node) => {
                  groupRefs.current[group.id] = node;
                }}
              >
                <div className={styles.groupTitle}>{group.label}</div>
                <div className={styles.groupList}>
                  {(grouped[group.id] ?? []).length === 0 ? (
                    <div className={styles.emptyHint}>None</div>
                  ) : (
                    (grouped[group.id] ?? []).map((t) => (
                      <div key={t.taskId ?? t.title} className={styles.taskRow}>
                        <div className={styles.taskMain}>
                          <div className={styles.taskTitle}>{t.title || "Untitled task"}</div>
                          <div className={styles.taskMeta}>
                            {t.status ? t.status.replace(/_/g, " ") : "todo"} • {normalizeOwnerLabel(t)} • {normalizeDueLabel(t)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => void handleUnlinkTask(t)}
                          disabled={isSaving}
                        >
                          Unlink
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}

            <div className={styles.group}>
              <div className={styles.groupTitle}>Other</div>
              <div className={styles.groupList}>
                {(grouped.other ?? []).length === 0 ? (
                  <div className={styles.emptyHint}>None</div>
                ) : (
                  (grouped.other ?? []).map((t) => (
                    <div key={t.taskId ?? t.title} className={styles.taskRow}>
                      <div className={styles.taskMain}>
                        <div className={styles.taskTitle}>{t.title || "Untitled task"}</div>
                        <div className={styles.taskMeta}>
                          {t.status ? t.status.replace(/_/g, " ") : "todo"} • {normalizeOwnerLabel(t)} • {normalizeDueLabel(t)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => void handleUnlinkTask(t)}
                        disabled={isSaving}
                      >
                        Unlink
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

