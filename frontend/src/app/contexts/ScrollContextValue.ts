import type { RefObject } from "react";

export interface ScrollContextType {
  isHeaderVisible: boolean;
  updateHeaderVisibility: (isVisible: boolean) => void;
  scrollableDivRef: RefObject<HTMLDivElement>;
}









