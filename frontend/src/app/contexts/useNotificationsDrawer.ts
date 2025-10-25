import { useContext } from 'react';
import {
  NotificationsDrawerContext,
  type NotificationsDrawerContextValue,
} from './NotificationsDrawerContext';

export const useNotificationsDrawer = (): NotificationsDrawerContextValue => {
  const context = useContext(NotificationsDrawerContext);
  if (!context) {
    throw new Error('useNotificationsDrawer must be used within a NotificationsDrawerProvider');
  }
  return context;
};

export type { NotificationsDrawerContextValue } from './NotificationsDrawerContext';

