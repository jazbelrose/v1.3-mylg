/**
 * DeletedFilePlaceholder
 * Displays a placeholder for deleted or unavailable files
 */

import React from 'react';
import { FileX, Lock, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export type PlaceholderReason = 
  | 'deleted'      // File was soft-deleted
  | 'no-access'    // User doesn't have permission
  | 'not-found'    // File record doesn't exist
  | 'failed'       // Upload failed
  | 'uploading';   // Still uploading

interface DeletedFilePlaceholderProps {
  reason?: PlaceholderReason;
  context?: 'slide' | 'chat' | 'task' | 'budget' | 'inline' | 'grid';
  filename?: string;
  className?: string;
  onRestore?: () => void;
  canRestore?: boolean;
}

const reasonConfig: Record<PlaceholderReason, { icon: React.ElementType; label: string; description: string }> = {
  deleted: {
    icon: FileX,
    label: 'File deleted',
    description: 'This file has been deleted',
  },
  'no-access': {
    icon: Lock,
    label: 'No access',
    description: 'You don\'t have permission to view this file',
  },
  'not-found': {
    icon: AlertCircle,
    label: 'File not found',
    description: 'This file no longer exists',
  },
  failed: {
    icon: AlertCircle,
    label: 'Upload failed',
    description: 'The file upload did not complete',
  },
  uploading: {
    icon: Clock,
    label: 'Uploading...',
    description: 'This file is still being uploaded',
  },
};

const contextStyles: Record<string, string> = {
  slide: 'w-full h-full min-h-[100px] bg-gray-100 dark:bg-gray-800',
  chat: 'inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg',
  task: 'flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700',
  budget: 'flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm',
  inline: 'inline-flex items-center gap-1.5 text-gray-500',
  grid: 'flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 aspect-square',
};

export const DeletedFilePlaceholder: React.FC<DeletedFilePlaceholderProps> = ({
  reason = 'deleted',
  context = 'inline',
  filename,
  className,
  onRestore,
  canRestore = false,
}) => {
  const config = reasonConfig[reason];
  const Icon = config.icon;

  if (context === 'slide') {
    return (
      <div 
        className={cn(
          contextStyles.slide,
          'flex flex-col items-center justify-center gap-2',
          className
        )}
      >
        <Icon className="w-8 h-8 text-gray-400" />
        <span className="text-sm text-gray-500">{config.label}</span>
        {filename && (
          <span className="text-xs text-gray-400 truncate max-w-[200px]">
            {filename}
          </span>
        )}
        {canRestore && onRestore && (
          <button
            onClick={onRestore}
            className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Restore file
          </button>
        )}
      </div>
    );
  }

  if (context === 'grid') {
    return (
      <div className={cn(contextStyles.grid, className)}>
        <Icon className="w-6 h-6 text-gray-400 mb-2" />
        <span className="text-sm text-gray-500 text-center">{config.label}</span>
        {filename && (
          <span className="text-xs text-gray-400 truncate max-w-full mt-1">
            {filename}
          </span>
        )}
        {canRestore && onRestore && (
          <button
            onClick={onRestore}
            className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Restore
          </button>
        )}
      </div>
    );
  }

  if (context === 'chat') {
    return (
      <div className={cn(contextStyles.chat, className)}>
        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-500">
          {reason === 'deleted' ? 'Attachment removed' : config.label}
        </span>
      </div>
    );
  }

  if (context === 'task') {
    return (
      <div className={cn(contextStyles.task, className)}>
        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-gray-500 truncate">
            {filename || config.label}
          </span>
          {filename && (
            <span className="text-xs text-gray-400">{config.label}</span>
          )}
        </div>
        {canRestore && onRestore && (
          <button
            onClick={onRestore}
            className="ml-auto text-xs text-blue-600 hover:text-blue-700"
          >
            Restore
          </button>
        )}
      </div>
    );
  }

  if (context === 'budget') {
    return (
      <div className={cn(contextStyles.budget, className)}>
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-gray-500">{config.label}</span>
      </div>
    );
  }

  // inline (default)
  return (
    <span className={cn(contextStyles.inline, className)}>
      <Icon className="w-4 h-4" />
      <span className="text-sm">{config.label}</span>
    </span>
  );
};

export default DeletedFilePlaceholder;
