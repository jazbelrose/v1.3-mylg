export type QuickCreateTaskLocation =
  | { lat?: number | string | null; lng?: number | string | null; [key: string]: unknown }
  | string
  | null
  | undefined;

export type TaskNoteAttachment = {
  id: string;
  fileName: string;
  mimeType?: string;
  url: string;
  uploadedAt?: string;
};

export type TaskReviewThreadEntry = {
  id?: string | null;
  submissionId?: string | null;
  action?: string | null;
  note?: string | null;
  fromStatus?: string | null;
  createdAt?: string | null;
  createdById?: string | null;
  createdByAdmin?: boolean | null;
  [key: string]: unknown;
};

export type QuickCreateTaskModalTask = {
  id?: string | null;
  taskId?: string | null;
  projectId: string;
  projectName?: string | null;
  title?: string | null;
  description?: string | null;
  dueDate?: string | number | Date | null;
  startAt?: string | number | Date | null;
  endAt?: string | number | Date | null;
  status?: string | null;
  kind?: string | null;
  tags?: string[] | null;
  cluster?: string | null;
  durationMinutes?: number | null;
  focusBlockId?: string | null;
  focusChildTaskIds?: string[] | null;
  focusChecklist?: Array<{ taskId: string; title: string }> | null;
  assigneeId?: string | null;
  assigneeIds?: string[] | null;
  assigneeTokens?: string[] | null;
  address?: string | null;
  location?: QuickCreateTaskLocation;
  noteAttachments?: TaskNoteAttachment[] | null;
  reviewState?: string | null;
  currentSubmissionId?: string | null;
  thread?: TaskReviewThreadEntry[] | null;
  reviewerId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
  createdByEmail?: string | null;
  createdByThumbnail?: string | null;
};

export type QuickCreateTaskModalEventType = "create" | "update" | "delete";

export type QuickCreateTaskModalEvent = {
  type: QuickCreateTaskModalEventType;
};
