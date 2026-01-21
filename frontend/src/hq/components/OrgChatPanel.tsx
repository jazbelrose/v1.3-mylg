/**
 * OrgChatPanel - Floating/docked chat panel for organization messages
 *
 * Similar to ChatPanel for projects but uses OrgMessagesThread for org-scoped chat.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import OrgMessagesThread from "./OrgMessagesThread";
import "@/dashboard/home/styles/components/chat-panel.css";

type OrgChatPanelProps = {
  orgId: string;
  initialFloating?: boolean;
  onFloatingChange?: (floating: boolean) => void;
  initialOpen?: boolean;
  openSignal?: number;
  onCloseChat?: () => void;
};

type Size = { width: number; height: number };
type Pos = { x: number; y: number };

type CSSVarStyle = React.CSSProperties & {
  ["--chat-panel-top"]?: string;
};

const OrgChatPanel: React.FC<OrgChatPanelProps> = ({
  orgId,
  initialFloating = false,
  onFloatingChange,
  initialOpen,
  openSignal = 0,
  onCloseChat,
}) => {
  const isNarrowScreen = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const [isMobile, setIsMobile] = useState<boolean>(isNarrowScreen);
  const [open, setOpen] = useState<boolean>(() => {
    if (isNarrowScreen) return Boolean(initialOpen);
    const resolvedInitialOpen = initialOpen ?? true;
    return Boolean(resolvedInitialOpen);
  });

  const prevHeightRef = useRef<number>(400);
  const [floating, setFloating] = useState<boolean>(isNarrowScreen ? true : Boolean(initialFloating));

  const [size, setSize] = useState<Size>(() => {
    if (typeof window === "undefined") return { width: 380, height: 450 };
    try {
      const stored = localStorage.getItem("orgChatPanelSize");
      if (stored) return JSON.parse(stored) as Size;
    } catch {
      /* ignore */
    }
    return { width: 380, height: 450 };
  });

  const [position, setPosition] = useState<Pos>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    try {
      const stored = localStorage.getItem("orgChatPanelPosition");
      if (stored) return JSON.parse(stored) as Pos;
    } catch {
      /* ignore */
    }
    const panelWidth = 380;
    const panelHeight = 450;
    return {
      x: window.innerWidth - panelWidth - 32,
      y: window.innerHeight - panelHeight - 32,
    };
  });

  const [headerOffset, setHeaderOffset] = useState<number>(50);
  const [dockedHeight, setDockedHeight] = useState<number | null>(null);

  const dragOffsetRef = useRef<Pos>({ x: 0, y: 0 });
  const draggingRef = useRef<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);
  const resizingRef = useRef<boolean>(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  const flashPanel = useCallback(() => {
    const node = panelRef.current;
    if (!node || typeof window === "undefined") return;
    node.classList.remove("flash");
    void node.offsetWidth;
    node.classList.add("flash");
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => node.classList.remove("flash"), 950);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("orgChatPanelPosition", JSON.stringify(position));
    } catch {
      /* ignore */
    }
  }, [position]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("orgChatPanelSize", JSON.stringify(size));
    } catch {
      /* ignore */
    }
  }, [size]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (panelRef.current) {
        const { offsetWidth, offsetHeight } = panelRef.current;
        setPosition((pos) => ({
          x: Math.max(0, Math.min(pos.x, window.innerWidth - offsetWidth)),
          y: Math.max(0, Math.min(pos.y, window.innerHeight - offsetHeight)),
        }));
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    const updateOffset = () => {
      const navBar = document.querySelector("[data-app-header-card]") as HTMLElement | null;
      const globalHeight = navBar ? navBar.getBoundingClientRect().height : 0;
      setHeaderOffset(globalHeight);
    };
    updateOffset();
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, []);

  useEffect(() => {
    if (floating) return;
    const updateHeight = () => {
      const available = window.innerHeight - headerOffset;
      setDockedHeight(available);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [floating, headerOffset, open]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (open && !floating) {
      const width = panelRef.current?.offsetWidth ?? 320;
      body.classList.add("chat-panel-docked");
      body.style.setProperty("--chat-panel-width", `${width}px`);
    } else {
      body.classList.remove("chat-panel-docked");
      body.style.removeProperty("--chat-panel-width");
    }
  }, [open, floating]);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("chat-panel-docked");
        document.body.style.removeProperty("--chat-panel-width");
      }
    };
  }, []);

  const handleSetFloating = useCallback(
    (valueOrUpdater: boolean | ((prev: boolean) => boolean)) => {
      setFloating((prev) => {
        const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
        onFloatingChange?.(next);
        return next;
      });
    },
    [onFloatingChange]
  );

  const headerHeight = 90;

  const handleSetOpen = useCallback(
    (valueOrUpdater: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
        if (next === prev) return prev;
        if (!next) {
          prevHeightRef.current = size.height;
          setSize((s) => ({ ...s, height: headerHeight }));
        } else {
          setSize((s) => ({ ...s, height: prevHeightRef.current || s.height }));
        }
        return next;
      });
    },
    [size.height]
  );

  useEffect(() => {
    if (openSignal <= 0) return;
    handleSetOpen(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => flashPanel());
    }
  }, [openSignal, handleSetOpen, flashPanel]);

  const startDrag = (e: React.MouseEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (!floating) {
      setPosition({ x: rect.left, y: rect.top });
      setSize({ width: rect.width, height: rect.height });
      handleSetFloating(true);
      handleSetOpen(true);
    }
    draggingRef.current = true;
    hasDraggedRef.current = false;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", endDrag);
  };

  const startResize = (e: React.MouseEvent) => {
    if (!floating || isMobile || !open) return;
    e.preventDefault();
    resizingRef.current = true;
    if (panelRef.current) panelRef.current.style.transition = "none";
    document.addEventListener("mousemove", onResize);
    document.addEventListener("mouseup", stopResize);
  };

  const onDrag = (e: MouseEvent) => {
    if (!draggingRef.current || !panelRef.current) return;
    hasDraggedRef.current = true;
    const panel = panelRef.current;
    const newX = e.clientX - dragOffsetRef.current.x;
    const newY = e.clientY - dragOffsetRef.current.y;
    const clampedX = Math.min(Math.max(0, newX), window.innerWidth - panel.offsetWidth);
    const clampedY = Math.min(Math.max(0, newY), window.innerHeight - panel.offsetHeight);
    setPosition({ x: clampedX, y: clampedY });
  };

  const onResize = (e: MouseEvent) => {
    if (!resizingRef.current || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    let newHeight = e.clientY - rect.top;
    const MIN_H = 280;
    const maxHeight = window.innerHeight - rect.top;
    newHeight = Math.min(maxHeight, Math.max(MIN_H, newHeight));
    setSize((prev) => ({ ...prev, height: newHeight }));
    setPosition((pos) => ({
      x: Math.max(0, Math.min(pos.x, window.innerWidth - rect.width)),
      y: Math.max(0, Math.min(pos.y, window.innerHeight - newHeight)),
    }));
  };

  const endDrag = () => {
    draggingRef.current = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", endDrag);
  };

  const stopResize = () => {
    resizingRef.current = false;
    if (panelRef.current) panelRef.current.style.transition = "";
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
  };

  const panelStyle: CSSVarStyle = isMobile
    ? { left: 0, right: 0, bottom: 0 }
    : floating
    ? {
        top: position.y,
        left: position.x,
        right: "auto",
        width: size.width,
        height: size.height,
        minWidth: 280,
        minHeight: open ? 280 : headerHeight,
      }
    : { ["--chat-panel-top"]: `${headerOffset}px`, height: dockedHeight ? `${dockedHeight}px` : undefined };

  return (
    <div
      ref={panelRef}
      className={`chat-panel ${open ? "open" : "closed"} ${floating ? "floating" : "docked"} ${isMobile ? "bottom" : ""}`}
      style={panelStyle}
      onClick={() => {
        if (hasDraggedRef.current) {
          hasDraggedRef.current = false;
          return;
        }
        if (!open) handleSetOpen(true);
      }}
    >
      <OrgMessagesThread
        orgId={orgId}
        open={open}
        setOpen={handleSetOpen}
        floating={floating}
        setFloating={handleSetFloating}
        startDrag={startDrag}
        onCloseChat={onCloseChat}
      />
      {floating && !isMobile && <div className="chat-panel-resizer" onMouseDown={startResize} />}
    </div>
  );
};

export default OrgChatPanel;
