/**
 * FileLifecycleContext - React Context for file state management
 * 
 * Provides file caching and real-time sync via WebSocket.
 * This is a simpler implementation using React Context instead of Zustand.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  useMemo,
} from 'react';
import type {
  FileRecord,
  FileStatus,
  FileWebSocketEvent,
} from '@/shared/types/fileLifecycle';
import {
  listProjectFiles,
  listOrgFiles,
} from '@/shared/api/fileLifecycleApi';

// ============================================================================
// TYPES
// ============================================================================

interface FileState {
  scope: string | null;
  projectId: string | null;
  orgId: string | null;
  files: Map<string, FileRecord>;
  loading: boolean;
  error: string | null;
  cursor: string | null;
  hasMore: boolean;
}

type FileAction =
  | { type: 'SET_SCOPE'; projectId?: string; orgId?: string }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; files: FileRecord[]; cursor: string | null; reset?: boolean }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'ADD_FILE'; file: FileRecord }
  | { type: 'UPDATE_FILE'; fileId: string; updates: Partial<FileRecord> }
  | { type: 'REMOVE_FILE'; fileId: string }
  | { type: 'CLEAR' };

interface FileContextValue {
  state: FileState;
  dispatch: React.Dispatch<FileAction>;
  setScope: (projectId?: string, orgId?: string) => void;
  fetchFiles: (reset?: boolean) => Promise<void>;
  handleWebSocketEvent: (event: FileWebSocketEvent) => void;
  getFile: (fileId: string) => FileRecord | undefined;
  getReadyFiles: () => FileRecord[];
  getDeletedFiles: () => FileRecord[];
}

// ============================================================================
// REDUCER
// ============================================================================

const initialState: FileState = {
  scope: null,
  projectId: null,
  orgId: null,
  files: new Map(),
  loading: false,
  error: null,
  cursor: null,
  hasMore: true,
};

function fileReducer(state: FileState, action: FileAction): FileState {
  switch (action.type) {
    case 'SET_SCOPE': {
      const newScope = action.projectId
        ? `project#${action.projectId}`
        : action.orgId
        ? `org#${action.orgId}`
        : null;
      
      if (state.scope === newScope) return state;
      
      return {
        ...initialState,
        scope: newScope,
        projectId: action.projectId || null,
        orgId: action.orgId || null,
      };
    }

    case 'FETCH_START':
      return { ...state, loading: true, error: null };

    case 'FETCH_SUCCESS': {
      const newFiles = action.reset ? new Map() : new Map(state.files);
      action.files.forEach((file) => newFiles.set(file.fileId, file));
      return {
        ...state,
        files: newFiles,
        loading: false,
        cursor: action.cursor,
        hasMore: !!action.cursor,
      };
    }

    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };

    case 'ADD_FILE': {
      const newFiles = new Map(state.files);
      newFiles.set(action.file.fileId, action.file);
      return { ...state, files: newFiles };
    }

    case 'UPDATE_FILE': {
      const existing = state.files.get(action.fileId);
      if (!existing) return state;
      const newFiles = new Map(state.files);
      newFiles.set(action.fileId, { ...existing, ...action.updates });
      return { ...state, files: newFiles };
    }

    case 'REMOVE_FILE': {
      const newFiles = new Map(state.files);
      newFiles.delete(action.fileId);
      return { ...state, files: newFiles };
    }

    case 'CLEAR':
      return initialState;

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

const FileLifecycleContext = createContext<FileContextValue | null>(null);

export function FileLifecycleProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(fileReducer, initialState);

  const setScope = useCallback((projectId?: string, orgId?: string) => {
    dispatch({ type: 'SET_SCOPE', projectId, orgId });
  }, []);

  const fetchFiles = useCallback(async (reset = false) => {
    const { projectId, orgId, cursor, loading, hasMore } = state;

    if (loading) return;
    if (!reset && !hasMore) return;
    if (!projectId && !orgId) return;

    dispatch({ type: 'FETCH_START' });

    try {
      const options = {
        limit: 50,
        cursor: reset ? undefined : cursor || undefined,
      };

      const response = projectId
        ? await listProjectFiles(projectId, options)
        : await listOrgFiles(orgId!, options);

      dispatch({
        type: 'FETCH_SUCCESS',
        files: response.files,
        cursor: response.cursor || null,
        reset,
      });
    } catch (err) {
      dispatch({
        type: 'FETCH_ERROR',
        error: err instanceof Error ? err.message : 'Failed to fetch files',
      });
    }
  }, [state.projectId, state.orgId, state.cursor, state.loading, state.hasMore]);

  const handleWebSocketEvent = useCallback((event: FileWebSocketEvent) => {
    // Verify the event is for our current scope
    const eventScope = event.projectId
      ? `project#${event.projectId}`
      : event.orgId
      ? `org#${event.orgId}`
      : null;

    if (eventScope !== state.scope) return;

    switch (event.action) {
      case 'fileCreated':
        dispatch({ type: 'ADD_FILE', file: event.file as unknown as FileRecord });
        break;
        
      case 'fileUpdated':
        dispatch({
          type: 'UPDATE_FILE',
          fileId: event.fileId,
          updates: event.changes,
        });
        break;
        
      case 'fileRestored':
        // Re-fetch the file or mark it as ready
        dispatch({
          type: 'UPDATE_FILE',
          fileId: event.fileId,
          updates: { status: 'READY' },
        });
        break;

      case 'fileDeleted':
        dispatch({
          type: 'UPDATE_FILE',
          fileId: event.fileId,
          updates: { status: 'DELETED', deletedAt: event.deletedAt },
        });
        break;

      case 'fileRefAdded':
      case 'fileRefRemovedEvent':
        // Could update ref count here if we track it
        break;
    }
  }, [state.scope]);

  const getFile = useCallback(
    (fileId: string) => state.files.get(fileId),
    [state.files]
  );

  const getReadyFiles = useCallback(() => {
    const files: FileRecord[] = [];
    state.files.forEach((file) => {
      if (file.status === 'READY') files.push(file);
    });
    return files.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [state.files]);

  const getDeletedFiles = useCallback(() => {
    const files: FileRecord[] = [];
    state.files.forEach((file) => {
      if (file.status === 'DELETED') files.push(file);
    });
    return files.sort((a, b) => 
      new Date(b.deletedAt || b.createdAt).getTime() - 
      new Date(a.deletedAt || a.createdAt).getTime()
    );
  }, [state.files]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      setScope,
      fetchFiles,
      handleWebSocketEvent,
      getFile,
      getReadyFiles,
      getDeletedFiles,
    }),
    [state, setScope, fetchFiles, handleWebSocketEvent, getFile, getReadyFiles, getDeletedFiles]
  );

  return (
    <FileLifecycleContext.Provider value={value}>
      {children}
    </FileLifecycleContext.Provider>
  );
}

export function useFileLifecycle() {
  const context = useContext(FileLifecycleContext);
  if (!context) {
    throw new Error('useFileLifecycle must be used within a FileLifecycleProvider');
  }
  return context;
}

// ============================================================================
// HOOK: Auto-fetch files when scope changes
// ============================================================================

export function useFilesForProject(projectId: string | undefined) {
  const { setScope, fetchFiles, getReadyFiles, state } = useFileLifecycle();

  useEffect(() => {
    if (projectId) {
      setScope(projectId);
    }
  }, [projectId, setScope]);

  useEffect(() => {
    if (state.projectId === projectId && !state.loading && state.files.size === 0) {
      fetchFiles(true);
    }
  }, [state.projectId, projectId, state.loading, state.files.size, fetchFiles]);

  return {
    files: getReadyFiles(),
    loading: state.loading,
    error: state.error,
    fetchMore: () => fetchFiles(false),
    hasMore: state.hasMore,
  };
}

export function useFilesForOrg(orgId: string | undefined) {
  const { setScope, fetchFiles, getReadyFiles, state } = useFileLifecycle();

  useEffect(() => {
    if (orgId) {
      setScope(undefined, orgId);
    }
  }, [orgId, setScope]);

  useEffect(() => {
    if (state.orgId === orgId && !state.loading && state.files.size === 0) {
      fetchFiles(true);
    }
  }, [state.orgId, orgId, state.loading, state.files.size, fetchFiles]);

  return {
    files: getReadyFiles(),
    loading: state.loading,
    error: state.error,
    fetchMore: () => fetchFiles(false),
    hasMore: state.hasMore,
  };
}
