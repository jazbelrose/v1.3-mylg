/**
 * useMagicLayout - Hook for accessing Magic Layout context
 */
import { useContext } from "react";
import MagicLayoutContext, { type MagicLayoutContextValue } from "../contexts/MagicLayoutContext";

export function useMagicLayout(): MagicLayoutContextValue {
  const context = useContext(MagicLayoutContext);
  if (!context) {
    throw new Error("useMagicLayout must be used within a MagicLayoutProvider");
  }
  return context;
}

export default useMagicLayout;
