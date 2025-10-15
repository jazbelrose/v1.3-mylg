import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";

export type ProjectWithMeta = ProjectLike & {
  _activity: number;
  _created: number;
  team?: Array<{
    userId?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }>;
  unreadCount?: number;
};












