/**
 * ActivityPanel - Project activity feed with utility state
 * 
 * Features:
 * - Shows latest project activity (comments, approvals, uploads, edits)
 * - If empty, shows "utility state" with chat highlights and actions
 * - Single panel with internal scroll
 * - Same height as left panel (Events & Tasks)
 * - Gallery preview with lightbox carousel
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  FileUp,
  CheckCircle2,
  Edit3,
  Link2,
  Pin,
  ListTodo,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Presentation,
  Image as ImageIcon,
  Clock,
  X,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { getFileUrl } from '@/shared/utils/api';
import { FileThumb } from '@/shared/ui/FileThumb';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface ActivityEvent {
  activityId: string;
  type: string;
  summary: string;
  createdAt: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  metadata?: {
    entityType?: string;
    entityId?: string;
    link?: string;
  };
}

interface ChatMessage {
  messageId: string;
  text: string;
  timestamp: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  hasLink?: boolean;
  linkUrl?: string;
  isPinned?: boolean;
}

interface RecentFile {
  fileId: string;
  fileName: string;
  fileType?: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

interface RecentLink {
  linkId: string;
  url: string;
  title?: string;
  sharedAt: string;
  sharedBy?: string;
}

interface ActivityPanelProps {
  projectId: string;
  projectTitle?: string;
  activities: ActivityEvent[];
  recentMessages?: ChatMessage[];
  recentFiles?: RecentFile[];
  recentLinks?: RecentLink[];
  maxItems?: number;
  onViewAll?: () => void;
  onPinMessage?: (messageId: string) => void;
  onCreateTaskFromMessage?: (message: ChatMessage) => void;
  onOpenNote?: (file: RecentFile) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getActivityIcon(type: string): React.ReactNode {
  const typeLC = type?.toLowerCase() || '';
  
  if (typeLC.includes('comment') || typeLC.includes('message')) {
    return <MessageCircle size={14} />;
  }
  if (typeLC.includes('upload') || typeLC.includes('file')) {
    return <FileUp size={14} />;
  }
  if (typeLC.includes('approv') || typeLC.includes('complete') || typeLC.includes('done')) {
    return <CheckCircle2 size={14} />;
  }
  if (typeLC.includes('edit') || typeLC.includes('update')) {
    return <Edit3 size={14} />;
  }
  if (typeLC.includes('budget')) {
    return <DollarSign size={14} />;
  }
  if (typeLC.includes('slide') || typeLC.includes('deck')) {
    return <Presentation size={14} />;
  }
  if (typeLC.includes('gallery') || typeLC.includes('image')) {
    return <ImageIcon size={14} />;
  }
  if (typeLC.includes('task')) {
    return <ListTodo size={14} />;
  }
  
  return <Clock size={14} />;
}

function getActivityCategory(type: string): 'neutral' | 'success' | 'info' {
  const typeLC = type?.toLowerCase() || '';
  
  if (typeLC.includes('approv') || typeLC.includes('complete') || typeLC.includes('done')) {
    return 'success';
  }
  if (typeLC.includes('upload') || typeLC.includes('create')) {
    return 'info';
  }
  
  return 'neutral';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ActivityItemProps {
  activity: ActivityEvent;
  onClick?: () => void;
}

function ActivityItem({ activity, onClick }: ActivityItemProps) {
  const icon = getActivityIcon(activity.type);
  const category = getActivityCategory(activity.type);
  const categoryClass = category === 'success'
    ? styles.apItemSuccess
    : category === 'info'
      ? styles.apItemInfo
      : '';

  return (
    <div
      className={`${styles.apItem} ${categoryClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.apItemIcon}>{icon}</div>
      <div className={styles.apItemContent}>
        <div className={styles.apItemSummary}>{activity.summary}</div>
        <div className={styles.apItemMeta}>
          {activity.userName && <span>{activity.userName}</span>}
          <span>{formatRelativeTime(activity.createdAt)}</span>
        </div>
      </div>
      {activity.userAvatar && (
        <img
          src={activity.userAvatar}
          alt=""
          className={styles.apItemAvatar}
        />
      )}
    </div>
  );
}

interface ChatHighlightProps {
  message: ChatMessage;
  onPin?: () => void;
  onCreateTask?: () => void;
  onClick?: () => void;
}

function ChatHighlight({ message, onPin, onCreateTask, onClick }: ChatHighlightProps) {
  return (
    <div className={styles.apChatItem} onClick={onClick} role="button" tabIndex={0}>
      <div className={styles.apChatContent}>
        <div className={styles.apChatSender}>
          {message.senderName || 'Unknown'}
          {message.isPinned && <Pin size={10} className={styles.apPinnedIcon} />}
        </div>
        <div className={styles.apChatText}>{message.text}</div>
        {message.hasLink && message.linkUrl && (
          <a
            href={message.linkUrl}
            className={styles.apChatLink}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Link2 size={12} />
            <span>{message.linkUrl.replace(/^https?:\/\//, '').slice(0, 30)}...</span>
          </a>
        )}
        <div className={styles.apChatMeta}>
          {formatRelativeTime(message.timestamp)}
        </div>
      </div>
      <div className={styles.apChatActions}>
        <button
          type="button"
          className={styles.apChatAction}
          onClick={(e) => { e.stopPropagation(); onPin?.(); }}
          title="Pin message"
        >
          <Pin size={12} />
        </button>
        <button
          type="button"
          className={styles.apChatAction}
          onClick={(e) => { e.stopPropagation(); onCreateTask?.(); }}
          title="Create task from message"
        >
          <ListTodo size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// FILES LIGHTBOX
// ============================================================================

interface FilesLightboxProps {
  files: RecentFile[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onOpenFileManager: () => void;
  onOpenNote?: (file: RecentFile) => void;
}

function isNoteFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext === 'md' || ext === 'markdown' || ext === 'txt';
}

function FilesLightbox({ files, currentIndex, onClose, onNavigate, onOpenFileManager, onOpenNote }: FilesLightboxProps) {
  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(currentIndex > 0 ? currentIndex - 1 : files.length - 1);
  }, [currentIndex, files.length, onNavigate]);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(currentIndex < files.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, files.length, onNavigate]);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(currentIndex > 0 ? currentIndex - 1 : files.length - 1);
      if (e.key === 'ArrowRight') onNavigate(currentIndex < files.length - 1 ? currentIndex + 1 : 0);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, files.length, onClose, onNavigate]);

  if (typeof document === 'undefined' || files.length === 0) return null;

  const currentFile = files[currentIndex];
  const imageUrl = currentFile?.thumbnailUrl ? getFileUrl(currentFile.thumbnailUrl) : '';

  return createPortal(
    <div className={styles.lightboxOverlay} onClick={onClose}>
      <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.lightboxHeader}>
          <span className={styles.lightboxCounter}>
            {currentIndex + 1} / {files.length}
          </span>
          <div className={styles.lightboxActions}>
            <button
              type="button"
              className={styles.lightboxBtn}
              onClick={onOpenFileManager}
              title="Open in File Manager"
            >
              <FolderOpen size={18} />
              <span>Open Files</span>
            </button>
            <button
              type="button"
              className={styles.lightboxBtnClose}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* File name */}
        <div className={styles.lightboxFileName}>
          {currentFile?.fileName || 'Unknown file'}
        </div>

        {/* Image or Note preview */}
        <div className={styles.lightboxImageWrapper}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={currentFile?.fileName || 'File preview'}
              className={styles.lightboxImage}
            />
          ) : isNoteFile(currentFile?.fileName || '') && onOpenNote ? (
            <div className={styles.lightboxPlaceholder}>
              <FileText size={48} />
              <span>Note file</span>
              <button
                type="button"
                className={styles.lightboxOpenNoteBtn}
                onClick={() => {
                  onOpenNote(currentFile);
                  onClose();
                }}
              >
                Open Note
              </button>
            </div>
          ) : (
            <div className={styles.lightboxPlaceholder}>
              <FileUp size={48} />
              <span>No preview available</span>
            </div>
          )}
        </div>

        {/* Navigation arrows */}
        {files.length > 1 && (
          <>
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
              onClick={handlePrev}
              aria-label="Previous"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
              onClick={handleNext}
              aria-label="Next"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ActivityPanel({
  projectId,
  projectTitle,
  activities,
  recentMessages = [],
  recentFiles = [],
  recentLinks = [],
  maxItems = 15,
  onViewAll,
  onPinMessage,
  onCreateTaskFromMessage,
  onOpenNote,
}: ActivityPanelProps) {
  const navigate = useNavigate();
  
  // Lightbox state for file preview
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Resizable sections state
  const [feedHeight, setFeedHeight] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Default feed height based on container
  const getDefaultFeedHeight = useCallback((containerHeight: number) => {
    return Math.round(containerHeight * 0.35); // 35% for feed
  }, []);

  const clampFeedHeight = useCallback((height: number, containerHeight: number) => {
    const minFeed = 80;
    const minUtility = 120;
    const maxFeed = containerHeight - minUtility;
    return Math.max(minFeed, Math.min(height, maxFeed));
  }, []);

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const body = bodyRef.current;
      if (!body) return;

      const containerHeight = body.offsetHeight;
      const currentFeedHeight = feedHeight ?? getDefaultFeedHeight(containerHeight);

      draggingRef.current = { startY: event.clientY, startHeight: currentFeedHeight };
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);

      const onMove = (e: PointerEvent) => {
        const state = draggingRef.current;
        if (!state) return;
        const dy = e.clientY - state.startY;
        const next = clampFeedHeight(state.startHeight + dy, containerHeight);
        setFeedHeight(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        draggingRef.current = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      event.preventDefault();
    },
    [clampFeedHeight, feedHeight, getDefaultFeedHeight]
  );

  const handleResizeDoubleClick = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const containerHeight = body.offsetHeight;
    setFeedHeight(getDefaultFeedHeight(containerHeight));
  }, [getDefaultFeedHeight]);

  const { feedItems, feedCount } = useMemo(() => {
    const items: ActivityEvent[] = [];

    // Only include real activity events, NOT chat messages
    activities.forEach((a) => {
      if (!a?.activityId || !a?.createdAt) return;
      items.push(a);
    });

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      feedItems: items.slice(0, maxItems),
      feedCount: items.length,
    };
  }, [activities, maxItems]);

  const hasFeed = feedItems.length > 0;
  const hasMessages = recentMessages.length > 0;
  const hasFiles = recentFiles.length > 0;
  const hasLinks = recentLinks.length > 0;

  const handleViewAll = useCallback(() => {
    if (onViewAll) {
      onViewAll();
    } else {
      navigate(getProjectDashboardPath(projectId, projectTitle, '/activity'));
    }
  }, [onViewAll, navigate, projectId, projectTitle]);

  const handleOpenFiles = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('project-open-files', { detail: { projectId } })
      );
      return;
    }

    navigate(getProjectDashboardPath(projectId, projectTitle, '/gallery'));
  }, [navigate, projectId, projectTitle]);

  const handleActivityClick = useCallback((activity: ActivityEvent) => {
    // Navigate based on type
    const typeLC = activity.type?.toLowerCase() || '';
    let path = '';
    
    if (typeLC.includes('budget')) path = '/budget';
    else if (typeLC.includes('slide') || typeLC.includes('deck')) path = '/slides';
    else if (typeLC.includes('task')) path = '/tasks';
    else if (
      typeLC.includes('gallery') ||
      typeLC.includes('image') ||
      typeLC.includes('file') ||
      typeLC.includes('upload')
    ) {
      handleOpenFiles();
      return;
    }
    else if (typeLC.includes('message') || typeLC.includes('comment')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('project-open-chat'));
        return;
      }
      path = '/messages';
    }
    else if (typeLC.includes('link')) {
      const url = activity.metadata?.link;
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    
    if (path) {
      navigate(getProjectDashboardPath(projectId, projectTitle, path));
    }
  }, [navigate, projectId, projectTitle, handleOpenFiles]);

  const handleOpenMessages = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('project-open-chat'));
      return;
    }
    navigate(getProjectDashboardPath(projectId, projectTitle, '/messages'));
  }, [navigate, projectId, projectTitle]);

  return (
    <div className={styles.apPanel}>
      {/* Header */}
      <div className={styles.apHeader}>
        <h3 className={styles.apTitle}>Activity</h3>
        {feedCount > maxItems && (
          <button
            type="button"
            className={styles.apViewAll}
            onClick={handleViewAll}
          >
            View all <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={styles.apBody} ref={bodyRef}>
        <div 
          className={styles.apFeedRegion}
          style={feedHeight != null ? { height: feedHeight, flex: 'none' } : undefined}
        >
          <div className={styles.apFeedScroll}>
            {hasFeed ? (
              <div className={styles.apList}>
                {feedItems.map((activity) => (
                  <ActivityItem
                    key={activity.activityId}
                    activity={activity}
                    onClick={() => handleActivityClick(activity)}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.apFeedEmpty}>No recent activity</div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className={styles.apResizeHandle}
          onPointerDown={handleResizePointerDown}
          onDoubleClick={handleResizeDoubleClick}
          role="separator"
          aria-orientation="horizontal"
          tabIndex={0}
        >
          <div className={styles.apResizeGrip} aria-hidden="true" />
        </div>

        <div className={styles.apUtility}>
            {/* Messages Section */}
            <div className={styles.apUtilitySection}>
              <div className={styles.apSectionHeader}>
                <MessageCircle size={14} />
                <span>Messages</span>
                <button
                  type="button"
                  className={styles.apSectionLink}
                  onClick={handleOpenMessages}
                >
                  Open Chat
                </button>
              </div>
              {hasMessages ? (
                <div className={styles.apSectionContent}>
                  {recentMessages.slice(0, 3).map(msg => (
                    <div
                      key={msg.messageId}
                      className={styles.apMiniMessage}
                      onClick={handleOpenMessages}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={styles.apMiniSender}>{msg.senderName?.split(' ')[0] || 'User'}:</span>
                      <span className={styles.apMiniText}>{msg.text.slice(0, 60)}{msg.text.length > 60 ? '…' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.apSectionEmpty}>No messages yet</div>
              )}
            </div>

            {/* Recent Files Section */}
            <div className={styles.apUtilitySection}>
              <div className={styles.apSectionHeader}>
                <FileUp size={14} />
                <span>Recent Files</span>
                <button
                  type="button"
                  className={styles.apSectionLink}
                  onClick={() => {
                    if (recentFiles.length > 0) {
                      setLightboxIndex(0);
                      setLightboxOpen(true);
                    } else {
                      handleOpenFiles();
                    }
                  }}
                >
                  Gallery
                </button>
              </div>
              {hasFiles ? (
                <div className={styles.apFilesGrid}>
                  {recentFiles.slice(0, 4).map((file, idx) => (
                    <div
                      key={file.fileId}
                      className={styles.apFileThumb}
                      title={file.fileName}
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <FileThumb
                        url={file.thumbnailUrl}
                        thumbnailUrl={file.thumbnailUrl}
                        fileName={file.fileName}
                        mimeType={file.fileType}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.apSectionEmpty}>No uploads yet</div>
              )}
            </div>

            {/* Recent Links Section */}
            <div className={styles.apUtilitySection}>
              <div className={styles.apSectionHeader}>
                <Link2 size={14} />
                <span>Links</span>
              </div>
              {hasLinks ? (
                <div className={styles.apSectionContent}>
                  {recentLinks.slice(0, 3).map(link => (
                    <a
                      key={link.linkId}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.apLinkItem}
                    >
                      <Link2 size={12} />
                      <span>{link.title || link.url.replace(/^https?:\/\//, '').slice(0, 35)}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className={styles.apSectionEmpty}>No links shared yet</div>
              )}
            </div>
        </div>
      </div>

      {/* Files Lightbox */}
      {lightboxOpen && recentFiles.length > 0 && (
        <FilesLightbox
          files={recentFiles}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={(idx) => setLightboxIndex(idx)}
          onOpenFileManager={handleOpenFiles}
          onOpenNote={onOpenNote}
        />
      )}
    </div>
  );
}

export default ActivityPanel;
