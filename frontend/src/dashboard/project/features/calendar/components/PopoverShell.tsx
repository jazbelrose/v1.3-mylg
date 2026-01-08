import React from "react";

export type PopoverShellProps = React.HTMLAttributes<HTMLDivElement> & {
  ariaLabel: string;
};

export const PopoverShell = React.forwardRef<HTMLDivElement, PopoverShellProps>(
  ({ ariaLabel, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={["calendar-entry-popover", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

PopoverShell.displayName = "PopoverShell";
