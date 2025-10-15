import type { NotificationItem } from '../../shared/utils/api';

export interface NotificationContextType {
  notifications: NotificationItem[];
  addNotification: (notif: NotificationItem) => void;
  addNotifications: (items: NotificationItem[]) => void;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (timestampUuid: string) => Promise<void>;
  removeNotification: (timestampUuid: string) => Promise<void>;
  removeNotifications: (ids: string[]) => Promise<void>;
}









