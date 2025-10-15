import React from "react";
import { createPortal } from "react-dom";

interface SvgOverlayPortalProps {
  readonly viewBox?: string;
  readonly pathId?: string;
  readonly pathD?: string;
  readonly preserveAspectRatio?: string;
}

export const SvgOverlayPortal: React.FC<SvgOverlayPortalProps> = ({
  viewBox = "0 0 1000 1000",
  pathId = "revealPath",
  pathD = "M0,1005S175,995,500,995s500,5,500,5V0H0Z",
  preserveAspectRatio = "none",
}) => {
  const overlay = (
    <div className="svg-overlay" aria-hidden="true">
      <svg viewBox={viewBox} preserveAspectRatio={preserveAspectRatio}>
        <path id={pathId} d={pathD} />
      </svg>
    </div>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
};

export default SvgOverlayPortal;
