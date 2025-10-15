import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

interface PreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  onExportGallery: () => void;
  onExportPDF: () => void;
}

const PreviewDrawer: React.FC<PreviewDrawerProps> = ({
  open,
  onClose,
  url,
  onExportGallery,
  onExportPDF,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", onKey);
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="preview-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="preview-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label="Preview"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              aria-label="Close preview"
            >
              ×
            </button>

            <PDFPreview url={url} />

            <div className="preview-actions">
              <button type="button" onClick={onExportGallery}>
                Export to Gallery
              </button>
              <button type="button" onClick={onExportPDF}>
                Export to PDF
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PreviewDrawer;









