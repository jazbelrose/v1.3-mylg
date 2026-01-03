import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wand2, X } from "lucide-react";
import type { CalendarEvent, CalendarTask } from "../utils";
import { fmtLocal, safeDate } from "../utils";
import { parseTimeToMinutes } from "./timelineLayout";
import { buildIsoDateTime } from "./calendarInteractions";
import {
  buildDoablePlans,
  formatMinutesHHMM,
  type BusyBlock,
  type DoablePlan,
  type DoableDraft,
} from "../lib/doablePlanner";

export type MakeTodayDoableApplyRequest = {
  dateIso: string;
  plan: DoablePlan;
  selectedTaskIds: string[];
};

export type MakeTodayDoableModalProps = {
  isOpen: boolean;
  date: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onClose: () => void;
  onApply: (request: MakeTodayDoableApplyRequest) => Promise<void> | void;
};

const buildBusyBlocksForDate = (dateIso: string, events: CalendarEvent[], tasks: CalendarTask[]): BusyBlock[] => {
  const busy: BusyBlock[] = [];

  events.forEach((event) => {
    if (event.date !== dateIso) return;
    if (event.allDay) return;
    if (!event.start || !event.end) return;
    const startMinutes = parseTimeToMinutes(event.start);
    const endMinutes = parseTimeToMinutes(event.end);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return;
    busy.push({ startMinutes, endMinutes });
  });

  tasks.forEach((task) => {
    if (task.kind === "intent") return;
    if (task.focusBlockId) return;
    if (!task.start || !task.end) return;
    if (!task.due || task.due !== dateIso) return;
    const startMinutes = parseTimeToMinutes(task.start);
    const endMinutes = parseTimeToMinutes(task.end);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return;
    busy.push({ startMinutes, endMinutes });
  });

  return busy;
};

const railButtonClass = (active: boolean) =>
  `task-spellbook__rail-btn ${active ? "task-spellbook__rail-btn--active" : ""}`;

export default function MakeTodayDoableModal({
  isOpen,
  date,
  events,
  tasks,
  onClose,
  onApply,
}: MakeTodayDoableModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dateIso = useMemo(() => fmtLocal(date), [date]);

  const candidateTasks = useMemo(() => {
    const today = safeDate(dateIso) ?? new Date(dateIso);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    return tasks
      .filter((task) => {
        if (task.kind === "intent") return false;
        if (task.kind === "focus_block") return false;
        if (task.focusBlockId) return false;
        if (task.status === "done" || task.status === "archived") return false;
        if (task.start || task.end) return false;
        const due = task.due ? safeDate(task.due) : null;
        if (!due) return false;
        return due.getTime() <= todayStart.getTime();
      })
      .slice(0, 16);
  }, [dateIso, tasks]);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("balanced");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTaskIds(candidateTasks.map((task) => task.id));
    setSelectedPlanId("balanced");
  }, [candidateTasks, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const busyBlocks = useMemo(() => buildBusyBlocksForDate(dateIso, events, tasks), [dateIso, events, tasks]);

  const drafts = useMemo<DoableDraft[]>(() => {
    const selected = new Set(selectedTaskIds);
    return candidateTasks
      .filter((task) => selected.has(task.id))
      .map((task) => ({
        id: task.id,
        title: task.title,
        durationMinutes:
          typeof task.durationMinutes === "number" && Number.isFinite(task.durationMinutes)
            ? task.durationMinutes
            : 30,
      }));
  }, [candidateTasks, selectedTaskIds]);

  const plans = useMemo(() => buildDoablePlans({ drafts, busy: busyBlocks }), [busyBlocks, drafts]);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );

  const toggleTask = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const set = new Set(prev);
      if (set.has(taskId)) set.delete(taskId);
      else set.add(taskId);
      return [...set];
    });
  }, []);

  const handleBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      onClose();
    },
    [onClose],
  );

  const handleApply = useCallback(async () => {
    if (!selectedPlan) return;
    if (drafts.length === 0) return;
    try {
      setIsApplying(true);
      await onApply({ dateIso, plan: selectedPlan, selectedTaskIds });
      onClose();
    } finally {
      setIsApplying(false);
    }
  }, [dateIso, drafts.length, onApply, onClose, selectedPlan, selectedTaskIds]);

  if (!isOpen) return null;

  const canApply = drafts.length > 0 && !isApplying;

  const modal = (
    <div className="task-spellbook__backdrop" onMouseDown={handleBackdropMouseDown} role="presentation">
      <div className="task-spellbook doable-modal" ref={dialogRef} role="dialog" aria-label="Make today doable">
        <div className="task-spellbook__header">
          <div className="task-spellbook__title">
            <Wand2 size={16} aria-hidden />
            <span>Make today doable</span>
          </div>
          <button type="button" className="task-spellbook__close" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="task-spellbook__body">
          <div className="task-spellbook__input">
            <div className="doable-modal__tasks">
              <div className="doable-modal__tasks-title">
                <span>Unscheduled</span>
                <span className="doable-modal__tasks-subtitle">{dateIso}</span>
              </div>
              {candidateTasks.length === 0 ? (
                <div className="doable-modal__empty">No unscheduled tasks found for today.</div>
              ) : (
                <div className="doable-modal__task-list">
                  {candidateTasks.map((task) => {
                    const checked = selectedTaskIds.includes(task.id);
                    const minutes =
                      typeof task.durationMinutes === "number" && Number.isFinite(task.durationMinutes)
                        ? task.durationMinutes
                        : 30;
                    return (
                      <label key={task.id} className="doable-modal__task-row">
                        <input type="checkbox" checked={checked} onChange={() => toggleTask(task.id)} />
                        <span className="doable-modal__task-title">{task.title}</span>
                        <span className="doable-modal__task-minutes">{minutes}m</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="task-spellbook__right">
            <div className="task-spellbook__section">
              <div className="task-spellbook__section-header">
                <span className="task-spellbook__section-title">Plans</span>
                <span className="task-spellbook__section-hint">Pick one, always editable</span>
              </div>
              <div className="task-spellbook__rail">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={railButtonClass(plan.id === selectedPlanId)}
                    onClick={() => setSelectedPlanId(plan.id)}
                    disabled={drafts.length === 0}
                  >
                    <div className="task-spellbook__rail-title">
                      {plan.label}
                      <span className="task-spellbook__rail-metric">
                        {Math.round(plan.scheduledMinutes / 5) * 5}m
                        {plan.overflow.length > 0 ? ` · +${plan.overflow.length} overflow` : ""}
                      </span>
                    </div>
                    <div className="task-spellbook__rail-hint">{plan.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="task-spellbook__section">
              <div className="doable-modal__preview">
                <span className="task-spellbook__section-title">Preview</span>
                {selectedPlan && drafts.length > 0 ? (
                  <div className="doable-modal__preview-list">
                    {selectedPlan.placements.slice(0, 6).map((p) => (
                      <div key={`${p.draftId}-${p.startMinutes}`} className="doable-modal__preview-row">
                        <span className="doable-modal__preview-time">
                          {formatMinutesHHMM(p.startMinutes)}–{formatMinutesHHMM(p.endMinutes)}
                        </span>
                        <span className="doable-modal__preview-title">
                          {drafts.find((d) => d.id === p.draftId)?.title ?? p.draftId}
                        </span>
                      </div>
                    ))}
                    {selectedPlan.placements.length > 6 && (
                      <div className="doable-modal__preview-more">+{selectedPlan.placements.length - 6} more</div>
                    )}
                    {selectedPlan.overflow.length > 0 && (
                      <div className="doable-modal__preview-more">Overflow: {selectedPlan.overflow.length}</div>
                    )}
                  </div>
                ) : (
                  <div className="doable-modal__empty">Select tasks to build plans.</div>
                )}
              </div>
            </div>

            <div className="task-spellbook__actions">
              <button type="button" className="task-spellbook__btn task-spellbook__btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="task-spellbook__btn task-spellbook__btn--primary"
                disabled={!canApply}
                onClick={handleApply}
              >
                {isApplying ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export const buildTaskReschedulePayload = (dateIso: string, startMinutes: number, endMinutes: number) => {
  const startAt = buildIsoDateTime(dateIso, formatMinutesHHMM(startMinutes));
  const endAt = buildIsoDateTime(dateIso, formatMinutesHHMM(endMinutes));
  return {
    startAt,
    endAt,
    dueDate: endAt ?? dateIso,
    dueAt: endAt ?? dateIso,
  };
};

