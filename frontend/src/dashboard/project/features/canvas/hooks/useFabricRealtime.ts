import { useCallback, useEffect, useRef, useState } from "react";
import { FABRIC_WS_URL } from "@/config/fabric";
import type { FabricRealtimeMessage, FabricSnapshot } from "../types";

export interface UseFabricRealtimeOptions {
  documentId: string;
  projectId: string;
  pageId: string;
  userId?: string;
  onRemoteSnapshot: (snapshot: FabricSnapshot, revision: number) => void;
}

export interface UseFabricRealtimeResult {
  status: "connecting" | "open" | "closed" | "error";
  revision: number;
  sendSnapshot: (snapshot: FabricSnapshot) => void;
  sendPresence: (presence: { x: number; y: number; color?: string }) => void;
  lastError: Error | null;
}

const HEARTBEAT_INTERVAL = 25_000;

export const useFabricRealtime = ({
  documentId,
  projectId,
  pageId,
  userId,
  onRemoteSnapshot,
}: UseFabricRealtimeOptions): UseFabricRealtimeResult => {
  const [status, setStatus] = useState<UseFabricRealtimeResult["status"]>("connecting");
  const [revision, setRevision] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const generateClientId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `fabric-${Math.random().toString(36).slice(2, 10)}`;
  };
  const clientIdRef = useRef<string>(generateClientId());

  useEffect(() => {
    const params = new URLSearchParams({
      projectId,
      pageId,
      documentId,
      actorId: clientIdRef.current,
    });
    if (userId) params.set("userId", userId);

    const socket = new WebSocket(`${FABRIC_WS_URL.replace(/\/$/, "")}?${params.toString()}`);
    wsRef.current = socket;

    const sendHeartbeat = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "ping",
            documentId,
            actorId: clientIdRef.current,
          })
        );
      }
    };

    const heartbeat = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    heartbeatRef.current = heartbeat;

    socket.onopen = () => {
      setStatus("open");
      setLastError(null);
    };

    socket.onclose = () => {
      setStatus("closed");
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };

    socket.onerror = event => {
      console.error("Fabric realtime error", event);
      setStatus("error");
      setLastError(new Error("Fabric realtime connection failed"));
    };

    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as FabricRealtimeMessage;
        if (message.type === "update" && message.documentId === documentId) {
          if (message.actorId === clientIdRef.current) return;
          onRemoteSnapshot(message.snapshot, message.revision);
          setRevision(message.revision);
        } else if (message.type === "init" && message.documentId === documentId) {
          if (message.snapshot) {
            onRemoteSnapshot(message.snapshot, message.revision);
          }
          setRevision(message.revision);
        } else if (message.type === "ack" && message.documentId === documentId) {
          setRevision(message.revision);
        } else if (message.type === "error") {
          setLastError(new Error(message.message));
        }
      } catch (err) {
        console.error("Failed to parse realtime payload", err);
      }
    };

    return () => {
      socket.close();
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, [documentId, pageId, projectId, userId, onRemoteSnapshot]);

  const sendSnapshot = useCallback(
    (snapshot: FabricSnapshot) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "sync",
          documentId,
          projectId,
          pageId,
          actorId: clientIdRef.current,
          snapshot,
        })
      );
    },
    [documentId, pageId, projectId]
  );

  const sendPresence = useCallback(
    (presence: { x: number; y: number; color?: string }) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "presence",
          documentId,
          projectId,
          pageId,
          actorId: clientIdRef.current,
          userId,
          ...presence,
        })
      );
    },
    [documentId, pageId, projectId, userId]
  );

  return { status, revision, sendSnapshot, sendPresence, lastError };
};
