import React from "react";

export default function DonutSlot({
  children,
  min = 220,
  max = 300,
}: {
  children: React.ReactNode;
  min?: number;
  max?: number;
}) {
  return (
    <div
      className="relative w-full"
      style={{
        aspectRatio: "1 / 1",
        minHeight: min,
        maxHeight: max,
        contain: "layout paint size",
        borderRadius: 16,
      }}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}
