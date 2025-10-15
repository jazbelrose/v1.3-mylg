import React from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";
import "./popover.css";

type PopoverContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLDivElement>;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

const usePopoverContext = () => {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error("Popover components must be used within <Popover>");
  }
  return context;
};

interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Popover: React.FC<PopoverProps> = ({
  children,
  open: controlledOpen,
  onOpenChange,
}) => {
  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);

  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  React.useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        contentRef.current &&
        !contentRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, setOpen]);

  const contextValue = React.useMemo(
    () => ({ open, setOpen, triggerRef, contentRef }),
    [open, setOpen]
  );

  return (
    <PopoverContext.Provider value={contextValue}>
      <div className="ui-popover">{children}</div>
    </PopoverContext.Provider>
  );
};

interface PopoverTriggerProps {
  children: React.ReactElement;
  asChild?: boolean;
}

interface PopoverTriggerProps {
  children: React.ReactElement;
  asChild?: boolean;
}

export const PopoverTrigger = React.forwardRef<HTMLElement, PopoverTriggerProps>(
  ({ children, asChild = false }, forwardedRef) => {
    const { open, setOpen, triggerRef } = usePopoverContext();

    const child = asChild
      ? (children as React.ReactElement)
      // @ts-expect-error children may not have type prop
      : React.cloneElement(children as React.ReactElement, { type: "button" });

    const refCallback = (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLElement | null>).current =
          node;
      }
    };

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      // @ts-expect-error child.props may not have onClick
      child.props.onClick?.(event);
      if (!event.defaultPrevented) {
        setOpen(!open);
      }
    };

    return React.cloneElement(child, { // @ts-expect-error cloneElement with ref
      ref: refCallback,
      "aria-expanded": open,
      onClick: handleClick,
    });
  }
);

PopoverTrigger.displayName = "PopoverTrigger";

interface PopoverContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
}

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, style, align = "end", children, ...props }, forwardedRef) => {
    const { open, contentRef, triggerRef } = usePopoverContext();

    const [positionStyle, setPositionStyle] = React.useState<React.CSSProperties>({});

    const updatePosition = React.useCallback(() => {
      const trigger = triggerRef.current;

      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const baseStyle: React.CSSProperties = {
        top: rect.bottom + 8,
        left: rect.left,
        transform: "translateX(0)",
      };

      if (align === "center") {
        baseStyle.left = rect.left + rect.width / 2;
        baseStyle.transform = "translateX(-50%)";
      } else if (align === "end") {
        baseStyle.left = rect.right;
        baseStyle.transform = "translateX(-100%)";
      }

      setPositionStyle(baseStyle);
    }, [align, triggerRef]);

    const refCallback = (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
      }
    };

    React.useLayoutEffect(() => {
      if (!open) return;

      updatePosition();
    }, [open, updatePosition]);

    React.useEffect(() => {
      if (!open) return;

      const handleReposition = () => {
        updatePosition();
      };

      window.addEventListener("resize", handleReposition);
      window.addEventListener("scroll", handleReposition, true);

      return () => {
        window.removeEventListener("resize", handleReposition);
        window.removeEventListener("scroll", handleReposition, true);
      };
    }, [open, updatePosition]);

    const portalTarget =
      typeof document !== "undefined" ? document.body : undefined;

    if (!open || !portalTarget) return null;

    return createPortal(
      <div
        ref={refCallback}
        className={cn("ui-popover-content", className)}
        style={{ position: "fixed", ...positionStyle, ...style }}
        role="menu"
        {...props}
      >
        {children}
      </div>,
      portalTarget
    );
  }
);

PopoverContent.displayName = "PopoverContent";

