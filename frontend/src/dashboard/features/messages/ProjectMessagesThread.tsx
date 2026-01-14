import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  DragEvent,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { useData } from "@/app/contexts/useData";
import { useAuth } from "@/app/contexts/useAuth";
import {useSocket } from "@/app/contexts/useSocket";
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
  Send,
  Smile,
} from "lucide-react";
import { uploadData } from "aws-amplify/storage";
import MessageItem, { ChatMessage } from "./MessageItem";
import "./project-messages-thread.css";
import {
  dedupeById,
  mergeAndDedupeMessages,
} from "../../../shared/utils/messageUtils";
import { getWithTTL, setWithTTL } from "../../../shared/utils/storageWithTTL";
import { DEFAULT_EMOJIS } from "./constants";
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
import Modal from "../../../shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import PromptModal from "../../../shared/ui/PromptModal";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";
import NoteEditorModal from "./components/NoteEditorModal";
import {
  GET_PROJECT_MESSAGES_URL,
  apiFetch,
  getFileUrl,
  normalizeFileUrl,
  fileUrlsToKeys,
  projectFileDeleteUrl,
} from "../../../shared/utils/api";
import { getFileNameFromUrl } from "../../../shared/utils/fileUtils";

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
  conversationType?: "project";
  conversationId?: string;
  projectId?: string;
  senderId?: string;
  username?: string;
  title?: string;
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
  attachments?: Attachment[]; // NEW: explicit attachments
  reactions?: Record<string, string[]>; // emoji -> [userId]
  [key: string]: unknown;
};

type GetProjectMessagesResponse =
  | { items?: Message[]; nextCursor?: string }
  | { Items?: Message[] }
  | Message[];

type DeleteProjectFilesResponse = { ok?: boolean; deleted?: string[]; errors?: unknown };

type ProjectMessagesMap = Record<string, Message[]>;

type ProjectMessagesThreadProps = {
  projectId: string;
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

const pmKey = (pid: string) => `project_messages_${pid}`;

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const SCROLL_TOLERANCE_PX = 10;

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

// Use "chat_uploads" folder key for previews
const getThumbnailUrl = (url: string, folderKey = "chat_uploads") =>
  url.replace(`/${folderKey}/`, `/${folderKey}_thumbnails/`);

// Custom preview renderer for files
const renderFilePreview = (file: FileObj, folderKey = "chat_uploads") => {
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

  if (["jpg", "jpeg", "png"].includes(extension)) {
    const normalizedUrl = normalizeFileUrl(file.url);
    const thumbnailUrl = getThumbnailUrl(normalizedUrl, folderKey);
    const finalUrl = normalizeFileUrl(file.finalUrl || file.url);
    return (
      <div className="chat-attachment-image">
        <OptimisticImage
          tempUrl={thumbnailUrl}
          finalUrl={finalUrl}
          alt={file.fileName}
        />
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
  if (extension === "js" || extension === "eps") return card(<FaFileAlt size={20} />);
  return card(<FaFileAlt size={20} />);
};

/* =============================================================================
   Component
============================================================================= */

const ProjectMessagesThread: React.FC<ProjectMessagesThreadProps> = ({
  projectId,
  open,
  setOpen,
  floating,
  setFloating,
  startDrag,
  headerOffset = 0,
  onCloseChat,
}) => {
  const {
    activeProject,
    user,
    userData,
    allUsers,
    isAdmin,
    isBuilder,
    isDesigner,
    projectMessages,
    setProjectMessages,
    deletedMessageIds,
    markMessageDeleted,
    toggleReaction,
  } = useData();
  const { ws } = useSocket() || {};
  const { isAuthenticated } = useAuth();
  const projectName = activeProject?.title?.trim() || projectId;
  const canEditTextFiles = Boolean(isAdmin || isBuilder || isDesigner);

  const messages = useMemo(() => {
    const all: Message[] = Array.isArray(projectMessages[projectId])
      ? (projectMessages[projectId] as Message[])
      : [];
    const filtered = all.filter(
      (m: Message) =>
        !(
          deletedMessageIds.has(m.messageId) ||
          deletedMessageIds.has(m.optimisticId)
        )
    );
    return dedupeById(filtered) as Message[];
  }, [projectMessages, projectId, deletedMessageIds]);

  // Normalize: ensure messages with attachments or file URLs display properly
  const displayMessages = React.useMemo(() => {
    const arr = Array.isArray(messages) ? messages : [];
    return arr.map((m: Message) => {
      // If attachments exist, derive a file object and ensure text contains the url
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        const a = m.attachments[0];
        const url = a.url || (a.key ? getFileUrl(a.key) : "");
        return {
          ...m,
          file: {
            fileName: a.fileName || a.name || getFileNameFromUrl(url),
            url,
          },
        };
      }
      return m;
    });
  }, [messages]);

  // Compute group position flags for Apple-style grouping
  const groupPositions = React.useMemo(() => {
    const parseTs = (m?: Message | null) => {
      if (!m?.timestamp) return null;
      const d = new Date(m.timestamp as any);
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

  const [isLoading, setIsLoading] = useState(
    () => !projectMessages[projectId]?.length
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [sendError, setSendError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });

  // File preview modal
  const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] =
    useState<FileObj | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [noteEditorState, setNoteEditorState] = useState<
    | { isOpen: false }
    | { isOpen: true; mode: "create" }
    | { isOpen: true; mode: "open"; fileUrl: string; fileName: string; initialTitle?: string | null }
  >({ isOpen: false });

  // Folder for S3 uploads
  const folderKey = "chat_uploads";

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
    if (!projectId) throw new Error("Missing projectId.");
    if (!ws) throw new Error("WebSocket unavailable.");
    if (!userData?.userId) throw new Error("Missing user info.");

    const noteId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fileStem = sanitizeFileStem(title);
    const s3FileName = `${fileStem}-${noteId}.md`;
    const displayFileName = `${title}.md`;

    const baseKey = `projects/${projectId}/${folderKey}/notes/${s3FileName}`;
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
      conversationType: "project",
      conversationId: `project#${projectId}`,
      senderId: userData.userId,
      username: user?.firstName || "Someone",
      title: activeProject?.title || projectId,
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
    setProjectMessages((prev: ProjectMessagesMap) => {
      const msgs: Message[] = Array.isArray(prev[projectId]) ? prev[projectId] : [];
      const merged = mergeAndDedupeMessages(msgs, [optimisticMessage]) as Message[];
      setWithTTL(pmKey(projectId), merged);
      return { ...prev, [projectId]: merged };
    });

    ws.send(JSON.stringify(normalizeMessage(messageData, "sendMessage")));
  };

  // Load cached messages for this project first
  useEffect(() => {
    if (!projectId) return;
    const stored = getWithTTL(pmKey(projectId));
    if (!Array.isArray(stored) || !stored.length) return;

    setProjectMessages((prev: ProjectMessagesMap) => {
      const existing: Message[] = Array.isArray(prev[projectId])
        ? prev[projectId] as Message[]
        : [];
      if (existing.length) return prev;
      return {
        ...prev,
        [projectId]: mergeAndDedupeMessages(existing, stored),
      } as ProjectMessagesMap;
    });
  }, [projectId, setProjectMessages]);

  // Persist messages
  useEffect(() => {
    if (projectId) {
      setWithTTL(pmKey(projectId), messages);
    }
  }, [messages, projectId]);

  useEffect(() => {
    if (!showActionMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(event.target as Node)
      ) {
        setShowActionMenu(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowActionMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showActionMenu]);

  const openPreviewModal = (file: FileObj) => {
    const ext = file.fileName.split(".").pop()?.toLowerCase() || "";
    const url = file.finalUrl || file.url;
    if ((ext === "md" || ext === "markdown" || ext === "txt") && url && !url.startsWith("blob:")) {
      setNoteEditorState({ isOpen: true, mode: "open", fileUrl: url, fileName: file.fileName });
      return;
    }
    setSelectedPreviewFile(file);
    setPreviewModalOpen(true);
  };
  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setSelectedPreviewFile(null);
  };

  // WebSocket delete listener
  useEffect(() => {
    if (!ws) return;
    const handleWsMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.action === "deleteMessage" &&
          data.conversationType === "project"
        ) {
          const pid =
            data.projectId ||
            (data.conversationId || "").replace("project#", "");
          if (pid === projectId) {
            markMessageDeleted(data.messageId || data.optimisticId);
            setProjectMessages((prev: ProjectMessagesMap) => {
              const msgs: Message[] = Array.isArray(prev[pid]) ? prev[pid] as Message[] : [];
              const updated = msgs.filter(
                (m) =>
                  !(
                    (data.messageId && m.messageId === data.messageId) ||
                    (data.optimisticId &&
                      m.optimisticId === data.optimisticId)
                  )
              );
              setWithTTL(pmKey(pid), updated);
              return { ...prev, [pid]: updated } as ProjectMessagesMap;
            });
          }
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };
    ws.addEventListener("message", handleWsMessage);
    return () => {
      ws.removeEventListener("message", handleWsMessage);
    };
  }, [ws, projectId, setProjectMessages, markMessageDeleted]);

  // Join conversation
  useEffect(() => {
    if (!ws || !projectId) return;
    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${projectId}`,
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
  }, [ws, projectId]);

  // Initial fetch (only when not present)
  useEffect(() => {
    if (!projectId || !isAuthenticated) {
      if (!projectId) setIsLoading(false);
      return;
    }
    if (projectMessages[projectId] !== undefined) {
      setIsLoading(false);
      return;
    }

    const fetchMessages = async () => {
      setIsLoading(true);
      const maxRetries = 5;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const data = await apiFetch<GetProjectMessagesResponse>(
            `${GET_PROJECT_MESSAGES_URL}?projectId=${projectId}`,
            attempt > 0 ? { skipRateLimit: true } : undefined
          );

          // Accept array or various wrapper shapes
          const items = Array.isArray(data)
            ? data
            : Array.isArray((data as { messages?: Message[] })?.messages)
            ? (data as { messages?: Message[] }).messages!
            : Array.isArray((data as { items?: Message[] })?.items)
            ? (data as { items?: Message[] }).items!
            : Array.isArray((data as { Items?: Message[] })?.Items)
            ? (data as { Items?: Message[] }).Items!
            : [];

          const filtered = items.filter(
            (m: Message) =>
              !(
                deletedMessageIds.has(m.messageId) ||
                deletedMessageIds.has(m.optimisticId)
              )
          );
          const deduped = dedupeById(filtered);

          setProjectMessages((prev: ProjectMessagesMap) => ({
            ...prev,
            [projectId]: deduped as Message[],
          }) as ProjectMessagesMap);
          setWithTTL(pmKey(projectId), deduped);

          setIsLoading(false);
          return;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (
            errorMessage?.includes("Rate limit exceeded") &&
            attempt < maxRetries
          ) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          console.error("Error fetching project messages:", error);
          setProjectMessages((prev: ProjectMessagesMap) => ({ ...prev, [projectId]: [] }) as ProjectMessagesMap);
          setWithTTL(pmKey(projectId), []);
          setErrorMessage(
            errorMessage?.includes("Rate limit")
              ? "Too many requests. Please try again later."
              : "Failed to load messages."
          );
          break;
        }
      }
      setIsLoading(false);
    };

    fetchMessages();
  }, [
    projectId,
    isAuthenticated,
    deletedMessageIds,
    setProjectMessages,
    projectMessages,
  ]);

  // Scroll handling
  const prevCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const lastProjectIdRef = useRef(projectId);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  // Reset scroll state when switching projects
  useEffect(() => {
    if (lastProjectIdRef.current !== projectId) {
      lastProjectIdRef.current = projectId;
      didInitialScrollRef.current = false;
      prevCountRef.current = 0;
    }
  }, [projectId]);

  // Main scroll effect
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const total = messages.length;
    const prevTotal = prevCountRef.current;
    const hasNewMessages = total > prevTotal;
    prevCountRef.current = total;

    // Initial entry: wait until we've finished loading and the panel is open
    if (!didInitialScrollRef.current && open && !isLoading) {
      didInitialScrollRef.current = true;

      if (total > 0) {
        // Use multiple RAF to ensure layout is complete
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToBottom();
          });
        });
      } else {
        // Even with 0 messages, make sure we're pinned to the bottom
        container.scrollTop = container.scrollHeight;
      }

      return;
    }

    // Only auto-scroll when user is near the bottom
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      SCROLL_TOLERANCE_PX;

    if (hasNewMessages && atBottom) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages, open, isLoading]);

  // Resize: keep at bottom when already at bottom
  useEffect(() => {
    const handleResize = () => {
      const container = messagesContainerRef.current;
      if (!container) return;

      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        SCROLL_TOLERANCE_PX;

      if (atBottom) {
        scrollToBottom();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ResizeObserver: handle image loading and dynamic content layout shifts
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !open) return;

    let scrollTimeout: NodeJS.Timeout;

    const resizeObserver = new ResizeObserver(() => {
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        SCROLL_TOLERANCE_PX;

      if (atBottom) {
        // Debounce scroll to avoid excessive calls during rapid layout changes
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          scrollToBottom("auto");
        }, 50);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(scrollTimeout);
    };
  }, [open, messages]);

  // Send text
  const sendMessage = () => {
    if (!projectId) {
      console.warn("No projectId selected.");
      return;
    }
    if (!newMessage.trim()) {
      console.warn("sendMessage aborted: empty.");
      return;
    }

    const timestamp = new Date().toISOString();
    const optimisticId =
      Date.now() + "-" + Math.random().toString(36).slice(2);

    const messageData: Message = {
      action: "sendMessage",
      conversationType: "project",
      conversationId: `project#${projectId}`,
      senderId: userData?.userId,
      username: user?.firstName || "Someone",
      title: activeProject?.title || projectId,
      text: newMessage,
      timestamp,
      optimisticId,
    };

    const optimisticMessage: Message = { ...messageData, optimistic: true };

    setProjectMessages((prev: ProjectMessagesMap) => {
      const msgs: Message[] = Array.isArray(prev[projectId])
        ? prev[projectId]
        : [];
      const merged = mergeAndDedupeMessages(msgs, [optimisticMessage]) as Message[];
      setWithTTL(pmKey(projectId), merged);
      return { ...prev, [projectId]: merged };
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
        setSendError("Can’t reach the server—your edits are safe; we’ll retry.");
      }
    };
    trySend();
  };

  // Upload helper
  const handleFileUpload = async (
    pid: string,
    file: File
  ): Promise<FileObj | undefined> => {
    const baseKey = `projects/${pid}/${folderKey}/${file.name}`;
    const storedKey = `public/${baseKey}`;
    try {
      const uploadTask = uploadData({
        key: baseKey,
        data: file,
        options: { accessLevel: "public" },
      });
      await uploadTask.result;
      await new Promise((resolve) => setTimeout(resolve, 2000)); // deliberate delay
      const fileUrl = getFileUrl(storedKey);
      return { fileName: file.name, url: fileUrl, key: storedKey };
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  // Drag & drop uploads
  const processFileUpload = async (file: File) => {
    if (!projectId) return;

    const tempUrl = URL.createObjectURL(file);
    const optimisticId = Date.now() + "-" + file.name;
    const timestamp = new Date().toISOString();
    const key = `public/projects/${projectId}/${folderKey}/${file.name}`;

    const optimisticMessage: Message = {
      action: "sendMessage",
      conversationType: "project",
      conversationId: `project#${projectId}`,
      senderId: userData?.userId,
      text: tempUrl, // legacy path
      file: { fileName: file.name, url: tempUrl, finalUrl: null },
      attachments: [
        {
          fileName: file.name,
          url: tempUrl,
          key,
          mimeType: file.type,
          size: file.size,
        },
      ],
      timestamp,
      optimisticId,
      optimistic: true,
    };

    setProjectMessages((prev: ProjectMessagesMap) => {
      const msgs: Message[] = Array.isArray(prev[projectId])
        ? prev[projectId]
        : [];
      const merged = mergeAndDedupeMessages(msgs, [optimisticMessage]) as Message[];
      setWithTTL(pmKey(projectId), merged);
      return { ...prev, [projectId]: merged };
    });

    try {
      const uploadedFile = await handleFileUpload(projectId, file);
      if (!uploadedFile) throw new Error("File upload failed");

      setProjectMessages((prev: ProjectMessagesMap) => {
        const msgs: Message[] = Array.isArray(prev[projectId])
          ? prev[projectId]
          : [];
        const updated = msgs.map((msg) =>
          msg.optimisticId === optimisticId
            ? {
                ...msg,
                text: uploadedFile.url, // legacy snippet
                file: {
                  ...msg.file!,
                  finalUrl: uploadedFile.url,
                  url: uploadedFile.url,
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
        setWithTTL(pmKey(projectId), updated);
        return { ...prev, [projectId]: updated };
      });

      const messageData: Message = {
        action: "sendMessage",
        conversationType: "project",
        conversationId: `project#${projectId}`,
        title: activeProject?.title,
        senderId: userData?.userId,
        text: uploadedFile.url, // legacy
        file: uploadedFile, // legacy
        attachments: [
          {
            key: uploadedFile.key,
            name: uploadedFile.fileName,
            type: file.type,
          },
        ],
        timestamp,
        optimisticId,
        username: user?.firstName || "Someone",
      };

      const maxAttempts = 5;
      const trySendFileMessage = (attempts = 0) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          if (attempts < maxAttempts) {
            setTimeout(() => trySendFileMessage(attempts + 1), 1000);
          } else {
            console.error(
              "Failed to send file message after",
              maxAttempts,
              "attempts."
            );
          }
          return;
        }
        try {
          ws.send(JSON.stringify(normalizeMessage(messageData, "sendMessage")));
          console.log("✅ File message successfully sent!");
        } catch (error) {
          console.error("❌ Error sending file WebSocket message:", error);
        }
      };
      trySendFileMessage();
    } catch (error) {
      console.error("Upload failed:", error);
      setProjectMessages((prev: ProjectMessagesMap) => {
        const msgs: Message[] = Array.isArray(prev[projectId])
          ? prev[projectId]
          : [];
        const updated = msgs.filter((msg) => msg.optimisticId !== optimisticId);
        setWithTTL(pmKey(projectId), updated);
        return { ...prev, [projectId]: updated };
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

  const handleFileInputChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const { files } = event.target;
    if (!files?.length) return;

    await processFiles(Array.from(files));
    event.target.value = "";
  };

  const toggleActionMenu = () => {
    setShowActionMenu((prev) => {
      const next = !prev;
      if (next) {
        setShowEmojiPicker(false);
      }
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

  // Delete
  const deleteMessage = async (message: Message) => {
    const id = message.messageId || message.optimisticId;
    if (!id) return;

    try {
      // Delete S3 files if present
      const fileKeys: string[] = [
        ...(message.attachments
          ?.map((a) => a.key || (a.url ? fileUrlsToKeys([a.url])[0] : ""))
          .filter(Boolean) ?? []),
        ...(message.file?.url ? fileUrlsToKeys([message.file.url]) : []),
      ];
      if (fileKeys.length && projectId) {
        await apiFetch<DeleteProjectFilesResponse>(projectFileDeleteUrl(projectId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileKeys,
          }),
        });
      }

      // Optimistic local removal
      setProjectMessages((prev: ProjectMessagesMap) => {
        const msgs: Message[] = Array.isArray(prev[projectId])
          ? prev[projectId]
          : [];
        const updated = msgs.filter(
          (m) => (m.messageId || m.optimisticId) !== id
        );
        setWithTTL(pmKey(projectId), updated);
        return { ...prev, [projectId]: updated };
      });

      markMessageDeleted(id);

      if (ws && ws.readyState === WebSocket.OPEN && message.messageId) {
        const deletePayload = {
          action: "deleteMessage",
          conversationType: "project",
          conversationId: `project#${projectId}`,
          messageId: message.messageId,
        };
        ws.send(JSON.stringify(normalizeMessage(deletePayload, "deleteMessage")));
      }
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  // Edit
  const editMessage = async (message: Message, newText: string) => {
    if (!message.messageId || !newText) return;
    try {
      const ts = new Date().toISOString();
      setProjectMessages((prev: ProjectMessagesMap) => {
        const msgs: Message[] = Array.isArray(prev[projectId])
          ? prev[projectId]
          : [];
        const updated = msgs.map((m) =>
          m.messageId === message.messageId
            ? { ...m, text: newText, edited: true, editedAt: ts }
            : m
        );
        setWithTTL(pmKey(projectId), updated);
        return { ...prev, [projectId]: updated };
      });

      if (ws && ws.readyState === WebSocket.OPEN) {
        const editPayload = {
          action: "editMessage",
          conversationType: "project",
          conversationId: `project#${projectId}`,
          projectId,
          messageId: message.messageId,
          text: newText,
          timestamp: message.timestamp,
          editedAt: ts,
          editedBy: userData?.userId,
        };
        ws.send(JSON.stringify(normalizeMessage(editPayload, "editMessage")));
      }
    } catch (err) {
      console.error("Failed to edit message", err);
    }
  };

  // Reactions
  const reactToMessage = (messageId?: string, emoji?: string) => {
    if (!messageId || !emoji) return;
    toggleReaction(
      messageId,
      emoji,
      userData?.userId,
      `project#${projectId}`,
      "project",
      ws
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateIsMobile = () => setIsMobile(window.innerWidth <= 768);
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  useEffect(() => {
    if (!open) {
      setShowEmojiPicker(false);
    }
  }, [open]);

  return (
    <>
      <div
        className={`project-messages ${isDragging ? "dragging" : ""} ${
          !open ? "closed" : ""
        } ${floating ? "floating" : ""}`}
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

        <div
          className="thread-panel-header chat-panel-header"
          onMouseDown={startDrag}
          aria-label={`Message thread controls for ${projectName}`}
        >
          <div className="thread-header-spacer" aria-hidden="true" />
          <div className="thread-header-actions">
            {floating && (
              <button
                className="icon-btn"
                onClick={() => setOpen((o) => !o)}
                aria-label={open ? "Collapse" : "Expand"}
                title={open ? "Collapse" : "Expand"}
              >
                {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            )}
            {!isMobile && (
              <button
                className="icon-btn"
                onClick={() => setFloating((f) => !f)}
                aria-label={floating ? "Dock" : "Float"}
                title={floating ? "Dock" : "Float"}
              >
                {floating ? <Dock size={16} /> : <Move size={16} />}
              </button>
            )}
            {!isMobile && (
              <button
                className="icon-btn"
                onClick={() => onCloseChat?.()}
                aria-label="Close chat"
                title="Close chat"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
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
              borderRadius: "5px",
              marginBottom: "10px",
              display: "flex",
              flexDirection: "column",
              justifyContent:
                messages.length === 0 ? "center" : "flex-start",
              alignItems: messages.length === 0 ? "center" : "stretch",
            }}
          >
            {messages.length === 0 && !isLoading ? (
              <div
                style={{ color: "#aaa", fontSize: "16px", textAlign: "center" }}
              >
                Looks quiet. Drop your first idea here.
              </div>
            ) : (
              displayMessages.map((msg, index) => {
                const pos = groupPositions[index] || { isFirstInGroup: true, isLastInGroup: true, isLastOutgoingInGroup: false };
                return (
                  <MessageItem
                    key={msg.messageId || msg.optimisticId || String(msg.timestamp)}
                    msg={msg as ChatMessage}
                    prevMsg={(index > 0 ? displayMessages[index - 1] : null) as ChatMessage | null}
                    nextMsg={(index < displayMessages.length - 1 ? displayMessages[index + 1] : null) as ChatMessage | null}
                    userData={userData}
                    allUsers={allUsers}
                    openPreviewModal={openPreviewModal}
                    folderKey={folderKey}
                    renderFilePreview={renderFilePreview}
                    getFileNameFromUrl={getFileNameFromUrl}
                    onDelete={(m: ChatMessage) => setDeleteTarget(m as Message)}
                    onEditRequest={(m: ChatMessage) => setEditTarget(m as Message)}
                    onReact={reactToMessage}
                    isFirstInGroup={pos.isFirstInGroup}
                    isLastInGroup={pos.isLastInGroup}
                    isLastOutgoingInGroup={pos.isLastOutgoingInGroup}
                    projectColor={activeProject?.color as string | undefined}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} style={{ height: "1px", flexShrink: 0 }} />
          </div>
        )}

        {open && (
          <div className="message-input-container">
            <div className="message-input-inner">
              <div
                className="message-action-wrapper"
                ref={actionMenuRef}
              >
                <button
                  type="button"
                  className="message-icon-button"
                  onClick={toggleActionMenu}
                  aria-label="Open message actions"
                  aria-haspopup="true"
                  aria-expanded={showActionMenu}
                >
                  <Plus size={18} />
                </button>
                {showActionMenu && (
                  <div
                    className="message-action-menu"
                    role="menu"
                    aria-label="Message actions"
                  >
                    <button
                      type="button"
                      className="message-action-menu-button"
                      onClick={triggerFileDialog}
                      role="menuitem"
                    >
                      <Paperclip size={14} />
                      <span>File</span>
                    </button>
                    <button
                      type="button"
                      className="message-action-menu-button"
                      onClick={openCreateNote}
                      role="menuitem"
                    >
                      <FileText size={14} />
                      <span>Note</span>
                    </button>
                    <button
                      type="button"
                      className="message-action-menu-button"
                      onClick={toggleEmojiPicker}
                      role="menuitem"
                    >
                      <Smile size={14} />
                      <span>Emoji</span>
                    </button>
                  </div>
                )}
                {showEmojiPicker && (
                  <div className="emoji-picker" role="menu">
                    {DEFAULT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="emoji-button"
                        onClick={() => handleEmojiSelect(emoji)}
                        aria-label={`Insert ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder={`Message ${projectName}`}
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
            <button
              type="button"
              onClick={sendMessage}
              className="send-button"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="message-file-input"
              onChange={handleFileInputChange}
              multiple
            />
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
              const ext =
                selectedPreviewFile.fileName.split(".").pop()?.toLowerCase() ||
                "";
              if (["jpg", "jpeg", "png"].includes(ext)) {
                return (
                  <img
                    src={getFileUrl(
                      fileUrlsToKeys([
                        selectedPreviewFile.finalUrl || selectedPreviewFile.url,
                      ])[0]
                    )}
                    alt={selectedPreviewFile.fileName}
                    className="preview-image"
                  />
                );
              } else if (ext === "pdf") {
                return (
                  <PDFPreview
                    url={selectedPreviewFile.finalUrl || selectedPreviewFile.url}
                    className="preview-pdf"
                    title={selectedPreviewFile.fileName}
                  />
                );
              } else {
                return renderFilePreview(selectedPreviewFile, folderKey);
              }
            })()}

            <div className="preview-header">
              <button
                onClick={closePreviewModal}
                className="modal-button secondary"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <a
                href={getFileUrl(
                  fileUrlsToKeys([selectedPreviewFile.url])[0]
                )}
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

      <NoteEditorModal
        isOpen={noteEditorState.isOpen}
        mode={noteEditorState.isOpen ? noteEditorState.mode : "create"}
        projectId={projectId}
        canEdit={canEditTextFiles}
        openFile={
          noteEditorState.isOpen && noteEditorState.mode === "open"
            ? { fileUrl: noteEditorState.fileUrl, fileName: noteEditorState.fileName, initialTitle: noteEditorState.initialTitle }
            : undefined
        }
        onCreate={createNote}
        onRequestClose={() => setNoteEditorState({ isOpen: false })}
      />

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
    </>
  );
};

export default ProjectMessagesThread;









