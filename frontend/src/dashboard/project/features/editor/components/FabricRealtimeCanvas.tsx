import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import DesignerComponent, {
  type DesignerRef,
} from "@/dashboard/project/features/editor/components/canvas/designercomponent";
import { useAuth } from "@/app/contexts/useAuth";
import { createSecureWebSocketConnection } from "@/shared/utils/secureWebSocketAuth";
import { notify } from "@/shared/ui/ToastNotifications";
import { DECK_REALTIME_WS_URL } from "@/shared/utils/api";
import styles from "./FabricRealtimeCanvas.module.css";

export interface RealtimeDesignerHandle extends DesignerRef {
  getCanvasJson: () => string | null;
  loadCanvasJson: (json: string, options?: { silent?: boolean }) => void;
}

interface FabricRealtimeCanvasProps {
  projectId?: string;
  pageId?: string;
  pageName?: string;
}

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

type DesignerInstance = DesignerRef & {
  getCanvasJson?: () => string | null;
  loadCanvasJson?: (json: string, options?: { silent?: boolean }) => void;
};

const randomId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Math.random().toString(36).slice(2)}`;
};

const FabricRealtimeCanvas = forwardRef<RealtimeDesignerHandle, FabricRealtimeCanvasProps>(
  ({ projectId, pageId, pageName }, ref) => {
    const { getAuthTokens } = useAuth();
    const designerRef = useRef<DesignerInstance | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestStateRef = useRef<Map<string, string>>(new Map());
    const pendingPatchRef = useRef<string | null>(null);
    const joinRequestedRef = useRef(false);
    const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
    const sessionIdRef = useRef(randomId());

    const websocketUrl = useMemo(() => (DECK_REALTIME_WS_URL || "").trim(), []);

    const cleanupSocket = useCallback(() => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      const socket = wsRef.current;
      if (socket) {
        try {
          socket.onclose = null;
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
          }
        } catch (error) {
          console.warn("Error during websocket cleanup", error);
        }
      }
      wsRef.current = null;
    }, []);

    const scheduleReconnect = useCallback((attempt?: () => void) => {
      if (reconnectTimeout.current) return;
      reconnectTimeout.current = setTimeout(() => {
        reconnectTimeout.current = null;
        joinRequestedRef.current = false;
        attempt?.();
      }, 2000);
    }, []);

    const sendPayload = useCallback(
      (payload: Record<string, unknown>) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          pendingPatchRef.current = JSON.stringify(payload);
          return;
        }
        try {
          socket.send(JSON.stringify(payload));
        } catch (error) {
          console.error("Failed to send realtime payload", error);
          pendingPatchRef.current = JSON.stringify(payload);
        }
      },
      []
    );

    const joinDeck = useCallback(() => {
      if (!projectId || !pageId) return;
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      sendPayload({
        action: "joinDeck",
        projectId,
        pageId,
        pageName,
      });
      joinRequestedRef.current = true;
      const existingState = latestStateRef.current.get(pageId);
      if (existingState) {
        sendPayload({ action: "deckPatch", projectId, pageId, state: existingState });
      }
    }, [pageId, pageName, projectId, sendPayload]);

    const applyRemoteState = useCallback(
      (state: string | null, sourcePageId?: string) => {
        const targetPageId = sourcePageId ?? pageId;
        if (!targetPageId) return;

        if (state == null) {
          latestStateRef.current.delete(targetPageId);
          if (targetPageId === pageId) {
            designerRef.current?.handleClear?.();
          }
          return;
        }

        latestStateRef.current.set(targetPageId, state);

        if (targetPageId === pageId) {
          designerRef.current?.loadCanvasJson?.(state, { silent: true });
        }
      },
      [pageId]
    );

    const handleLocalChange = useCallback(
      (state: string) => {
        if (!pageId) return;
        latestStateRef.current.set(pageId, state);
        if (!projectId) return;
        sendPayload({ action: "deckPatch", projectId, pageId, state });
      },
      [pageId, projectId, sendPayload]
    );

    useEffect(() => {
      if (!pageId) {
        designerRef.current?.handleClear?.();
        return;
      }

      const storedState = latestStateRef.current.get(pageId);
      if (storedState) {
        designerRef.current?.loadCanvasJson?.(storedState, { silent: true });
      } else {
        designerRef.current?.handleClear?.();
      }
    }, [pageId]);

    const connectSocket = useCallback(async () => {
      if (!websocketUrl || !projectId || !pageId) {
        setConnectionState("disconnected");
        return;
      }
      if (wsRef.current) {
        joinDeck();
        return;
      }
      setConnectionState("connecting");
      try {
        const tokens = await getAuthTokens();
        const idToken = tokens?.idToken?.toString();
        if (!idToken) {
          throw new Error("Missing ID token for realtime deck connection");
        }
        const socket = await createSecureWebSocketConnection(
          websocketUrl,
          idToken,
          sessionIdRef.current
        );
        wsRef.current = socket;

        socket.onopen = () => {
          setConnectionState("connected");
          joinDeck();
          if (pendingPatchRef.current) {
            try {
              socket.send(pendingPatchRef.current);
              pendingPatchRef.current = null;
            } catch (error) {
              console.warn("Failed to flush pending patch", error);
            }
          }
        };

        socket.onerror = (error) => {
          console.error("Realtime deck socket error", error);
          setConnectionState("error");
        };

        socket.onclose = () => {
          setConnectionState("disconnected");
          cleanupSocket();
          scheduleReconnect(() => {
            if (projectId && pageId) {
              connectSocket();
            }
          });
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === "deckState" && data.state !== undefined) {
              const normalized =
                typeof data.state === "string" ? data.state : JSON.stringify(data.state);
              applyRemoteState(normalized, data.pageId as string | undefined);
              return;
            }
            if (data.action === "deckPatch" && data.state !== undefined) {
              const normalized =
                typeof data.state === "string" ? data.state : JSON.stringify(data.state);
              applyRemoteState(normalized, data.pageId as string | undefined);
            }
          } catch (error) {
            console.error("Failed to parse realtime deck payload", error);
          }
        };
      } catch (error) {
        console.error("Failed to open realtime deck socket", error);
        setConnectionState("error");
        scheduleReconnect(() => {
          if (projectId && pageId) {
            connectSocket();
          }
        });
      }
    }, [
      applyRemoteState,
      cleanupSocket,
      getAuthTokens,
      joinDeck,
      pageId,
      projectId,
      scheduleReconnect,
      websocketUrl,
    ]);

    useEffect(() => {
      if (!projectId || !pageId) {
        cleanupSocket();
        setConnectionState("disconnected");
        return;
      }
      connectSocket();
      return () => {
        cleanupSocket();
      };
    }, [cleanupSocket, connectSocket, pageId, projectId]);

    useEffect(() => {
      if (!projectId || !pageId) return;
      if ((connectionState === "disconnected" || connectionState === "error") && !reconnectTimeout.current) {
        connectSocket();
      }
    }, [connectSocket, connectionState, pageId, projectId]);

    const connectionLabel = useMemo(() => {
      switch (connectionState) {
        case "connected":
          return "Live";
        case "connecting":
          return "Connecting";
        case "error":
          return "Retrying";
        case "disconnected":
          return "Offline";
        default:
          return "Idle";
      }
    }, [connectionState]);

    useImperativeHandle(
      ref,
      () => ({
        changeMode: (...args) => designerRef.current?.changeMode?.(...args),
        addText: (...args) => designerRef.current?.addText?.(...args),
        triggerImageUpload: (...args) => designerRef.current?.triggerImageUpload?.(...args),
        handleColorChange: (...args) => designerRef.current?.handleColorChange?.(...args),
        handleUndo: (...args) => designerRef.current?.handleUndo?.(...args),
        handleRedo: (...args) => designerRef.current?.handleRedo?.(...args),
        handleCopy: (...args) => designerRef.current?.handleCopy?.(...args),
        handlePaste: (...args) => designerRef.current?.handlePaste?.(...args),
        handleDelete: (...args) => designerRef.current?.handleDelete?.(...args),
        handleClear: (...args) => designerRef.current?.handleClear?.(...args),
        handleSave: (...args) => designerRef.current?.handleSave?.(...args),
        getCanvasJson: () => designerRef.current?.getCanvasJson?.() ?? null,
        loadCanvasJson: (json, options) => designerRef.current?.loadCanvasJson?.(json, options),
      }),
      []
    );

    return (
      <div className={styles.canvasShell}>
        <div className={styles.statusBar}>
          <span>Fabric canvas</span>
          <span className={styles.connectionHint}>{pageName}</span>
          <span className={styles.statusPill} data-state={connectionState}>
            {connectionLabel}
          </span>
        </div>
        <div className={styles.canvasBody}>
          <DesignerComponent
            ref={(instance) => {
              designerRef.current = instance as DesignerInstance;
            }}
            loadFromLegacyApi={false}
            onCanvasChange={handleLocalChange}
            onSave={(json) => {
              if (!projectId || !pageId) {
                notify("warning", "Connect project to sync changes.");
                return;
              }
              sendPayload({ action: "deckSave", projectId, pageId, state: json });
              notify("success", "Deck saved to realtime storage.");
            }}
          />
        </div>
      </div>
    );
  }
);

FabricRealtimeCanvas.displayName = "FabricRealtimeCanvas";

export default FabricRealtimeCanvas;
