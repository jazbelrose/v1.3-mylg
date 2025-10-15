import React from "react";
import { cn } from "./utils";
import "./badge.css";

type BadgeVariant = "default" | "outline" | "success";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const classes = cn(
      "ui-badge",
      variant !== "default" ? `ui-badge--${variant}` : undefined,
      className
    );

    return <span ref={ref} className={classes} {...props} />;
  }
);

Badge.displayName = "Badge";
