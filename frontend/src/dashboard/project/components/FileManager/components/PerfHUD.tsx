/**
 * PerfHUD - Dev-only performance heads-up display for FileManager
 * 
 * Shows real-time performance metrics in a floating panel.
 * Toggle with Ctrl+Shift+P or via localStorage.setItem('showFilesPerf', 'true')
 */

import { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { filesPerf } from '../hooks/useFilesPerf';

const IS_DEV = import.meta.env.DEV;

// External store for visibility toggle
let isVisible = localStorage.getItem('showFilesPerf') === 'true';
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return isVisible;
}

function toggleVisibility() {
  isVisible = !isVisible;
  localStorage.setItem('showFilesPerf', isVisible ? 'true' : 'false');
  listeners.forEach(l => l());
}

// Keyboard shortcut
if (IS_DEV && typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // Ctrl+Shift+P
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      toggleVisibility();
    }
  });
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: 'rgba(0, 0, 0, 0.85)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        padding: 8,
        borderRadius: 4,
        zIndex: 99999,
        minWidth: 180,
        userSelect: 'none',
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: 4 }}>
        📊 FileManager Perf
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
        <span style={{ color: '#888' }}>Thumbs:</span>{' '}
        {thumbnailStats.loaded}
        {thumbnailStats.loading > 0 && <span style={{ color: '#ff0' }}> (+{thumbnailStats.loading})</span>}
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
});

// Export only the component - toggleVisibility can be accessed via window.__toggleFilesPerf
if (IS_DEV && typeof window !== 'undefined') {
  (window as unknown as { __toggleFilesPerf: typeof toggleVisibility }).__toggleFilesPerf = toggleVisibility;
}
