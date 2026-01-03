import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import type { CalendarEvent, CalendarTask } from "../utils";
import { fmtLocal, safeDate } from "../utils";
import { parseTimeToMinutes } from "./timelineLayout";
import { buildDoablePlans, type BusyBlock, type DoablePlan, type DoableDraft } from "../lib/doablePlanner";
import {
  buildSpellbookVariants,
  parseSpellbookInput,
  type SpellbookParseResult,
  type SpellbookVariant,
  type SpellbookVariantId,
} from "../lib/taskSpellbook";

export type TaskSpellbookApplyRequest = {
  targetDate: string; // YYYY-MM-DD
  variantId: SpellbookVariantId;
  variant: SpellbookVariant;
  parseResult: SpellbookParseResult;
  autoPack: boolean;
  planId: string | null;
  plan: DoablePlan | null;
};

export type TaskSpellbookModalProps = {
  isOpen: boolean;
  anchorDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onClose: () => void;
  onApply: (request: TaskSpellbookApplyRequest) => Promise<void> | void;
};

const buildBusyBlocksForDate = (dateIso: string, events: CalendarEvent[], tasks: CalendarTask[]): BusyBlock[] => {
  const busy: BusyBlock[] = [];

  events.forEach((event) => {
    if (event.date !== dateIso) return;
    if (!event.start || !event.end) return;
    const startMinutes = parseTimeToMinutes(event.start);
    const endMinutes = parseTimeToMinutes(event.end);
    if (startMinutes == null || endMinutes == null) return;
    if (endMinutes <= startMinutes) return;
    busy.push({ startMinutes, endMinutes });
  });

  tasks.forEach((task) => {
    if (task.due !== dateIso) return;
    if (!task.start || !task.end) return;
    const startMinutes = parseTimeToMinutes(task.start);
    const endMinutes = parseTimeToMinutes(task.end);
    if (startMinutes == null || endMinutes == null) return;
    if (endMinutes <= startMinutes) return;
    busy.push({ startMinutes, endMinutes });
  });

  return busy;
};

const isMeaningfulText = (value: string) => value.trim().length >= 3;

const railButtonClass = (active: boolean) =>
  `task-spellbook__rail-btn ${active ? "task-spellbook__rail-btn--active" : ""}`;

const toDraftsFromVariant = (variant: SpellbookVariant): DoableDraft[] => {
  if (variant.focusBlocks.length > 0) {
    return variant.focusBlocks.map((block, idx) => ({
      id: `block-${idx}`,
      title: block.title,
      durationMinutes: block.durationMinutes,
    }));
  }

  return variant.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.kind === "task")
    .map(({ item, idx }) => ({
      id: `item-${idx}`,
      title: item.title,
      durationMinutes: item.durationMinutes,
    }));
};

export default function TaskSpellbookModal({
  isOpen,
  anchorDate,
  events,
  tasks,
  onClose,
  onApply,
}: TaskSpellbookModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [targetDate, setTargetDate] = useState<string>(() => fmtLocal(anchorDate));
  const [variantId, setVariantId] = useState<SpellbookVariantId>("split");
  const [autoPack, setAutoPack] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("balanced");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTargetDate(fmtLocal(anchorDate));
  }, [anchorDate, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  const parseResult = useMemo<SpellbookParseResult>(() => parseSpellbookInput(text), [text]);
  const variants = useMemo(() => buildSpellbookVariants(parseResult), [parseResult]);
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === variantId) ?? variants[0],
    [variants, variantId],
  );

  const busyBlocks = useMemo(() => buildBusyBlocksForDate(targetDate, events, tasks), [events, tasks, targetDate]);
  const drafts = useMemo(() => toDraftsFromVariant(selectedVariant), [selectedVariant]);
  const plans = useMemo(() => buildDoablePlans({ drafts, busy: busyBlocks }), [drafts, busyBlocks]);
  const selectedPlan = useMemo(
    () => (autoPack ? plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] : null),
    [autoPack, plans, selectedPlanId],
  );

  useEffect(() => {
    if (!autoPack) return;
    if (plans.some((plan) => plan.id === selectedPlanId)) return;
    setSelectedPlanId(plans[0]?.id ?? "balanced");
  }, [autoPack, plans, selectedPlanId]);

  const handleBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      onClose();
    },
    [onClose],
  );

  const handleApply = useCallback(async () => {
    if (!selectedVariant) return;
    if (!isMeaningfulText(text)) return;

    const resolvedTarget = safeDate(targetDate) ? targetDate : fmtLocal(anchorDate);
    const plan = autoPack ? selectedPlan : null;
    const planId = autoPack ? plan?.id ?? null : null;

    try {
      setIsApplying(true);
      await onApply({
        targetDate: resolvedTarget,
        variantId: selectedVariant.id,
        variant: selectedVariant,
        parseResult,
        autoPack,
        planId,
        plan,
      });
      onClose();
      setText("");
    } finally {
      setIsApplying(false);
    }
  }, [anchorDate, autoPack, onApply, onClose, parseResult, selectedPlan, selectedVariant, targetDate, text]);

  if (!isOpen) return null;

  const canApply = isMeaningfulText(text) && !isApplying;

  const modal = (
    <div className="task-spellbook__backdrop" onMouseDown={handleBackdropMouseDown} role="presentation">
      <div className="task-spellbook" ref={dialogRef} role="dialog" aria-label="Task Spellbook">
        <div className="task-spellbook__header">
          <div className="task-spellbook__title">
            <Sparkles size={16} aria-hidden />
            <span>Task Spellbook</span>
          </div>
          <button type="button" className="task-spellbook__close" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="task-spellbook__body">
          <div className="task-spellbook__input">
            <textarea
              ref={inputRef}
              className="task-spellbook__textarea"
              placeholder={`Paste anything: lists, meeting notes, PR descriptions...\n\nExample:\n- Calendar polish pass (45m)\n- Thumbnails: cleanup + export\nintent: touch base w/ Leah`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
            <div className="task-spellbook__meta">
              <label className="task-spellbook__meta-field">
                <span>Date</span>
                <input
                  className="task-spellbook__date"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </label>
              <label className="task-spellbook__meta-field task-spellbook__meta-field--toggle">
                <input
                  type="checkbox"
                  checked={autoPack}
                  onChange={(event) => setAutoPack(event.target.checked)}
                />
                <span>Auto-pack into day</span>
              </label>
              <div className="task-spellbook__summary" aria-live="polite">
                {parseResult.items.length > 0 ? (
                  <span>
                    {parseResult.items.length} items · {Math.round(parseResult.totalMinutes / 5) * 5}m suggested
                  </span>
                ) : (
                  <span>Paste anything to generate structure.</span>
                )}
              </div>
            </div>
          </div>

          <div className="task-spellbook__right">
            <div className="task-spellbook__section">
              <div className="task-spellbook__section-header">
                <span className="task-spellbook__section-title">Outputs</span>
                <span className="task-spellbook__section-hint">Pick a structure</span>
              </div>
              <div className="task-spellbook__rail">
                {variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className={railButtonClass(variant.id === variantId)}
                    onClick={() => setVariantId(variant.id)}
                    disabled={!isMeaningfulText(text)}
                  >
                    <div className="task-spellbook__rail-title">{variant.label}</div>
                    <div className="task-spellbook__rail-hint">{variant.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="task-spellbook__section">
              <div className="task-spellbook__section-header">
                <span className="task-spellbook__section-title">Plans</span>
                <span className="task-spellbook__section-hint">3 ways to make it doable</span>
              </div>
              <div className="task-spellbook__rail">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={railButtonClass(autoPack && plan.id === selectedPlanId)}
                    onClick={() => setSelectedPlanId(plan.id)}
                    disabled={!autoPack || !isMeaningfulText(text)}
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

