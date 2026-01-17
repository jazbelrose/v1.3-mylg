import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

import MemryLogo from "@/assets/svg/memry logo final sm.svg?react";

export type BrandRowProps = {
  className?: string;
  sticky?: boolean;
  href?: string;
  ariaLabel?: string;
  wordmark?: string;
  markSize?: number;
  onClose?: () => void;
  rightSlot?: React.ReactNode;
};

const BrandRow: React.FC<BrandRowProps> = ({
  className,
  sticky,
  href = "/",
  ariaLabel = "Go to marketing home",
  wordmark = "memry",
  markSize,
  onClose,
  rightSlot,
}) => {
  const rowClassName = [
    "dashboard-nav-panel__brand-row",
    sticky ? "dashboard-nav-panel__brand-row--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inlineStyle =
    typeof markSize === "number"
      ? ({ "--brand-mark-size": `${markSize}px` } as React.CSSProperties)
      : undefined;

  const rightContent =
    rightSlot ??
    (onClose ? (
      <button
        type="button"
        className="close-button close-button--brandrow"
        onClick={onClose}
        aria-label="Close navigation"
      >
        <X size={20} />
      </button>
    ) : null);

  return (
    <div className={rowClassName} style={inlineStyle}>
      <Link to={href} className="dashboard-nav-panel__brand-button" aria-label={ariaLabel}>
        <MemryLogo className="dashboard-nav-panel__brand-mark" />
        <span className="dashboard-nav-panel__brand-text">{wordmark}</span>
      </Link>

      {rightContent ? (
        <div className="dashboard-nav-panel__brand-right">{rightContent}</div>
      ) : null}
    </div>
  );
};

export default BrandRow;
