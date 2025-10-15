// Utility functions for chart data stability and optimization

export interface ChartDataItem {
  name: string;
  value: number;
}

/**
 * Creates a stable hash for chart data to detect meaningful changes
 * This helps prevent unnecessary chart re-renders when data is essentially the same
 */
export function createChartDataHash(data: ChartDataItem[]): string {
  return data
    .map(item => `${item.name}:${Math.round(item.value * 100)}`) // Round to 2 decimal places
    .sort() // Sort to make order-independent
    .join('|');
}

/**
 * Compares two chart data arrays for meaningful differences
 * Returns true if they are essentially the same (should not re-render)
 */
export function areChartDataEqual(prev: ChartDataItem[], next: ChartDataItem[]): boolean {
  if (prev.length !== next.length) return false;
  
  // Quick reference check first
  if (prev === next) return true;
  
  // Compare hashes for efficient deep comparison
  return createChartDataHash(prev) === createChartDataHash(next);
}

/**
 * Stabilizes chart data by rounding values and sorting consistently
 * This reduces unnecessary re-renders caused by floating point precision differences
 */
export function stabilizeChartData(data: ChartDataItem[]): ChartDataItem[] {
  return data.map(item => ({
    name: item.name,
    value: Math.round(item.value * 100) / 100 // Round to 2 decimal places
  }));
}

/**
 * Throttle function specifically designed for chart updates
 * Ensures a minimum delay between updates while still allowing the latest update
 */
export class ChartUpdateThrottler {
  private timeoutId: number | null = null;
  private lastUpdate = 0;
  private readonly minDelay: number;

  constructor(minDelayMs = 100) {
    this.minDelay = minDelayMs;
  }

  throttle(callback: () => void): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdate;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    if (timeSinceLastUpdate >= this.minDelay) {
      // Execute immediately if enough time has passed
      this.lastUpdate = now;
      callback();
    } else {
      // Schedule for later
      this.timeoutId = window.setTimeout(() => {
        this.lastUpdate = Date.now();
        this.timeoutId = null;
        callback();
      }, this.minDelay - timeSinceLastUpdate);
    }
  }

  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

/**
 * Development helper to track component render frequency
 * Logs a warning if a component re-renders too frequently
 */
export class RenderTracker {
  private renderCount = 0;
  private startTime = Date.now();
  private readonly componentName: string;
  private readonly warningThreshold: number;

  constructor(componentName: string, warningThreshold = 10) {
    this.componentName = componentName;
    this.warningThreshold = warningThreshold;
  }

  track(): void {
    this.renderCount++;
    const elapsed = Date.now() - this.startTime;
    
    // Reset counter every 5 seconds
    if (elapsed > 5000) {
      if (this.renderCount > this.warningThreshold) {
        console.warn(
          `🔄 ${this.componentName} rendered ${this.renderCount} times in 5 seconds. Consider optimizing.`
        );
      }
      this.renderCount = 0;
      this.startTime = Date.now();
    }
  }
}

/**
 * Hook to track render frequency in development
 * Usage: useRenderTracker('ComponentName');
 */
export function useRenderTracker(componentName: string): void {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Store tracker in a ref-like way without React dependency
    const trackerKey = `__renderTracker_${componentName}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any)[trackerKey]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)[trackerKey] = new RenderTracker(componentName);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[trackerKey].track();
  }
}








