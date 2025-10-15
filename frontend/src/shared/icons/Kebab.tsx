import React from "react";

// Larger-dot vertical ellipsis for better visibility on iOS
export const Kebab: React.FC<
  React.SVGProps<SVGSVGElement> & { size?: number | string; color?: string }
> = ({ size = 24, color = "currentColor", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    stroke="none"
    {...props}
  >
    <circle cx="12" cy="6" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="18" r="2" />
  </svg>
);









