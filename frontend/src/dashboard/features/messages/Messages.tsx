// src/pages/dashboard/features/messages.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { Thread } from "@/app/contexts/DataProvider";
import { useAuth } from "@/app/contexts/useAuth";
import { useDMConversation } from "@/app/contexts/useDMConversation";
import { useSocket } from "@/app/contexts/useSocket";
import {
  dedupeById,
  mergeAndDedupeMessages,
  DMMessage,
  DMFile,
} from "@/shared/utils/messageUtils";
import User from "@/assets/svg/user.svg?react";
import { normalizeMessage, normalizeDMConversationId } from "@/shared/utils/websocketUtils";
import { getWithTTL, setWithTTL } from "@/shared/utils/storageWithTTL";
import { uploadData } from "aws-amplify/storage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faDownload } from "@fortawesome/free-solid-svg-icons";
import Modal from "@/shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import PromptModal from "@/shared/ui/PromptModal";
import { slugify, findUserBySlug } from "@/shared/utils/slug";
import {
  MESSAGES_THREADS_URL,
  apiFetch,
  getFileUrl,
  normalizeFileUrl,
  fileUrlsToKeys,
} from "@/shared/utils/api";
import { getFileNameFromUrl } from "@/shared/utils/fileUtils";
import { ChatMessage } from "@/dashboard/features/messages/MessageItem";
import ConversationSidebar from "./components/ConversationSidebar";
import ChatWindow from "./components/ChatWindow";
import { MessagesProps, AppUser } from "./types";
import { FOLDER_KEY, getCacheKey, MAX_RETRY_ATTEMPTS, FILE_UPLOAD_DELAY } from "./constants";
import { getUserDisplayName, getUserThumbnail } from "./utils/userHelpers";
import { renderFilePreview } from "./utils/filePreview";
import "@/dashboard/features/messages/project-messages-thread.css";

// Helper function to sanitize conversationId for file keys (replace # with _)
const sanitizeConversationIdForFileKey = (conversationId: string): string => {
  return conversationId.replace(/#/g, "_");
};

// Accessibility binding
if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const Messages: React.FC<MessagesProps> = ({ initialUserSlug = null }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth() as { isAuthenticated: boolean };

  const {
    userData,
    allUsers,
    isAdmin,
    setUserData,
    setDmReadStatus,
    setInbox,
    deletedMessageIds,
    markMessageDeleted,
    toggleReaction,
    inbox,
  } = useData() as unknown as {
    userData: AppUser;
    allUsers: AppUser[];
    isAdmin: boolean;
    inbox: Thread[];
    setUserData: React.Dispatch<React.SetStateAction<AppUser>>;
    setInbox: React.Dispatch<React.SetStateAction<Thread[]>>;
    setDmReadStatus: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    deletedMessageIds: Set<string>;
    markMessageDeleted: (id: string) => void;
    toggleReaction: (
      messageId: string,
      emoji: string,
      userId: string,
      conversationId: string,
      type: "dm",
      ws?: WebSocket | null
    ) => void;
  };

  const { setActiveDmConversationId } = useDMConversation() as {
    setActiveDmConversationId: (id: string | null) => void;
  };

  // now available after adding the import above
  const { ws } = useSocket() as { ws: WebSocket | null };

  const isCurrentUserAdmin = isAdmin;

  const [isMobile, setIsMobile] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    if (typeof window !== "undefined") {
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  // Logging for debugging: component mount/unmount
  useEffect(() => {
    console.log("[Messages] mounted", { initialUserSlug, userId: userData?.userId });
    return () => {
      console.log("[Messages] unmounted");
    };
  }, [initialUserSlug, userData?.userId]);

  // map for unread badge
  const threadMap = useMemo<Record<string, boolean>>(
    () =>
      inbox.reduce((acc, t) => {
        acc[t.conversationId] = t.read === false;
        return acc;
      }, {} as Record<string, boolean>),
    [inbox]
  );

  // Local state
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPreviewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<DMFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DMMessage | null>(null);
  const [editTarget, setEditTarget] = useState<DMMessage | null>(null);

  const messages = useMemo(() => {
    if (!selectedConversation) return [];
    const all = Array.isArray(userData?.messages) ? userData.messages! : [];
    const convMsgs = all.filter((m): m is DMMessage => !!m.conversationId && m.conversationId === selectedConversation);
    const filtered = convMsgs.filter(
      (m) =>
        !(
          deletedMessageIds.has(m.messageId || "") ||
          deletedMessageIds.has(m.optimisticId || "")
        )
    );
    return dedupeById(
      filtered.map((m) => ({ ...m, read: true } as DMMessage))
    ).sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  }, [userData, selectedConversation, deletedMessageIds]);

  // Normalize: prefer explicit attachments; keep legacy `file` fallback
  const displayMessages = useMemo(() => {
    return messages.map((m) => {
      if (!m.file && Array.isArray(m.attachments) && m.attachments.length) {
        const a = m.attachments[0];
        const url = a.url || (a.key ? getFileUrl(a.key) : "");
        return {
          ...m,
          file: {
            fileName: a.fileName || a.name || getFileNameFromUrl(url),
            url,
          },
        } as DMMessage;
      }
      return m;
    });
  }, [messages]);

  const persistReadStatus = useCallback((conversationId: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      action: "markRead",
      conversationType: "dm",
      conversationId,
      userId: userData.userId,
      read: true,
      lastMsgTs: new Date().toISOString(),
    };

    ws.send(JSON.stringify(payload));
  }, [userData.userId, ws]);

  const markConversationAsRead = useCallback((conversationId: string) => {
    setUserData((prev) => {
      if (!prev || !Array.isArray(prev.messages)) return prev;
      const updated = prev.messages.map((m) =>
        m.conversationId === conversationId ? { ...m, read: true } : m
      );
      return { ...(prev as AppUser), messages: updated };
    });
    setDmReadStatus((prev) => ({
      ...prev,
      [conversationId]: new Date().toISOString(),
    }));
    persistReadStatus(conversationId);
  }, [setUserData, setDmReadStatus, persistReadStatus]);

  const handleMarkRead = (conversationId: string | null) => {
    if (!conversationId) return;
    setInbox((prev) =>
      prev.map((t) => (t.conversationId === conversationId ? { ...t, read: true } : t))
    );
    markConversationAsRead(conversationId);
  };

  // Filter who you can DM
  const filteredDMUsers = useMemo(
    () =>
      allUsers
        .filter((u) => {
          if (u.userId === userData.userId) return false;
          if (isCurrentUserAdmin) return true;
          return (
            (userData.collaborators && userData.collaborators.includes(u.userId)) ||
            ((u.role || "").toLowerCase() === "admin")
          );
        })
        .filter((u, index, arr) => arr.findIndex((user) => user.userId === u.userId) === index), // Deduplicate by userId
    [allUsers, userData, isCurrentUserAdmin]
  );

  const selectedConversationRef = useRef<string | null>(selectedConversation);
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    setActiveDmConversationId(selectedConversation);
    return () => setActiveDmConversationId(null);
  }, [selectedConversation, setActiveDmConversationId]);

  // Navigate to initial user (slug) if provided
  useEffect(() => {
    if (initialUserSlug && userData) {
      // Attempt to resolve the slug to a user either by slugified name or by raw userId
      let user = findUserBySlug(allUsers, initialUserSlug);
      if (!user) {
        user = allUsers.find((u) => u.userId === initialUserSlug);
      }

      if (user) {
        const sortedIds = [userData.userId, user.userId].sort();
        const conversationId = `dm#${sortedIds.join("___")}`;
        setSelectedConversation(conversationId);
        if (isMobile) setShowConversation(true);
      }
    }
  }, [initialUserSlug, userData, allUsers, isMobile]);

  // Inform server about active conversation
  useEffect(() => {
    if (!ws || !selectedConversation) return;
    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: selectedConversation,
    });
    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        const onOpen = () => {
          ws.send(payload);
          ws.removeEventListener("open", onOpen);
        };
        ws.addEventListener("open", onOpen);
      }
    };
    sendWhenReady();
  }, [ws, selectedConversation]);

  // Fetch messages on conversation change (resilient apiFetch)
  useEffect(() => {
    if (!selectedConversation || !isAuthenticated) {
      if (!selectedConversation) setIsLoading(false);
      return;
    }

    const cached = getWithTTL(getCacheKey(selectedConversation));
    if (cached) {
      setUserData((prev) => {
        const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
        const others = prevMsgs.filter((m) => m.conversationId !== selectedConversation);
        return { ...prev, messages: dedupeById([...others, ...(cached as DMMessage[])]) };
      });
    }

const fetchMessages = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await apiFetch<
          DMMessage[] | { messages?: DMMessage[] } | { Items?: DMMessage[] } | { items?: DMMessage[] }
        >(
          `${MESSAGES_THREADS_URL}/${encodeURIComponent(selectedConversation)}/messages`
        );

        const arr = Array.isArray(data)
          ? data
          : Array.isArray((data as { messages?: DMMessage[] }).messages)
          ? (data as { messages?: DMMessage[] }).messages!
          : Array.isArray((data as { Items?: DMMessage[] }).Items)
          ? (data as { Items?: DMMessage[] }).Items!
          : Array.isArray((data as { items?: DMMessage[] }).items)
          ? (data as { items?: DMMessage[] }).items!
          : [];

        if (!Array.isArray(arr)) {
          console.warn("Unexpected DM payload:", data);
          return;
        }

        const readData = arr
          .filter(
            (m) =>
              !(
                deletedMessageIds.has(m.messageId || "") ||
                deletedMessageIds.has(m.optimisticId || "")
              )
          )
          .map((m) => ({ ...m, read: true }));
        const uniqueData = dedupeById(readData);
        setWithTTL(getCacheKey(selectedConversation), uniqueData);

        setUserData((prev) => {
          const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
          const others = prevMsgs.filter((m) => m.conversationId !== selectedConversation);
          const merged = mergeAndDedupeMessages(others, uniqueData);
          return { ...prev, messages: merged };
        });

        markConversationAsRead(selectedConversation);
      } catch (error) {
        console.error("Error fetching messages:", error);
        setErrorMessage("Failed to load messages.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [selectedConversation, isAuthenticated, deletedMessageIds, setUserData, markConversationAsRead]);

  // Scroll management
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initialScrollRef = useRef(true);

  useEffect(() => {
    if (initialScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      initialScrollRef.current = false;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayMessages]);

  useEffect(() => {
    initialScrollRef.current = true;
  }, [selectedConversation]);

  // persist cache on change
  useEffect(() => {
    if (selectedConversation) {
      setWithTTL(getCacheKey(selectedConversation), messages);
    }
  }, [messages, selectedConversation]);

  // keep input visible on resize
  useEffect(() => {
    const handleResize = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Send message (optimistic)
  const sendMessage = () => {
    if (!selectedConversation || !newMessage.trim()) return;

    const timestamp = new Date().toISOString();
    const optimisticId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const normalizedConversationId = normalizeDMConversationId(selectedConversation);

    const messageData = {
      action: "sendMessage",
      conversationType: "dm",
      conversationId: normalizedConversationId,
      senderId: userData?.userId,
      text: newMessage,
      timestamp,
      optimisticId,
    };

    const optimisticMessage: DMMessage = {
      conversationId: normalizedConversationId,
      senderId: userData?.userId || "",
      text: newMessage,
      timestamp,
      optimisticId,
      optimistic: true,
    };

    setUserData((prev) => {
      const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
      return {
        ...prev,
        messages: mergeAndDedupeMessages(prevMsgs, [optimisticMessage]),
      };
    });

    const maxAttempts = MAX_RETRY_ATTEMPTS;
    const trySendMessage = (attempts = 0) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          try {
            ws.close();
          } catch {
            // Ignore errors when closing WebSocket
          }
        }
        if (attempts < maxAttempts) {
          setTimeout(() => trySendMessage(attempts + 1), 1000);
        } else {
          console.error("Failed to send message: WebSocket did not open.");
        }
        return;
      }

      try {
        ws.send(JSON.stringify(normalizeMessage(messageData, "sendMessage")));
        const [a, b] = normalizedConversationId.replace("dm#", "").split("___");
        const recipientId = a === userData.userId ? b : a;

        if (MESSAGES_THREADS_URL) {
          apiFetch(MESSAGES_THREADS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: normalizedConversationId,
              senderId: userData.userId,
              recipientId,
              snippet: newMessage,
              timestamp,
            }),
          }).catch((err) => console.error("Thread update failed:", err));
        }

        // update thread list
        setInbox((prev) => {
          const idx = prev.findIndex((t) => t.conversationId === normalizedConversationId);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              snippet: newMessage,
              lastMsgTs: timestamp,
              read: true,
            };
            return updated;
          }
          return [
            ...prev,
            {
              conversationId: normalizedConversationId,
              snippet: newMessage,
              lastMsgTs: timestamp,
              read: true,
              otherUserId: recipientId,
            },
          ];
        });

        setNewMessage("");
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
      }
    };

    trySendMessage();
  };

  const handleFileUpload = useCallback(async (
    conversationId: string,
    file: File
  ): Promise<DMFile | undefined> => {
    const sanitizedConversationId = sanitizeConversationIdForFileKey(conversationId);
    const filename = `dms/${sanitizedConversationId}/${FOLDER_KEY}/${file.name}`;
    try {
      const uploadTask = uploadData({
        key: filename,
        data: file,
        options: { accessLevel: "public" },
      });
      await uploadTask.result;
      // small delay for availability
      await new Promise((resolve) => setTimeout(resolve, FILE_UPLOAD_DELAY));
      const fileUrl = getFileUrl(
        `dms/${sanitizedConversationId}/${FOLDER_KEY}/${encodeURIComponent(file.name)}`
      );
      return { fileName: file.name, url: normalizeFileUrl(fileUrl), key: filename };
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  }, []);

  // File drop & upload
  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (!files.length || !selectedConversation) return;

    for (const file of files) {
      const tempUrl = URL.createObjectURL(file);
      const optimisticId = `${Date.now()}-${file.name}`;
      const timestamp = new Date().toISOString();
      const normalizedConversationId = normalizeDMConversationId(selectedConversation);
      const sanitizedConversationId = sanitizeConversationIdForFileKey(normalizedConversationId);
      const key = `dms/${sanitizedConversationId}/${FOLDER_KEY}/${file.name}`;

      const websocketMessage = {
        action: "sendMessage",
        conversationType: "dm",
        conversationId: normalizedConversationId,
        senderId: userData?.userId,
        text: "", // file messages don't have text
        timestamp,
        optimisticId,
        attachments: [{ fileName: file.name, url: tempUrl, key }],
      };

      const optimisticMessage: DMMessage = {
        conversationId: normalizedConversationId,
        senderId: userData?.userId || "",
        text: tempUrl,
        file: { fileName: file.name, url: tempUrl, finalUrl: null, key },
        attachments: [{ fileName: file.name, url: tempUrl, key }],
        timestamp,
        optimisticId,
        optimistic: true,
      };

      setUserData((prev) => {
        const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
        return {
          ...prev,
          messages: mergeAndDedupeMessages(prevMsgs, [optimisticMessage]),
        };
      });

      try {
        const uploadedFile = await handleFileUpload(selectedConversation, file);
        if (!uploadedFile) throw new Error("File upload failed");

        // replace optimistic
        setUserData((prev) => {
          const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
          const updated = prevMsgs.map((msg) =>
            msg.optimisticId === optimisticId
              ? {
                  ...msg,
                  text: uploadedFile.url,
                  file: {
                    ...msg.file!,
                    url: uploadedFile.url,
                    finalUrl: uploadedFile.url,
                    key: uploadedFile.key,
                  },
                  attachments: [
                    {
                      fileName: uploadedFile.fileName,
                      url: uploadedFile.url,
                      key: uploadedFile.key,
                    },
                  ],
                  optimistic: false,
                }
              : msg
          );
          return { ...(prev as AppUser), messages: updated };
        });

        // send via WS with retry logic
        const payload = {
          ...websocketMessage,
          text: "", // file messages don't have text
          attachments: [
            {
              key: uploadedFile.key,
              name: file.name,
              type: file.type,
            },
          ],
        };

        const maxAttempts = MAX_RETRY_ATTEMPTS;
        const trySendFileMessage = (attempts = 0) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (ws && ws.readyState !== WebSocket.OPEN) {
              try {
                ws.close();
              } catch {
                // Ignore errors when closing WebSocket
              }
            }
            if (attempts < maxAttempts) {
              setTimeout(() => trySendFileMessage(attempts + 1), 1000);
            } else {
              console.error("Failed to send file message after", maxAttempts, "attempts.");
            }
            return;
          }
          try {
            ws.send(JSON.stringify(normalizeMessage(payload, "sendMessage")));
            console.log("✅ File message successfully sent!");
          } catch (error) {
            console.error("❌ Error sending file WebSocket message:", error);
          }
        };
        trySendFileMessage();

        // update thread list
        const [a, b] = normalizedConversationId.replace("dm#", "").split("___");
        const recipientId = a === userData.userId ? b : a;

        if (MESSAGES_THREADS_URL) {
          apiFetch(MESSAGES_THREADS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: normalizedConversationId,
              senderId: userData.userId,
              recipientId,
              snippet: `📎 ${file.name}`,
              timestamp,
            }),
          }).catch((err) => console.error("Thread update failed:", err));
        }

        setInbox((prev) => {
          const idx = prev.findIndex((t) => t.conversationId === normalizedConversationId);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              snippet: uploadedFile.url,
              lastMsgTs: timestamp,
              read: true,
            };
            return updated;
          }
          return [
            ...prev,
            {
              conversationId: normalizedConversationId,
              snippet: uploadedFile.url,
              lastMsgTs: timestamp,
              read: true,
              otherUserId: recipientId,
            },
          ];
        });
      } catch (err) {
        console.error("File upload failed", err);
        setUserData((prev) => {
          const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
          return {
            ...prev,
            messages: prevMsgs.filter((m) => m.optimisticId !== optimisticId),
          };
        });
      } finally {
        URL.revokeObjectURL(tempUrl);
      }
    }
  }, [selectedConversation, userData, ws, setUserData, setInbox, handleFileUpload]);

  const deleteMessage = async (message: DMMessage) => {
    const id = message.messageId || message.optimisticId;
    if (!id || !selectedConversation) return;

    // Optimistic UI update
    setUserData((prev) => {
      const prevMsgs = Array.isArray(prev.messages) ? prev.messages : [];
      const updatedMsgs = prevMsgs.filter(
        (m) => (m.messageId || m.optimisticId) !== id
      );
      return { ...(prev as AppUser), messages: updatedMsgs };
    });
    markMessageDeleted(id);

    // Update thread snippet
    setInbox((prev) => {
      const convoMsgs = (userData.messages || []).filter(
        (m) => m.conversationId === selectedConversation && m.messageId !== id
      );
      const lastMsg = convoMsgs.sort(
        (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)
      )[0];
      const newSnippet = lastMsg?.text || "";
      const newTs = String(lastMsg?.timestamp || new Date().toISOString());

      return prev.map((t) =>
        t.conversationId === selectedConversation
          ? { ...t, snippet: newSnippet, lastMsgTs: newTs, read: true }
          : t
      );
    });

    // 🔥 WebSocket delete (no REST)
    if (ws && ws.readyState === WebSocket.OPEN && message.messageId) {
      const deletePayload = {
        action: "deleteMessage",
        conversationType: "dm" as const,
        conversationId: selectedConversation,
        messageId: message.messageId,
      };
      ws.send(JSON.stringify(normalizeMessage(deletePayload, "deleteMessage")));
    }
  };

  const editMessage = async (message: DMMessage, newText: string) => {
    if (!message.messageId || !newText || !selectedConversation) return;

    try {
      const ts = new Date().toISOString();
      setUserData((prev) => {
        const msgs = Array.isArray(prev.messages) ? prev.messages : [];
        return {
          ...prev,
          messages: msgs.map((m) =>
            m.messageId === message.messageId
              ? { ...m, text: newText, edited: true, editedAt: ts }
              : m
          ),
        };
      });

      if (ws && ws.readyState === WebSocket.OPEN) {
        const editPayload = {
          action: "editMessage",
          conversationType: "dm" as const,
          conversationId: selectedConversation,
          messageId: message.messageId,
          text: newText,
          timestamp: message.timestamp,
          editedAt: ts,
          editedBy: userData.userId,
        };
        ws.send(JSON.stringify(normalizeMessage(editPayload, "editMessage")));
      }
    } catch (err) {
      console.error("Failed to edit message", err);
    }
  };

  // Conversations list
  // Build list from inbox threads (existing convos) and eligible users (for new DMs), then dedupe
  const dmConversations = useMemo(() => {
    // from inbox
    const fromInbox = (inbox || []).map((t) => {
      const normalizedConversationId = normalizeDMConversationId(t.conversationId);
      const otherId =
        t.otherUserId ||
        normalizedConversationId
          .replace("dm#", "")
          .split("___")
          .find((id) => id !== userData.userId) || "";
      const u = allUsers.find((x) => x.userId === otherId);
      const title = getUserDisplayName(u) || otherId;
      return {
        id: normalizedConversationId,
        userId: otherId,
        title,
        profilePicture: getUserThumbnail(u),
        lastMsgTs: t.lastMsgTs,
      } as { id: string; userId: string; title: string; profilePicture: string | null; lastMsgTs?: string };
    });

    // from eligible users (collaborators/admins)
    const fromUsers = filteredDMUsers.map((u) => {
      const sortedIds = [userData.userId, u.userId].sort();
      const conversationId = `dm#${sortedIds.join("___")}`;
      return {
        id: conversationId,
        userId: u.userId,
        title: getUserDisplayName(u),
        profilePicture: getUserThumbnail(u),
      } as { id: string; userId: string; title: string; profilePicture: string | null; lastMsgTs?: string };
    });

    // union + prefer inbox data, then sort by recency/title
    const byId = new Map<string, { id: string; userId: string; title: string; profilePicture: string | null; lastMsgTs?: string }>();
    for (const c of fromUsers) byId.set(c.id, c);
    for (const c of fromInbox) byId.set(c.id, { ...byId.get(c.id), ...c });
    const arr = Array.from(byId.values());
    arr.sort((a, b) => {
      const ta = a.lastMsgTs ? Date.parse(a.lastMsgTs) : 0;
      const tb = b.lastMsgTs ? Date.parse(b.lastMsgTs) : 0;
      if (tb !== ta) return tb - ta;
      return a.title.localeCompare(b.title);
    });
    return arr;
  }, [inbox, allUsers, filteredDMUsers, userData.userId]);

  // Header title/icon
  let chatTitle = "Select a conversation";
  let chatIcon: React.ReactNode = null;
  if (selectedConversation) {
    const dmUser = dmConversations.find((u) => u.id === selectedConversation);
    if (dmUser) {
      chatTitle = `Direct Message / ${dmUser.title}`;
      chatIcon = dmUser.profilePicture ? (
        <img
          src={getFileUrl(dmUser.profilePicture)}
          alt={dmUser.title}
          style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : (
        <User style={{ width: 40, height: 40, opacity: 0.5 }} />
      );
    }
  }

  // Callback functions for child components
  const handleConversationOpen = useCallback(async (conversationId: string) => {
    console.log("[Messages] openConversation click", { conversationId });
    const normalizedConversationId = normalizeDMConversationId(conversationId);
    const [a, b] = normalizedConversationId.replace("dm#", "").split("___");
    const otherId = a === userData.userId ? b : a;
    const otherUser = allUsers.find((u) => u.userId === otherId);
    const slug = otherUser ? slugify(`${otherUser.firstName}-${otherUser.lastName}`) : otherId;
    navigate(`/dashboard/features/messages/${slug}`);

    setSelectedConversation(normalizedConversationId);
    if (isMobile) setShowConversation(true);

    // mark read locally
    setInbox((prev) =>
      prev.map((t) => (t.conversationId === normalizedConversationId ? { ...t, read: true } : t))
    );
    markConversationAsRead(normalizedConversationId);
  }, [navigate, userData.userId, allUsers, isMobile, setInbox, markConversationAsRead]);

  const handleMessageChange = useCallback((message: string) => {
    setNewMessage(message);
  }, []);

  const handleToggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker((p) => !p);
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => {
    setNewMessage((m) => m + emoji);
    setShowEmojiPicker(false);
  }, []);

  const handleDropEvent = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    handleDrop(event);
  }, [handleDrop]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleBack = useCallback(() => {
    setShowConversation(false);
  }, []);

  const openPreviewModal = (file: DMFile) => {
    setSelectedPreviewFile(file);
    setPreviewModalOpen(true);
  };
  
  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setSelectedPreviewFile(null);
  };

  const reactToMessage = (messageId: string, emoji: string) => {
    if (!messageId || !emoji || !selectedConversation) return;
    toggleReaction(messageId, emoji, userData.userId, selectedConversation, "dm", ws || undefined);
  };

  return (
    <div
      className="messages-container"
      style={{ display: isMobile ? "block" : "flex", height: "100%" }}
    >
      {/* Sidebar */}
      <ConversationSidebar
        dmConversations={dmConversations}
        selectedConversation={selectedConversation}
        threadMap={threadMap}
        userData={userData}
        isMobile={isMobile}
        showConversation={showConversation}
        onConversationOpen={handleConversationOpen}
      />

      {/* Chat Window */}
      <ChatWindow
        selectedConversation={selectedConversation}
        displayMessages={displayMessages}
        chatTitle={chatTitle}
        chatIcon={chatIcon}
        newMessage={newMessage}
        showEmojiPicker={showEmojiPicker}
        isLoading={isLoading}
        errorMessage={errorMessage}
        isDragging={isDragging}
        isMobile={isMobile}
        showConversation={showConversation}
        messagesEndRef={messagesEndRef}
        userData={userData}
        allUsers={allUsers}
        folderKey={FOLDER_KEY}
        onMessageChange={handleMessageChange}
        onSendMessage={sendMessage}
        onToggleEmojiPicker={handleToggleEmojiPicker}
        onEmojiSelect={handleEmojiSelect}
        onMarkRead={handleMarkRead}
        onDrop={handleDropEvent}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onBack={handleBack}
        setIsDragging={setIsDragging}
        onDelete={(m: ChatMessage) => setDeleteTarget(m as DMMessage)}
        onEditRequest={(m: ChatMessage) => setEditTarget(m as DMMessage)}
        onReact={reactToMessage}
        openPreviewModal={openPreviewModal}
      />

      {/* Preview Modal */}
      <Modal
        isOpen={isPreviewModalOpen}
        onRequestClose={closePreviewModal}
        contentLabel="File Preview Modal"
        className="messages-modal-content"
        overlayClassName="messages-modal-overlay"
      >
        {selectedPreviewFile && (
          <div className="preview-container">
            {(() => {
              const ext = selectedPreviewFile.fileName.split(".").pop()?.toLowerCase() || "";
              if (["jpg", "jpeg", "png"].includes(ext)) {
                return (
                  <img
                    src={getFileUrl(fileUrlsToKeys([selectedPreviewFile.finalUrl || selectedPreviewFile.url])[0])}
                    alt={selectedPreviewFile.fileName}
                    style={{ maxWidth: "90vw", maxHeight: "80vh" }}
                  />
                );
              }
              return renderFilePreview(selectedPreviewFile, FOLDER_KEY);
            })()}
            <div className="preview-header">
              <button onClick={closePreviewModal} className="modal-button secondary" aria-label="Close preview">
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <a href={getFileUrl(fileUrlsToKeys([selectedPreviewFile.url])[0])} download style={{ color: "white" }}>
                <FontAwesomeIcon icon={faDownload} />
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onRequestClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMessage(deleteTarget);
          setDeleteTarget(null);
        }}
        message="Delete this message?"
        className="messages-modal-content"
        overlayClassName="messages-modal-overlay"
      />

      {/* Edit Prompt */}
      <PromptModal
        isOpen={!!editTarget}
        onRequestClose={() => setEditTarget(null)}
        onSubmit={(text) => {
          if (editTarget) editMessage(editTarget, text);
          setEditTarget(null);
        }}
        message="Edit message"
        defaultValue={editTarget?.text || ""}
        className="messages-modal-content"
        overlayClassName="messages-modal-overlay"
      />
    </div>
  );
};

export default Messages;











