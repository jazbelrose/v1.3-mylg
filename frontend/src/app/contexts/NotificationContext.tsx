import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useUser } from './useUser';
import { getNotifications, markNotificationRead as apiMarkNotificationRead, deleteNotification as apiDeleteNotification, NotificationItem } from '../../shared/utils/api';
import { getWithTTL, setWithTTL, DEFAULT_TTL } from '../../shared/utils/storageWithTTL';
import { mergeAndDedupeNotifications } from '../../shared/utils/notificationUtils';
import type { NotificationContextType } from './NotificationContextValue';

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export { NotificationContext };

interface NotificationProviderProps {
  children: ReactNode;
}

// Avoid using useSocket here. NotificationProvider renders outside of
// SocketProvider (see App.jsx). Accessing SocketContext inside this
// provider would return the default undefined value and lead to bugs.
// Instead, use a bridge component (NotificationSocketBridge) that lives
// inside both providers to wire them together.
export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
    const { user } = useUser();
    const userId = user?.userId;
    const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
        const stored = getWithTTL('notifications');
        return Array.isArray(stored) ? stored : [];
    });

    useEffect(() => {
        setWithTTL('notifications', notifications, DEFAULT_TTL);
    }, [notifications]);

    const addNotification = useCallback((notif: NotificationItem) => {
        if (!notif) return;
        setNotifications((prev) => mergeAndDedupeNotifications(prev, [notif]));
    }, []);

    const addNotifications = useCallback((items: NotificationItem[]) => {
        if (!Array.isArray(items) || !items.length) return;
        setNotifications((prev) => mergeAndDedupeNotifications(prev, items));
    }, []);

    const fetchNotifications = useCallback(async (): Promise<void> => {
        if (!userId) return;
        try {
            const items = await getNotifications(userId);
            setNotifications((prev) =>
              mergeAndDedupeNotifications(
                prev,
                Array.isArray(items) ? items : []
              )
            );
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            return;
        }
        fetchNotifications();
    }, [userId, fetchNotifications]);

    const markNotificationRead = useCallback(async (timestampUuid: string): Promise<void> => {
        if (!timestampUuid) return;
        setNotifications((prev) => 
            prev.map((n) => 
                n["timestamp#uuid"] === timestampUuid ? { ...n, read: true } : n
            )
        );
        try {
            await apiMarkNotificationRead(userId, timestampUuid);
        } catch (err) {
            console.error('Error marking notification read:', err);
        }
    }, [userId]);

    const removeNotification = useCallback(async (timestampUuid: string): Promise<void> => {
        if (!timestampUuid) return;
        setNotifications((prev) => 
            prev.filter((n) => n["timestamp#uuid"] !== timestampUuid)
        );
        try {
            await apiDeleteNotification(userId, timestampUuid);
        } catch (err) {
            console.error('Error deleting notification:', err);
        }
    }, [userId]);

    const removeNotifications = useCallback(async (ids: string[] = []): Promise<void> => {
        if (!Array.isArray(ids) || ids.length === 0) return;
        setNotifications((prev) => 
            prev.filter((n) => !ids.includes(n["timestamp#uuid"]))
        );
        try {
            await Promise.all(ids.map((id) => apiDeleteNotification(userId, id)));
        } catch (err) {
            console.error('Error deleting notifications:', err);
        }
    }, [userId]);

    const value: NotificationContextType = { 
        notifications, 
        addNotification, 
        addNotifications, 
        fetchNotifications, 
        markNotificationRead, 
        removeNotification, 
        removeNotifications 
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};









