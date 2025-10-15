/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

interface DropdownContextValue {
  activeDropdown: string | null;
  openDropdown: (dropdownId: string, ref: HTMLElement | null) => void;
  closeDropdown: () => void;
  dropdownRef: React.RefObject<HTMLElement>;
  isDropdownOpen: boolean;
}

const DropdownContext = createContext<DropdownContextValue | undefined>(undefined);

export const DropdownProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLElement | null>(null);

  const openDropdown = (dropdownId: string, ref: HTMLElement | null) => {
    setActiveDropdown(dropdownId);
    dropdownRef.current = ref;
  };

  const closeDropdown = () => {
    setActiveDropdown(null);
    dropdownRef.current = null;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
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









