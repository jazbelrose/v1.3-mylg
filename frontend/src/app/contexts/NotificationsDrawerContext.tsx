import React, {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import NotificationsDrawer from '@/shared/ui/NotificationsDrawer';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export interface NotificationsDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  isPinned: boolean;
  togglePinned: () => void;
  setPinned: SetState<boolean>;
}

const NotificationsDrawerContext = createContext<NotificationsDrawerContextValue | null>(
  null
);

export { NotificationsDrawerContext };

interface NotificationsDrawerProviderProps {
  children: ReactNode;
}

export const NotificationsDrawerProvider: React.FC<NotificationsDrawerProviderProps> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);
  const togglePinned = useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  const value = useMemo<NotificationsDrawerContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      isPinned,
      togglePinned,
      setPinned: setIsPinned,
    }),
    [isOpen, open, close, toggle, isPinned, togglePinned]
  );

  return (
    <NotificationsDrawerContext.Provider value={value}>
      {children}
      <NotificationsDrawer
        open={isOpen}
        onClose={close}
        pinned={isPinned}
        onTogglePin={togglePinned}
      />
    </NotificationsDrawerContext.Provider>
  );
};
