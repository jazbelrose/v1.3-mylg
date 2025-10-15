import React, {
  useCallback,
  useEffect,
} from 'react';

import { useNotifications } from './contexts/useNotifications';
import { useSocket } from './contexts/useSocket';
import { useInvites } from './contexts/useInvites';
import { NotificationSocketContext } from './contexts/NotificationSocketContextValue';

interface Props {
  children: React.ReactNode;
}

export default function NotificationSocketBridge({ children }: Props) {
  const { ws } = useSocket();
  const { addNotification, addNotifications, markNotificationRead } =
    useNotifications();
  const { addPendingInvite } = useInvites();

  // Listen for incoming notification events and update local state.
  useEffect(() => {
    if (!ws) return;

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.action === 'notification') {
          addNotification({ ...data, read: false });
        } else if (data.action === 'notificationsBatch' && Array.isArray(data.items)) {
          addNotifications(data.items.map((n: Record<string, unknown>) => ({ ...n, read: false })));
        } else if (data.action === 'notificationRead' && data.timestampUuid) {
          markNotificationRead(data.timestampUuid);
        } else if (data.action === 'projectInvite' && data.invite) {
          addPendingInvite(data.invite);
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err, event.data);
      }
    };

    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [ws, addNotification, addNotifications, markNotificationRead, addPendingInvite]);

  // Helper to mark as read locally and emit the event to the server.
  const emitNotificationRead = useCallback(
    (timestampUuid: string) => {
      markNotificationRead(timestampUuid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'notificationRead', timestampUuid }));
      }
    },
    [ws, markNotificationRead],
  );

  return (
    <NotificationSocketContext.Provider value={{ emitNotificationRead }}>
      {children}
    </NotificationSocketContext.Provider>
  );
}










