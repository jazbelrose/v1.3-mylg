// lib/thumbnailJobQueue.ts - Centralized thumbnail generation queue
// Fixes the "thumbnails only appear after visiting slide" bug by
// immediately queuing all slides for thumbnail generation on create/import

import { saveSlideThumb } from './thumbnails';
import { isUiThumbsEnabled } from './featureFlags';

export type ThumbnailJobPriority = 'immediate' | 'high' | 'normal' | 'low';
export type ThumbnailJobStatus = 'pending' | 'generating' | 'done' | 'failed';

export interface ThumbnailJob {
  slideId: string;
  projectId: string;
  content: string;
  backgroundColor?: string;
  backgroundImage?: string;
  priority: ThumbnailJobPriority;
  status: ThumbnailJobStatus;
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
  error?: string;
}

export interface ThumbnailJobQueueOptions {
  maxConcurrency?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  onThumbnailGenerated?: (slideId: string, thumbnailUrl: string) => void;
  onStatusChange?: (slideId: string, status: ThumbnailJobStatus) => void;
}

const PRIORITY_ORDER: Record<ThumbnailJobPriority, number> = {
  immediate: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * ThumbnailJobQueue - Centralized queue manager for thumbnail generation
 * 
 * Key behaviors:
 * - Deduplicates jobs by slideId (latest config wins)
 * - Processes jobs by priority (immediate > high > normal > low)
 * - Limits concurrency to avoid overwhelming the backend
 * - Retries failed jobs with exponential backoff
 * - Exposes status per-slide for UI indicators
 */
export class ThumbnailJobQueue {
  private jobs: Map<string, ThumbnailJob> = new Map();
  private activeJobs: Set<string> = new Set();
  private isProcessing: boolean = false;
  private options: Required<ThumbnailJobQueueOptions>;

  constructor(options: ThumbnailJobQueueOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 3,
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 1000,
      onThumbnailGenerated: options.onThumbnailGenerated ?? (() => {}),
      onStatusChange: options.onStatusChange ?? (() => {}),
    };
  }

  /**
   * Enqueue a single slide for thumbnail generation
   */
  enqueue(params: {
    slideId: string;
    projectId: string;
    content: string;
    backgroundColor?: string;
    backgroundImage?: string;
    priority?: ThumbnailJobPriority;
  }): void {
    // Skip if UI-only thumbnails are enabled (handled by useThumbnail hook)
    if (isUiThumbsEnabled()) {
      return;
    }

    const { slideId, projectId, content, backgroundColor, backgroundImage, priority = 'normal' } = params;

    // Skip if no content AND no background image (nothing to render)
    const hasContent = content && content.length > 0;
    const hasBackgroundImage = backgroundImage && backgroundImage.length > 0;
    if (!hasContent && !hasBackgroundImage) {
      return;
    }

    // Check if already actively generating - don't interrupt
    if (this.activeJobs.has(slideId)) {
      console.log(`[ThumbnailQueue] Slide ${slideId} already generating, skipping enqueue`);
      return;
    }

    const existingJob = this.jobs.get(slideId);

    // If existing job is done or failed, allow re-queue
    // If existing job is pending, update it with new config
    if (existingJob && existingJob.status === 'generating') {
      return;
    }

    const job: ThumbnailJob = {
      slideId,
      projectId,
      content,
      backgroundColor,
      backgroundImage,
      priority,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    };

    this.jobs.set(slideId, job);
    this.options.onStatusChange(slideId, 'pending');

    console.log(`[ThumbnailQueue] Enqueued slide ${slideId} with priority ${priority}`);

    // Start processing if not already running
    this.processQueue();
  }

  /**
   * Enqueue multiple slides at once (for import/Magic Layout)
   */
  enqueueAll(
    slides: Array<{
      id: string;
      content?: string;
      backgroundColor?: string;
      backgroundImage?: string;
    }>,
    projectId: string,
    priority: ThumbnailJobPriority = 'high'
  ): void {
    if (isUiThumbsEnabled()) {
      return;
    }

    console.log(`[ThumbnailQueue] Enqueuing ${slides.length} slides with priority ${priority}`);

    for (const slide of slides) {
      // Skip if no content AND no background image (nothing to render)
      const hasContent = slide.content && slide.content.length > 0;
      const hasBackgroundImage = slide.backgroundImage && slide.backgroundImage.length > 0;
      if (!hasContent && !hasBackgroundImage) {
        continue;
      }

      this.enqueue({
        slideId: slide.id,
        projectId,
        content: slide.content || '',
        backgroundColor: slide.backgroundColor,
        backgroundImage: slide.backgroundImage,
        priority,
      });
    }
  }

  /**
   * Get status for a specific slide
   */
  getStatus(slideId: string): ThumbnailJobStatus | null {
    const job = this.jobs.get(slideId);
    return job?.status ?? null;
  }

  /**
   * Get all pending/generating jobs count
   */
  getPendingCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'pending' || job.status === 'generating') {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if any jobs are currently being processed
   */
  isActive(): boolean {
    return this.activeJobs.size > 0 || this.getPendingCount() > 0;
  }

  /**
   * Cancel a pending job (won't cancel actively generating ones)
   */
  cancel(slideId: string): void {
    const job = this.jobs.get(slideId);
    if (job && job.status === 'pending') {
      this.jobs.delete(slideId);
      console.log(`[ThumbnailQueue] Cancelled job for slide ${slideId}`);
    }
  }

  /**
   * Clear all pending jobs
   */
  clearPending(): void {
    for (const [slideId, job] of this.jobs.entries()) {
      if (job.status === 'pending') {
        this.jobs.delete(slideId);
      }
    }
  }

  /**
   * Mark a slide as already having a thumbnail (skip generation)
   */
  markComplete(slideId: string): void {
    const job = this.jobs.get(slideId);
    if (job && job.status === 'pending') {
      job.status = 'done';
      this.options.onStatusChange(slideId, 'done');
    }
  }

  /**
   * Main processing loop
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (true) {
        // Check if we can run more concurrent jobs
        if (this.activeJobs.size >= this.options.maxConcurrency) {
          // Wait a bit and check again
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // Get next job by priority
        const nextJob = this.getNextPendingJob();
        if (!nextJob) {
          break;
        }

        // Start processing this job
        this.processJob(nextJob);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get the next pending job sorted by priority
   */
  private getNextPendingJob(): ThumbnailJob | null {
    let bestJob: ThumbnailJob | null = null;
    let bestPriority = Infinity;

    for (const job of this.jobs.values()) {
      if (job.status !== 'pending') {
        continue;
      }

      const priorityValue = PRIORITY_ORDER[job.priority];
      if (priorityValue < bestPriority) {
        bestPriority = priorityValue;
        bestJob = job;
      } else if (priorityValue === bestPriority && bestJob && job.createdAt < bestJob.createdAt) {
        // Same priority - prefer older jobs (FIFO within priority)
        bestJob = job;
      }
    }

    return bestJob;
  }

  /**
   * Process a single job
   */
  private async processJob(job: ThumbnailJob): Promise<void> {
    const { slideId, projectId, content, backgroundColor, backgroundImage } = job;

    // Mark as generating
    job.status = 'generating';
    job.lastAttemptAt = Date.now();
    this.activeJobs.add(slideId);
    this.options.onStatusChange(slideId, 'generating');

    console.log(`[ThumbnailQueue] Generating thumbnail for slide ${slideId}`);

    try {
      let generatedUrl: string | null = null;

      await saveSlideThumb(
        projectId,
        slideId,
        (url) => {
          generatedUrl = url;
        },
        {
          width: 1920,
          height: 1080,
          backgroundColor,
          content,
          backgroundImage,
        }
      );

      if (generatedUrl) {
        job.status = 'done';
        this.options.onStatusChange(slideId, 'done');
        this.options.onThumbnailGenerated(slideId, generatedUrl);
        console.log(`[ThumbnailQueue] Successfully generated thumbnail for slide ${slideId}`);
      } else {
        throw new Error('No thumbnail URL returned');
      }
    } catch (error) {
      console.warn(`[ThumbnailQueue] Failed to generate thumbnail for slide ${slideId}:`, error);

      job.retryCount++;
      job.error = error instanceof Error ? error.message : 'Unknown error';

      if (job.retryCount < this.options.maxRetries) {
        // Schedule retry with exponential backoff
        const delay = this.options.retryDelayMs * Math.pow(2, job.retryCount - 1);
        console.log(`[ThumbnailQueue] Retrying slide ${slideId} in ${delay}ms (attempt ${job.retryCount}/${this.options.maxRetries})`);
        
        job.status = 'pending';
        this.options.onStatusChange(slideId, 'pending');
        
        setTimeout(() => {
          this.processQueue();
        }, delay);
      } else {
        job.status = 'failed';
        this.options.onStatusChange(slideId, 'failed');
        console.error(`[ThumbnailQueue] Max retries exceeded for slide ${slideId}`);
      }
    } finally {
      this.activeJobs.delete(slideId);
      
      // Continue processing queue
      this.processQueue();
    }
  }

  /**
   * Retry a failed job
   */
  retry(slideId: string): void {
    const job = this.jobs.get(slideId);
    if (job && job.status === 'failed') {
      job.status = 'pending';
      job.retryCount = 0;
      job.error = undefined;
      this.options.onStatusChange(slideId, 'pending');
      this.processQueue();
    }
  }

  /**
   * Cleanup completed/failed jobs older than a threshold
   */
  cleanup(maxAgeMs: number = 5 * 60 * 1000): void {
    const now = Date.now();
    for (const [slideId, job] of this.jobs.entries()) {
      if (
        (job.status === 'done' || job.status === 'failed') &&
        now - job.createdAt > maxAgeMs
      ) {
        this.jobs.delete(slideId);
      }
    }
  }
}

// Singleton instance for global use
let globalQueue: ThumbnailJobQueue | null = null;

export function getThumbnailQueue(): ThumbnailJobQueue {
  if (!globalQueue) {
    globalQueue = new ThumbnailJobQueue();
  }
  return globalQueue;
}

export function createThumbnailQueue(options: ThumbnailJobQueueOptions): ThumbnailJobQueue {
  return new ThumbnailJobQueue(options);
}
