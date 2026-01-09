import React, { useCallback, useRef } from "react";
import { Download } from "lucide-react";
import type { PdfExportPreset } from "../lib/pdfExportPresets";

type Props = {
  onExportAllPdf: (preset: PdfExportPreset) => void;
  isExportingPdf?: boolean;
};

export default function SlidesPdfExportMenu({ onExportAllPdf, isExportingPdf = false }: Props) {
  // Guard against accidental double-trigger (e.g., multiple handlers / fast double click)
  const clickGuardRef = useRef(false);

  const handleSelect = useCallback(
    (preset: PdfExportPreset) => {
      if (isExportingPdf) return;
      if (clickGuardRef.current) return;
      clickGuardRef.current = true;

      try {
        onExportAllPdf(preset);
      } finally {
        // Reset on next tick so a subsequent deliberate export still works.
        window.setTimeout(() => {
          clickGuardRef.current = false;
        }, 0);
      }
    },
    [isExportingPdf, onExportAllPdf]
  );

  return (
    <>
      <button
        type="button"
        className="item"
        disabled={isExportingPdf}
        onClick={() => handleSelect("screen")}
      >
        <Download size={18} className="dropdown-icon" />
        <span className="text">PDF (Screen) — small & fast</span>
      </button>
      <button
        type="button"
        className="item"
        disabled={isExportingPdf}
        onClick={() => handleSelect("high")}
      >
        <Download size={18} className="dropdown-icon" />
        <span className="text">PDF (High) — crisp (default)</span>
      </button>
      <button
        type="button"
        className="item"
        disabled={isExportingPdf}
        onClick={() => handleSelect("print")}
      >
        <Download size={18} className="dropdown-icon" />
        <span className="text">PDF (Print) — very large</span>
      </button>
    </>
  );
}
