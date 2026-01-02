import React, { useEffect, useMemo, useRef, useState } from "react";
import User from "@/assets/svg/user.svg?react";
import { useOnlineStatus } from '@/app/contexts/OnlineStatusContext';
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import ReactPlayer from "react-player";
// import "../../../../index.css";
import { normalizeFileUrl, getFileUrl } from "../../../shared/utils/api";
import ReactionBar from "@/shared/ui/ReactionBar";
import { ChatMessage, ChatFile, DMFile } from "@/shared/utils/messageUtils";
import Modal from "@/shared/ui/ModalWithStack";

type Emoji = string;

export type { ChatMessage };

const LONG_MESSAGE_INLINE_THRESHOLD = { lines: 14, chars: 900 };
const LONG_MESSAGE_INLINE_CLAMP = { lines: 12, chars: 800 };
const LONG_MESSAGE_READER_THRESHOLD = { lines: 60, chars: 4000 };
const LONG_MESSAGE_READER_PREVIEW = { lines: 10, chars: 1200 };
const LONG_MESSAGE_COLLAPSE_ANIM_MS = 220;
const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;
const TIME_SEPARATOR_GAP_MS = 15 * 60 * 1000; // 15 minutes gap triggers time separator

const countTextLines = (text: string) => {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
};

const makePreviewText = (text: string, maxLines: number, maxChars: number) => {
  if (!text) return "";

  const limitedByLines = text
    .split(/\r\n|\r|\n/)
    .slice(0, maxLines)
    .join("\n");

  if (limitedByLines.length <= maxChars) return limitedByLines;

  const sliced = limitedByLines.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  const safeCut = lastSpace > Math.floor(maxChars * 0.7) ? sliced.slice(0, lastSpace) : sliced;
  return `${safeCut}…`;
};

const safeDomId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, "_");

const preserveScrollAnchor = (container: HTMLElement, anchor: HTMLElement, mutate: () => void) => {
  const containerTop = container.getBoundingClientRect().top;
  const before = anchor.getBoundingClientRect().top - containerTop;
  mutate();
  requestAnimationFrame(() => {
    const after = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += after - before;
  });
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / permission issues
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Derive a muted/subdued bubble color from a project color.
 * Mixes the color with dark background and reduces saturation for a softer look.
 */
function deriveMutedBubbleColor(color?: string | null): string {
  const fallback = "rgba(250, 51, 86, 0.85)"; // Muted brand red
  if (!color) return fallback;

  // Parse hex color
  let hex = color.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6 || !/^[0-9a-fA-F]+$/.test(hex)) return fallback;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Mix with dark background (#1a1a1a) at 30% to mute the color
  const bgR = 26, bgG = 26, bgB = 26;
  const mixFactor = 0.25;
  const mixR = Math.round(r * (1 - mixFactor) + bgR * mixFactor);
  const mixG = Math.round(g * (1 - mixFactor) + bgG * mixFactor);
  const mixB = Math.round(b * (1 - mixFactor) + bgB * mixFactor);

  // Return with slight transparency for softer appearance
  return `rgba(${mixR}, ${mixG}, ${mixB}, 0.92)`;
}

// Move this component outside to prevent recreation on every render
const RenderLinkContent: React.FC<{ url: string }> = React.memo(({ url }) => {
  const isVideoUrl = /youtu\.be|youtube\.com|vimeo\.com/.test(url);

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }, [url]);

  // Placeholder to prevent layout shift if both favicon sources fail
  const placeholder =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%234ea1f3'/%3E%3Cpath d='M5.75 10.25l4.5-4.5M6.5 5.75h3.75V9.5' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

  const primarySrc = useMemo(() => (domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : placeholder), [domain]);
  const fallbackSrc = useMemo(
    () => (domain ? `https://www.google.com/s2/favicons?sz=16&domain=${domain}` : placeholder),
    [domain]
  );

  const [iconSrc, setIconSrc] = React.useState<string>(primarySrc);
  const triedFallbackRef = React.useRef(false);

  React.useEffect(() => {
    // Reset when URL/domain changes
    setIconSrc(primarySrc);
    triedFallbackRef.current = false;
  }, [primarySrc]);

  if (isVideoUrl) {
    return (
      <div style={{ maxWidth: "300px" }}>
        <ReactPlayer src={url} width="100%" height="200px" controls />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "300px" }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#4ea1f3", display: "flex", alignItems: "center" }}
      >
        <img
          src={iconSrc}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          style={{ width: 16, height: 16, marginRight: 4, flex: "0 0 16px" }}
          referrerPolicy="no-referrer"
          onError={() => {
            if (!triedFallbackRef.current) {
              triedFallbackRef.current = true;
              setIconSrc(fallbackSrc);
            } else if (iconSrc !== placeholder) {
              setIconSrc(placeholder);
            }
          }}
        />
        {url}
      </a>
    </div>
  );
});

RenderLinkContent.displayName = "RenderLinkContent";

export interface SimpleUser {
  userId?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  thumbnail?: string;
  profilePicture?: string;
  photoUrl?: string;
  avatar?: string;
  avatarUrl?: string;
  image?: string;
  profileImage?: string;
  picture?: string;
}

interface MessageItemProps {
  msg: ChatMessage;
  prevMsg?: ChatMessage | null;
  nextMsg?: ChatMessage | null;
  userData?: SimpleUser | null;
  allUsers?: SimpleUser[];
  openPreviewModal: (file: ChatFile | DMFile) => void;
  folderKey: string;
  renderFilePreview: (file: ChatFile | DMFile, folderKey: string) => React.ReactNode;
  getFileNameFromUrl: (url?: string) => string;
  onDelete?: (msg: ChatMessage) => void;
  onEditRequest?: (msg: ChatMessage) => void;
  onReact?: (messageId: string, emoji: Emoji) => void;
  /** True if this is the first message in a sender group */
  isFirstInGroup?: boolean;
  /** True if this is the last message in a sender group */
  isLastInGroup?: boolean;
  /** True if this outgoing message is the last one in the current outgoing group */
  isLastOutgoingInGroup?: boolean;
  /** Project color for outgoing message bubbles */
  projectColor?: string | null;
}

const MessageItem: React.FC<MessageItemProps> = ({
  msg,
  prevMsg,
  nextMsg,
  userData,
  allUsers = [],
  openPreviewModal,
  folderKey,
  renderFilePreview,
  getFileNameFromUrl,
  onDelete,
  onEditRequest,
  onReact,
  isFirstInGroup = false,
  isLastInGroup = false,
  isLastOutgoingInGroup = false,
  projectColor,
}) => {
  const { isOnline } = useOnlineStatus() as { isOnline: (id?: string | null) => boolean };
  const isCurrentUser = msg.senderId === (userData?.userId ?? "");
  const sender = allUsers.find((u) => u.userId === msg.senderId) || ({} as SimpleUser);
  const getDisplayName = (u?: SimpleUser | null) =>
    u
      ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
        (u.username as string | undefined) ||
        (u.email as string | undefined) ||
        (u.userId ?? "Unknown")
      : "Unknown";
  const getThumbnail = (u?: SimpleUser | null) =>
    u?.thumbnail ||
    u?.profilePicture ||
    u?.photoUrl ||
    u?.avatar ||
    u?.avatarUrl ||
    u?.image ||
    u?.profileImage ||
    u?.picture ||
    undefined;
  const senderName = isCurrentUser ? "You" : getDisplayName(sender);
  const senderThumbnail = isCurrentUser ? getThumbnail(userData) : getThumbnail(sender);
  const isSenderOnline = isOnline(msg.senderId);

  const senderThumbnailUrl =
    senderThumbnail && senderThumbnail.startsWith("http")
      ? senderThumbnail
      : senderThumbnail
        ? getFileUrl(senderThumbnail)
        : undefined;

 
  const [showReactions, setShowReactions] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const userReactions = useMemo<Emoji[]>(() => {
    const arr: Emoji[] = [];
    const reactions = msg.reactions || {};
    Object.entries(reactions).forEach(([emoji, users]) => {
      if (users.includes(userData?.userId ?? "")) arr.push(emoji);
    });
    return arr;
  }, [msg.reactions, userData?.userId]);

  const text = msg.text ?? "";
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const matchedUrl = text.match(urlRegex)?.[0];
  const messageKey = msg.messageId || msg.optimisticId || String(msg.timestamp);
  const longMessageBodyId = `long_message_${safeDomId(messageKey)}_body`;

  const isPlainTextBody =
    !msg.file && !(text && /mylg-files-v\d+/.test(text)) && !matchedUrl && !!text;

  const longMessageMetrics = useMemo(() => {
    if (!isPlainTextBody) return { lines: 0, chars: 0 };
    return { lines: countTextLines(text), chars: text.length };
  }, [isPlainTextBody, text]);

  const isLongMessage =
    isPlainTextBody &&
    (longMessageMetrics.lines > LONG_MESSAGE_INLINE_THRESHOLD.lines ||
      longMessageMetrics.chars > LONG_MESSAGE_INLINE_THRESHOLD.chars);

  const isMassiveMessage =
    isPlainTextBody &&
    (longMessageMetrics.lines > LONG_MESSAGE_READER_THRESHOLD.lines ||
      longMessageMetrics.chars > LONG_MESSAGE_READER_THRESHOLD.chars);

  const inlinePreview = useMemo(() => {
    if (!isLongMessage) return text;
    return makePreviewText(text, LONG_MESSAGE_INLINE_CLAMP.lines, LONG_MESSAGE_INLINE_CLAMP.chars);
  }, [isLongMessage, text]);

  const massivePreview = useMemo(() => {
    if (!isMassiveMessage) return inlinePreview;
    return makePreviewText(text, LONG_MESSAGE_READER_PREVIEW.lines, LONG_MESSAGE_READER_PREVIEW.chars);
  }, [inlinePreview, isMassiveMessage, text]);

  const [inlineExpanded, setInlineExpanded] = useState(false);
  const [inlineCollapsing, setInlineCollapsing] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusToOpenButtonRef = useRef(false);

  useEffect(() => {
    if (!isLongMessage) {
      setInlineExpanded(false);
      setInlineCollapsing(false);
    }
  }, [isLongMessage]);

  useEffect(() => {
    if (!readerOpen) return;
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [readerOpen]);

  useEffect(() => {
    if (readerOpen) return;
    if (!returnFocusToOpenButtonRef.current) return;
    returnFocusToOpenButtonRef.current = false;
    const t = window.setTimeout(() => openButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [readerOpen]);

  const toggleInlineExpanded = () => {
    const bubble = bubbleRef.current;
    const container = bubble?.closest(".chat-messages") as HTMLElement | null;

    if (inlineExpanded) {
      const mutate = () => {
        setInlineCollapsing(true);
        setInlineExpanded(false);
      };

      if (bubble && container) preserveScrollAnchor(container, bubble, mutate);
      else mutate();

      window.setTimeout(() => setInlineCollapsing(false), LONG_MESSAGE_COLLAPSE_ANIM_MS);
      return;
    }

    const mutate = () => {
      setInlineCollapsing(false);
      setInlineExpanded(true);
    };

    if (bubble && container) preserveScrollAnchor(container, bubble, mutate);
    else mutate();
  };

  const jumpToThisMessage = () => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    setReaderOpen(false);

    requestAnimationFrame(() => {
      bubble.scrollIntoView({ behavior: "smooth", block: "center" });
      bubble.classList.add("message-highlight");
      window.setTimeout(() => bubble.classList.remove("message-highlight"), 1400);
      bubble.focus();
    });
  };

  const messageDate = new Date(msg.timestamp);
  const formattedDate = messageDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = messageDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isOptimistic = (msg as any)?.optimistic === true;
  const isEdited = (msg as any)?.edited === true || !!(msg as any)?.editedAt;
  const isFailed = (msg as any)?.failed === true || !!(msg as any)?.error;

  const outgoingHeaderStatus =
    isOptimistic ? "Sending…" : isFailed ? "Failed" : isEdited ? "Edited" : null;

  // Build underbar meta - timestamp and edited now only shown on hover
  const statusText = useMemo(() => {
    if (isOptimistic) return "Sending…";
    if (isFailed) return "Failed";
    return null;
  }, [isFailed, isOptimistic]);

  // For accessibility label
  const underbarMetaText = statusText || formattedTime;

  const hasReactions = useMemo(
    () => Object.values(msg.reactions || {}).some((users) => Array.isArray(users) && users.length > 0),
    [msg.reactions]
  );

  const handleEmojiClick = (emoji: Emoji) => {
    const id = msg.messageId || msg.optimisticId;
    if (id && onReact) onReact(id, emoji);
    setShowReactions(false);
  };

  const canEdit = isCurrentUser && !!text && !matchedUrl && !msg.file;
  const canDelete = isCurrentUser;
  const canCopy = !!text;

  useEffect(() => {
    if (!menuOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const parseTs = (m?: ChatMessage | null) => {
    if (!m?.timestamp) return null;
    const d = new Date(m.timestamp as any);
    return Number.isNaN(+d) ? null : d;
  };

  const isGroupedWithPrev = useMemo(() => {
    if (!prevMsg) return false;
    if (prevMsg.senderId !== msg.senderId) return false;
    const a = parseTs(prevMsg);
    const b = parseTs(msg);
    if (!a || !b) return false;
    return Math.abs(+b - +a) <= MESSAGE_GROUP_WINDOW_MS;
  }, [msg.senderId, msg.timestamp, prevMsg]);

  // Time separator: show when gap > 15 min OR first message of the day
  const showTimeSeparator = useMemo(() => {
    if (!prevMsg) return false; // First message shows date bubble, not time separator
    const prevTs = parseTs(prevMsg);
    const currTs = parseTs(msg);
    if (!prevTs || !currTs) return false;
    // Same day check already handled by date bubble
    const prevDay = prevTs.toDateString();
    const currDay = currTs.toDateString();
    if (prevDay !== currDay) return false; // Date bubble will show instead
    return Math.abs(+currTs - +prevTs) >= TIME_SEPARATOR_GAP_MS;
  }, [msg.timestamp, prevMsg]);

  const timeSeparatorText = useMemo(() => {
    if (!showTimeSeparator) return '';
    return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [showTimeSeparator, messageDate]);

  // Use passed props for group position, fallback to computed
  const showAuthorRow = isFirstInGroup || !isGroupedWithPrev;

  const showIncomingAuthorRow = !isCurrentUser && showAuthorRow;
  // Always show outgoing author row for first in group (mirroring sender behavior)
  const showOutgoingAuthorRow = isCurrentUser && showAuthorRow;

  // date bubble logic
  let showDateBubble = !prevMsg;
  if (prevMsg) {
    const prevDate = new Date(prevMsg.timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (formattedDate !== prevDate) showDateBubble = true;
  }

  // helper to render file/text/url
  const renderBody = () => {
    if (msg.file) {
      return (
        <div onClick={() => openPreviewModal(msg.file!)} style={{ cursor: "pointer" }}>
          {renderFilePreview(msg.file!, folderKey)}
        </div>
      );
    }
    if (text && /mylg-files-v\d+/.test(text)) {
      const url = normalizeFileUrl(text);
      const file: ChatFile = { fileName: getFileNameFromUrl(url), url };
      return (
        <div
          onClick={() => openPreviewModal(file)}
          style={{ cursor: "pointer" }}
        >
          {renderFilePreview(file, folderKey)}
        </div>
      );
    }
    if (matchedUrl) {
      return <RenderLinkContent url={matchedUrl} />;
    }

    if (!isPlainTextBody || !isLongMessage) {
      return <div className="message-body">{text}</div>;
    }

    const showFullText = inlineExpanded || inlineCollapsing;
    const collapsed = !inlineExpanded;
    const displayText = showFullText ? text : (isMassiveMessage ? massivePreview : inlinePreview);

    return (
      <div className={`long-message ${isMassiveMessage ? "long-message--massive" : ""}`}>
        {isMassiveMessage && <div className="long-message-title">Long message</div>}

        <div
          id={longMessageBodyId}
          className={`long-message-body ${collapsed ? "is-collapsed" : "is-expanded"}`}
        >
          <pre className="long-message-text">{displayText}</pre>
        </div>

        <div className="long-message-controls">
          <button
            type="button"
            className="long-message-btn long-message-btn--link"
            onClick={toggleInlineExpanded}
            aria-expanded={inlineExpanded}
            aria-controls={longMessageBodyId}
            aria-label={inlineExpanded ? "Show less" : "Read more"}
          >
            {inlineExpanded ? "Show less" : "… more"}
          </button>

          {isMassiveMessage && (
            <button
              type="button"
              className="long-message-btn long-message-btn--link"
              onClick={() => {
                returnFocusToOpenButtonRef.current = true;
                setReaderOpen(true);
              }}
              ref={openButtonRef}
              aria-label="Open in reader"
            >
              Open
            </button>
          )}
        </div>

        {isMassiveMessage && (
          <Modal
            isOpen={readerOpen}
            onRequestClose={() => setReaderOpen(false)}
            ariaHideApp={false}
            shouldCloseOnOverlayClick
            closeTimeoutMS={180}
            className={{
              base: "long-message-reader",
              afterOpen: "long-message-reader--after-open",
              beforeClose: "long-message-reader--before-close",
            }}
            overlayClassName={{
              base: "long-message-reader-overlay",
              afterOpen: "long-message-reader-overlay--after-open",
              beforeClose: "long-message-reader-overlay--before-close",
            }}
            contentLabel="Long message reader"
          >
            <div className="long-message-reader-header">
              <div className="long-message-reader-title">Long message</div>
              <div className="long-message-reader-actions">
                <button
                  type="button"
                  className="long-message-reader-btn"
                  onClick={() => copyTextToClipboard(text)}
                >
                  Copy all
                </button>
                <button
                  type="button"
                  className="long-message-reader-btn"
                  onClick={jumpToThisMessage}
                >
                  Jump to message
                </button>
                <button
                  type="button"
                  className="long-message-reader-btn long-message-reader-btn--primary"
                  onClick={() => setReaderOpen(false)}
                  ref={closeButtonRef}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="long-message-reader-body">
              <pre className="long-message-reader-text">{text}</pre>
            </div>
          </Modal>
        )}
      </div>
    );
  };

  return (
    <>
      {showDateBubble && <div className="date-bubble">{formattedDate}</div>}
      {showTimeSeparator && (
        <div className="time-separator">
          <span className="time-separator-pill">{timeSeparatorText}</span>
        </div>
      )}

      <div
        className={`message-row ${isCurrentUser ? "current-user message-row--outgoing" : "message-row--incoming"} ${isGroupedWithPrev && !showTimeSeparator ? "message-row--grouped" : ""} ${isFirstInGroup ? "message-row--first-in-group" : ""} ${isLastInGroup ? "message-row--last-in-group" : ""} ${menuOpen || showReactions ? "message-row--active" : ""}`}
      >
        {(showIncomingAuthorRow || showOutgoingAuthorRow) && (
          <div className="message-author-row">
            {!isCurrentUser ? (
              <>
                <span className="message-author-avatar-wrap" aria-hidden="true">
                  {senderThumbnail ? (
                    <img
                      src={senderThumbnailUrl}
                      alt=""
                      className="message-author-avatar"
                    />
                  ) : (
                    <User className="message-author-avatar" />
                  )}
                  {isSenderOnline && <span className="online-indicator" />}
                </span>
                <div className="message-author-name">{senderName}</div>
              </>
            ) : (
              <>
                <div className="message-author-name">You</div>
                {outgoingHeaderStatus && (
                  <div className="message-author-status">{outgoingHeaderStatus}</div>
                )}
                <span className="message-author-avatar-wrap" aria-hidden="true">
                  {senderThumbnail ? (
                    <img
                      src={senderThumbnailUrl}
                      alt=""
                      className="message-author-avatar"
                    />
                  ) : (
                    <User className="message-author-avatar" />
                  )}
                </span>
              </>
            )}
          </div>
        )}

        <div className="message-stack">
          <div className="bubble-container">
            <div
              className="message-bubble"
              style={{ background: isCurrentUser ? deriveMutedBubbleColor(projectColor) : "#333" }}
              ref={bubbleRef}
              tabIndex={0}
            >
              <ReactionBar
                visible={showReactions}
                anchorRef={bubbleRef}
                selected={userReactions}
                onSelect={handleEmojiClick}
                onClose={() => setShowReactions(false)}
              />

              <div style={{ marginBottom: 5 }}>{renderBody()}</div>
            </div>

            <div className="message-underbar" aria-label="Message controls">
              {!isCurrentUser && (
                <>
                  {/* Reactions always visible if present */}
                  <div className="message-underbar-reactions">
                    {hasReactions &&
                      Object.entries(msg.reactions || {}).map(([emoji, users]) =>
                        users.length > 0 ? (
                          <button
                            key={emoji}
                            type="button"
                            className={`reaction-chip ${userReactions.includes(emoji) ? "is-selected" : ""}`}
                            onClick={() => handleEmojiClick(emoji)}
                            aria-label={`React ${emoji} (${users.length})`}
                          >
                            <span className="reaction-chip-emoji">{emoji}</span>
                            <span className="reaction-chip-count">{users.length}</span>
                          </button>
                        ) : null
                      )}
                  </div>

                  {/* Hover-reveal: timestamp, edited, action buttons */}
                  <div className="message-underbar-hover-reveal">
                    <span className="message-underbar-meta message-underbar-meta--time">{formattedTime}</span>
                    {isEdited && <span className="message-underbar-meta message-underbar-meta--edited">Edited</span>}
                    <div className="message-underbar-buttons">
                      <button
                        type="button"
                        className="message-underbar-btn"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowReactions((p) => !p);
                        }}
                        aria-label="Add reaction"
                        title="Add reaction"
                      >
                        <Plus size={15} />
                      </button>
                      <button
                        type="button"
                        className="message-underbar-btn"
                        aria-label="Message actions"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((v) => !v)}
                        ref={menuButtonRef}
                        title="Message actions"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {isCurrentUser && (
                <>
                  {/* Hover-reveal: action buttons, timestamp, edited */}
                  <div className="message-underbar-hover-reveal">
                    <div className="message-underbar-buttons">
                      <button
                        type="button"
                        className="message-underbar-btn"
                        aria-label="Message actions"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((v) => !v)}
                        ref={menuButtonRef}
                        title="Message actions"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      <button
                        type="button"
                        className="message-underbar-btn"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowReactions((p) => !p);
                        }}
                        aria-label="Add reaction"
                        title="Add reaction"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    {isEdited && <span className="message-underbar-meta message-underbar-meta--edited">Edited</span>}
                    <span className="message-underbar-meta message-underbar-meta--time">{formattedTime}</span>
                  </div>

                  {/* Reactions always visible if present */}
                  <div className="message-underbar-reactions">
                    {hasReactions &&
                      Object.entries(msg.reactions || {}).map(([emoji, users]) =>
                        users.length > 0 ? (
                          <button
                            key={emoji}
                            type="button"
                            className={`reaction-chip ${userReactions.includes(emoji) ? "is-selected" : ""}`}
                            onClick={() => handleEmojiClick(emoji)}
                            aria-label={`React ${emoji} (${users.length})`}
                          >
                            <span className="reaction-chip-emoji">{emoji}</span>
                            <span className="reaction-chip-count">{users.length}</span>
                          </button>
                        ) : null
                      )}
                  </div>

                  {/* Delivery status: only on last outgoing message in group */}
                  {isLastOutgoingInGroup && statusText && (
                    <div className="message-underbar-status">
                      <span className="message-status-indicator">{statusText}</span>
                    </div>
                  )}
                </>
              )}

              {menuOpen && (
                <div className="message-actions-menu" role="menu" ref={menuRef}>
                  {canCopy && (
                    <button
                      type="button"
                      className="message-actions-item"
                      role="menuitem"
                      onClick={async () => {
                        await copyTextToClipboard(text);
                        setMenuOpen(false);
                      }}
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="message-actions-item"
                      role="menuitem"
                      onClick={() => {
                        onEditRequest?.(msg);
                        setMenuOpen(false);
                      }}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="message-actions-item message-actions-item--danger"
                      role="menuitem"
                      onClick={() => {
                        onDelete?.(msg);
                        setMenuOpen(false);
                      }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                  {/* Metadata footer in menu */}
                  <div className="message-actions-meta">
                    <span>{formattedDate} · {formattedTime}</span>
                    {isEdited && <span className="message-actions-edited">Edited</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MessageItem;








