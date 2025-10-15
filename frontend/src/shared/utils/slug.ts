import type { Project } from "../utils/api";

export function slugify(str: string): string {
  return encodeURIComponent(
    str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
  );
}

interface AppUser {
  userId: string;
  firstName?: string;
  lastName?: string;
  [key: string]: unknown;
}

export function findUserBySlug(users: AppUser[], slug: string): AppUser | null {
  if (!Array.isArray(users)) return null;
  return users.find(u => slugify(`${u.firstName || ''}-${u.lastName || ''}`) === slug) || null;
}

export function findProjectBySlug(projects: Project[], slug: string): Project | null {
  if (!Array.isArray(projects)) return null;
  return projects.find(p => slugify(p.title || '') === slug) || null;
}








