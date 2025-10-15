import React, { createContext, useRef, useState, ReactNode } from "react";
import type { ScrollContextType } from "./ScrollContextValue";

interface ScrollProviderProps {
  children: ReactNode;
}

const ScrollContext = createContext<ScrollContextType | undefined>(undefined);

export { ScrollContext };

export const ScrollProvider: React.FC<ScrollProviderProps> = ({ children }) => {
  const scrollableDivRef = useRef<HTMLDivElement>(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);

  const updateHeaderVisibility = (isVisible: boolean): void => {
    setIsHeaderVisible(isVisible);
  };

  const value: ScrollContextType = {
    isHeaderVisible,
    updateHeaderVisibility,
    scrollableDivRef,
  };

  return (
    <ScrollContext.Provider value={value}>
      {children}
    </ScrollContext.Provider>
  );
};








