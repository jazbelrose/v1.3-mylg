import { createContext } from 'react';

export interface NotificationSocketContextValue {
  emitNotificationRead: (timestampUuid: string) => void;
}

export const NotificationSocketContext = createContext<NotificationSocketContextValue>({
  emitNotificationRead: () => {},
});









