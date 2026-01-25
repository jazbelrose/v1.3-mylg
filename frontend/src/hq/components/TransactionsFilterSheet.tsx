import React, { useCallback, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import { BottomSheet } from "@/shared/components/BottomSheet";
import HqSelect from "@/hq/components/HqSelect";
import HqCategoryPicker from "@/hq/components/HqCategoryPicker";
import ProjectFilter, { type ProjectFilterValue } from "@/hq/components/ProjectFilter";
import DateRangePopover, { type DateRangePreset } from "@/hq/components/DateRangePopover";
import type { HqCategoryId, HqPaymentType } from "@/hq/types";
import type { Project } from "@/shared/utils/api";
import styles from "./TransactionsFilterSheet.module.css";

export type TransactionFilters = {
  accountId: string;
  direction: "all" | "in" | "out";
  paymentType: "all" | HqPaymentType;
  categoryId: "all" | HqCategoryId | "UNCATEGORIZED";
  projectFilter: ProjectFilterValue;
  dateRange: DateRangePreset;
  startDate: string;
  endDate: string;
  amountMinCents: number | null;
  amountMaxCents: number | null;
  recurringOnly: boolean;
};

type TransactionsFilterSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  accounts: { accountId: string; name?: string; accountName?: string }[];
  projects: Project[];
  filters: TransactionFilters;
  onChange: (filters: Partial<TransactionFilters>) => void;
  onClear: () => void;
  onApply: () => void;
};

function parseMoneyToCents(input: string): number | null {
  if (!input.trim()) return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

function formatCents(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

const TransactionsFilterSheet: React.FC<TransactionsFilterSheetProps> = ({
  isOpen,
  onClose,
  orgId,
  accounts,
  projects,
  filters,
  onChange,
  onClear,
  onApply,
}) => {
  const [amountDraftMin, setAmountDraftMin] = useState(() => formatCents(filters.amountMinCents));
  const [amountDraftMax, setAmountDraftMax] = useState(() => formatCents(filters.amountMaxCents));
  const amountMinRef = useRef<HTMLInputElement>(null);
  const amountMaxRef = useRef<HTMLInputElement>(null);

  // Sync drafts when filters change externally
  React.useEffect(() => {
    setAmountDraftMin(formatCents(filters.amountMinCents));
    setAmountDraftMax(formatCents(filters.amountMaxCents));
  }, [filters.amountMinCents, filters.amountMaxCents]);

  const handleApplyAmount = useCallback(() => {
    const minCents = parseMoneyToCents(amountDraftMin);
    const maxCents = parseMoneyToCents(amountDraftMax);
    onChange({ amountMinCents: minCents, amountMaxCents: maxCents });
  }, [amountDraftMin, amountDraftMax, onChange]);

  const handleCustomDateRange = useCallback(
    (from: string, to: string) => {
      onChange({ dateRange: "custom", startDate: from, endDate: to });
    },
    [onChange]
  );

  const handleApply = useCallback(() => {
    handleApplyAmount();
    onApply();
    onClose();
  }, [handleApplyAmount, onApply, onClose]);

  const handleClear = useCallback(() => {
    setAmountDraftMin("");
    setAmountDraftMax("");
    onClear();
  }, [onClear]);

  const activeCount = [
    filters.accountId !== "all",
    filters.direction !== "all",
    filters.paymentType !== "all",
    filters.categoryId !== "all",
    filters.projectFilter.type !== "all",
    filters.dateRange !== "all",
    filters.amountMinCents !== null || filters.amountMaxCents !== null,
    filters.recurringOnly,
  ].filter(Boolean).length;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[85]}
      header={
        <div className={styles.header}>
          <h2 className={styles.title}>Filters</h2>
          {activeCount > 0 && (
            <span className={styles.badge}>{activeCount}</span>
          )}
        </div>
      }
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.clearButton} onClick={handleClear}>
            Clear all
          </button>
          <button type="button" className={styles.applyButton} onClick={handleApply}>
            Apply
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        {/* Account */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Account</label>
          <HqSelect
            className={styles.fieldInput}
            value={filters.accountId}
            onValueChange={(v) => onChange({ accountId: v })}
            ariaLabel="Filter by account"
            options={[
              { value: "all", label: "All accounts" },
              ...accounts.map((a) => ({
                value: a.accountId,
                label: String(a.name ?? a.accountName ?? a.accountId),
              })),
            ]}
          />
        </div>

        {/* Direction */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Flow</label>
          <HqSelect
            className={styles.fieldInput}
            value={filters.direction}
            onValueChange={(v) => onChange({ direction: v as "all" | "in" | "out" })}
            ariaLabel="Filter by direction"
            options={[
              { value: "all", label: "Both" },
              { value: "out", label: "Out" },
              { value: "in", label: "In" },
            ]}
          />
        </div>

        {/* Payment type */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Payment type</label>
          <HqSelect
            className={styles.fieldInput}
            value={filters.paymentType}
            onValueChange={(v) => onChange({ paymentType: v as "all" | HqPaymentType })}
            ariaLabel="Filter by payment type"
            options={[
              { value: "all", label: "All types" },
              { value: "card_purchase", label: "Card purchase" },
              { value: "transfer", label: "Transfer" },
              { value: "zelle", label: "Zelle" },
              { value: "wire", label: "Wire" },
              { value: "deposit", label: "Deposit" },
              { value: "fee", label: "Fee" },
              { value: "unknown", label: "Unknown" },
            ]}
          />
        </div>

        {/* Category */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Category</label>
          <HqCategoryPicker
            orgId={orgId}
            className={styles.fieldInput}
            value={filters.categoryId}
            onValueChange={(v) => onChange({ categoryId: v as "all" | HqCategoryId | "UNCATEGORIZED" })}
            ariaLabel="Filter by category"
            placeholder="All categories"
            staticOptions={[
              { value: "all", label: "All categories" },
              { value: "UNCATEGORIZED", label: "Uncategorized" },
            ]}
          />
        </div>

        {/* Project */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Project</label>
          <ProjectFilter
            value={filters.projectFilter}
            onChange={(v) => onChange({ projectFilter: v })}
            projects={projects}
            className={styles.fieldInput}
          />
        </div>

        {/* Date range */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Date range</label>
          <DateRangePopover
            preset={filters.dateRange}
            customFrom={filters.dateRange === "custom" ? filters.startDate : undefined}
            customTo={filters.dateRange === "custom" ? filters.endDate : undefined}
            onPresetChange={(v) => onChange({ dateRange: v })}
            onCustomRangeChange={handleCustomDateRange}
            className={styles.fieldInput}
          />
        </div>

        {/* Amount */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Amount</label>
          <div className={styles.amountRow}>
            <input
              ref={amountMinRef}
              className={styles.amountInput}
              type="text"
              inputMode="decimal"
              placeholder="Min"
              value={amountDraftMin}
              onChange={(e) => setAmountDraftMin(e.target.value)}
              onBlur={handleApplyAmount}
            />
            <span className={styles.amountSep}>–</span>
            <input
              ref={amountMaxRef}
              className={styles.amountInput}
              type="text"
              inputMode="decimal"
              placeholder="Max"
              value={amountDraftMax}
              onChange={(e) => setAmountDraftMax(e.target.value)}
              onBlur={handleApplyAmount}
            />
          </div>
        </div>

        {/* Recurring toggle */}
        <div className={styles.toggleRow}>
          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={filters.recurringOnly}
            data-active={filters.recurringOnly}
            onClick={() => onChange({ recurringOnly: !filters.recurringOnly })}
          >
            <Repeat size={18} aria-hidden="true" />
            <span>Recurring only</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};

export default TransactionsFilterSheet;
