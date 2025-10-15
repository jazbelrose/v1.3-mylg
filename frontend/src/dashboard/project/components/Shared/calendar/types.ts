export type TimelineEvent = {
  id: string;
  eventId?: string;
  date: string;
  description?: string;
  hours?: number | string;
  budgetItemId?: string | null;
  createdAt?: string;
  createdBy?: string;
  payload?: Record<string, unknown>;
};

export type Project = {
  projectId: string;
  title?: string;
  color?: string;
  dateCreated?: string;
  productionStart?: string;
  finishline?: string;
  timelineEvents?: TimelineEvent[];
  address?: string;
  company?: string;
  clientName?: string;
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  clientAddress?: string;
  invoiceBrandPhone?: string;
  clientPhone?: string;
  clientEmail?: string;
};
