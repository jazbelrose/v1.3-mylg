import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import { createRandomId } from "../../utils/utils";

type DropdownOption<T> = {
  value: T;
  label: string;
};

type UseDropdownParams<T> = {
  options: DropdownOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  idPrefix: string;
};

type DropdownOptionRenderState = {
  id: string;
  isSelected: boolean;
  isActive: boolean;
};

type DropdownOptionButtonProps = {
  type: "button";
  onClick: () => void;
  onMouseEnter: () => void;
  onFocus: () => void;
};

export type DropdownHelpers<T> = {
  dropdownRef: RefObject<HTMLDivElement>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  listId: string;
  activeOptionId?: string;
  highlightIndex: number;
  handleTriggerKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  getOptionRenderState: (option: DropdownOption<T>, index: number) => DropdownOptionRenderState;
  getOptionButtonProps: (option: DropdownOption<T>, index: number) => DropdownOptionButtonProps;
};

export const useDropdown = <T,>({
  options,
  selectedValue,
  onSelect,
  idPrefix,
}: UseDropdownParams<T>): DropdownHelpers<T> => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const listId = useMemo(() => createRandomId(idPrefix), [idPrefix]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof Node &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setHighlightIndex(-1);
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === selectedValue);
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, options, selectedValue]);

  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => setIsOpen(true), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const selectOption = useCallback(
    (value: T) => {
      onSelect(value);
      setIsOpen(false);
    },
    [onSelect]
  );

  const updateHighlight = useCallback(
    (direction: 1 | -1) => {
      setHighlightIndex((current) => {
        if (!options.length) return -1;
        const next = current < 0 ? 0 : current + direction;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
    },
    [options.length]
  );

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!options.length) return;

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          if (!isOpen) {
            open();
            return;
          }
          updateHighlight(1);
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          if (!isOpen) {
            open();
            return;
          }
          updateHighlight(-1);
          break;
        }
        case "Home": {
          if (!isOpen) return;
          event.preventDefault();
          setHighlightIndex(options.length ? 0 : -1);
          break;
        }
        case "End": {
          if (!isOpen) return;
          event.preventDefault();
          setHighlightIndex(options.length ? options.length - 1 : -1);
          break;
        }
        case "Enter":
        case " ": {
          event.preventDefault();
          if (isOpen && highlightIndex >= 0) {
            const option = options[highlightIndex];
            if (option) selectOption(option.value);
          } else {
            toggle();
          }
          break;
        }
        case "Escape": {
          if (isOpen) {
            event.preventDefault();
            close();
          }
          break;
        }
        default:
          break;
      }
    },
    [close, highlightIndex, isOpen, open, options, selectOption, toggle, updateHighlight]
  );

  const activeOptionId = useMemo(() => {
    if (!isOpen || highlightIndex < 0) return undefined;
    return `${listId}-option-${highlightIndex}`;
  }, [highlightIndex, isOpen, listId]);

  const getOptionRenderState = useCallback(
    (option: DropdownOption<T>, index: number): DropdownOptionRenderState => ({
      id: `${listId}-option-${index}`,
      isSelected: option.value === selectedValue,
      isActive: highlightIndex === index,
    }),
    [highlightIndex, listId, selectedValue]
  );

  const getOptionButtonProps = useCallback(
    (option: DropdownOption<T>, index: number): DropdownOptionButtonProps => ({
      type: "button" as const,
      onClick: () => selectOption(option.value),
      onMouseEnter: () => setHighlightIndex(index),
      onFocus: () => setHighlightIndex(index),
    }),
    [selectOption]
  );

  return {
    dropdownRef,
    isOpen,
    open,
    close,
    toggle,
    listId,
    activeOptionId,
    highlightIndex,
    handleTriggerKeyDown,
    getOptionRenderState,
    getOptionButtonProps,
  };
};

export type { DropdownOption };









