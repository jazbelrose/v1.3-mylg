/**
 * TransactionContextSheet - Mobile bottom sheet for transaction context actions
 * =============================================================================
 * Mobile equivalent of TransactionContextMenu (right-click context menu)
 * 
 * Provides:
 * - Quick category selection with search
 * - Payment type selection
 * - Toggle burn/runway
 * - Find similar
 * - Link to budget
 * - Edit action
 * =============================================================================
 */
import React from "react";
import { BottomSheet } from "@/shared/components/BottomSheet/BottomSheet";
import {
  Edit2,
  Link2,
  Repeat,
  Search,
  X,
  CreditCard,
  Tag,
} from "lucide-react";
import { getHqCategoryIcon, HQ_CATEGORY_LABEL, HQ_CATEGORY_OPTIONS } from "@/hq/lib/hqCategories";
import type { HqCategoryId, HqPaymentType, HqTransaction } from "@/hq/types";
import styles from "./TransactionContextSheet.module.css";

// Payment type options
const PAYMENT_TYPE_OPTIONS: Array<{ value: HqPaymentType; label: string }> = [
  { value: "card_purchase", label: "Card purchase" },
  { value: "transfer", label: "Transfer" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "deposit", label: "Deposit" },
  { value: "fee", label: "Fee" },
];

const RECENT_LIMIT = 12;
const DISPLAY_LIMIT = 10;

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

// Fuzzy matching scoring
function scoreMatch(text: string, query: string): number {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return 1000;
  if (normalizedText === normalizedQuery) return 100;
  if (normalizedText.startsWith(normalizedQuery)) return 80;

  const words = normalizedText.split(/\s+/);
  if (words.some((w) => w.startsWith(normalizedQuery))) return 60;
  if (normalizedText.includes(normalizedQuery)) return 40;

  let queryIdx = 0;
  for (let i = 0; i < normalizedText.length && queryIdx < normalizedQuery.length; i++) {
    if (normalizedText[i] === normalizedQuery[queryIdx]) {
      queryIdx++;
    }
  }
  if (queryIdx === normalizedQuery.length) return 20;

  return 0;
}

interface TransactionContextSheetProps {
  orgId: string;
  isOpen: boolean;
  txn: HqTransaction | null;
  selectedCount: number;
  onClose: () => void;
  onSetCategory: (categoryId: HqCategoryId) => void;
  onSetPaymentType: (paymentType: HqPaymentType) => void;
  onToggleBurnRunway: () => void;
  onFindSimilar: () => void;
  onLinkToBudget: () => void;
  onEdit: () => void;
}

type ViewMode = "main" | "category" | "payment";

export default function TransactionContextSheet({
  orgId,
  isOpen,
  txn,
  selectedCount,
  onClose,
  onSetCategory,
  onSetPaymentType,
  onToggleBurnRunway,
  onFindSimilar,
  onLinkToBudget,
  onEdit,
}: TransactionContextSheetProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("main");
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Reset state on open
  React.useEffect(() => {
    if (isOpen) {
      setViewMode("main");
      setSearchQuery("");
    }
  }, [isOpen]);

  // Auto-focus search when entering category/payment view
  React.useEffect(() => {
    if (viewMode !== "main" && searchInputRef.current) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [viewMode]);

  const recent = React.useMemo(() => readRecent(orgId), [orgId, isOpen]);

  // Filtered categories
  const filteredCategories = React.useMemo(() => {
    const query = normalizeText(searchQuery);

    if (!query) {
      const recentCategories = recent
        .filter((id) => HQ_CATEGORY_LABEL[id as HqCategoryId])
        .slice(0, DISPLAY_LIMIT)
        .map((id) => ({
          value: id as HqCategoryId,
          label: HQ_CATEGORY_LABEL[id as HqCategoryId],
        }));

      if (recentCategories.length < 8) {
        const common = HQ_CATEGORY_OPTIONS.slice(0, 8 - recentCategories.length);
        const seen = new Set(recentCategories.map((c) => c.value));
        for (const cat of common) {
          if (!seen.has(cat.value)) {
            recentCategories.push(cat);
          }
        }
      }

      return recentCategories;
    }

    return HQ_CATEGORY_OPTIONS.map((cat) => ({
      ...cat,
      score: scoreMatch(cat.label, query),
    }))
      .filter((cat) => cat.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, DISPLAY_LIMIT);
  }, [recent, searchQuery]);

  // Filtered payment types
  const filteredPaymentTypes = React.useMemo(() => {
    const query = normalizeText(searchQuery);

    if (!query) {
      return PAYMENT_TYPE_OPTIONS;
    }

    return PAYMENT_TYPE_OPTIONS.filter((pt) => scoreMatch(pt.label, query) > 0);
  }, [searchQuery]);

  const handleCategorySelect = React.useCallback(
    (categoryId: HqCategoryId) => {
      const prev = readRecent(orgId);
      const updated = [categoryId, ...prev.filter((v) => v !== categoryId)].slice(0, RECENT_LIMIT);
      writeRecent(orgId, updated);

      onSetCategory(categoryId);
      onClose();
    },
    [onClose, onSetCategory, orgId]
  );

  const handlePaymentTypeSelect = React.useCallback(
    (paymentType: HqPaymentType) => {
      onSetPaymentType(paymentType);
      onClose();
    },
    [onClose, onSetPaymentType]
  );

  const isSingleSelection = selectedCount === 1;
  const canLinkToBudget = txn && (txn.direction === "out" || txn.amount < 0);

  // Main actions view
  const renderMainView = () => (
    <>
      {/* Header info */}
      <div className={styles.headerInfo}>
        {isSingleSelection && txn ? (
          <span className={styles.txnTitle}>
            {txn.vendor || txn.counterparty || txn.rawDescription}
          </span>
        ) : (
          <span className={styles.selectionLabel}>{selectedCount} selected</span>
        )}
      </div>

      {/* Quick Actions */}
      <div className={styles.actionGroup}>
        <button
          type="button"
          className={styles.actionRow}
          onClick={() => setViewMode("category")}
        >
          <Tag size={18} />
          <span className={styles.actionLabel}>Set Category</span>
          <span className={styles.actionHint}>
            {txn?.categoryId ? HQ_CATEGORY_LABEL[txn.categoryId as HqCategoryId] || "—" : "—"}
          </span>
        </button>

        <button
          type="button"
          className={styles.actionRow}
          onClick={() => setViewMode("payment")}
        >
          <CreditCard size={18} />
          <span className={styles.actionLabel}>Payment Type</span>
          <span className={styles.actionHint}>
            {txn?.paymentType
              ? PAYMENT_TYPE_OPTIONS.find((p) => p.value === txn.paymentType)?.label || "—"
              : "—"}
          </span>
        </button>

        <button
          type="button"
          className={styles.actionRow}
          onClick={() => {
            onToggleBurnRunway();
            onClose();
          }}
        >
          <Repeat size={18} />
          <span className={styles.actionLabel}>Toggle Burn/Runway</span>
          <span className={styles.actionHint}>{txn?.isRecurring ? "On" : "Off"}</span>
        </button>
      </div>

      {/* More Actions */}
      <div className={styles.actionGroup}>
        {isSingleSelection && (
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            <Edit2 size={18} />
            <span className={styles.actionLabel}>Edit Transaction</span>
          </button>
        )}

        {isSingleSelection && (
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => {
              onFindSimilar();
              onClose();
            }}
          >
            <Search size={18} />
            <span className={styles.actionLabel}>Find Similar</span>
          </button>
        )}

        {canLinkToBudget && (
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => {
              onLinkToBudget();
              onClose();
            }}
          >
            <Link2 size={18} />
            <span className={styles.actionLabel}>Link to Budget</span>
          </button>
        )}
      </div>
    </>
  );

  // Category selection view
  const renderCategoryView = () => (
    <>
      <div className={styles.subHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => {
            setViewMode("main");
            setSearchQuery("");
          }}
        >
          ← Back
        </button>
        <span className={styles.subTitle}>Set Category</span>
      </div>

      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
        <input
          ref={searchInputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search categories…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.clearSearch}
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.optionsList}>
        {filteredCategories.length === 0 ? (
          <div className={styles.emptyState}>No matching categories</div>
        ) : (
          filteredCategories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={styles.optionRow}
              onClick={() => handleCategorySelect(cat.value)}
            >
              {(() => {
                const Icon = getHqCategoryIcon(cat.value);
                return <Icon size={16} className={styles.optionIcon} aria-hidden />;
              })()}
              <span className={styles.optionLabel}>{cat.label}</span>
            </button>
          ))
        )}
      </div>
    </>
  );

  // Payment type selection view
  const renderPaymentView = () => (
    <>
      <div className={styles.subHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => {
            setViewMode("main");
            setSearchQuery("");
          }}
        >
          ← Back
        </button>
        <span className={styles.subTitle}>Payment Type</span>
      </div>

      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
        <input
          ref={searchInputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search payment types…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.clearSearch}
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.optionsList}>
        {filteredPaymentTypes.length === 0 ? (
          <div className={styles.emptyState}>No matching types</div>
        ) : (
          filteredPaymentTypes.map((pt) => (
            <button
              key={pt.value}
              type="button"
              className={styles.optionRow}
              onClick={() => handlePaymentTypeSelect(pt.value)}
            >
              {pt.label}
            </button>
          ))
        )}
      </div>
    </>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={viewMode === "main" ? "Actions" : undefined}
      snapPoints={[55, 85]}
      initialSnap={0}
      ariaLabel="Transaction context actions"
    >
      <div className={styles.content}>
        {viewMode === "main" && renderMainView()}
        {viewMode === "category" && renderCategoryView()}
        {viewMode === "payment" && renderPaymentView()}
      </div>
    </BottomSheet>
  );
}
