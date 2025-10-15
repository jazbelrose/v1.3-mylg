import React, { useMemo, useRef, useState } from "react";
import User from "@/assets/svg/user.svg?react";
import { useOnlineStatus } from '@/app/contexts/OnlineStatusContext';
import { Trash2, Pencil, Smile } from "lucide-react";
import ReactPlayer from "react-player";
// import "../../../../index.css";
import { normalizeFileUrl, getFileUrl } from "../../../shared/utils/api";
import ReactionBar from "@/shared/ui/ReactionBar";
import { ChatMessage, ChatFile, DMFile } from "@/shared/utils/messageUtils";

type Emoji = string;

export type { ChatMessage };

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
  userData?: SimpleUser | null;
  allUsers?: SimpleUser[];
  openPreviewModal: (file: ChatFile | DMFile) => void;
  folderKey: string;
  renderFilePreview: (file: ChatFile | DMFile, folderKey: string) => React.ReactNode;
  getFileNameFromUrl: (url?: string) => string;
  onDelete?: (msg: ChatMessage) => void;
  onEditRequest?: (msg: ChatMessage) => void;
  onReact?: (messageId: string, emoji: Emoji) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
  msg,
  prevMsg,
  userData,
  allUsers = [],
  openPreviewModal,
  folderKey,
  renderFilePreview,
  getFileNameFromUrl,
  onDelete,
  onEditRequest,
  onReact,
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

  const hasReactions = useMemo(
    () => Object.values(msg.reactions || {}).some((users) => Array.isArray(users) && users.length > 0),
    [msg.reactions]
  );

  const handleEmojiClick = (emoji: Emoji) => {
    const id = msg.messageId || msg.optimisticId;
    if (id && onReact) onReact(id, emoji);
    setShowReactions(false);
  };

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
    return text;
  };

  return (
    <>
      {showDateBubble && <div className="date-bubble">{formattedDate}</div>}

      <div className={`message-row ${isCurrentUser ? "current-user" : ""}`}>
        {!isCurrentUser && (
          <div className="avatar-wrapper">
            {senderThumbnail ? (
              <img src={senderThumbnailUrl} alt={senderName} className="avatar" />
            ) : (
              <User className="avatar" />
            )}
            {isSenderOnline && <span className="online-indicator" />}
          </div>
        )}

        <div className="bubble-container" style={{ position: "relative" }}>
          <div
            className="message-bubble"
            style={{ background: isCurrentUser ? "#FA3356" : "#333" }}
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
            <div className="message-time">{formattedTime}</div>
            <div className="message-sender">{senderName}</div>

            <div style={{ marginBottom: 5 }}>{renderBody()}</div>

            {hasReactions && (
              <div className="reaction-summary">
                {Object.entries(msg.reactions || {}).map(([emoji, users]) =>
                  users.length > 0 ? (
                    <span
                      key={emoji}
                      onClick={() => handleEmojiClick(emoji)}
                      className={userReactions.includes(emoji) ? "selected" : ""}
                    >
                      {emoji} {users.length}
                    </span>
                  ) : null
                )}
              </div>
            )}
          </div>

          <div className="action-bar">
            {isCurrentUser && (
              <>
                <button
                  className="action-btn"
                  onClick={() => onEditRequest?.(msg)}
                  aria-label="Edit message"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="action-btn"
                  onClick={() => onDelete?.(msg)}
                  aria-label="Delete message"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
            <button
              className="action-btn"
              onClick={() => setShowReactions((p) => !p)}
              aria-label="Add reaction"
              title="React"
            >
              <Smile size={12} />
            </button>
          </div>
        </div>

        {isCurrentUser && (
          <div className="avatar-wrapper">
            {senderThumbnail ? (
              <img src={senderThumbnailUrl} alt="You" className="avatar avatar-right" />
            ) : (
              <User className="avatar avatar-right" />
            )}
            {isSenderOnline && <span className="online-indicator" />}
          </div>
        )}
      </div>
    </>
  );
};

export default MessageItem;








