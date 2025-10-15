import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardNavPanel from "./DashboardNavPanel";
import "./navigation-drawer.css";

interface NavigationDrawerProps {
  open: boolean;
  onClose: () => void;
  setActiveView: (view: string) => void;
  drawerId?: string;
}

const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  open,
  onClose,
  setActiveView,
  drawerId,
}) => {
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const { body, documentElement } = document;

    const originalBodyOverflow = body.style.overflow;
    const originalHtmlOverflow = documentElement.style.overflow;
    const originalBodyTouchAction = body.style.touchAction;
    const originalHtmlTouchAction = documentElement.style.touchAction;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.touchAction = "none";
    documentElement.style.touchAction = "none";

    return () => {
      body.style.overflow = originalBodyOverflow;
      documentElement.style.overflow = originalHtmlOverflow;
      body.style.touchAction = originalBodyTouchAction;
      documentElement.style.touchAction = originalHtmlTouchAction;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="navigation-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            id={drawerId}
            className="navigation-drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="Primary navigation"
          >
            <DashboardNavPanel
              variant="overlay"
              setActiveView={setActiveView}
              onClose={onClose}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NavigationDrawer;