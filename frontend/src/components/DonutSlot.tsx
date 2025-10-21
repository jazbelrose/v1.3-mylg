import React from "react";

interface DonutSlotProps {
  children: React.ReactNode;
  min?: number;
  max?: number;
}

export default function DonutSlot({ children, min = 220, max = 300 }: DonutSlotProps) {
  const minHeight = `var(--donut-slot-min, ${min}px)`;
  const maxHeight = `var(--donut-slot-max, ${max}px)`;

  return (
    <div
      className="donut-slot"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        minHeight,
        maxHeight,
        contain: "layout paint size",
        borderRadius: 16,
      }}
    >
      <div className="donut-slot__inner" style={{ position: "absolute", inset: 0 }}>
        {children}
      </div>
    </div>
  );
}
