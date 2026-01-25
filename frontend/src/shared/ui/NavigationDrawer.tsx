import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardNavPanel from "./DashboardNavPanel";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
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
  // Use shared scroll lock hook
  useScrollLock(open);

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