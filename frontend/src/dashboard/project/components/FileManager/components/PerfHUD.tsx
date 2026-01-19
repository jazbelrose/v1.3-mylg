/**
 * PerfHUD - Dev-only performance heads-up display for FileManager
 * 
 * Shows real-time performance metrics in a floating panel.
 * Toggle with Ctrl+Shift+P or via localStorage.setItem('showFilesPerf', 'true')
 * 
 * Uses a React portal to render outside any modal/stacking context hierarchies.
 */

import { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { filesPerf } from '../hooks/useFilesPerf';
import { useIsScrolling } from '../contexts/ScrollingContext';
import { getLoadedThumbCount } from '../utils/thumbnailCache';

const IS_DEV = import.meta.env.DEV;

// External store for visibility toggle
let isVisible = false;
// Initialize from localStorage safely
try {
  isVisible = typeof localStorage !== 'undefined' && localStorage.getItem('showFilesPerf') === 'true';
} catch {
  // localStorage not available
}

const listeners = new Set<() => void>();
let keyboardListenerRegistered = false;

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return isVisible;
}

function toggleVisibility() {
  isVisible = !isVisible;
  try {
    localStorage.setItem('showFilesPerf', isVisible ? 'true' : 'false');
  } catch {
    // localStorage not available
  }
  listeners.forEach(l => l());
  console.log('[PerfHUD] Visibility:', isVisible ? 'ON' : 'OFF');
}

// Register keyboard shortcut once
function registerKeyboardShortcut() {
  if (keyboardListenerRegistered || typeof window === 'undefined') return;
  keyboardListenerRegistered = true;
  
  window.addEventListener('keydown', (e) => {
    // Ctrl+Shift+P (check both uppercase and lowercase for cross-browser compatibility)
    if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p' || e.code === 'KeyP')) {
      e.preventDefault();
      toggleVisibility();
    }
  });
  console.log('[PerfHUD] Keyboard shortcut registered (Ctrl+Shift+P)');
}

// Register on module load in dev mode
if (IS_DEV) {
  registerKeyboardShortcut();
}

interface PerfHUDProps {
  gridRenderCount?: number;
  tileRenderCount?: number;
  fileCount?: number;
  filteredCount?: number;
}

export const PerfHUD = memo(function PerfHUD({
  gridRenderCount = 0,
  tileRenderCount = 0,
  fileCount = 0,
  filteredCount = 0,
}: PerfHUDProps) {
  const visible = useSyncExternalStore(subscribe, getSnapshot);
  const [stats, setStats] = useState({ filterSortStats: { avgDuration: 0 }, thumbnailStats: { loaded: 0, loading: 0 } });
  const isScrolling = useIsScrolling();
  
  // Ensure keyboard shortcut is registered when component mounts
  useEffect(() => {
    registerKeyboardShortcut();
  }, []);
  
  // Update stats periodically
  useEffect(() => {
    if (!visible) return;
    
    const update = () => {
      const report = filesPerf.getReport();
      setStats({
        filterSortStats: report.filterSortStats,
        thumbnailStats: report.thumbnailStats,
      });
    };
    
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [visible]);
  
  const handleReset = useCallback(() => {
    filesPerf.reset();
    setStats({ filterSortStats: { avgDuration: 0 }, thumbnailStats: { loaded: 0, loading: 0 } });
  }, []);

  if (!IS_DEV || !visible) return null;

  const { filterSortStats, thumbnailStats } = stats;

  // Use a portal to render outside any stacking context (modals, etc.)
  const content = (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: '#000',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        padding: 8,
        borderRadius: 4,
        zIndex: 2147483647, // Max z-index to ensure it's always on top
        minWidth: 180,
        userSelect: 'none',
        pointerEvents: 'auto',
        boxShadow: '0 2px 8px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(0,255,0,0.3)',
        isolation: 'isolate', // Create new stacking context
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: 4 }}>
        📊 FileManager Perf {isScrolling && <span style={{ color: '#ff0' }}>⚡ SCROLL</span>}
      </div>
      
      <div style={{ marginBottom: 4 }}>
        <span style={{ color: '#888' }}>Files:</span> {filteredCount}/{fileCount}
      </div>
      
      <div style={{ marginBottom: 4 }}>
        <span style={{ color: '#888' }}>Grid renders:</span>{' '}
        <span style={{ color: gridRenderCount > 10 ? '#ff0' : '#0f0' }}>{gridRenderCount}</span>
      </div>
      
      <div style={{ marginBottom: 4 }}>
        <span style={{ color: '#888' }}>Tile renders:</span>{' '}
        <span style={{ color: tileRenderCount > 100 ? '#f00' : tileRenderCount > 50 ? '#ff0' : '#0f0' }}>
          {tileRenderCount}
        </span>
      </div>
      
      <div style={{ marginBottom: 4 }}>
        <span style={{ color: '#888' }}>Filter time:</span>{' '}
        <span style={{ color: filterSortStats.avgDuration > 16 ? '#ff0' : '#0f0' }}>
          {filterSortStats.avgDuration.toFixed(1)}ms
        </span>
      </div>
      
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#888' }}>Thumbs cached:</span>{' '}
        <span style={{ color: '#0f0' }}>{getLoadedThumbCount()}</span>
      </div>
      
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={handleReset}
          style={{
            background: '#333',
            color: '#fff',
            border: 'none',
            padding: '2px 6px',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          Reset
        </button>
        <button
          onClick={toggleVisibility}
          style={{
            background: '#333',
            color: '#fff',
            border: 'none',
            padding: '2px 6px',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          Hide
        </button>
      </div>
      
      <div style={{ marginTop: 4, fontSize: 9, color: '#666' }}>
        Ctrl+Shift+P to toggle
      </div>
    </div>
  );

  // Render via portal to escape any modal/stacking context hierarchies
  return createPortal(content, document.body);
});

// Export only the component - toggleVisibility can be accessed via window.__toggleFilesPerf
if (IS_DEV && typeof window !== 'undefined') {
  (window as unknown as { __toggleFilesPerf: typeof toggleVisibility }).__toggleFilesPerf = toggleVisibility;
  (window as unknown as { __showFilesPerf: () => void }).__showFilesPerf = () => {
    if (!isVisible) {
      toggleVisibility();
    }
    console.log('[PerfHUD] Now visible. Open FileManager to see the HUD.');
  };
}
