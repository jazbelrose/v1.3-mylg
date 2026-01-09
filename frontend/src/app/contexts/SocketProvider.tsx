// src/contexts/SocketProvider.tsx
import React, { createContext, useEffect, useState, useRef, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { useAuth } from "./useAuth";
import { useData } from "./useData";
import { useDMConversation } from "./useDMConversation";
import { WEBSOCKET_URL } from "@/shared/utils/api";
import { mergeAndDedupeMessages } from "@/shared/utils/messageUtils";
import { createSecureWebSocketConnection } from "@/shared/utils/secureWebSocketAuth";
import { logSecurityEvent } from "@/shared/utils/securityUtils";
import { normalizeDMConversationId } from "@/shared/utils/websocketUtils";
import type { SocketContextType } from "./SocketContextValue";

const SocketContext = createContext<SocketContextType>({ ws: null, isConnected: false });

export { SocketContext };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getBaseThumbnailUrl(thumb: unknown): string {
  if (typeof thumb !== "string") return "";
  const idx = thumb.indexOf("?");
  return idx === -1 ? thumb : thumb.substring(0, idx);
}

function getThumbnailTimestamp(thumb: unknown): number {
  if (typeof thumb !== "string") return 0;
  const base = getBaseThumbnailUrl(thumb);
  const match = base.match(/(\d{10,13})/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function pickNewerThumbnail(existing: unknown, incoming: unknown): unknown {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingTs = getThumbnailTimestamp(existing);
  const incomingTs = getThumbnailTimestamp(incoming);
  if (existingTs > 0 && incomingTs > 0) {
    return existingTs >= incomingTs ? existing : incoming;
  }

  const existingBase = getBaseThumbnailUrl(existing);
  const incomingBase = getBaseThumbnailUrl(incoming);
  if (existingBase && existingBase === incomingBase) {
    return existing;
  }

  return incoming;
}

function mergeSlides(existingSlides: unknown, incomingSlides: unknown): unknown {
  if (!Array.isArray(incomingSlides)) return existingSlides;
  const existingList = Array.isArray(existingSlides) ? existingSlides : [];

  const existingById = new Map<string, Record<string, unknown>>();
  for (const s of existingList) {
    if (!isRecord(s)) continue;
    const id = s.id;
    if (typeof id === "string") existingById.set(id, s);
  }

  let maxIncomingRev: number | null = null;
  let maxIncomingThumbRev: number | null = null;
  for (const s of incomingSlides) {
    if (!isRecord(s)) continue;
    const r = normalizeFiniteNumber(s.revision);
    const tr = normalizeFiniteNumber(s.thumbRevision);
    if (r !== null) maxIncomingRev = maxIncomingRev === null ? r : Math.max(maxIncomingRev, r);
    if (tr !== null) maxIncomingThumbRev = maxIncomingThumbRev === null ? tr : Math.max(maxIncomingThumbRev, tr);
  }

  const seen = new Set<string>();
  const merged: unknown[] = incomingSlides.map((incoming) => {
    if (!isRecord(incoming)) return incoming;
    const id = incoming.id;
    if (typeof id !== "string") return incoming;
    seen.add(id);

    const existing = existingById.get(id);
    if (!existing) return incoming;

    const existingRev = normalizeFiniteNumber(existing.revision);
    const incomingRev = normalizeFiniteNumber(incoming.revision);
    const base =
      incomingRev !== null && (existingRev === null || incomingRev >= existingRev) ? incoming : existing;

    const existingThumbRev = normalizeFiniteNumber(existing.thumbRevision);
    const incomingThumbRev = normalizeFiniteNumber(incoming.thumbRevision);

    if (incomingThumbRev !== null || existingThumbRev !== null) {
      if (incomingThumbRev !== null && (existingThumbRev === null || incomingThumbRev >= existingThumbRev)) {
        return base === incoming
          ? incoming
          : { ...base, thumbnail: incoming.thumbnail, thumbRevision: incoming.thumbRevision };
      }
      return base === existing
        ? existing
        : { ...base, thumbnail: existing.thumbnail, thumbRevision: existing.thumbRevision };
    }

    const chosenThumbnail = pickNewerThumbnail(existing.thumbnail, incoming.thumbnail);
    return { ...base, thumbnail: chosenThumbnail };
  });

  for (const existing of existingList) {
    if (!isRecord(existing)) continue;
    const id = existing.id;
    if (typeof id !== "string" || seen.has(id)) continue;

    if (maxIncomingRev === null && maxIncomingThumbRev === null) {
      merged.push(existing);
      continue;
    }

    const er = normalizeFiniteNumber(existing.revision) ?? -1;
    const etr = normalizeFiniteNumber(existing.thumbRevision) ?? -1;
    if ((maxIncomingRev !== null && er > maxIncomingRev) || (maxIncomingThumbRev !== null && etr > maxIncomingThumbRev)) {
      merged.push(existing);
    }
  }

  merged.sort((a, b) => {
    const ao = isRecord(a) ? normalizeFiniteNumber(a.order) ?? 0 : 0;
    const bo = isRecord(b) ? normalizeFiniteNumber(b.order) ?? 0 : 0;
    return ao - bo;
  });
  return merged;
}

function mergeProjectFields<T>(prev: T, fields: unknown, versionId?: unknown): T {
  if (!isRecord(fields)) return prev;
  if (versionId) {
    return prev;
  }
  if (!("slides" in fields)) {
    const base = (isRecord(prev) ? prev : {}) as Record<string, unknown>;
    return { ...base, ...fields } as T;
  }

  const base = (isRecord(prev) ? prev : {}) as Record<string, unknown>;
  const mergedSlides = mergeSlides(base.slides, fields.slides);
  const rest = { ...fields } as Record<string, unknown>;
  delete rest.slides;
  return { ...base, ...rest, slides: mergedSlides } as T;
}

export const SocketProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { getAuthTokens } = useAuth();
  const {
    setUserData,
    setInbox,
    userId,
    setProjects,
    setUserProjects,
    setActiveProject,
    setProjectMessages,
    deletedMessageIds,
    markMessageDeleted,
    activeProject,
    fetchProjects,
    fetchUserProfile,
    refreshUsers,
  } = useData();
  const { activeDmConversationId } = useDMConversation();

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // ---- refs
  const refreshUsersRef = useRef(refreshUsers);
  const fetchUserProfileRef = useRef(fetchUserProfile);
  const collaboratorsUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastPresence = useRef<Record<string, boolean>>({});

  const generateSessionId = useCallback(() => {
    if (typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function") {
      return (crypto as { randomUUID: () => string }).randomUUID();
    }
    return uuid();
  }, []);
  const sessionIdRef = useRef<string>(sessionStorage.getItem("ws_session_id") || generateSessionId());
  useEffect(() => {
    sessionStorage.setItem("ws_session_id", sessionIdRef.current);
  }, []);

  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);
  useEffect(() => {
    refreshUsersRef.current = refreshUsers;
  }, [refreshUsers]);
  useEffect(() => {
    fetchUserProfileRef.current = fetchUserProfile;
  }, [fetchUserProfile]);

  const scheduleCollaboratorsRefresh = useCallback(() => {
    if (collaboratorsUpdateTimeout.current) clearTimeout(collaboratorsUpdateTimeout.current);
    collaboratorsUpdateTimeout.current = setTimeout(() => {
      refreshUsersRef.current?.();
      fetchUserProfileRef.current?.();
      collaboratorsUpdateTimeout.current = null;
    }, 1000);
  }, []);

  const startReconnect = () => {
    if (reconnectInterval.current || wsRef.current) return;
    reconnectInterval.current = setInterval(() => {
      if (!wsRef.current) connectWebSocket();
    }, 5000);
  };
  const stopReconnect = () => {
    if (reconnectInterval.current) {
      clearInterval(reconnectInterval.current);
      reconnectInterval.current = null;
    }
  };

  const connectWebSocket = async () => {
    if (wsRef.current) return;

    try {
      const tokens = await getAuthTokens();
      if (!tokens?.idToken) {
        console.error("No ID token, cannot connect WebSocket.");
        startReconnect();
        return;
      }
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        console.error("No sessionId, cannot connect WebSocket.");
        startReconnect();
        return;
      }

      const socket = await createSecureWebSocketConnection(WEBSOCKET_URL, tokens.idToken, sessionId);

      socket.onopen = () => {
        setIsConnected(true);
        setWs(socket);
        wsRef.current = socket;
        stopReconnect();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Deduplicate presenceChanged events
          if (data.action === "presenceChanged" && data.userId && typeof data.online === "boolean") {
            const prev = lastPresence.current[data.userId];
            if (prev !== data.online) {
              lastPresence.current[data.userId] = data.online;
              // Update state/UI for presence change
              scheduleCollaboratorsRefresh();
            } else {
              // Ignore duplicate presence event
              return;
            }
          }

          // Add debug logging for incoming WS messages
          console.log("📩 Incoming WS message:", data);

          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ws-message", { detail: data }));
          }

          // ---- timeline updates
          if (data.action === "timelineUpdated" && data.projectId && Array.isArray(data.events)) {
            setProjects((prev) => prev.map((p) => (p.projectId === data.projectId ? { ...p, timelineEvents: data.events } : p)));
            setUserProjects((prev) => prev.map((p) => (p.projectId === data.projectId ? { ...p, timelineEvents: data.events } : p)));
            setActiveProject((prev) => (prev && prev.projectId === data.projectId ? { ...prev, timelineEvents: data.events } : prev));
            return;
          }

          // ---- project updates
          if (data.action === "projectUpdated" && data.projectId && data.fields && typeof data.fields === "object") {
            setProjects((prev) =>
              prev.map((p) =>
                p.projectId === data.projectId ? mergeProjectFields(p, data.fields, data.versionId) : p
              )
            );
            setUserProjects((prev) =>
              prev.map((p) =>
                p.projectId === data.projectId ? mergeProjectFields(p, data.fields, data.versionId) : p
              )
            );
            setActiveProject((prev) =>
              prev && prev.projectId === data.projectId ? mergeProjectFields(prev, data.fields, data.versionId) : prev
            );
            return;
          }

          // ---- gallery created
          if (data.action === "galleryCreated" && data.projectId && data.galleryId && data.name) {
            fetchProjects();
            return;
          }

          // ---- collaborator list updates
          if (data.type === "collaborators-updated") {
            scheduleCollaboratorsRefresh();
            return;
          }

          // ---- DM messages
          if (data.conversationType === "dm") {
            if (data.action === "sendMessage" || data.action === "newMessage") {
              if (deletedMessageIds.has(data.messageId) || deletedMessageIds.has(data.optimisticId)) return;
              const normalizedConversationId = normalizeDMConversationId(data.conversationId);
              const isSelf = data.senderId === userId;
              const viewing = activeDmConversationId === normalizedConversationId;

              setUserData((prev) => {
                if (!prev) return prev;
                const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
                const messageWithNormalizedId = { ...data, conversationId: normalizedConversationId };
                const merged = mergeAndDedupeMessages(prevMsgs, [{ ...messageWithNormalizedId, read: viewing || isSelf }]);
                return { ...prev, messages: merged };
              });

              setInbox((prev) => {
                const idx = prev.findIndex((t) => t.conversationId === normalizedConversationId);
                if (idx !== -1) {
                  const shouldBeRead = viewing || isSelf;
                  const updated = [...prev];
                  updated[idx] = {
                    ...updated[idx],
                    snippet: data.text,
                    lastMsgTs: data.timestamp,
                    read: shouldBeRead,
                  };
                  return updated;
                } else {
                  return [
                    ...prev,
                    {
                      conversationId: normalizedConversationId,
                      snippet: data.text,
                      lastMsgTs: data.timestamp,
                      read: viewing || isSelf,
                      otherUserId: isSelf ? data.recipientId : data.senderId,
                    },
                  ];
                }
              });
            } else if (data.action === "deleteMessage") {
              const normalizedConversationId = normalizeDMConversationId(data.conversationId);
              const viewing = activeDmConversationId === normalizedConversationId;
              markMessageDeleted(data.messageId || data.optimisticId);

              setUserData((prev) => {
                if (!prev) return prev;
                const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
                const updatedMsgs = prevMsgs.filter(
                  (m) =>
                    !(
                      (data.messageId && m.messageId === data.messageId) ||
                      (data.optimisticId && m.optimisticId === data.optimisticId)
                    )
                );

                const convoMsgs = updatedMsgs
                  .filter((m) => m.conversationId === normalizedConversationId)
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                const lastMsg = convoMsgs[0];
                const newSnippet = lastMsg?.text || "";
                const newTs = lastMsg?.timestamp || new Date().toISOString();

                setInbox((prevThreads) =>
                  prevThreads.map((t) =>
                    t.conversationId === normalizedConversationId
                      ? { ...t, snippet: newSnippet, lastMsgTs: newTs, read: viewing ? true : t.read }
                      : t
                  )
                );

                return { ...prev, messages: updatedMsgs };
              });
            } else if (data.action === "editMessage") {
              const normalizedConversationId = normalizeDMConversationId(data.conversationId);
              setUserData((prev) => {
                if (!prev) return prev;
                const msgs = Array.isArray(prev.messages) ? prev.messages : [];
                return {
                  ...prev,
                  messages: msgs.map((m) =>
                    m.messageId === data.messageId ? { ...m, text: data.text, edited: true, editedAt: data.editedAt } : m
                  ),
                };
              });
              setInbox((prev) =>
                prev.map((t) =>
                  t.conversationId === normalizedConversationId && t.lastMsgTs === data.timestamp
                    ? { ...t, snippet: data.text, lastMsgTs: data.timestamp }
                    : t
                )
              );
            } else if (data.action === "toggleReaction") {
              setUserData((prev) => {
                if (!prev) return prev;
                const msgs = Array.isArray(prev.messages) ? prev.messages : [];
                return { ...prev, messages: msgs.map((m) => (m.messageId === data.messageId ? { ...m, reactions: data.reactions } : m)) };
              });
            }
            return;
          }

          // ---- Project messages
          if (data.conversationType === "project") {
            const projectId = data.projectId || String(data.conversationId || "").replace("project#", "");
            if (!projectId) return;

            if (data.action === "sendMessage" || data.action === "newMessage") {
              if (deletedMessageIds.has(data.messageId) || deletedMessageIds.has(data.optimisticId)) return;
              setProjectMessages((prev) => {
                const msgs = Array.isArray(prev[projectId]) ? prev[projectId] : [];
                const merged = mergeAndDedupeMessages(msgs, [data]);
                return { ...prev, [projectId]: merged };
              });
            } else if (data.action === "deleteMessage") {
              markMessageDeleted(data.messageId || data.optimisticId);
              setProjectMessages((prev) => {
                const msgs = Array.isArray(prev[projectId]) ? prev[projectId] : [];
                return {
                  ...prev,
                  [projectId]: msgs.filter(
                    (m) =>
                      !(
                        (data.messageId && m.messageId === data.messageId) ||
                        (data.optimisticId && m.optimisticId === data.optimisticId)
                      )
                  ),
                };
              });
            } else if (data.action === "editMessage") {
              setProjectMessages((prev) => {
                const msgs = Array.isArray(prev[projectId]) ? prev[projectId] : [];
                return {
                  ...prev,
                  [projectId]: msgs.map((m) =>
                    m.messageId === data.messageId ? { ...m, text: data.text, edited: true, editedAt: data.editedAt } : m
                  ),
                };
              });
            } else if (data.action === "toggleReaction") {
              setProjectMessages((prev) => {
                const msgs = Array.isArray(prev[projectId]) ? prev[projectId] : [];
                return { ...prev, [projectId]: msgs.map((m) => (m.messageId === data.messageId ? { ...m, reactions: data.reactions } : m)) };
              });
            }
            return;
          }

          // ---- anything else
          // console.warn("⚠️ Unexpected message from server:", data);
        } catch {
          console.error("❌ Failed to parse WS message:", event.data);
        }
      };

      socket.onclose = (event) => {
        console.log("WS close", event.code, event.reason);
        setIsConnected(false);
        setWs(null);
        wsRef.current = null;
        startReconnect();
      };

      socket.onerror = (err: Event) => {
        console.error("Socket error:", err);
        logSecurityEvent("websocket_error", { error: "WebSocket error occurred" });
        if (socket.readyState === WebSocket.OPEN) socket.close();
        startReconnect();
      };
    } catch (error: unknown) {
      console.error("Error establishing secure WebSocket connection:", error);
      logSecurityEvent("secure_websocket_connection_error", { error: error instanceof Error ? error.message : String(error) });
      startReconnect();
    }
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      stopReconnect();
      const socket = wsRef.current;
      if (socket) {
        socket.close();
        setWs(null);
        wsRef.current = null;
      }
      if (collaboratorsUpdateTimeout.current) clearTimeout(collaboratorsUpdateTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthTokens]);

 

  // notify server which project is active (kept as-is; unrelated to presence)
  useEffect(() => {
    if (!ws || !activeProject?.projectId) return;
    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${activeProject.projectId}`,
    });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    } else {
      const handleOpen = () => {
        ws.send(payload);
        ws.removeEventListener("open", handleOpen);
      };
      ws.addEventListener("open", handleOpen);
      return () => ws.removeEventListener("open", handleOpen);
    }
  }, [ws, activeProject?.projectId]);

  return <SocketContext.Provider value={{ ws, isConnected }}>{children}</SocketContext.Provider>;
};









