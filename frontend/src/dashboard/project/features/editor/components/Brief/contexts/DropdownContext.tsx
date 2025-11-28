/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface DropdownContextValue {
  activeDropdown: string | null;
  openDropdown: (dropdownId: string, ref: HTMLElement | null) => void;
  closeDropdown: () => void;
  dropdownRef: (node: HTMLElement | null) => void;
  isDropdownOpen: boolean;
}

const DropdownContext = createContext<DropdownContextValue | undefined>(undefined);

export const DropdownProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownElementRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openDropdown = (dropdownId: string, ref: HTMLElement | null) => {
    setActiveDropdown(dropdownId);
    triggerRef.current = ref;
  };

  const closeDropdown = () => {
    setActiveDropdown(null);
    triggerRef.current = null;
    dropdownElementRef.current = null;
  };

  // Callback ref that positions dropdown when it mounts
  const dropdownRef = useCallback((node: HTMLElement | null) => {
    dropdownElementRef.current = node;
    if (node && triggerRef.current) {
      const trigger = triggerRef.current;
      const triggerRect = trigger.getBoundingClientRect();
      
      // Position the dropdown below the trigger, aligned to the left
      node.style.position = 'fixed';
      node.style.top = `${triggerRect.bottom + 8}px`;
      node.style.left = `${triggerRect.left}px`;
      node.style.zIndex = '1000';
      node.style.visibility = 'visible';
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownElementRef.current && !dropdownElementRef.current.contains(event.target as Node)) {
        if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
          closeDropdown();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <DropdownContext.Provider value={{ activeDropdown, openDropdown, closeDropdown, dropdownRef, isDropdownOpen: activeDropdown !== null }}>
      {children}
    </DropdownContext.Provider>
  );
};

export const useDropdown = (): DropdownContextValue => {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error('useDropdown must be used within a DropdownProvider');
  }
  return context;
};









