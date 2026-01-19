/**
 * useScrollState - Detects when user is actively scrolling
 * 
 * Returns isScrolling which is true during scroll and for a short
 * period after (debounced). Used to reduce paint cost during scroll.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseScrollStateOptions {
  /** Delay in ms before isScrolling becomes false after scroll stops */
  debounceMs?: number;
}

export interface ScrollState {
  isScrolling: boolean;
  onScroll: () => void;
}

export function useScrollState(options: UseScrollStateOptions = {}): ScrollState {
  const { debounceMs = 150 } = options;
  const [isScrolling, setIsScrolling] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollCountRef = useRef(0);
  
  const onScroll = useCallback(() => {
    scrollCountRef.current += 1;
    
    // Set scrolling true immediately
    if (!isScrolling) {
      setIsScrolling(true);
    }
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set timeout to mark scroll as stopped
    timeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
      timeoutRef.current = null;
    }, debounceMs);
  }, [isScrolling, debounceMs]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return { isScrolling, onScroll };
}

export default useScrollState;
