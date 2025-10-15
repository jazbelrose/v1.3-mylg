import { useContext } from 'react';
import { NotificationContext } from './NotificationProvider';
import type { NotificationContextType } from './NotificationContextValue';

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};









