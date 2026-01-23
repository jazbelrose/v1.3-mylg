import React from "react";

export interface SpendIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * SpendIcon - Dollar sign with cycling arrows (money circulation)
 * Filled style to match FontAwesome icons used in Budget cards
 */
const SpendIcon = React.forwardRef<SVGSVGElement, SpendIconProps>(
  ({ size = 24, className = "", ...props }, ref) => {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        style={{ display: 'block' }}
        {...props}
      >
        {/* Center circle with dollar sign */}
        <circle cx="12" cy="12" r="5.5" />
        {/* Dollar sign (cut out / contrasting) */}
        <path 
          d="M12 7.5v1M12 15.5v1M10.5 10a1.5 1.5 0 0 1 1.5-1.5h.5a1.25 1.25 0 0 1 0 2.5h-1a1.25 1.25 0 0 0 0 2.5h.5a1.5 1.5 0 0 0 1.5-1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Top arrow arc */}
        <path d="M19.5 10.5c0-4.1-3.4-7.5-7.5-7.5S4.5 6.4 4.5 10.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        {/* Top arrowhead */}
        <path d="M17.5 8l2 2.5 2.5-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Bottom arrow arc */}
        <path d="M4.5 13.5c0 4.1 3.4 7.5 7.5 7.5s7.5-3.4 7.5-7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        {/* Bottom arrowhead */}
        <path d="M6.5 16l-2-2.5-2.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
);

SpendIcon.displayName = "SpendIcon";

export default SpendIcon;
export { SpendIcon };
