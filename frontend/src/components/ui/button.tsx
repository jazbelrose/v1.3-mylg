import React from "react";
import { cn } from "./utils";
import "./button.css";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "sm" | "icon" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      type = "button",
      ...props
    },
    ref
  ) => {
    const classes = cn(
      "ui-button",
      variant ? `ui-button--${variant}` : undefined,
      size !== "md" ? `ui-button--${size}` : undefined,
      className
    );

    return <button ref={ref} type={type} className={classes} {...props} />;
  }
);

Button.displayName = "Button";
