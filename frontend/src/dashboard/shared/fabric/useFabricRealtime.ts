import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

type FabricRealtimeMessage =
  | { type: "hello"; connectionId: string }
  | { type: "synced"; version: number }
  | { type: "sync"; state: unknown; version: number; actorId?: string }
  | { type: "presence"; actorId: string; payload: Record<string, unknown> }
  | { type: "error"; message: string };

type SendableMessage =
  | { action: "join"; documentId: string; actorId: string }
  | { action: "sync"; documentId: string; actorId: string; version: number; state: unknown }
  | { action: "presence"; documentId: string; actorId: string; payload: Record<string, unknown> };

export interface UseFabricRealtimeOptions<TState> {
  /** Stable document identifier (e.g. project:page) */
  documentId?: string | null;
  /** Called when the server sends a new authoritative state */
  onRemoteState?: (state: TState, version: number) => void;
  /** Optional callback when a connection level error occurs */
  onError?: (message: string) => void;
  /** Called whenever presence payloads are received */
  onPresence?: (actorId: string, payload: Record<string, unknown>) => void;
  /** Optional actor identifier; generated if omitted */
  actorId?: string;
}

export interface UseFabricRealtimeValue<TState> {
  status: "disconnected" | "connecting" | "connected";
  actorId: string;
  lastSyncedVersion: number | null;
  sendState: (state: TState, version?: number) => void;
  sendPresence: (payload: Record<string, unknown>) => void;
}

const noop = () => {
  /* noop */
};

export const useFabricRealtime = <TState,>(
  options: UseFabricRealtimeOptions<TState>
): UseFabricRealtimeValue<TState> => {
  const { documentId, onRemoteState, onError, onPresence } = options;
  const actorId = useMemo(() => options.actorId ?? uuid(), [options.actorId]);
  const endpoint = useMemo(() => import.meta.env.VITE_FABRIC_REALTIME_ENDPOINT ?? "", []);

  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<UseFabricRealtimeValue<TState>["status"]>(
    "disconnected"
  );
  const [status, setStatus] = useState<UseFabricRealtimeValue<TState>["status"]>(
    "disconnected"
  );
  const lastVersionRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const updateStatus = useCallback(
    (next: UseFabricRealtimeValue<TState>["status"]) => {
      statusRef.current = next;
      setStatus(next);
    },
    []
  );

  const closeSocket = useCallback(() => {
    cleanupReconnectTimer();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }
    updateStatus("disconnected");
  }, [updateStatus]);

  useEffect(() => {
    if (!documentId || !endpoint) {
      closeSocket();
      return noop;
    }

    updateStatus("connecting");

    const socket = new WebSocket(`${endpoint}?documentId=${encodeURIComponent(documentId)}`);
    wsRef.current = socket;

    socket.addEventListener("open", () => {
      updateStatus("connected");
      const joinMessage: SendableMessage = {
        action: "join",
        documentId,
        actorId,
      };
      socket.send(JSON.stringify(joinMessage));
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as FabricRealtimeMessage;
        switch (payload.type) {
          case "sync":
            lastVersionRef.current = payload.version;
            onRemoteState?.(payload.state as TState, payload.version);
            break;
          case "synced":
            lastVersionRef.current = payload.version;
            break;
          case "presence":
            onPresence?.(payload.actorId, payload.payload);
            break;
          case "error":
            onError?.(payload.message);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("Failed to parse realtime payload", err);
      }
    });

    socket.addEventListener("error", (event) => {
      console.error("Fabric realtime socket error", event);
      onError?.("Realtime connection error");
    });

    socket.addEventListener("close", () => {
      updateStatus("disconnected");
      cleanupReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        if (statusRef.current !== "disconnected") return;
        if (!documentId) return;
        // Kick off a reconnect by simply resetting state; the effect reruns
        updateStatus("connecting");
      }, 1500);
    });

    return () => {
      cleanupReconnectTimer();
      socket.close();
    };
  }, [documentId, endpoint, actorId, onRemoteState, onError, onPresence, updateStatus, closeSocket]);

  const sendMessage = useCallback(
    (message: SendableMessage) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        console.error("Failed to send realtime payload", err);
      }
    },
    []
  );

  const sendState = useCallback(
    (state: TState, version = Date.now()) => {
      if (!documentId) return;
      const message: SendableMessage = {
        action: "sync",
        documentId,
        actorId,
        version,
        state,
      };
      lastVersionRef.current = version;
      sendMessage(message);
    },
    [actorId, documentId, sendMessage]
  );

  const sendPresence = useCallback(
    (payload: Record<string, unknown>) => {
      if (!documentId) return;
      const message: SendableMessage = {
        action: "presence",
        documentId,
        actorId,
        payload,
      };
      sendMessage(message);
    },
    [actorId, documentId, sendMessage]
  );

  return {
    status,
    actorId,
    lastSyncedVersion: lastVersionRef.current,
    sendState,
    sendPresence,
  };
};

export default useFabricRealtime;
