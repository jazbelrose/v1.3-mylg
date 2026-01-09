import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { HQ_CATEGORY_GROUPS, HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { useHqStore } from "@/hq/lib/hqStore";
import type { HqCategoryId } from "@/hq/types";

import styles from "./HqSelect.module.css";

type StaticOption = { value: string; label: string };

type Props = {
  orgId: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  staticOptions?: StaticOption[];
};

const RECENT_LIMIT = 6;
const MOST_USED_LIMIT = 6;

function normalizeText(input: string): string {
  return input.trim().toLowerCase();
}

function recentStorageKey(orgId: string): string {
  return `mylg.hq.recentCategories:${orgId}`;
}

function readRecent(orgId: string): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(recentStorageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeRecent(orgId: string, values: string[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(recentStorageKey(orgId), JSON.stringify(values));
  } catch {
    // ignore
  }
}

function labelForValue(value: string): string {
  if (!value) return "";
  return HQ_CATEGORY_LABEL[value as HqCategoryId] || value;
}

export default function HqCategoryPicker({
  orgId,
  value,
  onValueChange,
  disabled,
  ariaLabel,
  className,
  placeholder,
  staticOptions,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const transactions = useHqStore(orgId, (s) => s.transactions);

  const recent = React.useMemo(() => readRecent(orgId), [orgId, open]);

  const mostUsed = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      const id = String((t.categoryId || "OTHER") as string);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const ranked = Array.from(counts.entries())
      .filter(([id]) => id && id !== "OTHER")
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST_USED_LIMIT)
      .map(([id]) => id);

    return ranked;
  }, [transactions]);

  const groupedItems = React.useMemo(() => {
    const q = normalizeText(query);

    const staticItems: Array<{ type: "static"; value: string; label: string }> = (staticOptions || []).map((o) => ({
      type: "static",
      value: o.value,
      label: o.label,
    }));

    const allCategoryIds = HQ_CATEGORY_GROUPS.flatMap((g) => g.categoryIds.map(String));

    const recentIds = recent.filter((id) => allCategoryIds.includes(id)).slice(0, RECENT_LIMIT);

    const mostUsedIds = mostUsed.filter((id) => allCategoryIds.includes(id)).slice(0, MOST_USED_LIMIT);

    const includeId = (id: string) => {
      const label = labelForValue(id);
      if (!q) return true;
      return normalizeText(label).includes(q);
    };

    const sections: Array<
      | { type: "header"; label: string }
      | { type: "item"; value: string; label: string }
      | { type: "static"; value: string; label: string }
    > = [];

    if (staticItems.length) {
      for (const s of staticItems) sections.push(s);
    }

    const pushSection = (label: string, ids: string[]) => {
      const filtered = ids.filter(includeId);
      if (filtered.length === 0) return;
      sections.push({ type: "header", label });
      for (const id of filtered) sections.push({ type: "item", value: id, label: labelForValue(id) });
    };

    const seen = new Set<string>();
    const unique = (ids: string[]) => ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

    pushSection("Recent", unique(recentIds));
    pushSection("Most used", unique(mostUsedIds));

    for (const group of HQ_CATEGORY_GROUPS) {
      pushSection(group.label, unique(group.categoryIds.map(String)));
    }

    // If user typed something and nothing matched, show no headers.
    const hasAnySelectable = sections.some((s) => s.type === "item") || sections.some((s) => s.type === "static");
    return { sections, hasAnySelectable };
  }, [mostUsed, query, recent, staticOptions]);

  const selectableValues = React.useMemo(() => {
    return groupedItems.sections
      .filter((s) => s.type === "item" || s.type === "static")
      .map((s) => (s.type === "item" || s.type === "static" ? s.value : ""))
      .filter(Boolean);
  }, [groupedItems.sections]);

  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const currentLabel = value ? labelForValue(value) : "";

  const selectValue = React.useCallback(
    (next: string) => {
      onValueChange(next);

      // Track recent only for category IDs (not for special static options like "all").
      if (next && HQ_CATEGORY_LABEL[next as HqCategoryId]) {
        const prev = readRecent(orgId);
        const updated = [next, ...prev.filter((v) => v !== next)].slice(0, RECENT_LIMIT);
        writeRecent(orgId, updated);
      }

      setOpen(false);
    },
    [onValueChange, orgId]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (selectableValues.length ? (i + 1) % selectableValues.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (selectableValues.length ? (i - 1 + selectableValues.length) % selectableValues.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const v = selectableValues[activeIndex];
        if (v) selectValue(v);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [activeIndex, open, selectValue, selectableValues]
  );

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={[styles.trigger, className].filter(Boolean).join(" ")}
          aria-label={ariaLabel}
          disabled={disabled}
        >
          <span>{currentLabel || placeholder || "Select category"}</span>
          <span className={styles.icon} aria-hidden>
            ▾
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={6} align="start">
          <div className={styles.searchRow}>
            <input
              ref={inputRef}
              className={styles.searchInput}
              placeholder="Search categories…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className={styles.viewport} role="listbox" aria-label="Categories">
            {!groupedItems.hasAnySelectable ? (
              <div className={styles.emptyHint}>No matching categories.</div>
            ) : (
              groupedItems.sections.map((entry, idx) => {
                if (entry.type === "header") {
                  return (
                    <div key={`h-${entry.label}-${idx}`} className={styles.sectionHeader} aria-hidden>
                      {entry.label}
                    </div>
                  );
                }

                const valueIndex = selectableValues.indexOf(entry.value);
                const isActive = valueIndex === activeIndex;

                return (
                  <button
                    key={`i-${entry.value}-${idx}`}
                    type="button"
                    className={[styles.itemButton, isActive ? styles.itemButtonActive : ""].filter(Boolean).join(" ")}
                    onMouseEnter={() => setActiveIndex(Math.max(0, valueIndex))}
                    onClick={() => selectValue(entry.value)}
                    role="option"
                    aria-selected={value === entry.value}
                  >
                    {entry.label}
                  </button>
                );
              })
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
