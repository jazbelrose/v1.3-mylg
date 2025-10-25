import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import NotificationList, { formatNotification } from './NotificationList';
import ProjectAvatar from './ProjectAvatar';
import { Pin, PinOff, Check } from 'lucide-react';
import { useNotifications } from '../../app/contexts/useNotifications';
import { useNotificationSocket } from '../../app/contexts/useNotificationSocket';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../../app/contexts/useData';
import { slugify } from '../utils/slug';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { prefetchBudgetData } from '@/dashboard/project/features/budget/context/useBudget';
import { useSocket } from '../../app/contexts/useSocket';
import { MESSAGES_THREADS_URL, apiFetch } from '../utils/api';
import type { Thread } from '@/app/contexts/DataProvider';
import './notifications-drawer.css';
import { MICRO_WOBBLE_SCALE, SPRING_FAST } from '@/shared/ui/motionTokens';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}

const formatRelativeTime = (dateString?: string): string => {
  if (!dateString) return '';
  const now = new Date();
  const then = new Date(dateString);
  if (Number.isNaN(then.getTime())) return '';
  const diffSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diffSeconds <= 0) return 'now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString();
};

const formatCount = (count: number): string => (count > 99 ? '99+' : `${count}`);

const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  open,
  onClose,
  pinned,
  onTogglePin,
}) => {
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'notifications' | 'inbox'>('notifications');

  const { notifications } = useNotifications();
  const { emitNotificationRead } = useNotificationSocket();
  const {
    projects,
    allUsers,
    fetchProjectDetails,
    inbox,
    setInbox,
    userId,
  } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const { ws } = useSocket() as { ws?: WebSocket | null };

  const normalized = notifications.map((n) => ({
    ['timestamp#uuid']: n['timestamp#uuid'] || '',
    message: n.message || '',
    timestamp: n.timestamp || new Date().toISOString(),
    read: n.read ?? false,
    senderId: n.senderId,
    projectId: n.projectId,
  }));

  const sortedInbox = useMemo<Thread[]>(
    () =>
      [...(inbox || [])].sort((a, b) => {
        const aTime = Date.parse(a.lastMsgTs || '');
        const bTime = Date.parse(b.lastMsgTs || '');
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      }),
    [inbox]
  );

  const unreadNotificationsCount = normalized.filter((n) => !n.read).length;
  const unreadThreadsCount = sortedInbox.filter((thread) => !thread.read).length;

  useEffect(() => {
    if (!open) return;
    setActiveTab((prev) => {
      if (prev === 'notifications' && normalized.length > 0) return prev;
      if (prev === 'inbox' && sortedInbox.length > 0) return prev;
      if (normalized.length > 0) return 'notifications';
      if (sortedInbox.length > 0) return 'inbox';
      return prev;
    });
  }, [open, normalized.length, sortedInbox.length]);

  const searchTerm = search.trim().toLowerCase();

  const filteredNotifications = normalized.filter((n) => {
    if (!searchTerm) return true;
    const sender = allUsers.find((u) => u.userId === n.senderId) || ({} as { firstName?: string; lastName?: string });
    const project = projects.find((p) => p.projectId === n.projectId);
    const name = project
      ? project.title || 'Project'
      : sender.firstName
      ? `${sender.firstName} ${sender.lastName ?? ''}`
      : 'User';
    const message = formatNotification(n.message);
    return (
      name.toLowerCase().includes(searchTerm) ||
      message.toLowerCase().includes(searchTerm)
    );
  });

  const filteredThreads = sortedInbox.filter((thread) => {
    if (!searchTerm) return true;
    const user = allUsers.find((u) => u.userId === thread.otherUserId);
    const name = user
      ? user.firstName
        ? `${user.firstName} ${user.lastName ?? ''}`.trim()
        : user.username || user.email || thread.otherUserId
      : thread.otherUserId;
    const snippet = thread.snippet || '';
    return (
      name.toLowerCase().includes(searchTerm) ||
      snippet.toLowerCase().includes(searchTerm)
    );
  });

  const handleItemClick = () => {
    if (!pinned) {
      onClose();
    }
  };

  const handleNavigateToProject = async ({ projectId }: { projectId: string }) => {
    if (!projectId) return;
    const hasUnsaved =
      (typeof (window as Window & { hasUnsavedChanges?: () => boolean }).hasUnsavedChanges === 'function' &&
        (window as Window & { hasUnsavedChanges?: () => boolean }).hasUnsavedChanges()) ||
      (window as Window & { unsavedChanges?: boolean }).unsavedChanges === true;
    if (hasUnsaved) {
      const confirmLeave = window.confirm('You have unsaved changes, continue?');
      if (!confirmLeave) return;
    }
    const proj = projects.find((p) => p.projectId === projectId);
    const path = getProjectDashboardPath(projectId, proj?.title || projectId);
    if (location.pathname !== path) {
      await Promise.all([
        fetchProjectDetails(projectId),
        prefetchBudgetData(projectId),
      ]);
      navigate(path);
    }
  };

  const handleThreadClick = async (thread: Thread) => {
    setInbox((prev) =>
      prev.map((item) =>
        item.conversationId === thread.conversationId ? { ...item, read: true } : item
      )
    );

    if (userId) {
      try {
        await apiFetch(MESSAGES_THREADS_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, conversationId: thread.conversationId, read: true }),
        });
      } catch (err) {
        console.warn('Failed to persist read flag', err);
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              action: 'markRead',
              conversationType: 'dm',
              conversationId: thread.conversationId,
              userId,
              read: true,
            })
          );
        } catch (err) {
          console.warn('Failed to broadcast read flag', err);
        }
      }
    }

    const user = allUsers.find((u) => u.userId === thread.otherUserId);
    const slug = user
      ? user.firstName
        ? slugify(`${user.firstName}-${user.lastName ?? ''}`)
        : user.username || thread.otherUserId
      : thread.otherUserId;

    navigate(`/dashboard/features/messages/${slug}`);
    handleItemClick();
  };

  useEffect(() => {
    const updateVh = () => {
      document.documentElement.style.setProperty(
        '--notifications-vh',
        `${window.innerHeight}px`
      );
    };
    updateVh();
    window.addEventListener('resize', updateVh);
    return () => window.removeEventListener('resize', updateVh);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pinned) {
        onClose();
      }
    };
    if (open) {
      window.addEventListener('keydown', onKey);
    }
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, pinned]);

  const searchPlaceholder =
    activeTab === 'notifications' ? 'Search notifications' : 'Search inbox';

  return (
    <>
      <AnimatePresence>
        {open && !pinned && (
          <motion.div
            className="notifications-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div
            className="notifications-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal={!pinned}
            aria-label="Notifications"
          >
            <div className="drawer-header">
              <div className="drawer-top-bar">
                {activeTab === 'notifications' && unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    className="drawer-mark-all-read-btn"
                    onClick={() =>
                      normalized.forEach(
                        (n) => !n.read && emitNotificationRead(n['timestamp#uuid'])
                      )
                    }
                    aria-label="Mark all notifications as read"
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="pin-button"
                  onClick={onTogglePin}
                  aria-label={
                    pinned ? 'Unpin notifications' : 'Pin notifications'
                  }
                >
                  {pinned ? <PinOff size={16} /> : <Pin size={16} />}
                </button>
                <button
                  type="button"
                  className="close-btn"
                  onClick={onClose}
                  aria-label="Close notifications"
                >
                  &times;
                </button>
              </div>
              <div className="drawer-tabs" role="tablist" aria-label="Notification sections">
                <button
                  type="button"
                  className={`drawer-tab${activeTab === 'notifications' ? ' active' : ''}`}
                  onClick={() => setActiveTab('notifications')}
                  role="tab"
                  aria-selected={activeTab === 'notifications'}
                >
                  Notifications
                  {unreadNotificationsCount > 0 && (
                    <motion.span
                      className="drawer-tab-badge"
                      whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                      whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                      transition={reduceMotion ? undefined : SPRING_FAST}
                    >
                      {formatCount(unreadNotificationsCount)}
                    </motion.span>
                  )}
                </button>
                <button
                  type="button"
                  className={`drawer-tab${activeTab === 'inbox' ? ' active' : ''}`}
                  onClick={() => setActiveTab('inbox')}
                  role="tab"
                  aria-selected={activeTab === 'inbox'}
                >
                  Inbox
                  {unreadThreadsCount > 0 && (
                    <motion.span
                      className="drawer-tab-badge"
                      whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                      whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                      transition={reduceMotion ? undefined : SPRING_FAST}
                    >
                      {formatCount(unreadThreadsCount)}
                    </motion.span>
                  )}
                </button>
              </div>
              <div className="drawer-search">
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="notifications-search-input"
                />
              </div>
            </div>
            <div className="drawer-content">
              {activeTab === 'notifications' ? (
                <NotificationList
                  notifications={filteredNotifications}
                  onNotificationClick={handleItemClick}
                  onNavigateToProject={handleNavigateToProject}
                />
              ) : filteredThreads.length === 0 ? (
                <p className="no-notifications">No direct messages yet.</p>
              ) : (
                <ul className="drawer-thread-list">
                  {filteredThreads.map((thread) => {
                    const user = allUsers.find((u) => u.userId === thread.otherUserId);
                    const name = user
                      ? user.firstName
                        ? `${user.firstName} ${user.lastName ?? ''}`.trim()
                        : user.username || user.email || thread.otherUserId
                      : thread.otherUserId;
                    const thumb = user?.thumbnail;
                    const time = formatRelativeTime(thread.lastMsgTs);
                    const snippet = thread.snippet || 'Open conversation';

                    return (
                      <li
                        key={thread.conversationId}
                        className={`drawer-thread-item${thread.read ? ' read' : ''}`}
                        onClick={() => handleThreadClick(thread)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleThreadClick(thread);
                          }
                        }}
                      >
                        <ProjectAvatar
                          thumb={thumb || undefined}
                          name={name}
                          className="drawer-thread-avatar"
                        />
                        <div className="drawer-thread-details">
                          <div className="drawer-thread-title-row">
                            <span className="drawer-thread-name">{name}</span>
                            {time && <span className="drawer-thread-time">{time}</span>}
                          </div>
                          <div className="drawer-thread-snippet">{snippet}</div>
                        </div>
                        {!thread.read && <span className="drawer-thread-unread-dot" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default NotificationsDrawer;











