// src/app/contexts/MessagesProvider.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  PropsWithChildren,
} from "react";
import { useAuth } from "./useAuth";
import { MESSAGES_INBOX_URL, apiFetch } from "../../shared/utils/api";
import { getWithTTL, setWithTTL, DEFAULT_TTL } from "../../shared/utils/storageWithTTL";
import { MessagesContext } from "./MessagesContext";
import type { MessagesValue, ProjectMessagesMap } from "./MessagesContextValue";
import type { Thread, Message } from "./DataProvider";
import { getDevPreviewData, isPreviewModeEnabled, subscribeToPreviewMode } from "@/shared/utils/devPreview";

const PreviewMessagesProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const preview = getDevPreviewData();
  const [projectMessages, setProjectMessages] = useState<ProjectMessagesMap>(preview.projectMessages);
  const [inbox, setInbox] = useState<Thread[]>(preview.inbox);
  const deletedMessageIds = useRef<Set<string>>(new Set());

  const markMessageDeleted = (id?: string) => {
    if (id) deletedMessageIds.current.add(id);
  };

  const clearDeletedMessageId = (id?: string) => {
    if (id) deletedMessageIds.current.delete(id);
  };

  const toggleReaction = (
    msgId: string,
    emoji: string,
    reactorId: string,
  ) => {
    if (!msgId || !emoji || !reactorId) return;

    setProjectMessages((prev) => {
      const updated: ProjectMessagesMap = {};
      Object.entries(prev).forEach(([projectId, messages]) => {
        updated[projectId] = messages.map((message) => {
          if ((message.messageId || message.optimisticId) !== msgId) return message;
          const reactions = { ...(message.reactions || {}) };
          const users = new Set(reactions[emoji] || []);
          if (users.has(reactorId)) {
            users.delete(reactorId);
          } else {
            users.add(reactorId);
          }
          reactions[emoji] = Array.from(users);
          return { ...message, reactions };
        });
      });
      return updated;
    });
  };

  const value: MessagesValue = {
    inbox,
    setInbox,
    projectMessages,
    setProjectMessages,
    deletedMessageIds: deletedMessageIds.current,
    markMessageDeleted,
    clearDeletedMessageId,
    toggleReaction,
  };

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
};

const NormalMessagesProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { userId } = useAuth();

  const [projectMessages, setProjectMessages] = useState<ProjectMessagesMap>({});
  const [inbox, setInbox] = useState<Thread[]>(() => {
    const stored = getWithTTL("inbox");
    return Array.isArray(stored) ? (stored as Thread[]) : [];
  });

  const deletedMessageIdsRef = useRef<Set<string>>(new Set());

  const markMessageDeleted = (id?: string) => {
    if (id) deletedMessageIdsRef.current.add(id);
  };

  const clearDeletedMessageId = (id?: string) => {
    if (id) deletedMessageIdsRef.current.delete(id);
  };

  const toggleReaction = (
    msgId: string,
    emoji: string,
    reactorId: string,
    conversationId: string,
    conversationType: "dm" | "project",
    ws?: WebSocket
  ) => {
    if (!msgId || !emoji || !reactorId) return;

    const updateArr = (arr: Message[] = []) =>
      arr.map((m) => {
        const id = m.messageId || m.optimisticId;
        if (id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = new Set(reactions[emoji] || []);
        if (users.has(reactorId)) {
          users.delete(reactorId);
        } else {
          users.add(reactorId);
        }
        reactions[emoji] = Array.from(users);
        return { ...m, reactions };
      });

    setProjectMessages((prev) => {
      const updated: ProjectMessagesMap = {};
      for (const pid of Object.keys(prev)) {
        const msgs = Array.isArray(prev[pid]) ? prev[pid] : [];
        updated[pid] = updateArr(msgs);
      }
      return updated;
    });

    if (ws && ws.readyState === WebSocket.OPEN && conversationId && conversationType) {
      ws.send(
        JSON.stringify({
          action: "toggleReaction",
          conversationType,
          conversationId,
          messageId: msgId,
          emoji,
          userId: reactorId,
        })
      );
    }
  };

  // Persist inbox threads
  useEffect(() => {
    setWithTTL("inbox", inbox, DEFAULT_TTL);
  }, [inbox]);

  // Load inbox threads
  useEffect(() => {
    if (!userId) return;
    const fetchThreads = async () => {
      try {
        const data = await apiFetch<Thread[] | { inbox?: Thread[] } | unknown>(
          `${MESSAGES_INBOX_URL}?userId=${encodeURIComponent(userId)}`
        );
        const threads = Array.isArray(data)
          ? data
          : (data as { inbox?: Thread[] })?.inbox || [];
        setInbox(threads as Thread[]);
      } catch (err) {
        console.error("Failed to fetch threads", err);
      }
    };
    fetchThreads();
  }, [userId]);

  const messagesValue = useMemo<MessagesValue>(
    () => ({
      inbox,
      setInbox,
      projectMessages,
      setProjectMessages,
      deletedMessageIds: deletedMessageIdsRef.current,
      markMessageDeleted,
      clearDeletedMessageId,
      toggleReaction,
    }),
    [inbox, projectMessages]
  );

  return (
    <MessagesContext.Provider value={messagesValue}>
      {children}
    </MessagesContext.Provider>
  );
};

export const MessagesProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [previewMode, setPreviewMode] = useState<boolean>(() => isPreviewModeEnabled());

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return subscribeToPreviewMode(() => {
      setPreviewMode(isPreviewModeEnabled());
    });
  }, []);

  if (previewMode) {
    return <PreviewMessagesProvider>{children}</PreviewMessagesProvider>;
  }

  return <NormalMessagesProvider>{children}</NormalMessagesProvider>;
};








