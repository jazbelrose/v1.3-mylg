import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Sector,
} from "recharts";

interface SectorProps {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
}

import { getColor } from "@/shared/utils/colorUtils";

export interface BudgetDonutSlice {
  id: string;
  label: string;
  value: number;
}

interface InternalSlice extends BudgetDonutSlice {
  color: string;
}

export type BudgetDonutDatum = InternalSlice;

interface BudgetDonutTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: BudgetDonutDatum } | undefined>;
}

export interface BudgetDonutProps {
  data: BudgetDonutSlice[];
  total: number;
  totalFormatter?: (value: number) => string;
  formatTooltip?: (slice: BudgetDonutDatum) => string;
  palette?: string[];
  ariaLabel?: string;
  explodeOnHover?: boolean;
  explodeOnClick?: boolean;
  className?: string;
  animateOnMount?: boolean;
}

const srOnlyStyles: React.CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  width: "1px",
  whiteSpace: "nowrap",
};

const centerButtonBaseBackground = "rgba(17, 17, 17, 0.6)";
const centerButtonBaseShadow = "0 8px 20px rgba(17, 17, 17, 0.45)";

const centerButtonStyles: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  border: "none",
  background: "transparent",
  borderRadius: "50%",
  padding: "12px",
  width: "min(45%, 120px)",
  aspectRatio: "1 / 1",
  boxSizing: "border-box",
  textAlign: "center",
  color: "inherit",
  cursor: "pointer",
  pointerEvents: "auto",
  transition: "background 150ms ease, box-shadow 150ms ease",
  maxWidth: "calc(100% - 16px)",
  maxHeight: "calc(100% - 16px)",
};

const centerValueStyles: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
};

const centerPopoverStyles: React.CSSProperties = {
  position: "fixed",
  transform: "translate(-50%, -50%)",
  background: "rgba(17, 17, 17, 0.6)", // Semi-transparent for frosted effect
  color: "#f8fafc",
  borderRadius: "16px",
  padding: "16px 18px",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.45)",
  minWidth: "220px",
  maxWidth: "260px",
  zIndex: 20,
  pointerEvents: "auto",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "2px solid rgba(148, 163, 184, 0.25)",
};
const centerPopoverHeaderStyles: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: "10px",
  fontSize: "0.78rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.85,
};

const centerPopoverListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const centerPopoverRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const centerPopoverLabelGroupStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  minWidth: 0,
};

const centerPopoverSwatchStyles: React.CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "999px",
  flexShrink: 0,
};

const centerPopoverPercentStyles: React.CSSProperties = {
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "rgba(226, 232, 240, 0.85)",
};

const tooltipStyles: React.CSSProperties = {
  background: "rgba(17, 17, 17, 0.8)", // Semi-transparent for frosted effect
  color: "#f8fafc",
  borderRadius: "6px",
  border: "1px solid rgba(148, 163, 184, 0.4)",
  padding: "6px 10px",
  fontSize: "0.75rem",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.45)",
  backdropFilter: "blur(10px)", // Add blur for frosted effect
  WebkitBackdropFilter: "blur(10px)", // Safari support
};
const renderActiveShape = (props: SectorProps) => {
  const outerRadius = typeof props.outerRadius === "number" ? props.outerRadius : 0;
  return <Sector {...props} outerRadius={outerRadius + 8} />;
};

const slicesAreEqual = (a: BudgetDonutSlice[], b: BudgetDonutSlice[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id || a[i].value !== b[i].value || a[i].label !== b[i].label) {
      return false;
    }
  }
  return true;
};

const BudgetDonut: React.FC<BudgetDonutProps> = ({
  data,
  total,
  totalFormatter = (value) => value.toLocaleString(),
  formatTooltip,
  palette,
  ariaLabel = "Budget allocation donut chart",
  explodeOnHover = true,
  explodeOnClick = true,
  className,
  animateOnMount = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasMountedRef = useRef(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [lockedIndex, setLockedIndex] = useState<number | null>(null);
  const [isCenterOpen, setIsCenterOpen] = useState(false);
  const [centerPopoverPosition, setCenterPopoverPosition] = useState<
    | {
        top: number;
        left: number;
        transform: string;
      }
    | null
  >(null);

  const centerButtonRef = useRef<HTMLButtonElement | null>(null);
  const centerPopoverRef = useRef<HTMLDivElement | null>(null);
  const [centerButtonSize, setCenterButtonSize] = useState<number | null>(null);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  const shouldAnimate = animateOnMount && hasMountedRef.current;

  const shapedData = useMemo(() => {
    if (!Array.isArray(data)) return [] as InternalSlice[];
    const paletteArray = Array.isArray(palette) ? palette : [];
    const paletteLength = paletteArray.length;
    return data.map((slice, index) => ({
      ...slice,
      color: paletteLength > 0 ? paletteArray[index % paletteLength] : getColor(slice.id),
    }));
  }, [data, palette]);

  const stableDataRef = useRef<InternalSlice[]>([]);
  const signatureRef = useRef<string | null>(null);

  const stableData = useMemo(() => {
    const signature = shapedData
      .map((slice) => `${slice.id}:${slice.value}`)
      .join("|");

    if (signatureRef.current === signature && stableDataRef.current.length) {
      const current = stableDataRef.current;
      for (let i = 0; i < shapedData.length; i += 1) {
        const source = shapedData[i];
        if (current[i]) {
          current[i].label = source.label;
          current[i].color = source.color;
          current[i].id = source.id;
          current[i].value = source.value;
        } else {
          current[i] = { ...source };
        }
      }
      current.length = shapedData.length;
      return current;
    }

    const next = shapedData.map((slice) => ({ ...slice }));
    signatureRef.current = signature;
    stableDataRef.current = next;
    return next;
  }, [shapedData]);

  const activeIndex = lockedIndex ?? hoverIndex ?? undefined;

  const dataSignature = useMemo(
    () => stableData.map((slice) => `${slice.id}:${slice.value}`).join("|"),
    [stableData]
  );

  const handleMouseEnter = useCallback(
    (_: unknown, index: number) => {
      if (!explodeOnHover) return;
      setHoverIndex(index);
    },
    [explodeOnHover]
  );

  const handleMouseLeave = useCallback(() => {
    if (!explodeOnHover) return;
    setHoverIndex(null);
  }, [explodeOnHover]);

  const handleSliceClick = useCallback(
    (_: unknown, index: number) => {
      if (!explodeOnClick) return;
      setLockedIndex((prev) => (prev === index ? null : index));
    },
    [explodeOnClick]
  );

  useEffect(() => {
    if (!explodeOnClick || lockedIndex === null) return undefined;

    const resetInteraction = () => {
      setLockedIndex(null);
      setHoverIndex(null);
    };

    const handlePointerEvent = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current?.contains(target)) {
        return;
      }

      resetInteraction();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons === 0) return;
      handlePointerEvent(event);
    };

    const handlePointerCancel = () => {
      resetInteraction();
    };

    window.addEventListener("pointerdown", handlePointerEvent);
    window.addEventListener("pointerup", handlePointerEvent);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointerdown", handlePointerEvent);
      window.removeEventListener("pointerup", handlePointerEvent);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [explodeOnClick, lockedIndex]);

  const tooltipRenderer = useCallback(({ active, payload }: BudgetDonutTooltipProps) => {
      if (!active || !payload || payload.length === 0) return null;
      const datum = payload[0]?.payload as BudgetDonutDatum | undefined;
      if (!datum) return null;
      const text = formatTooltip
        ? formatTooltip(datum)
        : `${datum.label}: ${Math.round(datum.value).toLocaleString()}`;
      return (
        <div style={tooltipStyles} role="presentation">
          {text}
        </div>
      );
    }, [formatTooltip]);

  const formattedTotal = useMemo(() => totalFormatter(total), [total, totalFormatter]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const updateCenterButtonSize = () => {
      const rect = container.getBoundingClientRect();
      const diameter = Math.min(rect.width, rect.height);

      if (!diameter) return;

      const availableDiameter = Math.max(diameter - 24, 0);
      const minimumSize = Math.min(54, availableDiameter);
      const compactScale = diameter <= 340 ? 0.34 : diameter <= 420 ? 0.38 : 0.42;
      const desiredSize = Math.min(
        Math.max(diameter * compactScale, minimumSize),
        Math.min(availableDiameter, 240)
      );

      setCenterButtonSize((previous) => {
        if (previous !== null && Math.abs(previous - desiredSize) < 0.5) {
          return previous;
        }
        return desiredSize;
      });
    };

    const handleResize = () => updateCenterButtonSize();

    updateCenterButtonSize();
    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new window.ResizeObserver(() => {
        updateCenterButtonSize();
      });
      resizeObserver.observe(container);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
    };
  }, []);

  const isCompactLayout = useMemo(
    () => centerButtonSize !== null && centerButtonSize <= 110,
    [centerButtonSize]
  );

  const centerButtonResponsiveStyles = useMemo(() => {
    if (centerButtonSize === null) {
      return centerButtonStyles;
    }

    const padding = Math.round(
      Math.min(
        Math.max(centerButtonSize * (isCompactLayout ? 0.16 : 0.18), 12),
        isCompactLayout ? 24 : 28
      )
    );
    const gap = Math.round(
      Math.min(
        Math.max(centerButtonSize * (isCompactLayout ? 0.05 : 0.06), 6),
        isCompactLayout ? 16 : 20
      )
    );

    return {
      ...centerButtonStyles,
      width: `${centerButtonSize}px`,
      padding: `${padding}px`,
      gap: `${gap}px`,
    } as React.CSSProperties;
  }, [centerButtonSize, isCompactLayout]);

  const centerValueResponsiveStyles = useMemo(() => {
    if (centerButtonSize === null) {
      return centerValueStyles;
    }

    const minFont = isCompactLayout ? 14 : 18;
    const maxFont = isCompactLayout ? 28 : 34;
    const multiplier = isCompactLayout ? 0.19 : 0.22;
    const fontSize = Math.min(Math.max(centerButtonSize * multiplier, minFont), maxFont);
    return {
      ...centerValueStyles,
      fontSize: `${fontSize}px`,
    } as React.CSSProperties;
  }, [centerButtonSize, isCompactLayout]);

  const pieInnerRadius = isCompactLayout ? "48%" : "52%";
  const pieOuterRadius = isCompactLayout ? "98%" : "90%";

  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "percent",
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }),
    []
  );

  const updateCenterPopoverPosition = useCallback(() => {
    const button = centerButtonRef.current;
    if (!button || typeof window === "undefined") return;

    const rect = button.getBoundingClientRect();
    const visualViewport = typeof window.visualViewport !== "undefined" ? window.visualViewport : null;
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const isMobileViewport = viewportWidth <= 768;
    const margin = 16;
    const mobileRightMargin = 0;

    const baseTop = rect.top + rect.height / 2 + viewportOffsetTop;
    const baseLeft = rect.left + rect.width / 2 + viewportOffsetLeft;

    let top = baseTop;
    let left = baseLeft;
    let transform = "translate(-50%, -50%)";

    if (isMobileViewport) {
      transform = "translate(-100%, -50%)";
      left = viewportOffsetLeft + viewportWidth - mobileRightMargin;
    }

    const clampPosition = () => {
      const popover = centerPopoverRef.current;
      if (popover) {
        const popoverWidth = popover.offsetWidth;
        const popoverHeight = popover.offsetHeight;
        const halfWidth = popoverWidth / 2;
        const halfHeight = popoverHeight / 2;

        const safeMinTop = viewportOffsetTop + margin + halfHeight;
        const safeMaxTop = viewportOffsetTop + viewportHeight - margin - halfHeight;

        if (isMobileViewport) {
          const desiredRightEdge = viewportOffsetLeft + viewportWidth - mobileRightMargin;
          const minRightEdge = viewportOffsetLeft + margin + popoverWidth;
          const maxRightEdge = viewportOffsetLeft + viewportWidth - mobileRightMargin;
          const clampedRightEdge = Math.min(
            Math.max(desiredRightEdge, minRightEdge),
            maxRightEdge
          );
          left = clampedRightEdge;
        } else {
          const minLeft = viewportOffsetLeft + margin + halfWidth;
          const maxLeft = viewportOffsetLeft + viewportWidth - margin - halfWidth;
          left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
        }

        if (safeMinTop > safeMaxTop) {
          top = viewportOffsetTop + viewportHeight / 2;
        } else {
          top = Math.min(Math.max(top, safeMinTop), safeMaxTop);
        }
      } else {
        const safeMinLeft = viewportOffsetLeft + margin;
        const safeMaxLeft =
          viewportOffsetLeft + viewportWidth - (isMobileViewport ? mobileRightMargin : margin);
        const safeMinTop = viewportOffsetTop + margin;
        const safeMaxTop = viewportOffsetTop + viewportHeight - margin;

        left = Math.min(Math.max(left, safeMinLeft), safeMaxLeft);
        top = Math.min(Math.max(top, safeMinTop), safeMaxTop);
      }

      setCenterPopoverPosition({
        top,
        left,
        transform,
      });
    };

    if (centerPopoverRef.current) {
      clampPosition();
    } else if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(clampPosition);
    } else {
      clampPosition();
    }
  }, []);

  const openCenterPopover = useCallback(() => {
    setIsCenterOpen(true);
    updateCenterPopoverPosition();
  }, [updateCenterPopoverPosition]);

  const closeCenterPopover = useCallback(() => {
    setIsCenterOpen(false);
    setCenterPopoverPosition(null);
  }, []);

  const handleCenterMouseEnter = useCallback(() => {
    openCenterPopover();
  }, [openCenterPopover]);

  const handleCenterMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && centerPopoverRef.current?.contains(nextTarget)) {
        return;
      }
      closeCenterPopover();
    },
    [closeCenterPopover]
  );

  const handleCenterFocus = useCallback(() => {
    openCenterPopover();
  }, [openCenterPopover]);

  const handleCenterBlur = useCallback(() => {
    closeCenterPopover();
  }, [closeCenterPopover]);

  const handleCenterPopoverMouseEnter = useCallback(() => {
    openCenterPopover();
  }, [openCenterPopover]);

  const handleCenterPopoverMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && centerButtonRef.current?.contains(nextTarget)) {
        return;
      }
      closeCenterPopover();
    },
    [closeCenterPopover]
  );

  const handleCenterPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      event.stopPropagation();
      openCenterPopover();
    },
    [openCenterPopover]
  );

  useEffect(() => {
    if (!isCenterOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        centerButtonRef.current?.contains(target) ||
        centerPopoverRef.current?.contains(target)
      ) {
        return;
      }
      closeCenterPopover();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCenterPopover();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeCenterPopover, isCenterOpen]);

  useEffect(() => {
    if (!isCenterOpen) return;

    updateCenterPopoverPosition();

    const handleReposition = () => {
      updateCenterPopoverPosition();
    };

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isCenterOpen, updateCenterPopoverPosition]);

  useEffect(() => {
    closeCenterPopover();
  }, [dataSignature, total, closeCenterPopover]);

  const handleContainerPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!explodeOnHover) return;
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && containerRef.current?.contains(nextTarget)) {
        return;
      }
      setHoverIndex(null);
    },
    [explodeOnHover]
  );

  const popoverContent =
    typeof document !== "undefined" && isCenterOpen && centerPopoverPosition
      ? createPortal(
          <div
            ref={centerPopoverRef}
            style={{
              ...centerPopoverStyles,
              top: centerPopoverPosition.top,
              left: centerPopoverPosition.left,
              transform: centerPopoverPosition.transform,
            }}
            role="dialog"
            aria-label="Budget allocation breakdown"
            onMouseEnter={handleCenterPopoverMouseEnter}
            onMouseLeave={handleCenterPopoverMouseLeave}
          >
            <div style={centerPopoverHeaderStyles}>Budget allocation</div>
            {stableData.length ? (
              <div style={centerPopoverListStyles}>
                {stableData.map((slice) => {
                  const ratio = total > 0 ? slice.value / total : 0;
                  return (
                    <div key={slice.id} style={centerPopoverRowStyles}>
                      <div style={centerPopoverLabelGroupStyles}>
                        <span
                          aria-hidden="true"
                          style={{
                            ...centerPopoverSwatchStyles,
                            backgroundColor: slice.color,
                          }}
                        />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "0.8rem",
                          }}
                        >
                          {slice.label}
                        </span>
                      </div>
                      <span style={centerPopoverPercentStyles}>
                        {total > 0 ? percentageFormatter.format(ratio) : "0%"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontStyle: "italic", opacity: 0.75, fontSize: "0.8rem" }}>
                No categories available
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "visible",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onPointerLeave={handleContainerPointerLeave}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart width={200} height={200} style={{ width: "100%", height: "100%" }}>
          <Pie
            data={stableData}
            dataKey="value"
            nameKey="label"
            innerRadius={pieInnerRadius}
            outerRadius={pieOuterRadius}
            paddingAngle={1}
            cornerRadius={2}
            isAnimationActive={shouldAnimate}
            animationDuration={shouldAnimate ? 350 : 0}
            activeIndex={activeIndex as number | undefined}
            activeShape={renderActiveShape as never}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleSliceClick}
            cursor="pointer"
          >
            {stableData.map((entry) => (
              <Cell
                key={entry.id}
                fill={entry.color}
                stroke="var(--budget-chart-border, #0f172a)"
                strokeWidth={entry.value > 0 ? 1 : 0}
              />
            ))}
          </Pie>
          <Tooltip
            content={tooltipRenderer}
            cursor={{ fill: "rgba(255,255,255,0.08)" }}
            wrapperStyle={{ zIndex: 10 }}
          />
        </PieChart>
      </ResponsiveContainer>

      <button
        ref={centerButtonRef}
        type="button"
        style={{
          ...centerButtonResponsiveStyles,
          background: isCenterOpen ? "#111" : centerButtonBaseBackground,
          boxShadow: isCenterOpen
            ? "0 12px 32px #111"
            : centerButtonBaseShadow,
        }}
        onMouseEnter={handleCenterMouseEnter}
        onMouseLeave={handleCenterMouseLeave}
        onFocus={handleCenterFocus}
        onBlur={handleCenterBlur}
        onPointerDown={handleCenterPointerDown}
        aria-label="View budget allocation"
        aria-haspopup="dialog"
        aria-expanded={isCenterOpen}
      >
        <span style={centerValueResponsiveStyles}>{formattedTotal}</span>
      </button>

      {popoverContent}

      <table style={srOnlyStyles}>
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {stableData.map((slice) => (
            <tr key={slice.id}>
              <td>{slice.label}</td>
              <td>{slice.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(BudgetDonut, (prev, next) => {
  if (prev.total !== next.total) return false;
  if (prev.totalFormatter !== next.totalFormatter) return false;
  if (prev.formatTooltip !== next.formatTooltip) return false;
  if (prev.ariaLabel !== next.ariaLabel) return false;
  if (prev.explodeOnHover !== next.explodeOnHover) return false;
  if (prev.explodeOnClick !== next.explodeOnClick) return false;
  if (prev.palette !== next.palette) return false;
  if (!slicesAreEqual(prev.data, next.data)) return false;
  return true;
});
