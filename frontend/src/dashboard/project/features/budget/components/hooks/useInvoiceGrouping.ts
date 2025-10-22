import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import type { BudgetItem, GroupField, RowData } from "../invoicePreviewTypes";

interface UseInvoiceGroupingOptions {
  isOpen: boolean;
  invoiceRef: React.MutableRefObject<HTMLDivElement | null>;
  budgetItems: BudgetItem[];
}

interface UseInvoiceGroupingResult {
  items: BudgetItem[];
  groupField: GroupField;
  groupValues: string[];
  groupOptions: string[];
  rowsData: RowData[];
  pages: RowData[][];
  selectedPages: number[];
  setSelectedPages: React.Dispatch<React.SetStateAction<number[]>>;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  currentRows: RowData[];
  subtotal: number;
  handleGroupFieldChange: (field: GroupField) => void;
  handleToggleGroupValue: (val: string) => void;
  handleToggleAllGroupValues: (checked: boolean) => void;
  handleTogglePage: (idx: number) => void;
  handleToggleAllPages: (checked: boolean) => void;
  applyGroupingFromInvoice: (field: GroupField | undefined, values: string[]) => void;
}

const PAGE_HEIGHT = 1122;
const PAGE_NUMBER_HEIGHT = 40;

export function useInvoiceGrouping({
  isOpen,
  invoiceRef,
  budgetItems,
}: UseInvoiceGroupingOptions): UseInvoiceGroupingResult {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [groupField, setGroupField] = useState<GroupField>("invoiceGroup");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const [pages, setPages] = useState<RowData[][]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const arr = Array.isArray(budgetItems) ? budgetItems : [];
    setItems(arr);
    if (arr.length && !arr.some((i) => i.invoiceGroup)) {
      setGroupField("category");
      setGroupValues([]);
    }
  }, [isOpen, budgetItems]);

  useEffect(() => {
    const vals = Array.from(
      new Set(
        items
          .map((it) => String((it as BudgetItem)[groupField] || "").trim())
          .filter(Boolean)
      )
    );
    if (groupValues.length === 0) {
      setGroupValues(vals);
    } else {
      const filteredVals = groupValues.filter((v) => vals.includes(v));
      if (filteredVals.length !== groupValues.length) {
        setGroupValues(filteredVals);
      }
    }
  }, [items, groupField, groupValues]);

  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((it) => String((it as BudgetItem)[groupField] || "").trim())
            .filter(Boolean)
        )
      ),
    [items, groupField]
  );

  const filteredItems = useMemo(
    () =>
      groupValues.length === 0
        ? items
        : items.filter((it) => groupValues.includes(String((it as BudgetItem)[groupField]).trim())),
    [groupValues, items, groupField]
  );

  const subtotal = useMemo(
    () =>
      filteredItems.reduce((sum, it) => {
        const amt = parseFloat(String(it.itemFinalCost ?? 0)) || 0;
        return sum + amt;
      }, 0),
    [filteredItems]
  );

  const rowsData: RowData[] = useMemo(() => {
    const groups = groupValues.length === 0 ? groupOptions : groupValues;
    const arr: RowData[] = [];
    groups.forEach((grp) => {
      if (grp) arr.push({ type: "group", group: grp });
      items
        .filter((it) => String((it as BudgetItem)[groupField]).trim() === grp)
        .forEach((it) => arr.push({ type: "item", item: it }));
    });
    return arr;
  }, [items, groupValues, groupField, groupOptions]);

  useLayoutEffect(() => {
    if (!invoiceRef.current) return;
    const top = invoiceRef.current.querySelector(".invoice-top") as HTMLElement | null;
    const thead = invoiceRef.current.querySelector(".items-table thead") as HTMLElement | null;
    const totals = invoiceRef.current.querySelector(".totals") as HTMLElement | null;
    const notesEl = invoiceRef.current.querySelector(".notes") as HTMLElement | null;
    const footer = invoiceRef.current.querySelector(".footer") as HTMLElement | null;
    const bottomBlock = invoiceRef.current.querySelector(".bottom-block") as HTMLElement | null;

    const getTotalHeight = (el: HTMLElement | null) => {
      if (!el) return 0;
      const style = window.getComputedStyle(el);
      const marginTop = parseFloat(style.marginTop || "0");
      const marginBottom = parseFloat(style.marginBottom || "0");
      return el.offsetHeight + marginTop + marginBottom;
    };

    const topHeight = (top?.offsetHeight || 0) + (thead?.offsetHeight || 0);
    const bottomHeight =
      getTotalHeight(bottomBlock) ||
      getTotalHeight(totals) + getTotalHeight(notesEl) + getTotalHeight(footer);
    const staticHeights = topHeight + PAGE_NUMBER_HEIGHT;

    const rowEls = Array.from(
      invoiceRef.current.querySelectorAll(".items-table tbody tr")
    ) as HTMLElement[];

    let available = Math.max(PAGE_HEIGHT - staticHeights, 0);
    const pagesAccum: RowData[][] = [];
    let current: RowData[] = [];

    rowEls.forEach((row, idx) => {
      const rowHeight = row.offsetHeight;
      const data = rowsData[idx];
      const isLast = idx === rowEls.length - 1;
      const nextRow = rowEls[idx + 1];
      const nextData = rowsData[idx + 1];
      const isGroupHeader = row.classList.contains("group-header");
      const bundleHeight =
        isGroupHeader && nextRow && nextData?.type === "item"
          ? rowHeight + nextRow.offsetHeight
          : rowHeight;
      const needed = bundleHeight + (isLast ? bottomHeight : 0);
      if (needed > available && current.length) {
        pagesAccum.push(current);
        current = [];
        available = Math.max(PAGE_HEIGHT - staticHeights, 0);
      }
      current.push(data);
      available -= rowHeight;
    });

    if (current.length) pagesAccum.push(current);

    setPages((prevPages) => {
      const same =
        prevPages.length === pagesAccum.length &&
        prevPages.every((p, i) => p.length === pagesAccum[i].length);
      return same ? prevPages : pagesAccum;
    });
  }, [rowsData, invoiceRef]);

  useEffect(() => {
    setSelectedPages(pages.map((_, i) => i));
    setCurrentPage(0);
  }, [pages]);

  const handleGroupFieldChange = useCallback((field: GroupField) => {
    setGroupField(field);
    setGroupValues([]);
  }, []);

  const handleToggleGroupValue = useCallback((val: string) => {
    setGroupValues((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
  }, []);

  const handleToggleAllGroupValues = useCallback(
    (checked: boolean) => {
      setGroupValues(checked ? groupOptions : []);
    },
    [groupOptions]
  );

  const handleTogglePage = useCallback((idx: number) => {
    setSelectedPages((prev) => (prev.includes(idx) ? prev.filter((p) => p !== idx) : [...prev, idx]));
  }, []);

  const handleToggleAllPages = useCallback((checked: boolean) => {
    setSelectedPages(checked ? pages.map((_, i) => i) : []);
  }, [pages]);

  const applyGroupingFromInvoice = useCallback(
    (field: GroupField | undefined, values: string[]) => {
      if (field) setGroupField(field);
      if (values.length) setGroupValues(values);
    },
    []
  );

  const currentRows = pages[currentPage] || [];

  return {
    items,
    groupField,
    groupValues,
    groupOptions,
    rowsData,
    pages,
    selectedPages,
    setSelectedPages,
    currentPage,
    setCurrentPage,
    currentRows,
    subtotal,
    handleGroupFieldChange,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
    handleTogglePage,
    handleToggleAllPages,
    applyGroupingFromInvoice,
  };
}
