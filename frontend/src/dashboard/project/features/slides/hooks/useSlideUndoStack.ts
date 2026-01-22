/**
 * useSlideUndoStack.ts - Slide-level undo/redo for structural changes
 * 
 * Tracks slide-level operations that aren't covered by Lexical's editor history:
 * - Reorder slides
 * - Delete slides
 * - Duplicate slides
 * - Add slides (optional - typically not undone)
 * 
 * Uses a command pattern with inverse operations for undo.
 */
import { useState, useCallback, useRef } from 'react';
import { Slide } from '@/app/contexts/DataProvider';

export type SlideCommand = {
  type: 'reorder' | 'delete' | 'duplicate' | 'add' | 'bulkDelete';
  /** Timestamp for debugging */
  timestamp: number;
  /** Description for debugging/logging */
  description: string;
} & (
  | {
      type: 'reorder';
      /** Slide order before the operation */
      previousOrder: string[];
      /** Slide order after the operation */
      newOrder: string[];
    }
  | {
      type: 'delete';
      /** The deleted slide data (for restoration) */
      deletedSlide: Slide;
      /** Index where the slide was before deletion */
      previousIndex: number;
    }
  | {
      type: 'bulkDelete';
      /** The deleted slides with their indices */
      deletedSlides: Array<{ slide: Slide; index: number }>;
    }
  | {
      type: 'duplicate';
      /** ID of the newly created duplicate slide */
      newSlideId: string;
      /** ID of the source slide */
      sourceSlideId: string;
    }
  | {
      type: 'add';
      /** ID of the newly added slide */
      newSlideId: string;
    }
);

export interface UseSlideUndoStackOptions {
  /** Max number of commands to keep in history */
  maxHistorySize?: number;
}

export interface UseSlideUndoStackReturn {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Push a new command to the undo stack */
  pushCommand: (command: SlideCommand) => void;
  /** Undo the last command, returns the command if successful */
  undo: () => SlideCommand | null;
  /** Redo the last undone command, returns the command if successful */
  redo: () => SlideCommand | null;
  /** Clear all history */
  clearHistory: () => void;
  /** Get current undo stack size (for debugging) */
  undoStackSize: number;
  /** Get current redo stack size (for debugging) */
  redoStackSize: number;
}

const DEFAULT_MAX_HISTORY = 50;

export function useSlideUndoStack(
  options: UseSlideUndoStackOptions = {}
): UseSlideUndoStackReturn {
  const { maxHistorySize = DEFAULT_MAX_HISTORY } = options;

  const [undoStack, setUndoStack] = useState<SlideCommand[]>([]);
  const [redoStack, setRedoStack] = useState<SlideCommand[]>([]);
  
  // Use refs to avoid stale closures in callbacks
  const undoStackRef = useRef(undoStack);
  const redoStackRef = useRef(redoStack);
  undoStackRef.current = undoStack;
  redoStackRef.current = redoStack;

  const pushCommand = useCallback((command: SlideCommand) => {
    setUndoStack((prev) => {
      const next = [...prev, command];
      // Trim to max size
      if (next.length > maxHistorySize) {
        return next.slice(-maxHistorySize);
      }
      return next;
    });
    // Clear redo stack when new command is pushed
    setRedoStack([]);
  }, [maxHistorySize]);

  const undo = useCallback((): SlideCommand | null => {
    const currentUndo = undoStackRef.current;
    if (currentUndo.length === 0) return null;

    const command = currentUndo[currentUndo.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, command]);
    
    return command;
  }, []);

  const redo = useCallback((): SlideCommand | null => {
    const currentRedo = redoStackRef.current;
    if (currentRedo.length === 0) return null;

    const command = currentRedo[currentRedo.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, command]);
    
    return command;
  }, []);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pushCommand,
    undo,
    redo,
    clearHistory,
    undoStackSize: undoStack.length,
    redoStackSize: redoStack.length,
  };
}

// Helper to create commands with timestamp
export function createSlideCommand<T extends SlideCommand['type']>(
  type: T,
  data: Omit<Extract<SlideCommand, { type: T }>, 'type' | 'timestamp'>
): Extract<SlideCommand, { type: T }> {
  return {
    type,
    timestamp: Date.now(),
    ...data,
  } as Extract<SlideCommand, { type: T }>;
}

export default useSlideUndoStack;
