import { useContext } from 'react';
import { NotificationSocketContext, NotificationSocketContextValue } from './NotificationSocketContextValue';

export const useNotificationSocket = (): NotificationSocketContextValue =>
  useContext(NotificationSocketContext);









