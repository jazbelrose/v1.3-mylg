/**
 * DeleteFileDialog
 * Confirmation dialog for file deletion with reference count warning
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { getFileRefs } from '@/shared/api/fileLifecycleApi';
import { cn } from '@/components/ui/utils';
import type { GetRefsResponse } from '@/shared/types/fileLifecycle';

interface DeleteFileDialogProps {
  fileId: string;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void>;
}

export const DeleteFileDialog: React.FC<DeleteFileDialogProps> = ({
  fileId,
  filename,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refsData, setRefsData] = useState<GetRefsResponse | null>(null);

  // Fetch reference count when dialog opens
  useEffect(() => {
    if (isOpen && fileId) {
      setLoadingRefs(true);
      setRefsData(null);
      getFileRefs(fileId)
        .then(setRefsData)
        .catch((err) => console.error('Failed to fetch refs:', err))
        .finally(() => setLoadingRefs(false));
    }
  }, [isOpen, fileId]);

  const refCount = refsData?.count ?? 0;
  const groupedRefs = refsData?.grouped ?? {};

  const hasRefs = refCount > 0;

  // Format usage summary
  const usageSummary = Object.entries(groupedRefs)
    .map(([type, refs]) => `${capitalize(type)} (${(refs as unknown[]).length})`)
    .join(', ');

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm(hasRefs);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Delete File
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* File info */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Are you sure you want to delete this file?
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                {filename}
              </p>
            </div>
          </div>

          {/* Reference warning */}
          {loadingRefs ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking file usage...
            </div>
          ) : hasRefs ? (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    This file is used in {refCount} place{refCount !== 1 ? 's' : ''}
                  </p>
                  {usageSummary && (
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      Used in: {usageSummary}
                    </p>
                  )}
                  <p className="mt-2 text-amber-600 dark:text-amber-400">
                    Deleting will show a placeholder in all locations where this file is referenced.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This file is not used anywhere and can be safely deleted.
            </p>
          )}

          {/* Restore info */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Deleted files can be restored within 30 days.
          </p>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg',
              'text-gray-700 dark:text-gray-300',
              'bg-white dark:bg-gray-800',
              'border border-gray-300 dark:border-gray-600',
              'hover:bg-gray-50 dark:hover:bg-gray-700',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting || loadingRefs}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg',
              'text-white',
              'bg-red-600 hover:bg-red-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center gap-2'
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete{hasRefs ? ' Anyway' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default DeleteFileDialog;
