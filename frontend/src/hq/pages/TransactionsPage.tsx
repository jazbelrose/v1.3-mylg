import React from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Circle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Landmark,
  Minus,
  Repeat,
  Zap,
  X,
  Search,
  Edit2,
  Link2,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import HQLayout from "../components/HQLayout";
import AddAccountModal from "@/hq/components/AddAccountModal";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import { HQ_CATEGORY_LABEL, HQ_CATEGORY_OPTIONS } from "@/hq/lib/hqCategories";
import { applyHqTransactionsBulk, fetchHqSummary, fetchHqTransactions } from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState, useHqStore } from "@/hq/lib/hqStore";
import { sendHqUpdated } from "@/hq/lib/hqWebSocket";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { useSocket } from "@/app/contexts/useSocket";
import { useHqBootstrap } from "@/hq/lib/useHqBootstrap";
import { todayPacificIsoDate } from "@/hq/lib/hqDate";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { HqCategoryId, HqPaymentType, HqTransaction } from "@/hq/types";
import type { HqUpdateType } from "@/hq/lib/hqWebSocket";
import styles from "./TransactionsPage.module.css";
import HqSelect from "@/hq/components/HqSelect";
import TxnModalApply from "@/hq/components/TxnModalApply";
import HqCategoryPicker from "@/hq/components/HqCategoryPicker";
import AllocationModal from "@/hq/components/AllocationModal";
import { getTransactionAllocatedTotal } from "@/hq/lib/hqStore";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function parseMoneyToCents(input: string): number | null {
  const cleaned = String(input || "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * 100);
}

function centsToMoneyInput(cents: number | null): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return String(Math.round(cents) / 100);
}

function typeIcon(type: HqPaymentType): React.ReactNode {
  switch (type) {
    case "card_purchase":
      return <CreditCard size={16} />;
    case "transfer":
      return <ArrowLeftRight size={16} />;
    case "zelle":
      return <Zap size={16} />;
    case "wire":
      return <Landmark size={16} />;
    case "deposit":
      return <ArrowDownToLine size={16} />;
    case "fee":
      return <Minus size={16} />;
    default:
      return <Circle size={12} />;
  }
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [yyyy, mm, dd] = String(isoDate || "").split("-");
  const year = Number(yyyy);
  const monthIndex = Number(mm) - 1;
  const day = Number(dd);
  const base = new Date(Date.UTC(year, monthIndex, day));
  if (!Number.isFinite(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function effectivePaymentType(txn: HqTransaction): HqPaymentType {
  const paymentType = txn.paymentType;
  if (paymentType) return paymentType;
  const legacy = String(txn.type || "unknown").trim();
  // Legacy stored `type: "recurring"` should not be treated as a payment type.
  if (legacy === "recurring") return "unknown";
  return legacy as HqPaymentType;
}
type DateRangePreset = "all" | "7d" | "30d" | "90d" | "month" | "ytd";

function txnTitle(txn: HqTransaction) {
  return txn.vendor || txn.counterparty || txn.rawDescription;
}

type SortKey = "date" | "category" | "amount";
type SortDir = "asc" | "desc";

const TransactionsPage: React.FC = () => {
  useUser();
  const { activeOrgId, activeOrgRole } = useOrg();
  const hasOrg = Boolean(activeOrgId);
  const orgId = activeOrgId ?? "__no_org__";
  const canAdmin = hasOrg && isOrgAdmin(activeOrgRole);
  useHqBootstrap(activeOrgId);
  const location = useLocation();

  const accounts = useHqStore(orgId, (s) => s.accounts);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [accountId, setAccountId] = React.useState<string>("all");
  const [direction, setDirection] = React.useState<"all" | "in" | "out">("all");
  const [paymentType, setPaymentType] = React.useState<"all" | HqPaymentType>("all");
  const [recurringOnly, setRecurringOnly] = React.useState(false);
  const [seriesKey, setSeriesKey] = React.useState<string>("");
  const [categoryId, setCategoryId] = React.useState<"all" | HqCategoryId | "UNCATEGORIZED">("all");
  const [dateRange, setDateRange] = React.useState<DateRangePreset>("all");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [amountMinCents, setAmountMinCents] = React.useState<number | null>(null);
  const [amountMaxCents, setAmountMaxCents] = React.useState<number | null>(null);
  const [amountPopoverOpen, setAmountPopoverOpen] = React.useState(false);
  const [amountDraftMin, setAmountDraftMin] = React.useState("");
  const [amountDraftMax, setAmountDraftMax] = React.useState("");
  const amountMinRef = React.useRef<HTMLInputElement | null>(null);
  const amountMaxRef = React.useRef<HTMLInputElement | null>(null);
  const amountTriggerRef = React.useRef<HTMLElement | null>(null);
  const [amountPopoverWidth, setAmountPopoverWidth] = React.useState<number | null>(null);

  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });

  const [items, setItems] = React.useState<HqTransaction[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [totals, setTotals] = React.useState<{ count: number; inCents: number; outCents: number; netCents: number } | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);
  const [selectedTxn, setSelectedTxn] = React.useState<HqTransaction | null>(null);
  const [isApplyOpen, setIsApplyOpen] = React.useState(false);
  const [isAllocationOpen, setIsAllocationOpen] = React.useState(false);
  const [allocationTxn, setAllocationTxn] = React.useState<HqTransaction | null>(null);

  // Row selection state for bulk operations
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = React.useState<number | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = React.useState<number | null>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenuPos, setContextMenuPos] = React.useState<{ x: number; y: number } | null>(null);
  const [contextMenuTxn, setContextMenuTxn] = React.useState<HqTransaction | null>(null);

  // Undo state for bulk actions
  const [undoStack, setUndoStack] = React.useState<Array<{
    hashes: string[];
    prevStates: Array<{ hash: string; categoryId?: string; paymentType?: string; isRecurring?: boolean }>;
    description: string;
  }>>([]);

  const openImport = React.useCallback(() => {
    if (!canAdmin) return;
    setIsImportOpen(true);
  }, [canAdmin]);

  const openAddAccount = React.useCallback(() => {
    if (!canAdmin) return;
    setIsAddAccountOpen(true);
  }, [canAdmin]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filter = params.get("filter");
    const q = params.get("q");
    const type = params.get("type");
    const category = params.get("category");
    const dir = params.get("dir");
    const date = params.get("dateRange");
    const nextSeriesKey = params.get("seriesKey");
    if (typeof q === "string" && q.length) setSearchTerm(q);

    const allowedPaymentTypes: Array<HqPaymentType> = [
      "card_purchase",
      "transfer",
      "zelle",
      "wire",
      "deposit",
      "fee",
      "unknown",
    ];
    if (type && type !== "all" && allowedPaymentTypes.includes(type as HqPaymentType)) {
      setPaymentType(type as HqPaymentType);
    }

    // Backward-compat for old links.
    setRecurringOnly(filter === "recurring");

    if (typeof nextSeriesKey === "string" && nextSeriesKey.trim()) {
      setSeriesKey(nextSeriesKey.trim());
      setRecurringOnly(true);
    } else {
      setSeriesKey("");
    }

    if (filter === "uncategorized") {
      setCategoryId("UNCATEGORIZED");
    }

    if (category) {
      setCategoryId(category as "all" | HqCategoryId | "UNCATEGORIZED");
    }

    if (dir === "in" || dir === "out" || dir === "all") {
      setDirection(dir);
    }

    if (date === "all" || date === "7d" || date === "30d" || date === "90d" || date === "month" || date === "ytd") {
      setDateRange(date);
    }

  }, [location.search]);

  React.useEffect(() => {
    if (!amountPopoverOpen) return;
    setAmountDraftMin(centsToMoneyInput(amountMinCents));
    setAmountDraftMax(centsToMoneyInput(amountMaxCents));
  }, [amountMaxCents, amountMinCents, amountPopoverOpen]);

  React.useLayoutEffect(() => {
    const el = amountTriggerRef.current;
    if (!el) return;
    const update = () => setAmountPopoverWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const today = todayPacificIsoDate();
    if (dateRange === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }

    if (dateRange === "7d") {
      setStartDate(addDaysIso(today, -6));
      setEndDate(today);
      return;
    }

    if (dateRange === "30d") {
      setStartDate(addDaysIso(today, -29));
      setEndDate(today);
      return;
    }

    if (dateRange === "90d") {
      setStartDate(addDaysIso(today, -89));
      setEndDate(today);
      return;
    }

    if (dateRange === "month") {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
      return;
    }

    // YTD
    setStartDate(`${today.slice(0, 4)}-01-01`);
    setEndDate(today);
  }, [dateRange]);

  const accountsById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.accountId, a.name ?? a.accountName ?? "Account");
    return map;
  }, [accounts]);

  const listQueryKey = React.useMemo(
    () =>
      JSON.stringify({
        orgId: activeOrgId || null,
        accountId,
        startDate,
        endDate,
        q: searchTerm.trim(),
        direction,
        paymentType,
        recurringOnly,
        seriesKey,
        categoryId,
        amountMinCents,
        amountMaxCents,
        sortKey: sort.key,
        sortDir: sort.dir,
      }),
    [
      accountId,
      activeOrgId,
      amountMaxCents,
      amountMinCents,
      categoryId,
      direction,
      endDate,
      paymentType,
      recurringOnly,
      searchTerm,
      seriesKey,
      sort.dir,
      sort.key,
      startDate,
    ]
  );

  const listQueryKeyRef = React.useRef(listQueryKey);
  React.useEffect(() => {
    listQueryKeyRef.current = listQueryKey;
  }, [listQueryKey]);

  const loadPage = React.useCallback(
    async (opts: { cursor?: string | null; append?: boolean; includeTotals?: boolean }) => {
      if (!activeOrgId) return;
      const requestKey = listQueryKeyRef.current;
      const append = Boolean(opts.append);
      setLoadError(null);
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      try {
        const res = await fetchHqTransactions({
          orgId: activeOrgId,
          accountId: accountId !== "all" ? accountId : undefined,
          from: startDate || undefined,
          to: endDate || undefined,
          q: searchTerm.trim() || undefined,
          dir: direction,
          paymentType: paymentType !== "all" ? paymentType : undefined,
          recurringOnly,
          seriesKey: seriesKey || undefined,
          categoryId: categoryId !== "all" ? categoryId : undefined,
          amountMinCents,
          amountMaxCents,
          amountMode: "ABS",
          sortKey: sort.key,
          sortDir: sort.dir,
          includeTotals: opts.includeTotals !== false,
          cursor: opts.cursor || null,
          limit: 200,
        });

        const pageItems = res.items ?? res.transactions ?? [];
        const cursor = res.nextCursor ?? res.cursor ?? null;

        if (listQueryKeyRef.current !== requestKey) return;
        setItems((prev) => (append ? [...prev, ...pageItems] : pageItems));
        setNextCursor(cursor);
        if (opts.includeTotals !== false) setTotals(res.totals ?? null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (listQueryKeyRef.current !== requestKey) return;
        setLoadError(msg);
        if (!append) {
          setItems([]);
          setNextCursor(null);
          setTotals(null);
        }
      } finally {
        if (append) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    },
    [
      accountId,
      activeOrgId,
      amountMaxCents,
      amountMinCents,
      categoryId,
      direction,
      endDate,
      paymentType,
      recurringOnly,
      searchTerm,
      seriesKey,
      sort.dir,
      sort.key,
      startDate,
    ]
  );

  React.useEffect(() => {
    if (!activeOrgId) {
      setItems([]);
      setNextCursor(null);
      setTotals(null);
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    fetchHqTransactions({
      orgId: activeOrgId,
      accountId: accountId !== "all" ? accountId : undefined,
      from: startDate || undefined,
      to: endDate || undefined,
      q: searchTerm.trim() || undefined,
      dir: direction,
      paymentType: paymentType !== "all" ? paymentType : undefined,
      recurringOnly,
      seriesKey: seriesKey || undefined,
      categoryId: categoryId !== "all" ? categoryId : undefined,
      amountMinCents,
      amountMaxCents,
      amountMode: "ABS",
      sortKey: sort.key,
      sortDir: sort.dir,
      includeTotals: true,
      cursor: null,
      limit: 200,
      signal: controller.signal,
    })
      .then((res) => {
        const pageItems = res.items ?? res.transactions ?? [];
        const cursor = res.nextCursor ?? res.cursor ?? null;
        setItems(pageItems);
        setNextCursor(cursor);
        setTotals(res.totals ?? null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
        setItems([]);
        setNextCursor(null);
        setTotals(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [
    accountId,
    activeOrgId,
    amountMaxCents,
    amountMinCents,
    categoryId,
    direction,
    endDate,
    paymentType,
    recurringOnly,
    searchTerm,
    seriesKey,
    sort.dir,
    sort.key,
    startDate,
  ]);

  // Listen for WebSocket hqUpdated events (transaction updates from other org members)
  React.useEffect(() => {
    if (!activeOrgId) return;

    const handleWsMessage = (event: CustomEvent<{ action?: string; orgId?: string; updateType?: HqUpdateType }>) => {
      const data = event.detail;
      if (data?.action === "hqUpdated" && data?.orgId === activeOrgId && data?.updateType === "transaction") {
        console.log("📊 [TransactionsPage] Received hqUpdated for transactions, refreshing list...");
        loadPage({ cursor: null, append: false, includeTotals: true });
      }
    };

    window.addEventListener("ws-message", handleWsMessage as EventListener);
    return () => {
      window.removeEventListener("ws-message", handleWsMessage as EventListener);
    };
  }, [activeOrgId, loadPage]);

  const amountValue = React.useMemo(() => {
    if (typeof amountMinCents !== "number" && typeof amountMaxCents !== "number") return "Any";
    if (typeof amountMinCents === "number" && typeof amountMaxCents === "number") {
      return `${currency.format(amountMinCents / 100)}–${currency.format(amountMaxCents / 100)}`;
    }
    if (typeof amountMinCents === "number") return `≥${currency.format(amountMinCents / 100)}`;
    return `≤${currency.format((amountMaxCents as number) / 100)}`;
  }, [amountMaxCents, amountMinCents]);

  const applyAmountDraft = React.useCallback(() => {
    const nextMin = parseMoneyToCents(amountDraftMin);
    const nextMax = parseMoneyToCents(amountDraftMax);
    if (typeof nextMin === "number" && typeof nextMax === "number" && nextMin > nextMax) {
      setAmountMinCents(nextMax);
      setAmountMaxCents(nextMin);
    } else {
      setAmountMinCents(nextMin);
      setAmountMaxCents(nextMax);
    }
    setAmountPopoverOpen(false);
  }, [amountDraftMax, amountDraftMin]);

  const clearAmount = React.useCallback(() => {
    setAmountMinCents(null);
    setAmountMaxCents(null);
    setAmountDraftMin("");
    setAmountDraftMax("");
    setAmountPopoverOpen(false);
  }, []);

  const setSortByKey = React.useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return { key: "date", dir: "desc" };
    });
  }, []);

  // Clear selection when list changes
  React.useEffect(() => {
    setSelectedRows(new Set());
    setLastClickedIndex(null);
    setFocusedRowIndex(null);
  }, [listQueryKey]);

  // Selection handlers
  const handleRowClick = React.useCallback(
    (txn: HqTransaction, index: number, e: React.MouseEvent) => {
      if (!canAdmin) return;
      e.preventDefault();

      const hash = txn.dedupeHash;
      if (!hash) return;

      if (e.shiftKey && lastClickedIndex !== null) {
        // Range select
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        setSelectedRows((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            const h = items[i]?.dedupeHash;
            if (h) next.add(h);
          }
          return next;
        });
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle select
        setSelectedRows((prev) => {
          const next = new Set(prev);
          if (next.has(hash)) {
            next.delete(hash);
          } else {
            next.add(hash);
          }
          return next;
        });
      } else {
        // Single select (replace selection)
        setSelectedRows(new Set([hash]));
      }
      setLastClickedIndex(index);
      setFocusedRowIndex(index);
    },
    [canAdmin, items, lastClickedIndex]
  );

  const handleRowDoubleClick = React.useCallback(
    (txn: HqTransaction) => {
      if (!canAdmin) return;
      setSelectedTxn(txn);
      setIsApplyOpen(true);
    },
    [canAdmin]
  );

  const handleRowKeyDown = React.useCallback(
    (txn: HqTransaction, index: number, e: React.KeyboardEvent) => {
      if (!canAdmin) return;

      if (e.key === "Enter") {
        e.preventDefault();
        // Open edit modal for focused row
        setSelectedTxn(txn);
        setIsApplyOpen(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedRows(new Set());
        setFocusedRowIndex(null);
      } else if (e.key === "ArrowDown" && index < items.length - 1) {
        e.preventDefault();
        setFocusedRowIndex(index + 1);
        // Auto-scroll to focused row
        const nextRow = tableRef.current?.querySelector(`[data-row-index="${index + 1}"]`);
        nextRow?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp" && index > 0) {
        e.preventDefault();
        setFocusedRowIndex(index - 1);
        const prevRow = tableRef.current?.querySelector(`[data-row-index="${index - 1}"]`);
        prevRow?.scrollIntoView({ block: "nearest" });
      } else if (e.key === " ") {
        e.preventDefault();
        // Toggle selection on focused row
        const hash = txn.dedupeHash;
        if (hash) {
          setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(hash)) {
              next.delete(hash);
            } else {
              next.add(hash);
            }
            return next;
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        // Select all
        setSelectedRows(new Set(items.map((t) => t.dedupeHash).filter(Boolean)));
      }
    },
    [canAdmin, items]
  );

  // Context menu handlers
  const handleContextMenu = React.useCallback(
    (txn: HqTransaction, index: number, e: React.MouseEvent) => {
      if (!canAdmin) return;
      e.preventDefault();

      const hash = txn.dedupeHash;
      if (!hash) return;

      // If right-clicking a non-selected row, select only that row
      if (!selectedRows.has(hash)) {
        setSelectedRows(new Set([hash]));
        setLastClickedIndex(index);
      }

      setContextMenuTxn(txn);
      
      // Calculate position, adjusting to stay on screen
      const menuWidth = 240;
      const menuHeight = 400;
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        y = Math.max(8, window.innerHeight - menuHeight - 8);
      }
      
      setContextMenuPos({ x, y });
    },
    [canAdmin, selectedRows]
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenuPos(null);
    setContextMenuTxn(null);
  }, []);

  // Close context menu on outside click or escape
  React.useEffect(() => {
    if (!contextMenuPos) return;

    const handleClick = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };

    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenu, contextMenuPos]);

  // Bulk action handlers
  const { ws } = useSocket();

  const applyBulkAction = React.useCallback(
    async (opts: {
      categoryId?: HqCategoryId;
      paymentType?: HqPaymentType;
      isRecurring?: boolean;
    }) => {
      if (!activeOrgId || selectedRows.size === 0) return;

      const hashes = Array.from(selectedRows);
      const affectedTxns = items.filter((t) => hashes.includes(t.dedupeHash));

      // Save previous states for undo
      const prevStates = affectedTxns.map((t) => ({
        hash: t.dedupeHash,
        categoryId: t.categoryId,
        paymentType: t.paymentType,
        isRecurring: t.isRecurring,
      }));

      try {
        const payload: {
          dedupeHashes: string[];
          categoryId?: string;
          paymentType?: string;
          isRecurring?: boolean;
        } = { dedupeHashes: hashes };

        if (opts.categoryId !== undefined) payload.categoryId = opts.categoryId;
        if (opts.paymentType !== undefined) payload.paymentType = opts.paymentType;
        if (opts.isRecurring !== undefined) payload.isRecurring = opts.isRecurring;

        await applyHqTransactionsBulk(activeOrgId, payload);

        // Build description for toast
        let desc = "";
        if (opts.categoryId !== undefined) {
          desc = `Category set to ${HQ_CATEGORY_LABEL[opts.categoryId] || opts.categoryId}`;
        } else if (opts.paymentType !== undefined) {
          desc = `Payment type set to ${opts.paymentType}`;
        } else if (opts.isRecurring !== undefined) {
          desc = opts.isRecurring ? "Marked as recurring" : "Unmarked recurring";
        }

        // Push to undo stack
        setUndoStack((prev) => [...prev.slice(-9), { hashes, prevStates, description: desc }]);

        // Show toast with undo
        toast.success(
          <span>
            {desc} for {hashes.length} transaction{hashes.length === 1 ? "" : "s"}.{" "}
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "#fa3356",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
                font: "inherit",
              }}
              onClick={() => handleUndo()}
            >
              Undo
            </button>
          </span>,
          { autoClose: 5000 }
        );

        sendHqUpdated(ws, activeOrgId, "transaction");
        loadPage({ cursor: null, append: false, includeTotals: true });
        setSelectedRows(new Set());
      } catch (err) {
        console.error(err);
        toast.error("Could not apply bulk action.");
      }
      closeContextMenu();
    },
    [activeOrgId, closeContextMenu, items, loadPage, selectedRows, ws]
  );

  const handleUndo = React.useCallback(async () => {
    if (!activeOrgId || undoStack.length === 0) return;

    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    try {
      // Restore each transaction to its previous state
      for (const prev of last.prevStates) {
        await applyHqTransactionsBulk(activeOrgId, {
          dedupeHashes: [prev.hash],
          categoryId: prev.categoryId || undefined,
          paymentType: prev.paymentType || undefined,
          isRecurring: prev.isRecurring,
        });
      }
      toast.success("Undo successful.");
      sendHqUpdated(ws, activeOrgId, "transaction");
      loadPage({ cursor: null, append: false, includeTotals: true });
    } catch (err) {
      console.error(err);
      toast.error("Could not undo changes.");
    }
  }, [activeOrgId, loadPage, undoStack, ws]);

  // Open edit modal in bulk mode
  const openBulkEdit = React.useCallback(() => {
    if (selectedRows.size === 0) return;
    const firstHash = Array.from(selectedRows)[0];
    const firstTxn = items.find((t) => t.dedupeHash === firstHash);
    if (firstTxn) {
      setSelectedTxn(firstTxn);
      setIsApplyOpen(true);
    }
    closeContextMenu();
  }, [closeContextMenu, items, selectedRows]);

  // Open edit for single transaction
  const openSingleEdit = React.useCallback(() => {
    if (contextMenuTxn) {
      setSelectedTxn(contextMenuTxn);
      setIsApplyOpen(true);
    }
    closeContextMenu();
  }, [closeContextMenu, contextMenuTxn]);

  // Clear selection
  const clearSelection = React.useCallback(() => {
    setSelectedRows(new Set());
    setFocusedRowIndex(null);
    setLastClickedIndex(null);
  }, []);

  const selectedCount = selectedRows.size;

  const actions = (
    <div className={styles.actions}>
      {canAdmin ? (
        <>
          <button type="button" className={styles.secondaryButton} onClick={openImport}>
            Import CSV
          </button>
          <button type="button" className={styles.primaryButton} onClick={openAddAccount}>
            Add account
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <HQLayout
      title="Transactions"
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.transactionsShell}>
          <div className={styles.stickyStack}>
            <div className={styles.filters}>
            <input
              className={styles.filterField}
              type="search"
              placeholder="Search vendor / memo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search transactions"
            />
            <HqSelect
              className={styles.filterField}
              value={accountId}
              onValueChange={setAccountId}
              ariaLabel="Filter by account"
              options={[
                { value: "all", label: "All accounts", shortLabel: "All", tooltip: "All accounts" },
                ...accounts.map((a) => ({
                  value: a.accountId,
                  label: String(a.name ?? a.accountName ?? a.accountId),
                })),
              ]}
            />

            <HqSelect
              className={styles.filterField}
              value={direction}
              onValueChange={(v) => setDirection(v as "all" | "in" | "out")}
              ariaLabel="Filter by direction"
              options={[
                { value: "all", label: "Flow: In + Out" },
                { value: "out", label: "Flow: Out" },
                { value: "in", label: "Flow: In" },
              ]}
            />

            <HqSelect
              className={styles.filterField}
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as "all" | HqPaymentType)}
              ariaLabel="Filter by payment type"
              options={[
                { value: "all", label: "All payment types", shortLabel: "All", tooltip: "All payment types" },
                { value: "card_purchase", label: "Card purchase" },
                { value: "transfer", label: "Transfer" },
                { value: "zelle", label: "Zelle" },
                { value: "wire", label: "Wire" },
                { value: "deposit", label: "Deposit" },
                { value: "fee", label: "Fee" },
                { value: "unknown", label: "Unknown" },
              ]}
            />

            <HqCategoryPicker
              orgId={orgId}
              className={styles.filterField}
              value={categoryId}
              onValueChange={(v) => setCategoryId(v as "all" | HqCategoryId | "UNCATEGORIZED")}
              ariaLabel="Filter by category"
              placeholder="All categories"
              staticOptions={[
                { value: "all", label: "All categories" },
                { value: "UNCATEGORIZED", label: "Uncategorized" },
              ]}
            />

            <div className={styles.amountSlot}>
              <Popover open={amountPopoverOpen} onOpenChange={setAmountPopoverOpen}>
                <PopoverTrigger asChild ref={amountTriggerRef}>
                  <button
                    type="button"
                    className={[styles.filterField, styles.amountChip].join(" ")}
                    data-active={typeof amountMinCents === "number" || typeof amountMaxCents === "number" ? "true" : "false"}
                    aria-label="Filter by amount"
                  >
                    <span className={styles.chipLabel}>Amount</span>
                    <span className={styles.chipValue}>{amountValue}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className={styles.amountPopover}
                  align="end"
                  role="dialog"
                  aria-label="Amount filter"
                  style={{ width: Math.max(amountPopoverWidth ?? 320, 360) }}
                >
                  <div className={styles.amountPopoverTitle}>Amount</div>
                  <div className={styles.amountInputs}>
                    <label className={styles.amountField}>
                      <span className={styles.amountFieldLabel}>Min</span>
                      <input
                        ref={amountMinRef}
                        className={styles.amountInput}
                        inputMode="decimal"
                        placeholder="Any"
                        value={amountDraftMin}
                        onChange={(e) => setAmountDraftMin(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyAmountDraft();
                          }
                        }}
                      />
                    </label>
                    <label className={styles.amountField}>
                      <span className={styles.amountFieldLabel}>Max</span>
                      <input
                        ref={amountMaxRef}
                        className={styles.amountInput}
                        inputMode="decimal"
                        placeholder="Any"
                        value={amountDraftMax}
                        onChange={(e) => setAmountDraftMax(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyAmountDraft();
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className={styles.amountToggles} aria-label="Quick amount modes">
                    <button
                      type="button"
                      className={styles.amountToggle}
                      onClick={() => {
                        setAmountDraftMax("");
                        requestAnimationFrame(() => amountMinRef.current?.focus());
                      }}
                    >
                      ≥
                    </button>
                    <button
                      type="button"
                      className={styles.amountToggle}
                      onClick={() => {
                        setAmountDraftMin("");
                        requestAnimationFrame(() => amountMaxRef.current?.focus());
                      }}
                    >
                      ≤
                    </button>
                    <button
                      type="button"
                      className={styles.amountToggle}
                      onClick={() => {
                        requestAnimationFrame(() => amountMinRef.current?.focus());
                      }}
                    >
                      Between
                    </button>
                  </div>

                  <div className={styles.amountActions}>
                    <button type="button" className={styles.amountClear} onClick={clearAmount}>
                      Clear
                    </button>
                    <button type="button" className={styles.amountApply} onClick={applyAmountDraft}>
                      Apply
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <HqSelect
              className={styles.filterField}
              value={dateRange}
              onValueChange={(v) => setDateRange(v as DateRangePreset)}
              ariaLabel="Filter by date range"
              options={[
                { value: "all", label: "Date: All time" },
                { value: "7d", label: "Date: Last 7d" },
                { value: "30d", label: "Date: Last 30d" },
                { value: "90d", label: "Date: Last 90d" },
                { value: "month", label: "Date: This month" },
                { value: "ytd", label: "Date: YTD" },
              ]}
            />

            <button
              type="button"
              className={styles.recurringToggle}
              aria-label="Show only recurring commitments (you marked)."
              title="Show only recurring commitments (you marked)."
              aria-pressed={recurringOnly}
              data-active={recurringOnly ? "true" : "false"}
              onClick={() => setRecurringOnly((prev) => !prev)}
            >
              <Repeat size={18} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.totalsBar}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={styles.totalsLine}
                  disabled={!totals}
                  aria-label={totals ? "View totals (filtered)" : "Totals unavailable"}
                >
                  {totals ? (
                    <>
                      <span className={styles.totalsValue}>{totals.count}</span>&nbsp;
                      <span className={styles.totalsLabel}>txns</span>
                      <span className={styles.totalsSep}>·</span>
                      <span className={styles.totalsLabel}>In</span>&nbsp;
                      <span className={[styles.totalsValue, styles.totalsIn].join(" ")}>
                        {currency.format(totals.inCents / 100)}
                      </span>
                      <span className={styles.totalsSep}>·</span>
                      <span className={styles.totalsLabel}>Out</span>&nbsp;
                      <span className={[styles.totalsValue, styles.totalsOut].join(" ")}>
                        {currency.format(totals.outCents / 100)}
                      </span>
                      <span className={styles.totalsSep}>·</span>
                      <span className={styles.totalsLabel}>Net</span>&nbsp;
                      <span
                        className={[
                          styles.totalsValue,
                          totals.netCents < 0 ? styles.totalsOut : styles.totalsIn,
                        ].join(" ")}
                      >
                        {currency.format(totals.netCents / 100)}
                      </span>
                    </>
                  ) : (
                    <span className={styles.totalsLabel}>—</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className={styles.totalsPopover} align="end" role="dialog" aria-label="Totals (filtered)">
                <div className={styles.totalsPopoverTitle}>Totals (filtered)</div>
                {totals ? (
                  <>
                    <div className={styles.totalsGrid}>
                      <div>Count</div>
                      <div className={styles.totalsValue}>{totals.count}</div>
                      <div>In</div>
                      <div className={styles.totalsValue}>{currency.format(totals.inCents / 100)}</div>
                      <div>Out</div>
                      <div className={styles.totalsValue}>{currency.format(totals.outCents / 100)}</div>
                      <div>Net</div>
                      <div className={styles.totalsValue}>{currency.format(totals.netCents / 100)}</div>
                    </div>
                    <button
                      type="button"
                      className={styles.totalsCopy}
                      onClick={async () => {
                        const text = `${totals.count} txns\nIn ${currency.format(totals.inCents / 100)}\nOut ${currency.format(
                          totals.outCents / 100
                        )}\nNet ${currency.format(totals.netCents / 100)}`;
                        await copyTextToClipboard(text);
                      }}
                    >
                      Copy
                    </button>
                  </>
                ) : (
                  <div className={styles.totalsEmpty}>No totals for this filter.</div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {items.length ? (
            <div className={styles.tableHeader} role="row">
              {canAdmin ? (
                <button
                  type="button"
                  className={styles.selectAllButton}
                  onClick={() => {
                    if (selectedRows.size === items.length) {
                      setSelectedRows(new Set());
                    } else {
                      setSelectedRows(new Set(items.map((t) => t.dedupeHash).filter(Boolean)));
                    }
                  }}
                  aria-label={selectedRows.size === items.length ? "Deselect all" : "Select all"}
                  title={selectedRows.size === items.length ? "Deselect all" : "Select all"}
                >
                  <span className={[
                    styles.selectAllIndicator,
                    selectedRows.size > 0 ? styles.selectAllActive : ""
                  ].filter(Boolean).join(" ")} />
                </button>
              ) : null}
              <button
                type="button"
                className={styles.headerButton}
                onClick={() => setSortByKey("date")}
                role="columnheader"
                aria-sort={sort.key === "date" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                <span>TXN</span>
                <span className={styles.sortIconSlot}>
                  {sort.key === "date" ? (sort.dir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null}
                </span>
              </button>
              <button
                type="button"
                className={styles.headerButton}
                onClick={() => setSortByKey("category")}
                role="columnheader"
                aria-sort={sort.key === "category" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                <span>Category</span>
                <span className={styles.sortIconSlot}>
                  {sort.key === "category" ? (sort.dir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null}
                </span>
              </button>
              <button
                type="button"
                className={[styles.headerButton, styles.headerAmount].join(" ")}
                onClick={() => setSortByKey("amount")}
                role="columnheader"
                aria-sort={sort.key === "amount" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                <span>Amount</span>
                <span className={styles.sortIconSlot}>
                  {sort.key === "amount" ? (sort.dir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null}
                </span>
              </button>
            </div>
          ) : null}
          </div>

          {/* Bulk action bar */}
          {selectedCount > 0 && canAdmin ? (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedCount} selected</span>
              <div className={styles.bulkActions}>
                <HqCategoryPicker
                  orgId={orgId}
                  className={styles.bulkSelect}
                  value=""
                  onValueChange={(v) => {
                    if (v) applyBulkAction({ categoryId: v as HqCategoryId });
                  }}
                  ariaLabel="Set category for selected"
                  placeholder="Category"
                />
                <HqSelect
                  className={styles.bulkSelect}
                  value=""
                  onValueChange={(v) => {
                    if (v) applyBulkAction({ paymentType: v as HqPaymentType });
                  }}
                  ariaLabel="Set payment type for selected"
                  placeholder="Payment type"
                  options={[
                    { value: "card_purchase", label: "Card purchase" },
                    { value: "transfer", label: "Transfer" },
                    { value: "zelle", label: "Zelle" },
                    { value: "wire", label: "Wire" },
                    { value: "deposit", label: "Deposit" },
                    { value: "fee", label: "Fee" },
                    { value: "unknown", label: "Unknown" },
                  ]}
                />
                <Tooltip.Provider delayDuration={200}>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        type="button"
                        className={styles.bulkToggle}
                        onClick={() => applyBulkAction({ isRecurring: true })}
                        aria-label="Mark as recurring"
                      >
                        <Repeat size={16} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content className={styles.bulkTooltip} sideOffset={6}>
                        Mark as recurring
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
                <button
                  type="button"
                  className={styles.bulkEditBtn}
                  onClick={openBulkEdit}
                >
                  <Edit2 size={14} />
                  Bulk edit…
                </button>
              </div>
              <button
                type="button"
                className={styles.bulkClear}
                onClick={clearSelection}
                aria-label="Clear selection"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          <div className={styles.tableClip}>
            <div className={styles.tableScroll} ref={tableRef}>
              {loadError ? (
                <div className={styles.emptyState} role="status">
                  Failed to load transactions. {loadError}
                </div>
              ) : isLoading && items.length === 0 ? (
                <div className={styles.emptyState} role="status">
                  Loading transactions…
                </div>
              ) : items.length === 0 ? (
                <div className={styles.emptyState} role="status">
                  No transactions for this filter. Import a CSV or adjust your search.
                </div>
              ) : (
                <div className={styles.table} role="region" aria-label="Transactions table">
                  {items.map((txn, index) => {
                    const accountLabel = accountsById.get(txn.accountId) || "Account";
                    const currentCategoryId: HqCategoryId = (txn.categoryId || "OTHER") as HqCategoryId;
                    const directionClass = txn.amount < 0 ? styles.out : styles.in;
                    const iconType = effectivePaymentType(txn);
                    const isSelected = selectedRows.has(txn.dedupeHash);
                    const isFocused = focusedRowIndex === index;
                    return (
                      <div
                        key={txn.dedupeHash}
                        data-row-index={index}
                        className={[
                          styles.row,
                          canAdmin ? styles.rowClickable : "",
                          isSelected ? styles.rowSelected : "",
                          isFocused ? styles.rowFocused : "",
                        ].filter(Boolean).join(" ")}
                        role={canAdmin ? "row" : undefined}
                        tabIndex={canAdmin ? 0 : undefined}
                        aria-selected={isSelected}
                        onClick={(e) => handleRowClick(txn, index, e)}
                        onDoubleClick={() => handleRowDoubleClick(txn)}
                        onKeyDown={(e) => handleRowKeyDown(txn, index, e)}
                        onContextMenu={(e) => handleContextMenu(txn, index, e)}
                      >
                        {/* Selection rail indicator */}
                        {isSelected ? <div className={styles.selectionRail} aria-hidden /> : null}
                        <div className={styles.txnCell}>
                          <div className={styles.icon} aria-hidden>
                            {typeIcon(iconType)}
                          </div>
                          <div className={styles.txnMain}>
                            <div className={styles.txnTitle}>{txnTitle(txn)}</div>
                            <div className={styles.txnMeta}>
                              <span>{txn.postedAt}</span>
                              <span>·</span>
                              <span>{accountLabel}</span>
                              {txn.cardLast4 ? (
                                <>
                                  <span>·</span>
                                  <span>Card {txn.cardLast4}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className={styles.categoryCell}>
                          {HQ_CATEGORY_LABEL[currentCategoryId]}
                        </div>

                        {/* Allocation chip - only show for outgoing transactions */}
                        {txn.direction === "out" || txn.amount < 0 ? (
                          <div className={styles.allocationCell}>
                            {(() => {
                              const allocatedTotal = getTransactionAllocatedTotal(txn);
                              const hasAllocations = allocatedTotal > 0;
                              const txnAmount = Math.abs(txn.amount);
                              const isFullyAllocated = allocatedTotal >= txnAmount - 0.01;

                              return (
                                <button
                                  type="button"
                                  className={[
                                    styles.allocationChip,
                                    hasAllocations
                                      ? isFullyAllocated
                                        ? styles.allocationFull
                                        : styles.allocationPartial
                                      : styles.allocationEmpty,
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!canAdmin) return;
                                    setAllocationTxn(txn);
                                    setIsAllocationOpen(true);
                                  }}
                                  disabled={!canAdmin}
                                  title={
                                    hasAllocations
                                      ? `Allocated: ${currency.format(allocatedTotal)}`
                                      : "Link to budget"
                                  }
                                >
                                  <Link2 size={12} />
                                  {hasAllocations ? (
                                    <span className={styles.allocationAmount}>
                                      {currency.format(allocatedTotal)}
                                    </span>
                                  ) : (
                                    <span className={styles.allocationLabel}>Link</span>
                                  )}
                                </button>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className={styles.allocationCell} />
                        )}

                        <div className={[styles.amountCol, directionClass].join(" ")}>
                          {txn.amount < 0 ? "-" : "+"}
                          {currency.format(Math.abs(txn.amount))}
                        </div>
                      </div>
                    );
                  })}
                  {nextCursor ? (
                    <div className={styles.loadMoreRow}>
                      <button
                        type="button"
                        className={styles.loadMoreButton}
                        disabled={isLoadingMore}
                        onClick={() => {
                          if (!nextCursor) return;
                          loadPage({ cursor: nextCursor, append: true, includeTotals: false });
                        }}
                      >
                        {isLoadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenuPos && canAdmin ? (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          role="menu"
          aria-label="Transaction actions"
        >
          {selectedCount === 1 ? (
            <>
              <button type="button" className={styles.contextMenuItem} onClick={openSingleEdit} role="menuitem">
                <Edit2 size={14} />
                Edit…
              </button>
              <div className={styles.contextMenuSeparator} />
              <div className={styles.contextMenuLabel}>Set category</div>
              {HQ_CATEGORY_OPTIONS.slice(0, 8).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={styles.contextMenuItem}
                  onClick={() => applyBulkAction({ categoryId: opt.value as HqCategoryId })}
                  role="menuitem"
                >
                  {opt.label}
                </button>
              ))}
              <div className={styles.contextMenuSeparator} />
              <div className={styles.contextMenuLabel}>Set payment type</div>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "card_purchase" })} role="menuitem">
                Card purchase
              </button>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "transfer" })} role="menuitem">
                Transfer
              </button>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "zelle" })} role="menuitem">
                Zelle
              </button>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "wire" })} role="menuitem">
                Wire
              </button>
              <div className={styles.contextMenuSeparator} />
              <button
                type="button"
                className={styles.contextMenuItem}
                onClick={() => {
                  const txn = contextMenuTxn;
                  if (txn) applyBulkAction({ isRecurring: !txn.isRecurring });
                }}
                role="menuitem"
              >
                <Repeat size={14} />
                Toggle burn/runway
              </button>
              <div className={styles.contextMenuSeparator} />
              <button
                type="button"
                className={styles.contextMenuItem}
                onClick={() => {
                  if (contextMenuTxn) {
                    setSelectedTxn(contextMenuTxn);
                    setIsApplyOpen(true);
                  }
                  closeContextMenu();
                }}
                role="menuitem"
              >
                <Search size={14} />
                Find similar…
              </button>
              {/* Allocate to budget - only for outgoing transactions */}
              {contextMenuTxn && (contextMenuTxn.direction === "out" || contextMenuTxn.amount < 0) ? (
                <>
                  <div className={styles.contextMenuSeparator} />
                  <button
                    type="button"
                    className={styles.contextMenuItem}
                    onClick={() => {
                      if (contextMenuTxn) {
                        setAllocationTxn(contextMenuTxn);
                        setIsAllocationOpen(true);
                      }
                      closeContextMenu();
                    }}
                    role="menuitem"
                  >
                    <Link2 size={14} />
                    Link to budget…
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className={styles.contextMenuLabel}>{selectedCount} selected</div>
              <div className={styles.contextMenuSeparator} />
              <div className={styles.contextMenuLabel}>Set category</div>
              {HQ_CATEGORY_OPTIONS.slice(0, 8).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={styles.contextMenuItem}
                  onClick={() => applyBulkAction({ categoryId: opt.value as HqCategoryId })}
                  role="menuitem"
                >
                  {opt.label}
                </button>
              ))}
              <div className={styles.contextMenuSeparator} />
              <div className={styles.contextMenuLabel}>Set payment type</div>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "card_purchase" })} role="menuitem">
                Card purchase
              </button>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "transfer" })} role="menuitem">
                Transfer
              </button>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "zelle" })} role="menuitem">
                Zelle
              </button>
              <button type="button" className={styles.contextMenuItem} onClick={() => applyBulkAction({ paymentType: "wire" })} role="menuitem">
                Wire
              </button>
              <div className={styles.contextMenuSeparator} />
              <button
                type="button"
                className={styles.contextMenuItem}
                onClick={() => applyBulkAction({ isRecurring: true })}
                role="menuitem"
              >
                <Repeat size={14} />
                Toggle burn/runway
              </button>
              <div className={styles.contextMenuSeparator} />
              <button type="button" className={styles.contextMenuItem} onClick={openBulkEdit} role="menuitem">
                <Edit2 size={14} />
                Bulk edit…
              </button>
            </>
          )}
        </div>
      ) : null}

      {activeOrgId ? (
        <>
          <ImportCsvModal orgId={activeOrgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
          <AddAccountModal
            orgId={activeOrgId}
            isOpen={isAddAccountOpen}
            onRequestClose={() => setIsAddAccountOpen(false)}
          />
          <TxnModalApply
            orgId={activeOrgId}
            isOpen={isApplyOpen}
            txn={selectedTxn}
            batchHashes={selectedCount > 1 ? Array.from(selectedRows) : undefined}
            from={startDate || undefined}
            to={endDate || undefined}
            onSaved={() => {
              // Refresh list after transaction update.
              // Small delay to allow DynamoDB eventual consistency to propagate writes.
              setTimeout(() => {
                loadPage({ cursor: null, append: false, includeTotals: true });
              }, 150);
              setSelectedRows(new Set());
            }}
            onRequestClose={() => {
              setIsApplyOpen(false);
              setSelectedTxn(null);
            }}
          />
          <AllocationModal
            orgId={activeOrgId}
            isOpen={isAllocationOpen}
            txn={allocationTxn}
            onSaved={() => {
              // Refresh list after allocation update
              setTimeout(() => {
                loadPage({ cursor: null, append: false, includeTotals: true });
              }, 150);
            }}
            onRequestClose={() => {
              setIsAllocationOpen(false);
              setAllocationTxn(null);
            }}
          />
        </>
      ) : null}
    </HQLayout>
  );
};

export default TransactionsPage;
