import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { RowData } from "./invoicePreviewTypes";

interface UseInvoiceLayoutResult {
  invoiceRef: React.MutableRefObject<HTMLDivElement | null>;
  previewRef: React.MutableRefObject<HTMLDivElement | null>;
  pages: RowData[][];
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  selectedPages: number[];
  setSelectedPages: React.Dispatch<React.SetStateAction<number[]>>;
  handleTogglePage: (index: number) => void;
  handleToggleAllPages: (checked: boolean) => void;
  currentRows: RowData[];
}

export function useInvoiceLayout(rowsData: RowData[]): UseInvoiceLayoutResult {
  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<RowData[][]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  useLayoutEffect(() => {
    if (!invoiceRef.current) return;
    const pageElement = invoiceRef.current;
    const pageHeight = 1122;
    const computedPageStyle = window.getComputedStyle(pageElement);
    const paddingBottom = parseFloat(computedPageStyle.paddingBottom || "0");
    const pageNumberHeight = Math.max(paddingBottom, 40);
    const top = pageElement.querySelector(".invoice-top") as HTMLElement | null;
    const thead = pageElement.querySelector(".items-table thead") as HTMLElement | null;
    const firstRow = pageElement.querySelector(".items-table tbody tr") as HTMLElement | null;
    const totals = invoiceRef.current.querySelector(".totals") as HTMLElement | null;
    const notesEl = invoiceRef.current.querySelector(".notes") as HTMLElement | null;
    const footer = invoiceRef.current.querySelector(".footer") as HTMLElement | null;
    const bottomBlock = invoiceRef.current.querySelector(".bottom-block") as HTMLElement | null;

    const getTotalHeight = (el: HTMLElement | null) => {
      if (!el) return 0;
      const style = window.getComputedStyle(el);
      const marginTopValue = parseFloat(style.marginTop || "0");
      const marginBottomValue = parseFloat(style.marginBottom || "0");
      const marginTop = Number.isFinite(marginTopValue) ? marginTopValue : 0;
      const marginBottom = Number.isFinite(marginBottomValue) ? marginBottomValue : 0;
      return el.offsetHeight + marginTop + marginBottom;
    };

    const pageRect = pageElement.getBoundingClientRect();
    const topHeight = firstRow
      ? Math.max(firstRow.getBoundingClientRect().top - pageRect.top, 0)
      : (top?.offsetHeight || 0) + (thead?.offsetHeight || 0);
    const bottomHeight =
      getTotalHeight(bottomBlock) ||
      getTotalHeight(totals) + getTotalHeight(notesEl) + getTotalHeight(footer);
    const staticHeights = topHeight + pageNumberHeight;

    const rowEls = Array.from(
      invoiceRef.current.querySelectorAll(".items-table tbody tr")
    ) as HTMLElement[];

    let available = Math.max(pageHeight - staticHeights, 0);
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
        available = Math.max(pageHeight - staticHeights, 0);
      }
      current.push(data);
      available = Math.max(available - rowHeight, 0);
    });

    if (current.length) pagesAccum.push(current);

    const same =
      pages.length === pagesAccum.length &&
      pages.every((pageRows, index) => pageRows.length === pagesAccum[index].length);

    if (!same) setPages(pagesAccum);
  }, [rowsData, pages]);

  useEffect(() => {
    setSelectedPages(pages.map((_, index) => index));
    setCurrentPage(0);
  }, [pages]);

  const handleTogglePage = useCallback((index: number) => {
    setSelectedPages((prev) =>
      prev.includes(index) ? prev.filter((page) => page !== index) : [...prev, index]
    );
  }, []);

  const handleToggleAllPages = useCallback(
    (checked: boolean) => {
      setSelectedPages(checked ? pages.map((_, index) => index) : []);
    },
    [pages]
  );

  const currentRows = pages[currentPage] || [];

  return {
    invoiceRef,
    previewRef,
    pages,
    currentPage,
    setCurrentPage,
    selectedPages,
    setSelectedPages,
    handleTogglePage,
    handleToggleAllPages,
    currentRows,
  };
}

export type { UseInvoiceLayoutResult };
