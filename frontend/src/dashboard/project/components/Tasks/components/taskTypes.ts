import type { Status } from "../types";

export type RawTask = {
  taskId?: string;
  id?: string;
  projectId?: string;
  title?: string;
  name?: string;
  description?: string;
  status?: Status;
  dueAt?: string | number | Date;
  due_at?: string | number | Date;
  dueDate?: string | number | Date;
  due_date?: string | number | Date;
  due?: string | number | Date;
  assigneeId?: string;
  assignedTo?: string;
  location?: unknown;
  address?: string;
  createdBy?: string;
  createdById?: string;
  createdByName?: string;
  createdByUsername?: string;
  createdByEmail?: string;
  [key: string]: unknown;
};

export type QuickTask = {
  id: string;
  title: string;
  description?: string;
  status: Status;
  dueDate: Date | null;
  address?: string;
  location?: { lat: number; lng: number } | null;
  assignedTo?: string;
  projectId?: string;
  dueDateInput?: string | null;
  raw: RawTask;
};

export type TaskStats = {
  completed: number;
  overdue: number;
  dueSoon: number;
};

export type TaskMapMarker = {
  id: string;
  lat: number;
  lng: number;
  iconUrl?: string;
  title?: string;
  isActive?: boolean;
  variant?: "pin" | "avatar";
};
