export type QuickCreateTaskLocation =
  | { lat?: number | string | null; lng?: number | string | null; [key: string]: unknown }
  | string
  | null
  | undefined;

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
  address?: string | null;
  location?: QuickCreateTaskLocation;
};
