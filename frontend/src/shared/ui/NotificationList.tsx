/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { useNotifications } from '../../app/contexts/useNotifications';
import { useNotificationSocket } from '../../app/contexts/useNotificationSocket';
import { useData } from '@/app/contexts/useData';
import ProjectAvatar from './ProjectAvatar';
import { Check } from 'lucide-react';
import './Notifications.css';

export interface Notification {
  ['timestamp#uuid']: string;
  senderId?: string;
  projectId?: string;
  message: string;
  timestamp: string;
  read?: boolean;
}

type SlideDigestPayload = {
  slideIds?: string[];
  added?: number;
  deleted?: number;
  renamed?: number;
  updated?: number;
};

function formatSlideDigest(payload: SlideDigestPayload = {}): string {
  const { slideIds, added = 0, deleted = 0, renamed = 0, updated = 0 } = payload;
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (renamed) parts.push(`${renamed} renamed`);
  if (deleted) parts.push(`${deleted} deleted`);
  if (updated) parts.push(`${updated} updated`);

  const verbs = parts.length ? parts.join(', ') : 'updates';
  const count = slideIds?.length ?? updated ?? 0;
  const plural = count === 1 ? '' : 's';
  return `Edited ${count} slide${plural} — ${verbs}.`;
}

export function formatNotification(msg: string): string {
  if (msg === undefined || msg === null) {
    return '';
  }

  let normalized = typeof msg === 'string' ? msg : String(msg);
  normalized = normalized.trim();

  if (!normalized.length) {
    return '';
  }

  if (normalized === '[object Object]') {
    return 'Updated slides.';
  }

  try {
    // Handle "slides: [object Object], ..." messages
    if (normalized.startsWith('slides: ')) {
      const slidesPart = normalized.replace('slides: ', '');
      if (slidesPart.startsWith('[') && slidesPart.endsWith(']')) {
        const slides = JSON.parse(slidesPart);
        if (Array.isArray(slides)) {
          const count = slides.length;
          if (count === 0) return 'No slides updated.';
          if (count === 1) return 'Edited 1 slide.';
          
          // If slides have IDs, list them; otherwise, just the count
          const slideIds = slides.map((slide: any) => slide?.id || slide?.slideId).filter(Boolean);
          if (slideIds.length === count) {
            return `Edited slides ${slideIds.join(', ')}.`;
          } else {
            return `Edited ${count} slides.`;
          }
        }
      }
    }

    if (normalized.startsWith('\uD83D\uDCE6 Parsed Payload: ')) {
      const payload = JSON.parse(normalized.replace('\uD83D\uDCE6 Parsed Payload: ', ''));
      if (payload.action === 'projectUpdated') {
        return `Project ${payload.projectId} was updated.`;
      }
      if (payload.action === 'timelineUpdated') {
        return `Timeline updated on project ${payload.projectId}.`;
      }
    }

    if (normalized.startsWith('{') && normalized.endsWith('}')) {
      const parsed = JSON.parse(normalized);
      if (parsed) {
        if (typeof parsed.text === 'string' && parsed.text.trim().length) {
          return parsed.text;
        }

        if (parsed.type === 'slide_digest') {
          return formatSlideDigest(parsed);
        }

        if (typeof parsed.title === 'string' && parsed.title.trim().length) {
          return parsed.title;
        }
      }
    }
  } catch (error) {
    console.warn('[notifications] Failed to format message payload', error);
  }

  return normalized;
}

function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const then = new Date(dateString);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diff <= 0) return 'now';
  if (diff < 60) return `${diff}s ago`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString();
}

interface NotificationListProps {
  notifications?: Notification[];
  selectMode?: boolean;
  selectedIds?: Set<string>;
  toggleSelected?: (id: string) => void;
  highlightId?: string | null;
  onNotificationClick?: () => void;
  onNavigateToProject?: (args: { projectId: string }) => Promise<void>;
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications = [],
  selectMode = false,
  selectedIds = new Set(),
  toggleSelected = () => {},
  highlightId = null,
  onNotificationClick,
  onNavigateToProject,
}) => {
  const { removeNotification } = useNotifications();
  const { emitNotificationRead } = useNotificationSocket();
  const { allUsers, projects } = useData() as {
    allUsers: Array<{ userId?: string; username?: string; firstName?: string; lastName?: string; thumbnailUrl?: string }>;
    projects: Array<{ projectId?: string; thumbnails?: string[]; title?: string }>;
  };

  if (!notifications.length) {
    return <p className="no-notifications">No updates yet!</p>;
  }

  return (
    <ul className="notifications-list">
      {notifications.map((notif, idx) => {
        const sender = allUsers.find((u) => u.userId === notif.senderId) || {};
        const project = projects.find((p) => p.projectId === notif.projectId);
        const thumb = project?.thumbnails?.[0] || sender.thumbnailUrl;
        const name = project
          ? project.title || 'Project'
          : sender.firstName
          ? `${sender.firstName} ${sender.lastName ?? ''}`
          : 'User';
        const time = formatTimeAgo(notif.timestamp);
        const notifId = notif['timestamp#uuid'];

        // Preprocess the message to replace project ID with project title
        const processedMessage = notif.message.replace(notif.projectId || '', project?.title || notif.projectId || '');

        return (
          <li
            key={notifId || idx}
            className={`notification-item${notif.read ? ' read' : ''}${
              highlightId === notif['timestamp#uuid'] ? ' notification-highlight' : ''
            }`}
            onClick={async () => {
              if (selectMode) {
                toggleSelected(notifId);
                return;
              }
              emitNotificationRead(notifId);
              onNotificationClick?.();
              if (notif.projectId && onNavigateToProject) {
                await onNavigateToProject({ projectId: notif.projectId });
              }
            }}
          >
            {selectMode && (
              <input
                type="checkbox"
                className="notification-select-checkbox"
                checked={selectedIds.has(notifId)}
                onChange={() => toggleSelected(notifId)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <ProjectAvatar thumb={thumb} name={name} className="notification-avatar" />
            <div className="notification-details">
              <div className="notification-title-row">
                <span className="notification-title">{name}</span>
                <div className="notification-meta">
                  <span className="notification-time">{time}</span>
                  {!selectMode && (
                    <>
                      {!notif.read && (
                        <button
                          className="notification-mark-read-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            emitNotificationRead(notifId);
                          }}
                          aria-label="Mark notification as read"
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        className="notification-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notifId);
                        }}
                        aria-label="Delete notification"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="notification-message">{formatNotification(processedMessage)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default NotificationList;









