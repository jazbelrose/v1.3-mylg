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
  const triggerRefsMap = useRef<Map<string, HTMLElement | null>>(new Map());

  const openDropdown = (dropdownId: string, ref: HTMLElement | null) => {
    setActiveDropdown(dropdownId);
    triggerRefsMap.current.set(dropdownId, ref);
  };

  const closeDropdown = () => {
    setActiveDropdown(null);
    dropdownElementRef.current = null;
  };

  // Callback ref that positions dropdown when it mounts
  const dropdownRef = useCallback((node: HTMLElement | null) => {
    dropdownElementRef.current = node;
  }, []);

  // Position the dropdown after it's mounted
  useEffect(() => {
    const node = dropdownElementRef.current;
    if (!node || !activeDropdown) return;
    
    const trigger = triggerRefsMap.current.get(activeDropdown);
    
    // If trigger doesn't exist or isn't in the DOM, try a small delay
    if (!trigger || !document.body.contains(trigger)) {
      const timeoutId = setTimeout(() => {
        const delayedTrigger = triggerRefsMap.current.get(activeDropdown);
        if (delayedTrigger && document.body.contains(delayedTrigger)) {
          positionDropdown(node, delayedTrigger);
        }
      }, 10);
      return () => clearTimeout(timeoutId);
    }
    
    positionDropdown(node, trigger);
  }, [activeDropdown]); // Re-position when dropdown changes
  
  const positionDropdown = (node: HTMLElement, trigger: HTMLElement) => {
    const triggerRect = trigger.getBoundingClientRect();
    
    // Position the dropdown
    node.style.position = 'fixed';
    node.style.zIndex = '1000';
    node.style.visibility = 'visible';
    
    // Check if this is a nested dropdown (has dropdown--nested class)
    if (node.classList.contains('dropdown--nested')) {
      // Position to the right of the trigger for nested dropdowns
      node.style.left = `${triggerRect.right + 8}px`;
      node.style.top = `${triggerRect.top}px`;
    } else if (node.classList.contains('dropdown--right')) {
      // Position below and aligned to the right
      node.style.left = `${triggerRect.right}px`;
      node.style.top = `${triggerRect.bottom + 8}px`;
    } else {
      // Position below the trigger (default)
      node.style.left = `${triggerRect.left}px`;
      node.style.top = `${triggerRect.bottom + 8}px`;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownElementRef.current && !dropdownElementRef.current.contains(event.target as Node)) {
        const trigger = activeDropdown ? triggerRefsMap.current.get(activeDropdown) : null;
        if (trigger && !trigger.contains(event.target as Node)) {
          closeDropdown();
        } else if (!trigger) {
          closeDropdown();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDropdown]);

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









