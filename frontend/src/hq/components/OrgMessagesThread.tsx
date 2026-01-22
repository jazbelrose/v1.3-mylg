/**
 * OrgMessagesThread - Chat thread for organization-level messages
 *
 * Similar to ProjectMessagesThread but scoped to org. Uses WebSocket with
 * conversationType: "org" and conversationId: "org#<orgId>".
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  DragEvent,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { useUser } from "@/app/contexts/useUser";
import { useOrg } from "@/app/contexts/useOrg";
import { useSocket } from "@/app/contexts/useSocket";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import OptimisticImage from "@/shared/ui/OptimisticImage";
import { normalizeMessage } from "@/shared/utils/websocketUtils";
import {
  ChevronDown,
  ChevronUp,
  Dock,
  FileText,
  Move,
  Paperclip,
  Plus,
  Search,
  Send,
  Smile,
  X,
} from "lucide-react";
import { uploadData } from "aws-amplify/storage";
import MessageItem, { ChatMessage } from "@/dashboard/features/messages/MessageItem";
import "@/dashboard/features/messages/project-messages-thread.css";
import {
  dedupeById,
  mergeAndDedupeMessages,
} from "@/shared/utils/messageUtils";
import { getWithTTL, setWithTTL } from "@/shared/utils/storageWithTTL";
import { DEFAULT_EMOJIS } from "@/dashboard/features/messages/constants";
import {
  FaFilePdf,
  FaFileExcel,
  FaFileAlt,
  FaDraftingCompass,
  FaCube,
} from "react-icons/fa";
import {
  SiAdobe,
  SiAffinitydesigner,
  SiAffinitypublisher,
  SiSvg,
} from "react-icons/si";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faDownload } from "@fortawesome/free-solid-svg-icons";
import Modal from "@/shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import PromptModal from "@/shared/ui/PromptModal";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";
import NoteEditorModal from "@/dashboard/features/messages/components/NoteEditorModal";
import {
  apiFetch,
  getFileUrl,
  normalizeFileUrl,
  fileUrlsToKeys,
  MESSAGES_THREADS_URL,
} from "@/shared/utils/api";
import { getFileNameFromUrl } from "@/shared/utils/fileUtils";

/* =============================================================================
   Types
============================================================================= */

type Attachment = {
  fileName?: string;
  url?: string;
  key?: string;
  name?: string;
  mimeType?: string;
  type?: string;
  size?: number;
};

type FileObj = {
  fileName: string;
  url: string;
  finalUrl?: string | null;
  key?: string;
};

type Message = {
  action?: string;
  conversationType?: "org";
  conversationId?: string;
  orgId?: string;
  senderId?: string;
  username?: string;
  type?: string;
  noteId?: string;
  noteTitle?: string;
  format?: string;
  text?: string;
  timestamp: string;
  optimisticId?: string;
  messageId?: string;
  optimistic?: boolean;
  edited?: boolean;
  editedAt?: string;
  file?: FileObj;
  attachments?: Attachment[];
  reactions?: Record<string, string[]>;
  [key: string]: unknown;
};

type OrgMessagesThreadProps = {
  orgId: string;
  open: boolean;
  setOpen: (fn: (v: boolean) => boolean | boolean) => void;
  floating: boolean;
  setFloating: (fn: (v: boolean) => boolean | boolean) => void;
  startDrag: (e: React.MouseEvent<HTMLDivElement>) => void;
  headerOffset?: number;
  onCloseChat?: () => void;
};

/* =============================================================================
   Utils
============================================================================= */

const omKey = (oid: string) => `org_messages_${oid}`;
const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;
const SCROLL_TOLERANCE_PX = 10;

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const getThumbnailUrl = (url: string): string => {
  if (!url || url.startsWith("blob:")) return url;
  const parts = url.split("/");
  if (parts.length < 3) return url;
  const fileName = parts.pop()!;
  const actualFolderKey = parts.pop()!;
  if (actualFolderKey.endsWith("_thumbnails")) return url;
  return `${parts.join("/")}/${actualFolderKey}_thumbnails/${fileName}.webp`;
};

const renderFilePreview = (file: FileObj) => {
  const extension = file.fileName.split(".").pop()?.toLowerCase() || "";
  const extLabel = extension ? extension.toUpperCase() : "FILE";
  const card = (icon: React.ReactNode) => (
    <div className="chat-attachment-card">
      <div className="chat-attachment-icon">{icon}</div>
      <div className="chat-attachment-meta">
        <div className="chat-attachment-name">{file.fileName}</div>
        <div className="chat-attachment-sub">{extLabel}</div>
      </div>
    </div>
  );

  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) {
    const normalizedUrl = normalizeFileUrl(file.url);
    const thumbnailUrl = getThumbnailUrl(normalizedUrl);
    const finalUrl = normalizeFileUrl(file.finalUrl || file.url);
    return (
      <div className="chat-attachment-image">
        <OptimisticImage tempUrl={thumbnailUrl} finalUrl={finalUrl} alt={file.fileName} />
      </div>
    );
  }

  if (extension === "pdf") return card(<FaFilePdf size={20} />);
  if (extension === "svg") return card(<SiSvg size={20} />);
  if (extension === "txt") return card(<FaFileAlt size={20} />);
  if (["xls", "xlsx", "csv"].includes(extension)) return card(<FaFileExcel size={20} />);
  if (["dwg", "vwx"].includes(extension)) return card(<FaDraftingCompass size={20} />);
  if (["c4d", "obj"].includes(extension)) return card(<FaCube size={20} />);
  if (extension === "ai") return card(<SiAdobe size={20} />);
  if (extension === "afdesign") return card(<SiAffinitydesigner size={20} />);
  if (extension === "afpub") return card(<SiAffinitypublisher size={20} />);
  return card(<FaFileAlt size={20} />);
};

/* =============================================================================
   Component
============================================================================= */

const OrgMessagesThread: React.FC<OrgMessagesThreadProps> = ({
  orgId,
  open,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setOpen,
  floating,
  setFloating,
  startDrag,
  headerOffset = 0,
  onCloseChat,
}) => {
  const { user, userData, allUsers } = useUser();
  const { orgs } = useOrg();
  const { ws } = useSocket() || {};

  const activeOrg = useMemo(() => orgs.find((o) => o.orgId === orgId), [orgs, orgId]);
  const orgName = activeOrg?.name || orgId;

  // Local state for org messages (not in global context yet)
  const [orgMessages, setOrgMessages] = useState<Record<string, Message[]>>({});
  const [deletedMessageIds] = useState<Set<string>>(() => new Set());

  const messages = useMemo(() => {
    const all = Array.isArray(orgMessages[orgId]) ? orgMessages[orgId] : [];
    return dedupeById(all.filter((m) => !deletedMessageIds.has(m.messageId || m.optimisticId || ""))) as Message[];
  }, [orgMessages, orgId, deletedMessageIds]);

  const displayMessages = useMemo(() => {
    return messages.map((m) => {
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        const a = m.attachments[0];
        const url = a.url || (a.key ? getFileUrl(a.key) : "");
        return { ...m, file: { fileName: a.fileName || a.name || getFileNameFromUrl(url), url } };
      }
      return m;
    });
  }, [messages]);

  const groupPositions = useMemo(() => {
    const parseTs = (m?: Message | null) => {
      if (!m?.timestamp) return null;
      const d = new Date(m.timestamp);
      return Number.isNaN(+d) ? null : d;
    };

    const isSameGroup = (a: Message | null, b: Message | null) => {
      if (!a || !b) return false;
      if (a.senderId !== b.senderId) return false;
      const tsA = parseTs(a);
      const tsB = parseTs(b);
      if (!tsA || !tsB) return false;
      return Math.abs(+tsB - +tsA) <= MESSAGE_GROUP_WINDOW_MS;
    };

    return displayMessages.map((msg, i) => {
      const prev = i > 0 ? displayMessages[i - 1] : null;
      const next = i < displayMessages.length - 1 ? displayMessages[i + 1] : null;
      const isFirstInGroup = !isSameGroup(prev, msg);
      const isLastInGroup = !isSameGroup(msg, next);
      const isCurrentUser = msg.senderId === userData?.userId;
      const isLastOutgoingInGroup = isCurrentUser && isLastInGroup;
      return { isFirstInGroup, isLastInGroup, isLastOutgoingInGroup };
    });
  }, [displayMessages, userData?.userId]);

  const [isLoading, setIsLoading] = useState(() => !orgMessages[orgId]?.length);
  const [errorMessage] = useState("");
  const [sendError, setSendError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchKey, setActiveSearchKey] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<FileObj | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [renameNoteTarget, setRenameNoteTarget] = useState<Message | null>(null);
  const [noteEditorState, setNoteEditorState] = useState<
    | { isOpen: false }
    | { isOpen: true; mode: "create" }
    | { isOpen: true; mode: "open"; fileUrl: string; fileName: string; initialTitle?: string | null; message?: Message }
  >({ isOpen: false });

  // Use 'uploads' folder so files appear in HQ Files immediately
  const folderKey = "uploads";

  const getMessageKey = useCallback((msg: Message) => {
    return (msg.messageId || msg.optimisticId || String(msg.timestamp)) as string;
  }, []);

  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    const matches: Array<{ key: string; index: number }> = [];
    displayMessages.forEach((msg, index) => {
      const key = getMessageKey(msg);
      const text = String(msg.text ?? "");
      const fileName = String(msg.file?.fileName ?? "");
      const haystack = `${text} ${fileName}`.toLowerCase();
      if (haystack.includes(normalizedSearchQuery)) {
        matches.push({ key, index });
      }
    });
    return matches;
  }, [displayMessages, getMessageKey, normalizedSearchQuery]);

  const searchHitKeys = useMemo(() => new Set(searchMatches.map((m) => m.key)), [searchMatches]);

  const activeSearchIndex = useMemo(() => {
    if (!activeSearchKey) return -1;
    return searchMatches.findIndex((m) => m.key === activeSearchKey);
  }, [activeSearchKey, searchMatches]);

  useEffect(() => {
    if (!normalizedSearchQuery || searchMatches.length === 0) {
      if (activeSearchKey !== null) setActiveSearchKey(null);
      return;
    }
    if (activeSearchKey && searchHitKeys.has(activeSearchKey)) return;
    setActiveSearchKey(searchMatches[0]?.key ?? null);
  }, [activeSearchKey, normalizedSearchQuery, searchHitKeys, searchMatches]);

  const scrollToMessageKey = useCallback((key: string, behavior: ScrollBehavior = "smooth") => {
    if (typeof window === "undefined") return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const escape = (value: string) => {
      const css = (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS;
      if (css?.escape) return css.escape(value);
      return value.replace(/["\\]/g, "\\$&");
    };
    const selector = `[data-pm-message-key="${escape(key)}"] .message-bubble`;
    const bubble = container.querySelector(selector) as HTMLElement | null;
    if (!bubble) return;
    bubble.scrollIntoView({ behavior, block: "center" });
    bubble.classList.add("message-highlight");
    window.setTimeout(() => bubble.classList.remove("message-highlight"), 1400);
    bubble.focus();
  }, []);

  const jumpSearch = useCallback(
    (direction: 1 | -1) => {
      if (!normalizedSearchQuery || searchMatches.length === 0) return;
      if (activeSearchIndex < 0) {
        const initialIndex = direction === 1 ? 0 : searchMatches.length - 1;
        const initialKey = searchMatches[initialIndex]?.key;
        if (!initialKey) return;
        setActiveSearchKey(initialKey);
        scrollToMessageKey(initialKey, "smooth");
        return;
      }
      const nextIndex = (activeSearchIndex + direction + searchMatches.length) % searchMatches.length;
      const nextKey = searchMatches[nextIndex]?.key;
      if (!nextKey) return;
      setActiveSearchKey(nextKey);
      scrollToMessageKey(nextKey, "smooth");
    },
    [activeSearchIndex, normalizedSearchQuery, scrollToMessageKey, searchMatches]
  );

  // Load cached messages
  useEffect(() => {
    if (!orgId) return;
    const stored = getWithTTL(omKey(orgId));
    if (!Array.isArray(stored) || !stored.length) return;
    setOrgMessages((prev) => {
      const existing = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      if (existing.length) return prev;
      return { ...prev, [orgId]: mergeAndDedupeMessages(existing, stored) as Message[] };
    });
  }, [orgId]);

  // Persist messages
  useEffect(() => {
    if (orgId) {
      setWithTTL(omKey(orgId), messages);
    }
  }, [messages, orgId]);

  useEffect(() => {
    if (!showActionMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setShowActionMenu(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setShowActionMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showActionMenu]);

  // Note helper functions
  const sanitizeFileStem = (raw: string) => {
    const cleaned = String(raw || "")
      .trim()
      .replace(/[^\w\s-]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned.slice(0, 60) || "note";
  };

  const makeNotePreview = (md: string) => {
    const trimmed = String(md || "").trim();
    if (!trimmed) return "";
    const lines = trimmed.split(/\r\n|\r|\n/).slice(0, 6).join("\n");
    return lines.length > 400 ? `${lines.slice(0, 400)}…` : lines;
  };

  const openCreateNote = () => {
    setShowActionMenu(false);
    setShowEmojiPicker(false);
    setNoteEditorState({ isOpen: true, mode: "create" });
  };

  const createNote = async ({ title, markdown }: { title: string; markdown: string }) => {
    if (!orgId) throw new Error("Missing orgId.");
    if (!ws) throw new Error("WebSocket unavailable.");
    if (!userData?.userId) throw new Error("Missing user info.");

    const noteId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fileStem = sanitizeFileStem(title);
    const s3FileName = `${fileStem}-${noteId}.md`;
    const displayFileName = `${title}.md`;

    const baseKey = `orgs/${orgId}/notes/${s3FileName}`;
    const storedKey = `public/${baseKey}`;

    const uploadTask = uploadData({
      key: baseKey,
      data: new Blob([markdown], { type: "text/markdown" }),
      options: { accessLevel: "public" },
    });
    await uploadTask.result;

    const uploadedUrl = getFileUrl(storedKey);
    const timestamp = new Date().toISOString();
    const optimisticId = `${Date.now()}-${noteId}`;

    const messageData: Message = {
      action: "sendMessage",
      conversationType: "org",
      conversationId: `org#${orgId}`,
      orgId,
      senderId: userData.userId,
      username: user?.firstName || "Someone",
      text: makeNotePreview(markdown),
      timestamp,
      optimisticId,
      type: "note",
      noteId,
      noteTitle: title,
      format: "markdown",
      file: { fileName: displayFileName, url: uploadedUrl, finalUrl: uploadedUrl, key: storedKey },
      attachments: [{ fileName: displayFileName, url: uploadedUrl, key: storedKey, mimeType: "text/markdown" }],
    };

    const optimisticMessage: Message = { ...messageData, optimistic: true };
    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const merged = mergeAndDedupeMessages(msgs, [optimisticMessage]) as Message[];
      setWithTTL(omKey(orgId), merged);
      return { ...prev, [orgId]: merged };
    });

    ws.send(JSON.stringify(normalizeMessage(messageData, "sendMessage")));
  };

  const openPreviewModal = (file: FileObj, message?: Message) => {
    const ext = file.fileName.split(".").pop()?.toLowerCase() || "";
    const url = file.finalUrl || file.url;
    // Handle markdown/text files with NoteEditorModal like ProjectMessagesThread
    if ((ext === "md" || ext === "markdown" || ext === "txt") && url && !url.startsWith("blob:")) {
      setNoteEditorState({ isOpen: true, mode: "open", fileUrl: url, fileName: file.fileName, message });
      return;
    }
    setSelectedPreviewFile(file);
    setPreviewModalOpen(true);
  };

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setSelectedPreviewFile(null);
  };

  // WebSocket message handler
  useEffect(() => {
    if (!ws) return;

    const handleWsMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        // Handle incoming messages for org
        if (data.conversationType === "org") {
          const oid = data.orgId || (data.conversationId || "").replace("org#", "");
          if (oid !== orgId) return;

          if (data.action === "sendMessage" || data.action === "message" || data.action === "newMessage") {
            const newMsg: Message = {
              ...data,
              timestamp: data.timestamp || new Date().toISOString(),
              optimistic: false, // Mark as confirmed from server
            };
            setOrgMessages((prev) => {
              const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
              // Dedupe by messageId or optimisticId
              const merged = mergeAndDedupeMessages(msgs, [newMsg]) as Message[];
              setWithTTL(omKey(orgId), merged);
              return { ...prev, [orgId]: merged };
            });
          }

          if (data.action === "deleteMessage") {
            setOrgMessages((prev) => {
              const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
              const updated = msgs.filter(
                (m) => !((data.messageId && m.messageId === data.messageId) || (data.optimisticId && m.optimisticId === data.optimisticId))
              );
              setWithTTL(omKey(orgId), updated);
              return { ...prev, [orgId]: updated };
            });
          }

          if (data.action === "editMessage") {
            setOrgMessages((prev) => {
              const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
              const updated = msgs.map((m) =>
                m.messageId === data.messageId
                  ? {
                      ...m,
                      text: data.text ?? m.text,
                      edited: true,
                      editedAt: data.editedAt,
                      // Support note rename
                      ...(data.noteTitle !== undefined ? { noteTitle: data.noteTitle } : {}),
                      ...(data.file !== undefined ? { file: data.file } : {}),
                    }
                  : m
              );
              setWithTTL(omKey(orgId), updated);
              return { ...prev, [orgId]: updated };
            });
          }

          if (data.action === "toggleReaction") {
            setOrgMessages((prev) => {
              const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
              const updated = msgs.map((m) => {
                if (m.messageId !== data.messageId) return m;
                const reactions = { ...(m.reactions || {}) };
                const users = reactions[data.emoji] ? [...reactions[data.emoji]] : [];
                const idx = users.indexOf(data.userId);
                if (idx >= 0) {
                  users.splice(idx, 1);
                } else {
                  users.push(data.userId);
                }
                if (users.length === 0) {
                  delete reactions[data.emoji];
                } else {
                  reactions[data.emoji] = users;
                }
                return { ...m, reactions };
              });
              setWithTTL(omKey(orgId), updated);
              return { ...prev, [orgId]: updated };
            });
          }
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    ws.addEventListener("message", handleWsMessage);
    return () => ws.removeEventListener("message", handleWsMessage);
  }, [ws, orgId]);

  // Join org conversation
  useEffect(() => {
    if (!ws || !orgId) return;
    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `org#${orgId}`,
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
  }, [ws, orgId]);

  // Track which orgs we've already fetched to prevent duplicate requests
  const fetchedOrgsRef = useRef<Set<string>>(new Set());

  // Fetch messages on mount from REST API
  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    // Check if we already fetched this org
    if (fetchedOrgsRef.current.has(orgId)) {
      setIsLoading(false);
      return;
    }

    // Check if we already have messages for this org (from cache or prior load)
    if (orgMessages[orgId]?.length) {
      fetchedOrgsRef.current.add(orgId);
      setIsLoading(false);
      return;
    }

    // Mark as fetched early to prevent duplicate requests
    fetchedOrgsRef.current.add(orgId);

    const fetchOrgMessages = async () => {
      setIsLoading(true);
      try {
        // Use the messages threads endpoint with org# prefix
        const conversationId = `org#${orgId}`;
        const url = `${MESSAGES_THREADS_URL}/${encodeURIComponent(conversationId)}/messages`;
        const data = await apiFetch<{ messages?: Message[]; conversationId?: string }>(url, {
          skipRateLimit: true,  // Avoid rate limit issues for initial load
        });
        
        const items = Array.isArray(data?.messages) ? data.messages : [];
        
        setOrgMessages((prev) => {
          const existing = Array.isArray(prev[orgId]) ? prev[orgId] : [];
          if (existing.length) return prev; // Don't overwrite if we already have messages
          const merged = mergeAndDedupeMessages(existing, items) as Message[];
          setWithTTL(omKey(orgId), merged);
          return { ...prev, [orgId]: merged };
        });
      } catch (err) {
        console.error("Error fetching org messages:", err);
        // Not critical - messages will come via WebSocket
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrgMessages();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps -- orgMessages checked via ref to prevent loops

  // Scroll handling
  const prevCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const lastOrgIdRef = useRef(orgId);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    if (lastOrgIdRef.current !== orgId) {
      lastOrgIdRef.current = orgId;
      didInitialScrollRef.current = false;
      prevCountRef.current = 0;
    }
  }, [orgId]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const total = messages.length;
    const prevTotal = prevCountRef.current;
    const hasNewMessages = total > prevTotal;
    prevCountRef.current = total;

    if (!didInitialScrollRef.current && open && !isLoading) {
      didInitialScrollRef.current = true;
      if (total > 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom()));
      } else {
        container.scrollTop = container.scrollHeight;
      }
      return;
    }

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_TOLERANCE_PX;
    if (hasNewMessages && atBottom) {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [messages, open, isLoading]);

  // Send text message
  const sendMessage = () => {
    if (!orgId) return;
    if (!newMessage.trim()) return;

    const timestamp = new Date().toISOString();
    const optimisticId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const messageData: Message = {
      action: "sendMessage",
      conversationType: "org",
      conversationId: `org#${orgId}`,
      orgId,
      senderId: userData?.userId,
      username: user?.firstName || "Someone",
      text: newMessage,
      timestamp,
      optimisticId,
    };

    const optimisticMessage: Message = { ...messageData, optimistic: true };

    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const merged = mergeAndDedupeMessages(msgs, [optimisticMessage]) as Message[];
      setWithTTL(omKey(orgId), merged);
      return { ...prev, [orgId]: merged };
    });

    const maxAttempts = 5;
    const trySend = (attempts = 0) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (attempts < maxAttempts) {
          setTimeout(() => trySend(attempts + 1), 1000);
        } else {
          console.error("Failed to send after", maxAttempts, "attempts.");
        }
        return;
      }
      try {
        ws.send(JSON.stringify(normalizeMessage(messageData, "sendMessage")));
        setNewMessage("");
        setShowEmojiPicker(false);
      } catch (error) {
        console.error("Error sending WS message:", error);
        setSendError("Can't reach the server—your edits are safe; we'll retry.");
      }
    };
    trySend();
  };

  // File upload helper
  const handleFileUpload = async (oid: string, file: File): Promise<FileObj | undefined> => {
    const baseKey = `orgs/${oid}/${folderKey}/${file.name}`;
    const storedKey = `public/${baseKey}`;
    try {
      const uploadTask = uploadData({
        key: baseKey,
        data: file,
        options: { accessLevel: "public" },
      });
      await uploadTask.result;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const fileUrl = getFileUrl(storedKey);
      return { fileName: file.name, url: fileUrl, key: storedKey };
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  const processFileUpload = async (file: File) => {
    if (!orgId) return;

    const tempUrl = URL.createObjectURL(file);
    const optimisticId = `${Date.now()}-${file.name}`;
    const timestamp = new Date().toISOString();
    const key = `public/orgs/${orgId}/${folderKey}/${file.name}`;

    const optimisticMessage: Message = {
      action: "sendMessage",
      conversationType: "org",
      conversationId: `org#${orgId}`,
      orgId,
      senderId: userData?.userId,
      text: tempUrl,
      file: { fileName: file.name, url: tempUrl, finalUrl: null },
      attachments: [{ fileName: file.name, url: tempUrl, key, mimeType: file.type, size: file.size }],
      timestamp,
      optimisticId,
      optimistic: true,
    };

    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const merged = mergeAndDedupeMessages(msgs, [optimisticMessage]) as Message[];
      setWithTTL(omKey(orgId), merged);
      return { ...prev, [orgId]: merged };
    });

    try {
      const uploadedFile = await handleFileUpload(orgId, file);
      if (!uploadedFile) throw new Error("File upload failed");

      setOrgMessages((prev) => {
        const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
        const updated = msgs.map((msg) =>
          msg.optimisticId === optimisticId
            ? {
                ...msg,
                text: uploadedFile.url,
                file: { ...msg.file!, finalUrl: uploadedFile.url, url: uploadedFile.url, key: uploadedFile.key },
                attachments: [{ fileName: uploadedFile.fileName, url: uploadedFile.url, key: uploadedFile.key }],
                optimistic: false,
              }
            : msg
        );
        setWithTTL(omKey(orgId), updated);
        return { ...prev, [orgId]: updated };
      });

      const messageData: Message = {
        action: "sendMessage",
        conversationType: "org",
        conversationId: `org#${orgId}`,
        orgId,
        senderId: userData?.userId,
        text: uploadedFile.url,
        file: uploadedFile,
        attachments: [{ key: uploadedFile.key, name: uploadedFile.fileName, type: file.type }],
        timestamp,
        optimisticId,
        username: user?.firstName || "Someone",
      };

      const maxAttempts = 5;
      const trySendFileMessage = (attempts = 0) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (attempts < maxAttempts) setTimeout(() => trySendFileMessage(attempts + 1), 1000);
          return;
        }
        try {
          ws.send(JSON.stringify(normalizeMessage(messageData, "sendMessage")));
        } catch (error) {
          console.error("Error sending file WebSocket message:", error);
        }
      };
      trySendFileMessage();
    } catch (error) {
      console.error("Upload failed:", error);
      setOrgMessages((prev) => {
        const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
        const updated = msgs.filter((msg) => msg.optimisticId !== optimisticId);
        setWithTTL(omKey(orgId), updated);
        return { ...prev, [orgId]: updated };
      });
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  };

  const processFiles = async (files: File[]) => {
    for (const file of files) {
      await processFileUpload(file);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    await processFiles(files);
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files?.length) return;
    await processFiles(Array.from(files));
    event.target.value = "";
  };

  const toggleActionMenu = () => {
    setShowActionMenu((prev) => {
      const next = !prev;
      if (next) setShowEmojiPicker(false);
      return next;
    });
  };

  const triggerFileDialog = () => {
    setShowActionMenu(false);
    setShowEmojiPicker(false);
    fileInputRef.current?.click();
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
    setShowActionMenu(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage((prev) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
  };

  // Delete message
  const deleteMessage = async (message: Message) => {
    const id = message.messageId || message.optimisticId;
    if (!id) return;

    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const updated = msgs.filter((m) => (m.messageId || m.optimisticId) !== id);
      setWithTTL(omKey(orgId), updated);
      return { ...prev, [orgId]: updated };
    });

    if (ws && ws.readyState === WebSocket.OPEN && message.messageId) {
      const deletePayload = {
        action: "deleteMessage",
        conversationType: "org",
        conversationId: `org#${orgId}`,
        messageId: message.messageId,
      };
      ws.send(JSON.stringify(normalizeMessage(deletePayload, "deleteMessage")));
    }
  };

  // Edit message
  const editMessage = async (message: Message, newText: string) => {
    if (!message.messageId || !newText) return;
    const ts = new Date().toISOString();
    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const updated = msgs.map((m) => (m.messageId === message.messageId ? { ...m, text: newText, edited: true, editedAt: ts } : m));
      setWithTTL(omKey(orgId), updated);
      return { ...prev, [orgId]: updated };
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
      const editPayload = {
        action: "editMessage",
        conversationType: "org",
        conversationId: `org#${orgId}`,
        orgId,
        messageId: message.messageId,
        text: newText,
        timestamp: message.timestamp,
        editedAt: ts,
        editedBy: userData?.userId,
      };
      ws.send(JSON.stringify(normalizeMessage(editPayload, "editMessage")));
    }
  };

  // Rename note
  const renameNote = async (message: Message, newTitle: string) => {
    if (!message.messageId || !newTitle.trim()) return;
    const trimmedTitle = newTitle.trim();
    const ts = new Date().toISOString();
    const oldFile = message.file;

    // Build new file name (preserve extension)
    const oldFileName = oldFile?.fileName || "";
    const ext = oldFileName.split(".").pop() || "md";
    const newFileName = `${trimmedTitle}.${ext}`;

    // Update local state immediately
    const newFile = oldFile ? { ...oldFile, fileName: newFileName } : undefined;

    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const updated = msgs.map((m) =>
        m.messageId === message.messageId
          ? { ...m, noteTitle: trimmedTitle, file: newFile, edited: true, editedAt: ts }
          : m
      );
      setWithTTL(omKey(orgId), updated);
      return { ...prev, [orgId]: updated };
    });

    // Broadcast the rename via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      const editPayload = {
        action: "editMessage",
        conversationType: "org",
        conversationId: `org#${orgId}`,
        orgId,
        messageId: message.messageId,
        noteTitle: trimmedTitle,
        file: newFile,
        timestamp: message.timestamp,
        editedAt: ts,
        editedBy: userData?.userId,
      };
      ws.send(JSON.stringify(normalizeMessage(editPayload, "editMessage")));
    }
  };

  // Handler for renaming note from NoteEditorModal
  const handleNoteEditorRename = async (newTitle: string) => {
    if (noteEditorState.isOpen && noteEditorState.mode === "open" && noteEditorState.message) {
      await renameNote(noteEditorState.message, newTitle);
    }
  };

  // Reactions
  const reactToMessage = (messageId?: string, emoji?: string) => {
    if (!messageId || !emoji || !ws || ws.readyState !== WebSocket.OPEN) return;

    const reactionPayload = {
      action: "toggleReaction",
      conversationType: "org",
      conversationId: `org#${orgId}`,
      messageId,
      emoji,
      userId: userData?.userId,
    };
    ws.send(JSON.stringify(normalizeMessage(reactionPayload, "toggleReaction")));

    // Optimistic update
    setOrgMessages((prev) => {
      const msgs = Array.isArray(prev[orgId]) ? prev[orgId] : [];
      const updated = msgs.map((m) => {
        if (m.messageId !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] ? [...reactions[emoji]] : [];
        const idx = users.indexOf(userData?.userId || "");
        if (idx >= 0) {
          users.splice(idx, 1);
        } else {
          users.push(userData?.userId || "");
        }
        if (users.length === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = users;
        }
        return { ...m, reactions };
      });
      setWithTTL(omKey(orgId), updated);
      return { ...prev, [orgId]: updated };
    });
  };

  useEffect(() => {
    if (typeof document === "undefined" || !open) return;

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (!normalizedSearchQuery) return;
      if (isCmdOrCtrl && e.key.toLowerCase() === "g") {
        e.preventDefault();
        jumpSearch(e.shiftKey ? -1 : 1);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [jumpSearch, normalizedSearchQuery, open]);

  useEffect(() => {
    if (!open) setShowEmojiPicker(false);
  }, [open]);

  return (
    <>
      <div
        className={`project-messages ${isDragging ? "dragging" : ""} ${!open ? "closed" : ""} ${floating ? "floating" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: floating ? (open ? "100%" : "50px") : "100%",
          overflow: floating && !open ? "hidden" : "visible",
          backgroundColor: "transparent",
          position: floating ? "relative" : "sticky",
          top: floating ? undefined : headerOffset,
          maxHeight: floating ? undefined : `calc(100vh - ${headerOffset}px)`,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleDrop(e);
        }}
      >
        {isLoading && <SpinnerOverlay />}
        {errorMessage && <div className="error-message">{errorMessage}</div>}

        {floating && <div className="thread-drag-bar" onMouseDown={startDrag} aria-label="Drag to move window" />}

        <div
          className={`thread-panel-header chat-panel-header ${floating ? "floating" : ""}`}
          aria-label={`HQ chat controls for ${orgName}`}
        >
          <div className="thread-header-search" role="search" aria-label="Search messages">
            <Search size={14} aria-hidden="true" className="thread-header-search-icon" />
            <input
              ref={searchInputRef}
              className="thread-header-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search in this thread"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSearchQuery("");
                  setActiveSearchKey(null);
                  (e.currentTarget as HTMLInputElement).blur();
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  jumpSearch(e.shiftKey ? -1 : 1);
                }
              }}
            />
            <div className={`thread-header-search-controls ${normalizedSearchQuery ? "" : "is-hidden"}`} aria-hidden={!normalizedSearchQuery}>
              <span className="thread-header-search-count" aria-live="polite">
                {searchMatches.length > 0 && activeSearchIndex >= 0 ? `${activeSearchIndex + 1}/${searchMatches.length}` : `0/${searchMatches.length}`}
              </span>
              <button
                type="button"
                className="thread-header-search-btn"
                onClick={() => jumpSearch(-1)}
                disabled={searchMatches.length === 0}
                aria-label="Previous match"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="thread-header-search-btn"
                onClick={() => jumpSearch(1)}
                disabled={searchMatches.length === 0}
                aria-label="Next match"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                className="thread-header-search-btn"
                onClick={() => {
                  setSearchQuery("");
                  setActiveSearchKey(null);
                  searchInputRef.current?.focus();
                }}
                disabled={!normalizedSearchQuery}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="thread-header-actions">
            <button className="icon-btn" onClick={() => setFloating((f) => !f)} aria-label={floating ? "Dock" : "Undock"} title={floating ? "Dock" : "Undock"}>
              {floating ? <Dock size={20} /> : <Move size={20} />}
            </button>
            <button className="icon-btn thread-close-btn" onClick={() => onCloseChat?.()} aria-label="Close chat" title="Close chat">
              <X size={22} />
            </button>
          </div>
        </div>

        {open && (
          <div
            className="chat-messages"
            ref={messagesContainerRef}
            style={{
              flexGrow: 1,
              overflowY: "auto",
              padding: "4px 4px 8px",
              borderRadius: "20px",
              marginBottom: "10px",
              display: "flex",
              flexDirection: "column",
              justifyContent: messages.length === 0 ? "center" : "flex-start",
              alignItems: messages.length === 0 ? "center" : "stretch",
            }}
          >
            {messages.length === 0 && !isLoading ? (
              <div style={{ color: "#aaa", fontSize: "16px", textAlign: "center" }}>No messages yet. Start the conversation!</div>
            ) : (
              displayMessages.map((msg, index) => {
                const pos = groupPositions[index] || { isFirstInGroup: true, isLastInGroup: true, isLastOutgoingInGroup: false };
                const key = getMessageKey(msg);
                return (
                  <MessageItem
                    key={key}
                    msg={msg as ChatMessage}
                    prevMsg={(index > 0 ? displayMessages[index - 1] : null) as ChatMessage | null}
                    nextMsg={(index < displayMessages.length - 1 ? displayMessages[index + 1] : null) as ChatMessage | null}
                    userData={userData}
                    allUsers={allUsers}
                    openPreviewModal={(file, m) => openPreviewModal(file as FileObj, m as Message | undefined)}
                    folderKey={folderKey}
                    renderFilePreview={renderFilePreview}
                    getFileNameFromUrl={getFileNameFromUrl}
                    onDelete={(m: ChatMessage) => setDeleteTarget(m as Message)}
                    onEditRequest={(m: ChatMessage) => setEditTarget(m as Message)}
                    onRenameNote={(m: ChatMessage) => setRenameNoteTarget(m as Message)}
                    onReact={reactToMessage}
                    isFirstInGroup={pos.isFirstInGroup}
                    isLastInGroup={pos.isLastInGroup}
                    isLastOutgoingInGroup={pos.isLastOutgoingInGroup}
                    messageDomKey={key}
                    isSearchHit={searchHitKeys.has(key)}
                    isSearchCurrent={activeSearchKey != null && key === activeSearchKey}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} style={{ height: "1px", flexShrink: 0 }} />
          </div>
        )}

        {open && (
          <div className="message-input-footer">
            <div className="message-input-divider" />
            <div className="message-input-container">
              <div className="message-input-inner">
                <div className="message-action-wrapper" ref={actionMenuRef}>
                  <button
                    type="button"
                    className="message-icon-button"
                    onClick={toggleActionMenu}
                    aria-label="Open message actions"
                    aria-haspopup="true"
                    aria-expanded={showActionMenu}
                  >
                    <Plus size={16} />
                  </button>
                  {showActionMenu && (
                    <div className="message-action-menu" role="menu" aria-label="Message actions">
                      <button type="button" className="message-action-menu-button" onClick={triggerFileDialog} role="menuitem">
                        <Paperclip size={14} />
                        <span>File</span>
                      </button>
                      <button type="button" className="message-action-menu-button" onClick={openCreateNote} role="menuitem">
                        <FileText size={14} />
                        <span>Note</span>
                      </button>
                      <button type="button" className="message-action-menu-button" onClick={toggleEmojiPicker} role="menuitem">
                        <Smile size={14} />
                        <span>Emoji</span>
                      </button>
                    </div>
                  )}
                  {showEmojiPicker && (
                    <div className="emoji-picker" role="menu">
                      {DEFAULT_EMOJIS.map((emoji) => (
                        <button key={emoji} type="button" className="emoji-button" onClick={() => handleEmojiSelect(emoji)} aria-label={`Insert ${emoji}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  placeholder={`Message ${orgName}`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="message-input"
                />
              </div>
              <button type="button" onClick={sendMessage} className="send-button" aria-label="Send message">
                <Send size={16} />
              </button>
              <input ref={fileInputRef} type="file" className="message-file-input" onChange={handleFileInputChange} multiple />
            </div>
          </div>
        )}

        {sendError && <div className="error-message">{sendError}</div>}
        {isDragging && <div className="drag-overlay">Drop files to upload</div>}
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={isPreviewModalOpen}
        onRequestClose={closePreviewModal}
        contentLabel="File Preview Modal"
        className="messages-modal-content preview-modal-content"
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
                    className="preview-image"
                  />
                );
              } else if (ext === "pdf") {
                return <PDFPreview url={selectedPreviewFile.finalUrl || selectedPreviewFile.url} className="preview-pdf" title={selectedPreviewFile.fileName} />;
              } else {
                return renderFilePreview(selectedPreviewFile);
              }
            })()}
            <div className="preview-header">
              <button onClick={closePreviewModal} className="modal-button secondary">
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <a
                href={getFileUrl(fileUrlsToKeys([selectedPreviewFile.url])[0])}
                download
                style={{ color: "white" }}
                aria-label="Download"
                title="Download"
              >
                <FontAwesomeIcon icon={faDownload} />
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
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

      {/* Edit prompt */}
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

      {/* Rename note prompt */}
      <PromptModal
        isOpen={!!renameNoteTarget}
        onRequestClose={() => setRenameNoteTarget(null)}
        onSubmit={(title) => {
          if (renameNoteTarget) renameNote(renameNoteTarget, title);
          setRenameNoteTarget(null);
        }}
        message="Rename note"
        defaultValue={renameNoteTarget?.noteTitle || ""}
        className="messages-modal-content"
        overlayClassName="messages-modal-overlay"
      />

      {/* Note Editor Modal */}
      <NoteEditorModal
        isOpen={noteEditorState.isOpen}
        mode={noteEditorState.isOpen ? noteEditorState.mode : "create"}
        projectId={orgId}
        canEdit={true}
        isOrgFile={true}
        openFile={
          noteEditorState.isOpen && noteEditorState.mode === "open"
            ? { fileUrl: noteEditorState.fileUrl, fileName: noteEditorState.fileName, initialTitle: noteEditorState.initialTitle }
            : undefined
        }
        onCreate={createNote}
        onRequestClose={() => setNoteEditorState({ isOpen: false })}
        onRename={noteEditorState.isOpen && noteEditorState.mode === "open" && noteEditorState.message ? handleNoteEditorRename : undefined}
      />
    </>
  );
};

export default OrgMessagesThread;
