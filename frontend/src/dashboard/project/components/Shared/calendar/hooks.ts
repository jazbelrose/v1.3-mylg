import { useCallback, useMemo, useState } from "react";
import { useIsMobile } from "@/shared/hooks/useBreakpoints";

// Re-export for backward compatibility
export { useIsMobile } from "@/shared/hooks/useBreakpoints";

interface DayOverlayState {
  anchor: HTMLButtonElement | null;
  date: Date;
  dayKey: string;
}

export function useDayOverlay() {
  const [state, setState] = useState<DayOverlayState | null>(null);
  const isMobile = useIsMobile();

  const open = useCallback((anchor: HTMLButtonElement, date: Date, dayKey: string) => {
    setState({ anchor, date, dayKey });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  return useMemo(
    () => ({
      anchor: state?.anchor || null,
      date: state?.date || null,
      dayKey: state?.dayKey || null,
      isOpen: Boolean(state),
      isMobile,
      open,
      close,
    }),
    [state, isMobile, open, close]
  );
}
