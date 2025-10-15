import { useContext } from "react";
import { ScrollContext } from "./ScrollProvider";
import type { ScrollContextType } from "./ScrollContextValue";

export const useScrollContext = (): ScrollContextType => {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error('useScrollContext must be used within a ScrollProvider');
  }
  return context;
};









