/**
 * VariantsRail - Preview rail showing 6 layout candidates
 * 
 * Features:
 * - Displays miniature previews of all variants
 * - Click to select a variant
 * - Keyboard shortcuts 1-6 for quick selection
 * - Visual indication of selected/hovered variant
 */

import React, { useCallback, useEffect, useMemo } from "react";
import type { LayoutVariant, GeneratedFrame } from "../lib/magicLayoutTypes";
import "./VariantsRail.css";

export interface VariantsRailProps {
  /** All generated variants */
  variants: LayoutVariant[];
  /** Currently selected variant index */
  selectedIndex: number;
  /** Callback when variant is selected */
  onSelect: (index: number) => void;
  /** Whether to enable keyboard shortcuts (1-6) */
  enableKeyboardShortcuts?: boolean;
  /** Optional class name */
  className?: string;
}

const VariantsRail: React.FC<VariantsRailProps> = ({
  variants,
  selectedIndex,
  onSelect,
  enableKeyboardShortcuts = true,
  className = "",
}) => {
  // Keyboard shortcuts 1-6
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= variants.length) {
        e.preventDefault();
        onSelect(num - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableKeyboardShortcuts, variants.length, onSelect]);

  return (
    <div className={`variants-rail ${className}`}>
      <div className="variants-rail__header">
        <span className="variants-rail__title">Layouts</span>
        <span className="variants-rail__hint">Press 1-{variants.length} to select</span>
      </div>
      <div className="variants-rail__grid">
        {variants.map((variant, index) => (
          <VariantPreview
            key={variant.id}
            variant={variant}
            index={index}
            isSelected={index === selectedIndex}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </div>
  );
};

interface VariantPreviewProps {
  variant: LayoutVariant;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

const VariantPreview: React.FC<VariantPreviewProps> = ({
  variant,
  index,
  isSelected,
  onSelect,
}) => {
  // Calculate SVG viewBox based on canvas
  const viewBox = `0 0 ${variant.canvas.width / 10} ${variant.canvas.height / 10}`;

  // Render frames as rectangles
  const renderFrame = useCallback((frame: GeneratedFrame) => {
    const scale = 0.1; // Scale down by 10x for preview
    const isText = frame.contentType === "text";
    
    return (
      <g key={frame.id}>
        <rect
          x={frame.x * scale}
          y={frame.y * scale}
          width={frame.width * scale}
          height={frame.height * scale}
          rx={Math.min(frame.radius * scale, 2)}
          fill={isText ? "rgba(79, 140, 255, 0.3)" : "rgba(255, 255, 255, 0.15)"}
          stroke={isText ? "rgba(79, 140, 255, 0.6)" : "rgba(255, 255, 255, 0.4)"}
          strokeWidth={isText ? 0.8 : 0.5}
        />
        {/* Text indicator lines */}
        {isText && (
          <>
            <line
              x1={frame.x * scale + 4}
              y1={frame.y * scale + frame.height * scale * 0.35}
              x2={frame.x * scale + frame.width * scale - 4}
              y2={frame.y * scale + frame.height * scale * 0.35}
              stroke="rgba(79, 140, 255, 0.5)"
              strokeWidth={0.5}
            />
            <line
              x1={frame.x * scale + 4}
              y1={frame.y * scale + frame.height * scale * 0.55}
              x2={frame.x * scale + frame.width * scale * 0.7}
              y2={frame.y * scale + frame.height * scale * 0.55}
              stroke="rgba(79, 140, 255, 0.5)"
              strokeWidth={0.5}
            />
          </>
        )}
        {/* Hero indicator */}
        {frame.isHero && !isText && (
          <circle
            cx={frame.x * scale + 4}
            cy={frame.y * scale + 4}
            r={2}
            fill="rgba(255, 200, 50, 0.8)"
          />
        )}
        {/* Lock indicator */}
        {frame.locks.lockPosition && (
          <circle
            cx={frame.x * scale + frame.width * scale - 4}
            cy={frame.y * scale + 4}
            r={1.5}
            fill="rgba(255, 100, 100, 0.8)"
          />
        )}
      </g>
    );
  }, []);

  // Score display
  const scorePercent = Math.round(variant.score * 100);

  return (
    <button
      type="button"
      className={`variant-preview ${isSelected ? "variant-preview--selected" : ""}`}
      onClick={onSelect}
      title={`Layout ${index + 1} (Score: ${scorePercent}%)`}
    >
      <div className="variant-preview__number">{index + 1}</div>
      <svg
        viewBox={viewBox}
        className="variant-preview__svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background */}
        <rect
          x={0}
          y={0}
          width={variant.canvas.width / 10}
          height={variant.canvas.height / 10}
          fill="rgba(16, 17, 18, 0.9)"
          rx={2}
        />
        {/* Content area outline */}
        <rect
          x={variant.content.x / 10}
          y={variant.content.y / 10}
          width={variant.content.width / 10}
          height={variant.content.height / 10}
          fill="none"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
        {/* Frames */}
        {variant.frames.map(renderFrame)}
      </svg>
      {isSelected && <div className="variant-preview__checkmark">✓</div>}
      <div className="variant-preview__score">{scorePercent}%</div>
    </button>
  );
};

export default VariantsRail;
