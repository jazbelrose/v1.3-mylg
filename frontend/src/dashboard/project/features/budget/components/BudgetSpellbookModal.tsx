import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { Sparkles, X } from "lucide-react";
import styles from "./budget-spellbook-modal.module.css";
import {
  buildBudgetSpellbookVariants,
  computeBudgetSpellbookTotals,
  parseBudgetSpellbookInput,
  type BudgetSpellbookApplyMode,
  type BudgetSpellbookCrewModel,
  type BudgetSpellbookEventType,
  type BudgetSpellbookGeneratorOptions,
  type BudgetSpellbookParseResult,
  type BudgetSpellbookVariant,
  type BudgetSpellbookVariantId,
} from "../lib/budgetSpellbook";
import {
  buildPlanDraft,
  defaultPlanDraftAssumptions,
  type PlanDraft,
  type PlanDraftAssumptions,
  type PlanDraftOutputs,
} from "../lib/planDraft";
import { FOCUS_BLOCK_WINDOWS } from "@/shared/utils/focusBlockWindows";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

export type BudgetSpellbookApplyRequest = {
  applyMode: BudgetSpellbookApplyMode;
  variantId: BudgetSpellbookVariantId;
  variant: BudgetSpellbookVariant;
  parseResult: BudgetSpellbookParseResult;
  options: BudgetSpellbookGeneratorOptions;
  outputs: PlanDraftOutputs;
  planAssumptions: PlanDraftAssumptions;
};

export type BudgetSpellbookModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  revisionLabel: string;
  onApply: (request: BudgetSpellbookApplyRequest) => Promise<void> | void;
  canApply?: boolean;
  applyDisabledReason?: string;
  entryPoint?: "budget" | "overview";
  initialTab?: "budget" | "plan" | "assumptions";
  initialOutputs?: Partial<PlanDraftOutputs>;
};

const isMeaningfulText = (value: string) => value.trim().length >= 3;

const formatMoney = (value: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const percentLabel = (value: number) => `${Math.round(value * 100)}%`;

const formatMinutes = (minutes: number | undefined) => {
  const value = typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  return value ? `${value}m` : "";
};

export default function BudgetSpellbookModal({
  isOpen,
  onRequestClose,
  revisionLabel,
  onApply,
  canApply = true,
  applyDisabledReason,
  entryPoint = "budget",
  initialTab = "budget",
  initialOutputs,
}: BudgetSpellbookModalProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [variantId, setVariantId] = useState<BudgetSpellbookVariantId>("producer-standard");

  const [eventType, setEventType] = useState<BudgetSpellbookEventType>("brand activation");
  const [venueCity, setVenueCity] = useState<string>("");
  const [crewModel, setCrewModel] = useState<BudgetSpellbookCrewModel>("internal");
  const [includeTravelTrucking, setIncludeTravelTrucking] = useState(true);
  const [markupTarget, setMarkupTarget] = useState<0.25 | 0.35 | "custom">(0.25);
  const [markupCustom, setMarkupCustom] = useState("25");
  const [contingency, setContingency] = useState<0 | 0.05 | 0.1 | 0.15 | "custom">(0.1);
  const [contingencyCustom, setContingencyCustom] = useState("10");

  const [applyMode, setApplyMode] = useState<BudgetSpellbookApplyMode>("add");
  const [isApplying, setIsApplying] = useState(false);

  const [activeTab, setActiveTab] = useState<"budget" | "plan" | "assumptions">(initialTab);

  const [outputs, setOutputs] = useState<PlanDraftOutputs>(() => {
    const base: PlanDraftOutputs =
      entryPoint === "overview"
        ? { budget: true, calendarPlan: true, links: true }
        : { budget: true, calendarPlan: false, links: false };
    return {
      budget: initialOutputs?.budget ?? base.budget,
      calendarPlan: initialOutputs?.calendarPlan ?? base.calendarPlan,
      links: initialOutputs?.links ?? base.links,
    };
  });

  const [{ assumptions: defaultAssumptions, confidence: defaultConfidence }] = useState(() =>
    defaultPlanDraftAssumptions({ eventDate: null, installDays: null }),
  );

  const [planAssumptions, setPlanAssumptions] = useState<PlanDraftAssumptions>(defaultAssumptions);
  const [assumptionConfidence, setAssumptionConfidence] = useState(defaultConfidence);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRequestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onRequestClose]);

  const resolvedMarkupTarget = useMemo(() => {
    if (markupTarget !== "custom") return markupTarget;
    const parsed = Number(markupCustom);
    if (!Number.isFinite(parsed)) return 0.25;
    return Math.max(0, Math.min(2, parsed / 100));
  }, [markupCustom, markupTarget]);

  const resolvedContingency = useMemo(() => {
    if (contingency !== "custom") return contingency;
    const parsed = Number(contingencyCustom);
    if (!Number.isFinite(parsed)) return 0.1;
    return Math.max(0, Math.min(1, parsed / 100));
  }, [contingency, contingencyCustom]);

  const options = useMemo<BudgetSpellbookGeneratorOptions>(
    () => ({
      eventType,
      venueCity,
      crewModel,
      markupTarget: resolvedMarkupTarget,
      contingencyPct: resolvedContingency,
      includeTravelTrucking,
    }),
    [crewModel, eventType, includeTravelTrucking, resolvedContingency, resolvedMarkupTarget, venueCity],
  );

  const parseResult = useMemo(() => parseBudgetSpellbookInput(text), [text]);

  // Note: Plan time is controlled by a Focus Block window (Plan tab).
  const variants = useMemo(() => buildBudgetSpellbookVariants(parseResult, options), [options, parseResult]);
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === variantId) ?? variants[0],
    [variantId, variants],
  );

  useEffect(() => {
    if (!variants.some((variant) => variant.id === variantId)) {
      setVariantId(variants[0]?.id ?? "producer-standard");
    }
  }, [variantId, variants]);

  const totals = useMemo(() => computeBudgetSpellbookTotals(selectedVariant.lines), [selectedVariant.lines]);

  const planDraft: PlanDraft = useMemo(() => {
    return buildPlanDraft({
      budgetLines: selectedVariant.lines,
      assumptions: planAssumptions,
      confidence: assumptionConfidence,
    });
  }, [assumptionConfidence, planAssumptions, selectedVariant.lines]);

  const [conjurePhase, setConjurePhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== "plan") return;
    setConjurePhase(0);
    const t1 = window.setTimeout(() => setConjurePhase(1), 160);
    const t2 = window.setTimeout(() => setConjurePhase(2), 360);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [activeTab, isOpen, planDraft.focusBlocks.length, planDraft.tasks.length, selectedVariant.id]);

  const categoryBars = useMemo(() => {
    const rows = Object.entries(totals.byCategory)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const max = rows[0]?.value ?? 0;
    return rows.map((row) => ({ ...row, pct: max > 0 ? row.value / max : 0 }));
  }, [totals.byCategory]);

  const requiresEventDate = outputs.calendarPlan || outputs.links;
  const hasEventDate = Boolean(planAssumptions.eventDate && planAssumptions.eventDate.trim().length > 0);
  const isBlockedByEventDate = requiresEventDate && !hasEventDate;

  const canSubmit = isMeaningfulText(text) && canApply && !isApplying && !isBlockedByEventDate;
  const applyTooltip = !canApply
    ? applyDisabledReason
    : isBlockedByEventDate
      ? "Add an event date to generate the calendar plan."
      : undefined;

  const handleApply = useCallback(async () => {
    if (!canSubmit) return;
    try {
      setIsApplying(true);
      await onApply({
        applyMode,
        variantId: selectedVariant.id,
        variant: selectedVariant,
        parseResult,
        options,
        outputs,
        planAssumptions,
      });
      onRequestClose();
      setText("");
    } finally {
      setIsApplying(false);
    }
  }, [applyMode, canSubmit, onApply, onRequestClose, options, outputs, parseResult, planAssumptions, selectedVariant]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
      closeTimeoutMS={180}
      className={{
        base: styles.modal,
        afterOpen: styles.modalAfterOpen,
        beforeClose: styles.modalBeforeClose,
      }}
      overlayClassName={{
        base: styles.overlay,
        afterOpen: styles.overlayAfterOpen,
        beforeClose: styles.overlayBeforeClose,
      }}
    >
      <div className={styles.header}>
        <div className={styles.title}>
          <Sparkles size={16} aria-hidden />
          <span>Budget Spellbook</span>
        </div>
        <button type="button" className={styles.close} onClick={onRequestClose} aria-label="Close">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.leftPane}>
          <textarea
            ref={inputRef}
            className={styles.textarea}
            placeholder={`Paste anything: scope notes, run-of-show, emails, shopping lists...\n\nExample:\nMB2 Tahoe, scenic + drape + labor, 2 days install, 25% markup\nPipe & drape 200', 12 uplights, stage 24x16, 8 crew\nAdd 10% contingency`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />

          <div className={styles.quickMeta}>
            {parseResult.shoppingList.length > 0 ? (
              <div className={styles.summary} aria-live="polite">
                <span>{parseResult.shoppingList.length} notes • {selectedVariant.lines.length} line items</span>
              </div>
            ) : (
              <div className={styles.summary} aria-live="polite">
                <span>Paste anything to generate structure.</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.rightPane}>
          <div className={styles.outputsRow} aria-label="Outputs">
            <button
              type="button"
              className={`${styles.outputToggle} ${outputs.budget ? styles.outputToggleOn : ""}`}
              onClick={() => setOutputs((prev) => ({ ...prev, budget: !prev.budget }))}
            >
              <span className={styles.outputToggleCheck} aria-hidden>
                {outputs.budget ? "✓" : ""}
              </span>
              <span>Budget</span>
            </button>
            <button
              type="button"
              className={`${styles.outputToggle} ${outputs.calendarPlan ? styles.outputToggleOn : ""}`}
              onClick={() => setOutputs((prev) => ({ ...prev, calendarPlan: !prev.calendarPlan }))}
            >
              <span className={styles.outputToggleCheck} aria-hidden>
                {outputs.calendarPlan ? "✓" : ""}
              </span>
              <span>Calendar Plan</span>
            </button>
            <button
              type="button"
              className={`${styles.outputToggle} ${outputs.links ? styles.outputToggleOn : ""}`}
              onClick={() => setOutputs((prev) => ({ ...prev, links: !prev.links }))}
            >
              <span className={styles.outputToggleCheck} aria-hidden>
                {outputs.links ? "✓" : ""}
              </span>
              <span>Links</span>
            </button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Preview">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "budget"}
              className={`${styles.tab} ${activeTab === "budget" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("budget")}
            >
              Budget
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "plan"}
              className={`${styles.tab} ${activeTab === "plan" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("plan")}
            >
              Plan
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "assumptions"}
              className={`${styles.tab} ${activeTab === "assumptions" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("assumptions")}
            >
              Assumptions
            </button>
          </div>

          <div className={styles.rail}>
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={`${styles.railButton} ${variant.id === selectedVariant.id ? styles.railButtonActive : ""}`}
                onClick={() => setVariantId(variant.id)}
              >
                <div className={styles.railLabel}>{variant.label}</div>
                <div className={styles.railHint}>{variant.hint}</div>
              </button>
            ))}
          </div>

          <div className={styles.preview}>
            {activeTab === "budget" ? (
              <>
                <div className={styles.totals}>
                  <div className={styles.totalCard}>
                    <div className={styles.totalLabel}>Budgeted</div>
                    <div className={styles.totalValue}>{formatMoney(totals.budgeted)}</div>
                  </div>
                  <div className={styles.totalCard}>
                    <div className={styles.totalLabel}>Final</div>
                    <div className={styles.totalValue}>{formatMoney(totals.final)}</div>
                  </div>
                  <div className={styles.totalCard}>
                    <div className={styles.totalLabel}>Effective markup</div>
                    <div className={styles.totalValue}>{percentLabel(totals.effectiveMarkup)}</div>
                  </div>
                </div>

                <div className={styles.breakdown}>
                  <div className={styles.breakdownTitle}>Category breakdown</div>
                  <div className={styles.breakdownRows}>
                    {categoryBars.length ? (
                      categoryBars.map((row) => (
                        <div key={row.category} className={styles.breakdownRow}>
                          <div className={styles.breakdownLabel}>{row.category}</div>
                          <div className={styles.breakdownBar}>
                            <div className={styles.breakdownFill} style={{ width: `${Math.round(row.pct * 100)}%` }} />
                          </div>
                          <div className={styles.breakdownValue}>{formatMoney(row.value)}</div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.breakdownEmpty}>Generate a structure to preview totals.</div>
                    )}
                  </div>
                </div>

                <div className={styles.lines}>
                  <div className={styles.linesHeader}>
                    <div>Line items</div>
                    <div className={styles.linesCount}>{selectedVariant.lines.length}</div>
                  </div>
                  <div className={styles.linesTable} role="table" aria-label="Spellbook preview line items">
                    {selectedVariant.lines.map((line) => (
                      <div key={line.id} className={styles.lineRow} role="row">
                        <div className={styles.lineMeta} role="cell">
                          <div className={styles.lineCategory}>{line.category}</div>
                          <div className={styles.lineDesc}>{line.description}</div>
                          <div className={styles.lineGroups}>
                            <span>{line.areaGroup}</span>
                            <span>•</span>
                            <span>{line.invoiceGroup}</span>
                            {line.packageLabel ? (
                              <>
                                <span>•</span>
                                <span>{line.packageLabel}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className={styles.lineQty} role="cell">
                          <div className={styles.lineQtyTop}>
                            {line.quantity} {line.unit}
                          </div>
                          <div className={styles.lineQtyBottom}>
                            {formatMoney(line.itemBudgetedCost)} • {percentLabel(line.itemMarkUp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {activeTab === "plan" ? (
              <div className={styles.planTab}>
                <div className={styles.planChips}>
                  <label className={styles.chip}>
                    <span className={styles.chipDot} style={{ opacity: assumptionConfidence.eventDate }} aria-hidden />
                    <span className={styles.chipLabel}>Event date</span>
                    <input
                      className={styles.chipInput}
                      type="date"
                      value={planAssumptions.eventDate ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPlanAssumptions((prev) => ({ ...prev, eventDate: v || null }));
                        setAssumptionConfidence((prev) => ({ ...prev, eventDate: v ? 0.85 : 0.3 }));
                      }}
                    />
                  </label>

                  <label className={styles.chip}>
                    <span className={styles.chipDot} style={{ opacity: assumptionConfidence.focusBlockWindowId }} aria-hidden />
                    <span className={styles.chipLabel}>Focus Block</span>
                    <select
                      className={styles.chipInput}
                      value={planAssumptions.focusBlockWindowId}
                      onChange={(e) => {
                        const v = e.target.value as PlanDraftAssumptions["focusBlockWindowId"];
                        setPlanAssumptions((prev) => ({ ...prev, focusBlockWindowId: v }));
                        setAssumptionConfidence((prev) => ({ ...prev, focusBlockWindowId: 0.95 }));
                      }}
                    >
                      {FOCUS_BLOCK_WINDOWS.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.chip}>
                    <span className={styles.chipDot} style={{ opacity: assumptionConfidence.minTaskMinutes }} aria-hidden />
                    <span className={styles.chipLabel}>Min task</span>
                    <input
                      className={styles.chipInput}
                      type="number"
                      min={0}
                      max={240}
                      value={String(planAssumptions.minTaskMinutes)}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setPlanAssumptions((prev) => ({ ...prev, minTaskMinutes: Number.isFinite(next) ? next : prev.minTaskMinutes }));
                        setAssumptionConfidence((prev) => ({ ...prev, minTaskMinutes: 0.95 }));
                      }}
                    />
                    <span className={styles.chipSuffix}>m</span>
                  </label>

                  <label className={styles.chip}>
                    <span className={styles.chipDot} style={{ opacity: assumptionConfidence.maxTaskMinutes }} aria-hidden />
                    <span className={styles.chipLabel}>Max task</span>
                    <input
                      className={styles.chipInput}
                      type="number"
                      min={0}
                      max={480}
                      value={String(planAssumptions.maxTaskMinutes)}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setPlanAssumptions((prev) => ({ ...prev, maxTaskMinutes: Number.isFinite(next) ? next : prev.maxTaskMinutes }));
                        setAssumptionConfidence((prev) => ({ ...prev, maxTaskMinutes: 0.95 }));
                      }}
                    />
                    <span className={styles.chipSuffix}>m</span>
                  </label>
                </div>

                {planDraft.warnings.length > 0 ? (
                  <div className={styles.planWarnings} role="status">
                    {planDraft.warnings.map((w) => (
                      <div key={w.code} className={styles.planWarning}>
                        {w.message}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className={`${styles.planSection} ${conjurePhase >= 0 ? styles.planSectionOn : ""}`}>
                  <div className={styles.planSectionTitle}>Budget lines</div>
                  <div className={styles.planMiniList}>
                    {selectedVariant.lines.slice(0, 8).map((line) => (
                      <div key={line.id} className={styles.planMiniRow}>
                        <span className={styles.planMiniStrong}>{line.description}</span>
                        <span className={styles.planMiniMeta}>{formatMoney(line.itemBudgetedCost)}</span>
                      </div>
                    ))}
                    {selectedVariant.lines.length > 8 ? (
                      <div className={styles.planMiniMore}>+{selectedVariant.lines.length - 8} more</div>
                    ) : null}
                  </div>
                </div>

                <div className={`${styles.planSection} ${conjurePhase >= 1 ? styles.planSectionOn : ""}`}>
                  <div className={styles.planSectionTitle}>Focus Blocks (containers)</div>
                  <div className={styles.planBlocks}>
                    {planDraft.focusBlocks.length === 0 ? (
                      <div className={styles.planEmpty}>Add an event date to preview blocks.</div>
                    ) : (
                      planDraft.focusBlocks.map((b) => (
                        <div key={b.key} className={styles.planBlockRow}>
                          <div className={styles.planBlockTitle}>{b.title}</div>
                          <div className={styles.planBlockMeta}>
                            {b.dateIso} • {b.startLocalTime}–{b.endLocalTime}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`${styles.planSection} ${conjurePhase >= 2 ? styles.planSectionOn : ""}`}>
                  <div className={styles.planSectionTitle}>Tasks (fit inside Focus Blocks)</div>
                  <div className={styles.planTasks}>
                    {planDraft.tasks.length === 0 ? (
                      <div className={styles.planEmpty}>No tasks generated for these line items.</div>
                    ) : (
                      planDraft.tasks
                        .slice(0, 16)
                        .map((t) => (
                          <div key={t.id} className={styles.planTaskRow}>
                            <div className={styles.planTaskTitle}>{t.title}</div>
                            <div className={styles.planTaskMeta}>
                              {t.dateIso} • {t.linkType.toUpperCase()}{t.plannedMinutes ? ` • ${formatMinutes(t.plannedMinutes)}` : ""}
                            </div>
                          </div>
                        ))
                    )}
                    {planDraft.tasks.length > 16 ? (
                      <div className={styles.planMiniMore}>+{planDraft.tasks.length - 16} more</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "assumptions" ? (
              <div className={styles.assumptionsTab}>
                <div className={styles.assumptionsHeader}>Assumptions</div>
                <div className={styles.assumptionsList}>
                  {planDraft.assumptions.map((chip) => (
                    <div key={chip.key} className={styles.assumptionRow}>
                      <span className={styles.assumptionDot} style={{ opacity: chip.confidence }} aria-hidden />
                      <span className={styles.assumptionLabel}>{chip.label}</span>
                      <span className={styles.assumptionValue}>{chip.value}</span>
                    </div>
                  ))}
                </div>
                {planDraft.warnings.length > 0 ? (
                  <div className={styles.assumptionsWarnings}>
                    {planDraft.warnings.map((w) => (
                      <div key={w.code} className={styles.planWarning}>
                        {w.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.toggles}>
          <label className={styles.field}>
            <span>Event type</span>
            <select value={eventType} onChange={(e) => setEventType(e.target.value as BudgetSpellbookEventType)}>
              <option value="corporate">corporate</option>
              <option value="brand activation">brand activation</option>
              <option value="wedding">wedding</option>
              <option value="conference">conference</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Venue city</span>
            <input value={venueCity} onChange={(e) => setVenueCity(e.target.value)} placeholder="Optional" />
          </label>

          <label className={styles.field}>
            <span>Crew model</span>
            <select value={crewModel} onChange={(e) => setCrewModel(e.target.value as BudgetSpellbookCrewModel)}>
              <option value="internal">internal</option>
              <option value="outsourced">outsourced</option>
              <option value="mixed">mixed</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Markup target</span>
            <div className={styles.inlineField}>
              <select
                value={markupTarget}
                onChange={(e) => setMarkupTarget(e.target.value as 0.25 | 0.35 | "custom")}
              >
                <option value={0.25}>25%</option>
                <option value={0.35}>35%</option>
                <option value="custom">custom</option>
              </select>
              {markupTarget === "custom" ? (
                <input
                  value={markupCustom}
                  onChange={(e) => setMarkupCustom(e.target.value)}
                  inputMode="decimal"
                  aria-label="Custom markup percent"
                />
              ) : null}
            </div>
          </label>

          <label className={styles.field}>
            <span>Contingency</span>
            <div className={styles.inlineField}>
              <select
                value={contingency}
                onChange={(e) => setContingency(e.target.value as 0 | 0.05 | 0.1 | 0.15 | "custom")}
              >
                <option value={0}>0%</option>
                <option value={0.05}>5%</option>
                <option value={0.1}>10%</option>
                <option value={0.15}>15%</option>
                <option value="custom">custom</option>
              </select>
              {contingency === "custom" ? (
                <input
                  value={contingencyCustom}
                  onChange={(e) => setContingencyCustom(e.target.value)}
                  inputMode="decimal"
                  aria-label="Custom contingency percent"
                />
              ) : null}
            </div>
          </label>

          <label className={`${styles.field} ${styles.checkboxField}`}>
            <span>Include travel/trucking</span>
            <input
              type="checkbox"
              checked={includeTravelTrucking}
              onChange={(e) => setIncludeTravelTrucking(e.target.checked)}
            />
          </label>

          <label className={styles.field}>
            <span>Apply mode</span>
            <select value={applyMode} onChange={(e) => setApplyMode(e.target.value as BudgetSpellbookApplyMode)}>
              <option value="add">Add</option>
              <option value="merge">Merge (best effort)</option>
              <option value="replace">Replace this revision</option>
            </select>
          </label>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onRequestClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.apply}
            onClick={handleApply}
            disabled={!canSubmit}
            title={applyTooltip}
          >
            {isApplying ? "Applying..." : `Apply to ${revisionLabel}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

