export type QuickCreateTaskLocation =
  | { lat?: number | string | null; lng?: number | string | null; [key: string]: unknown }
  | string
  | null
  | undefined;

export type TaskNoteAttachment = {
  id: string;
  fileName: string;
  mimeType?: string;
  dataUrl?: string;
  url?: string;
  uploadedAt?: string;
};

export type QuickCreateTaskModalTask = {
  id?: string | null;
  taskId?: string | null;
  projectId: string;
  projectName?: string | null;
  title?: string | null;
  description?: string | null;
  dueDate?: string | number | Date | null;
  status?: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[] | null;
  assigneeTokens?: string[] | null;
  address?: string | null;
  location?: QuickCreateTaskLocation;
  noteAttachments?: TaskNoteAttachment[] | null;
};
