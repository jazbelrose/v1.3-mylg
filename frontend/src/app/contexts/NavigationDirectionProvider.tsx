import React, { useState, ReactNode } from "react";
import { NavigationDirectionContext } from "./NavigationDirectionContext";
import type { NavigationDirection, NavigationDirectionContextType } from "./NavigationDirectionContextValue";

interface NavigationDirectionProviderProps {
  children: ReactNode;
}

export const NavigationDirectionProvider: React.FC<NavigationDirectionProviderProps> = ({ children }) => {
  const [direction, setDirection] = useState<NavigationDirection>(null);

  const value: NavigationDirectionContextType = {
    direction,
    setDirection,
  };

  return (
    <NavigationDirectionContext.Provider value={value}>
      {children}
    </NavigationDirectionContext.Provider>
  );
};








