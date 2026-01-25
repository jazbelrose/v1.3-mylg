import React from "react";
import {
  Edit2,
  Link2,
  Repeat,
  Search,
  X,
} from "lucide-react";
import { HQ_CATEGORY_LABEL, HQ_CATEGORY_OPTIONS } from "@/hq/lib/hqCategories";
import type { HqCategoryId, HqPaymentType, HqTransaction } from "@/hq/types";
import styles from "./TransactionContextMenu.module.css";

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

  if (!normalizedQuery) return 1000; // No query = high score

  // Exact match
  if (normalizedText === normalizedQuery) return 100;

  // Prefix match
  if (normalizedText.startsWith(normalizedQuery)) return 80;

  // Word-start match
  const words = normalizedText.split(/\s+/);
  if (words.some((w) => w.startsWith(normalizedQuery))) return 60;

  // Substring match
  if (normalizedText.includes(normalizedQuery)) return 40;

  // Individual character matching (fuzzy)
  let queryIdx = 0;
  for (let i = 0; i < normalizedText.length && queryIdx < normalizedQuery.length; i++) {
    if (normalizedText[i] === normalizedQuery[queryIdx]) {
      queryIdx++;
    }
  }
  if (queryIdx === normalizedQuery.length) return 20;

  return 0;
}

interface TransactionContextMenuProps {
  orgId: string;
  open: boolean;
  anchorPos: { x: number; y: number };
  txn: HqTransaction | null;
  selectedCount: number;
  onClose: () => void;
  onSetCategory: (categoryId: HqCategoryId) => void;
  onSetPaymentType: (paymentType: HqPaymentType) => void;
  onToggleBurnRunway: () => void;
  onFindSimilar: () => void;
  onLinkToBudget: () => void;
  onEdit: () => void;
  canAdmin: boolean;
}

export default function TransactionContextMenu({
  orgId,
  open,
  anchorPos,
  txn,
  selectedCount,
  onClose,
  onSetCategory,
  onSetPaymentType,
  onToggleBurnRunway,
  onFindSimilar,
  onLinkToBudget,
  onEdit,
  canAdmin,
}: TransactionContextMenuProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Get recent categories - refresh when popover opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recent = React.useMemo(() => readRecent(orgId), [orgId, open]);

  // Build filtered category list
  const filteredCategories = React.useMemo(() => {
    const query = normalizeText(searchQuery);

    if (!query) {
      // Default: show recents
      const recentCategories = recent
        .filter((id) => HQ_CATEGORY_LABEL[id as HqCategoryId])
        .slice(0, DISPLAY_LIMIT)
        .map((id) => ({
          value: id as HqCategoryId,
          label: HQ_CATEGORY_LABEL[id as HqCategoryId],
        }));

      // If recents is short, add common categories
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

    // Search: filter and score all categories
    return HQ_CATEGORY_OPTIONS.map((cat) => ({
      ...cat,
      score: scoreMatch(cat.label, query),
    }))
      .filter((cat) => cat.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, DISPLAY_LIMIT);
  }, [recent, searchQuery]);

  // Build filtered payment types
  const filteredPaymentTypes = React.useMemo(() => {
    const query = normalizeText(searchQuery);

    if (!query) {
      return PAYMENT_TYPE_OPTIONS;
    }

    return PAYMENT_TYPE_OPTIONS.filter((pt) => scoreMatch(pt.label, query) > 0);
  }, [searchQuery]);

  // Combined selectable items for keyboard nav
  const selectableItems = React.useMemo(() => {
    const items: Array<{ type: "category" | "payment"; value: string; label: string }> = [];

    for (const cat of filteredCategories) {
      items.push({ type: "category", value: cat.value, label: cat.label });
    }

    for (const pt of filteredPaymentTypes) {
      items.push({ type: "payment", value: pt.value, label: pt.label });
    }

    return items;
  }, [filteredCategories, filteredPaymentTypes]);

  // Reset state on open
  React.useEffect(() => {
    if (open) {
      setSearchQuery("");
      setHighlightedIndex(0);
      // Autofocus search input
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [open]);

  // Calculate flip position
  const menuStyle = React.useMemo(() => {
    const menuWidth = 280;
    const menuMinHeight = 520;
    const menuMaxHeight = Math.min(640, window.innerHeight * 0.78);
    const padding = 8;

    let x = anchorPos.x;
    let y = anchorPos.y;

    // Flip horizontally if needed
    if (x + menuWidth > window.innerWidth - padding) {
      x = Math.max(padding, window.innerWidth - menuWidth - padding);
    }

    // Flip vertically if needed (prefer growing upward if near bottom)
    const spaceBelow = window.innerHeight - y - padding;
    const spaceAbove = y - padding;

    let maxHeight = menuMaxHeight;
    let flipUp = false;

    if (spaceBelow < menuMinHeight && spaceAbove > spaceBelow) {
      // Flip up
      flipUp = true;
      maxHeight = Math.min(menuMaxHeight, spaceAbove);
      y = Math.max(padding, y - Math.min(maxHeight, menuMinHeight));
    } else {
      maxHeight = Math.min(menuMaxHeight, spaceBelow);
    }

    return {
      left: x,
      top: flipUp ? undefined : y,
      bottom: flipUp ? window.innerHeight - anchorPos.y : undefined,
      minHeight: Math.min(menuMinHeight, maxHeight),
      maxHeight,
    };
  }, [anchorPos]);

  const handleCategorySelect = React.useCallback(
    (categoryId: HqCategoryId) => {
      // Update recent
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

  // Keyboard navigation
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % Math.max(1, selectableItems.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + selectableItems.length) % Math.max(1, selectableItems.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = selectableItems[highlightedIndex];
        if (item) {
          if (item.type === "category") {
            handleCategorySelect(item.value as HqCategoryId);
          } else {
            handlePaymentTypeSelect(item.value as HqPaymentType);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        e.preventDefault();
        // Tab could cycle sections if we wanted, but for now just prevent default
      }
    },
    [handleCategorySelect, handlePaymentTypeSelect, highlightedIndex, onClose, selectableItems]
  );

  if (!open || !canAdmin) return null;

  const isSingleSelection = selectedCount === 1;
  const canLinkToBudget = txn && (txn.direction === "out" || txn.amount < 0);

  return (
    <div
      ref={contentRef}
      className={styles.contextMenuContainer}
      style={menuStyle}
      role="menu"
      aria-label="Transaction actions"
      onKeyDown={handleKeyDown}
    >
      {/* HEADER ZONE - Pinned */}
      <div className={styles.headerZone}>
        {isSingleSelection && (
          <button
            type="button"
            className={styles.editButton}
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            <Edit2 size={14} />
            Edit…
          </button>
        )}

        {!isSingleSelection && (
          <div className={styles.selectionLabel}>{selectedCount} selected</div>
        )}

        {/* Search Input - Always visible */}
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search categories…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
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
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* MIDDLE ZONE - Scrollable if needed */}
      <div className={styles.middleZone}>
        {/* Category Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            Set Category
            {!searchQuery && <span className={styles.sectionHint}>Recents</span>}
          </div>
          <div className={styles.sectionContent}>
            {filteredCategories.length === 0 ? (
              <div className={styles.emptyState}>No matching categories</div>
            ) : (
              filteredCategories.map((cat, index) => {
                const isHighlighted = highlightedIndex === index;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    className={`${styles.menuItem} ${isHighlighted ? styles.menuItemHighlighted : ""}`}
                    onClick={() => handleCategorySelect(cat.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    role="menuitem"
                  >
                    <span className={styles.menuItemLabel}>{cat.label}</span>
                  </button>
                );
              })
            )}
            {!searchQuery && filteredCategories.length > 0 && (
              <div className={styles.hintRow}>
                Type to search all categories…
              </div>
            )}
          </div>
        </div>

        {/* Payment Type Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Set Payment Type</div>
          <div className={styles.sectionContent}>
            {filteredPaymentTypes.length === 0 ? (
              <div className={styles.emptyState}>No matching types</div>
            ) : (
              filteredPaymentTypes.map((pt, index) => {
                const globalIndex = filteredCategories.length + index;
                const isHighlighted = highlightedIndex === globalIndex;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    className={`${styles.menuItem} ${isHighlighted ? styles.menuItemHighlighted : ""}`}
                    onClick={() => handlePaymentTypeSelect(pt.value)}
                    onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    role="menuitem"
                  >
                    <span className={styles.menuItemLabel}>{pt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* FOOTER ZONE - Pinned */}
      <div className={styles.footerZone}>
        <button
          type="button"
          className={styles.footerAction}
          onClick={() => {
            onToggleBurnRunway();
            onClose();
          }}
        >
          <Repeat size={14} />
          Toggle burn/runway
        </button>

        {isSingleSelection && (
          <button
            type="button"
            className={styles.footerAction}
            onClick={() => {
              onFindSimilar();
              onClose();
            }}
          >
            <Search size={14} />
            Find similar…
          </button>
        )}

        {canLinkToBudget && (
          <button
            type="button"
            className={styles.footerAction}
            onClick={() => {
              onLinkToBudget();
              onClose();
            }}
          >
            <Link2 size={14} />
            Link to budget…
          </button>
        )}
      </div>
    </div>
  );
}
