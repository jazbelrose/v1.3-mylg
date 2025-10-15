export type Status = "todo" | "in_progress" | "done" | string;

export interface TeamMember {
  userId: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  username?: string;
  email?: string;
}

export interface TaskLocation {
  lat: number | string;
  lng: number | string;
}

export interface ApiTask {
  taskId?: string;
  id?: string;
  projectId: string;
  title?: string;
  name?: string;
  description?: string;
  comments?: string;
  budgetItemId?: string | null;
  status?: Status;
  assigneeId?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: string;
  eventId?: string;
  location?: TaskLocation;
  address?: string;
}

export interface Task {
  id: string;
  taskId?: string;
  projectId: string;
  name: string;
  assigneeId?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: string;
  budgetItemId?: string;
  eventId?: string;
  description?: string;
  status: Status;
  location?: TaskLocation;
  address?: string;
  createdBy?: string;
  createdById?: string;
  createdByName?: string;
  createdByUsername?: string;
  createdByEmail?: string;
}

export interface NominatimSuggestion {
  place_id: string | number;
  display_name: string;
  lat: string;
  lon: string;
}
