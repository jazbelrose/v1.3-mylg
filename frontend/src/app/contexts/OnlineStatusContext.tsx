/* eslint-disable react-refresh/only-export-components */
// src/contexts/OnlineStatusContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "./useSocket";

type OnlineCtx = {
  onlineUsers: string[];
  isOnline: (userId?: string | number | null) => boolean;
};

type PresenceMessage = {
  action?: string;
  userIds?: Array<string | number>;
  userId?: string | number;
  online?: boolean;
};

const OnlineStatusContext = createContext<OnlineCtx | undefined>(undefined);

export const useOnlineStatus = () => {
  const ctx = useContext(OnlineStatusContext);
  if (!ctx) throw new Error("useOnlineStatus must be used within OnlineStatusProvider");
  return ctx;
};

export const OnlineStatusProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { ws, isConnected } = useSocket();
  const usersRef = useRef<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!ws) return;

    // Ask the server for a fresh snapshot once the connection is ready.
    const sendLookup = () => {
      try {
        ws.send(JSON.stringify({ action: "presenceLookup" }));
      } catch {
        // Ignore send errors - connection might be closed
      }
    };
    if (ws.readyState === WebSocket.OPEN) sendLookup();
    else ws.addEventListener("open", sendLookup, { once: true });

    const onMessage = (e: MessageEvent) => {
      let data: PresenceMessage;
      try {
        data = JSON.parse(e.data) as PresenceMessage;
      } catch {
        return;
      }

      if (data?.action === "presenceSnapshot" && Array.isArray(data?.userIds)) {
        const s = new Set(
          (data.userIds as Array<string | number>).map((u) => String(u))
        );
        usersRef.current = s;
        setOnlineUsers(Array.from(s));
        return;
      }

      if (data?.action !== "presenceChanged" || !data?.userId) return;

      const id = String(data.userId);
      const s = new Set(usersRef.current);
      if (data.online) {
        s.add(id);
      } else {
        s.delete(id);
      }

      // update only if the set really changed
      if (s.size !== usersRef.current.size || s.has(id) !== usersRef.current.has(id)) {
        usersRef.current = s;
        setOnlineUsers(Array.from(s));
      }
    };

    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [ws]);

  useEffect(() => {
    if (!isConnected) {
      usersRef.current = new Set();
      setOnlineUsers([]);
    }
  }, [isConnected]);

  const value = useMemo<OnlineCtx>(
    () => ({
      onlineUsers,
      isOnline: (userId?: string | number | null) =>
        userId !== null && userId !== undefined && usersRef.current.has(String(userId)),
    }),
    [onlineUsers]
  );

  return (
    <OnlineStatusContext.Provider value={value}>
      {children}
    </OnlineStatusContext.Provider>
  );
};









