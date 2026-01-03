/**
 * VariantsRail - Preview rail showing 6 layout candidates
 * 
 * Features:
 * - Displays miniature previews of all variants
 * - Hover = ghost-apply preview (Phase 1.5)
 * - Click = commit selection
 * - Keyboard shortcuts 1-6 for quick selection
 * - Visual indication of selected/hovered variant
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { LayoutVariant, GeneratedFrame } from "../lib/magicLayoutTypes";
import "./VariantsRail.css";

export interface VariantsRailProps {
  /** All generated variants */
  variants: LayoutVariant[];
  /** Currently selected variant index */
  selectedIndex: number;
  /** Callback when variant is selected (committed) */
  onSelect: (index: number) => void;
  /** Callback for hover preview (ghost-apply) */
  onHoverPreview?: (index: number | null) => void;
  /** Whether to enable keyboard shortcuts (1-6) */
  enableKeyboardShortcuts?: boolean;
  /** Optional class name */
  className?: string;
  /** Optional title text */
  titleText?: string;
  /** Optional hint text */
  hintText?: string;
  /** Optional images to show in preview frames */
  previewImages?: string[];
}

const VariantsRail: React.FC<VariantsRailProps> = ({
  variants,
  selectedIndex,
  onSelect,
  onHoverPreview,
  enableKeyboardShortcuts = true,
  className = "",
  titleText = "Layouts",
  hintText = "Hover to preview, click to apply",
  previewImages = [],
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  // Handle hover preview
  const handleMouseEnter = useCallback((index: number) => {
    setHoveredIndex(index);
    onHoverPreview?.(index);
  }, [onHoverPreview]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    onHoverPreview?.(null);
  }, [onHoverPreview]);

  return (
    <div className={`variants-rail ${className}`}>
      <div className="variants-rail__header">
        <span className="variants-rail__title">{titleText}</span>
        <span className="variants-rail__hint">{hintText}</span>
      </div>
      <div className="variants-rail__grid">
        {variants.map((variant, index) => (
          <VariantPreview
            key={variant.id}
            variant={variant}
            index={index}
            isSelected={index === selectedIndex}
            isHovered={index === hoveredIndex}
            onSelect={() => onSelect(index)}
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={handleMouseLeave}
            previewImages={previewImages}
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
  isHovered: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  previewImages?: string[];
}

const VariantPreview: React.FC<VariantPreviewProps> = ({
  variant,
  index,
  isSelected,
  isHovered,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  previewImages = [],
}) => {
  // Calculate SVG viewBox based on canvas
  const viewBox = `0 0 ${variant.canvas.width / 10} ${variant.canvas.height / 10}`;

  // Render frames as rectangles with optional images
  const renderFrame = useCallback((frame: GeneratedFrame, frameIndex: number) => {
    const scale = 0.1; // Scale down by 10x for preview
    const isText = frame.contentType === "text";
    const imageFrameIdx = !isText
      ? variant.frames.slice(0, frameIndex + 1).filter((f) => f.contentType === "image").length - 1
      : -1;
    const imageUrl = !isText && previewImages.length > 0 ? previewImages[imageFrameIdx] ?? null : null;
    
    // Create unique clip path ID for this frame
    const clipId = `clip-${variant.id}-${frame.id}`;
    
    return (
      <g key={frame.id}>
        {/* Clip path for rounded corners on images */}
        {imageUrl && (
          <defs>
            <clipPath id={clipId}>
              <rect
                x={frame.x * scale}
                y={frame.y * scale}
                width={frame.width * scale}
                height={frame.height * scale}
                rx={Math.min(frame.radius * scale, 2)}
              />
            </clipPath>
          </defs>
        )}
        {/* Image (if available) */}
        {imageUrl && (
          <image
            href={imageUrl}
            x={frame.x * scale}
            y={frame.y * scale}
            width={frame.width * scale}
            height={frame.height * scale}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        )}
        {/* Frame outline */}
        <rect
          x={frame.x * scale}
          y={frame.y * scale}
          width={frame.width * scale}
          height={frame.height * scale}
          rx={Math.min(frame.radius * scale, 2)}
          fill={imageUrl ? "none" : isText ? "rgba(79, 140, 255, 0.3)" : "rgba(255, 255, 255, 0.15)"}
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
  }, [previewImages, variant.id]);

  // Score display
  const scorePercent = Math.round(variant.score * 100);

  // Build class name with hover and selected states
  const className = [
    "variant-preview",
    isSelected && "variant-preview--selected",
    isHovered && !isSelected && "variant-preview--hovered",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={`Layout ${index + 1} (Score: ${scorePercent}%) - Click to apply`}
    >
      <div className="variant-preview__number">{index + 1}</div>
      {isHovered && !isSelected && (
        <div className="variant-preview__preview-badge">Preview</div>
      )}
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
        {variant.frames.map((frame, frameIndex) => renderFrame(frame, frameIndex))}
      </svg>
      {isSelected && <div className="variant-preview__checkmark">✓</div>}
      <div className="variant-preview__score">{scorePercent}%</div>
    </button>
  );
};

export default VariantsRail;
