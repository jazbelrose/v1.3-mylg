import React from "react";
import { cn } from "./utils";
import "./avatar.css";

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, children, ...props }, ref) => {
    const content = src ? (
      <img src={src} alt={alt} />
    ) : children ? (
      children
    ) : fallback ? (
      <span>{fallback}</span>
    ) : null;

    return (
      <div ref={ref} className={cn("ui-avatar", className)} {...props}>
        {content}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";
