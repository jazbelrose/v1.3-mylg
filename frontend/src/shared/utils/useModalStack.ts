import { useEffect } from 'react';

let openCount = 0;

export default function useModalStack(isOpen: boolean): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isOpen) {
      openCount += 1;
      document.body.classList.add('ReactModal__Body--open');
    }

    return () => {
      if (isOpen) {
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) {
          document.body.classList.remove('ReactModal__Body--open');
        }
      }
    };
  }, [isOpen]);
}








