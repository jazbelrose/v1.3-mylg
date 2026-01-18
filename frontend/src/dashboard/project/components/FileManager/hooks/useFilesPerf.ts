/**
 * useFilesPerf - Dev-only performance instrumentation for FileManager
 * 
 * Provides timing metrics and logging for debugging performance issues.
 * Exposes data via window.__filesPerf in development mode.
 * 
 * Usage in console:
 *   window.__filesPerf.getReport() - Shows timing summary
 *   window.__filesPerf.getRenderCounts() - Shows component render counts
 *   window.__filesPerf.reset() - Reset all metrics
 */

interface PerfEntry {
  label: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface FilesPerf {
  entries: PerfEntry[];
  renderCounts: Record<string, number>;
  mark: (label: string, metadata?: Record<string, unknown>) => void;
  measure: (label: string) => number | undefined;
  countRender: (componentName: string) => void;
  trackFilterSort: (fileCount: number, filteredCount: number, duration: number) => void;
  trackThumbnailLoad: (url: string, duration: number) => void;
  getReport: () => {
    entries: PerfEntry[];
    renderCounts: Record<string, number>;
    filterSortStats: { totalCalls: number; avgDuration: number; avgFileCount: number };
    thumbnailStats: { loading: number; loaded: number; avgLoadTime: number };
    summary: string;
  };
  getRenderCounts: () => Record<string, number>;
  reset: () => void;
}

const IS_DEV = import.meta.env.DEV;

class FilesPerfImpl implements FilesPerf {
  entries: PerfEntry[] = [];
  renderCounts: Record<string, number> = {};
  private activeMarks: Map<string, number> = new Map();
  
  // Filter/sort tracking
  private filterSortCalls: Array<{ fileCount: number; filteredCount: number; duration: number }> = [];
  
  // Thumbnail tracking
  private thumbnailsLoading = new Set<string>();
  private thumbnailsLoaded = new Set<string>();
  private thumbnailLoadTimes: number[] = [];

  mark(label: string, metadata?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const now = performance.now();
    this.activeMarks.set(label, now);
    this.entries.push({
      label,
      startTime: now,
      metadata,
    });
  }

  measure(label: string): number | undefined {
    if (!IS_DEV) return undefined;
    const startTime = this.activeMarks.get(label);
    if (startTime === undefined) return undefined;

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Update the entry
    const entry = this.entries.find(e => e.label === label && !e.endTime);
    if (entry) {
      entry.endTime = endTime;
      entry.duration = duration;
    }

    this.activeMarks.delete(label);

    if (duration > 50) {
      console.warn(`[FilesPerf] ${label}: ${duration.toFixed(1)}ms (SLOW)`);
    } else if (duration > 16) {
      console.debug(`[FilesPerf] ${label}: ${duration.toFixed(1)}ms`);
    }

    return duration;
  }

  countRender(componentName: string) {
    if (!IS_DEV) return;
    this.renderCounts[componentName] = (this.renderCounts[componentName] || 0) + 1;
  }
  
  trackFilterSort(fileCount: number, filteredCount: number, duration: number) {
    if (!IS_DEV) return;
    this.filterSortCalls.push({ fileCount, filteredCount, duration });
    if (duration > 10) {
      console.warn(`[FilesPerf] Filter/sort: ${duration.toFixed(1)}ms for ${fileCount} files → ${filteredCount} results`);
    }
  }
  
  trackThumbnailLoad(url: string, duration: number) {
    if (!IS_DEV) return;
    this.thumbnailsLoading.delete(url);
    this.thumbnailsLoaded.add(url);
    this.thumbnailLoadTimes.push(duration);
  }

  getReport() {
    const completedEntries = this.entries.filter(e => e.duration !== undefined);
    const summary = completedEntries
      .slice(-20) // Last 20 entries
      .map(e => `${e.label}: ${e.duration?.toFixed(1)}ms`)
      .join('\n');
    
    // Filter/sort stats
    const filterSortStats = {
      totalCalls: this.filterSortCalls.length,
      avgDuration: this.filterSortCalls.length > 0 
        ? this.filterSortCalls.reduce((a, b) => a + b.duration, 0) / this.filterSortCalls.length 
        : 0,
      avgFileCount: this.filterSortCalls.length > 0
        ? this.filterSortCalls.reduce((a, b) => a + b.fileCount, 0) / this.filterSortCalls.length
        : 0,
    };
    
    // Thumbnail stats
    const thumbnailStats = {
      loading: this.thumbnailsLoading.size,
      loaded: this.thumbnailsLoaded.size,
      avgLoadTime: this.thumbnailLoadTimes.length > 0
        ? this.thumbnailLoadTimes.reduce((a, b) => a + b, 0) / this.thumbnailLoadTimes.length
        : 0,
    };

    return {
      entries: completedEntries,
      renderCounts: { ...this.renderCounts },
      filterSortStats,
      thumbnailStats,
      summary,
    };
  }
  
  getRenderCounts() {
    return { ...this.renderCounts };
  }

  reset() {
    this.entries = [];
    this.renderCounts = {};
    this.activeMarks.clear();
    this.filterSortCalls = [];
    this.thumbnailsLoading.clear();
    this.thumbnailsLoaded.clear();
    this.thumbnailLoadTimes = [];
  }
}

// Singleton instance
const filesPerf = new FilesPerfImpl();

// Expose to window in dev mode
if (IS_DEV && typeof window !== 'undefined') {
  (window as unknown as { __filesPerf: FilesPerf }).__filesPerf = filesPerf;
}

export function useFilesPerf() {
  return filesPerf;
}

export { filesPerf };
export type { FilesPerf, PerfEntry };
