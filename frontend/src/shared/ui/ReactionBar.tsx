import React, {
  useEffect,
  useRef,
  useLayoutEffect,
  useState,
  MutableRefObject,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏', '✅', '💯', '❓'];

interface ReactionBarProps {
  visible: boolean;
  anchorRef: MutableRefObject<HTMLElement | null>;
  reactions?: string[];
  selected?: string[];
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const ReactionBar: React.FC<ReactionBarProps> = ({
  visible,
  anchorRef,
  reactions = DEFAULT_REACTIONS,
  selected = [],
  onSelect,
  onClose,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current || !barRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const barRect = barRef.current.getBoundingClientRect();
    let left = anchorRect.left + anchorRect.width / 2 - barRect.width / 2;
    const margin = 4;
    const maxLeft = window.innerWidth - barRect.width - margin;
    if (left < margin) left = margin;
    if (left > maxLeft) left = maxLeft;
    let top = anchorRect.top - barRect.height - 8;
    if (top < margin) top = anchorRect.bottom + 8;
    setPosition({ top, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (visible) {
      updatePosition();
    }
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!visible) return;

    const handleClick = (e: MouseEvent) => {
      if (
        barRef.current &&
        !barRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const buttons = barRef.current?.querySelectorAll<HTMLButtonElement>(
          'button'
        );
        if (!buttons || !buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    const handleWindow = () => updatePosition();

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleWindow);
    window.addEventListener('scroll', handleWindow, true);

    const firstBtn = barRef.current?.querySelector<HTMLButtonElement>('button');
    firstBtn?.focus();

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleWindow);
      window.removeEventListener('scroll', handleWindow, true);
    };
  }, [visible, onClose, anchorRef, updatePosition]);

  if (!visible) return null;

  const bar = (
    <div
      ref={barRef}
      className="reaction-bar"
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-label="Message reactions"
    >
      {reactions.map((emoji) => (
        <button
          key={emoji}
          className={`reaction-btn ${selected.includes(emoji) ? 'selected' : ''}`}
          onClick={() => onSelect(emoji)}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return createPortal(bar, document.body);
};

export default ReactionBar;










