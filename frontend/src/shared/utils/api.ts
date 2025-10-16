// api.ts
import { waitForAuthReady } from './waitForAuthReady';
import { csrfProtection, rateLimiter, logSecurityEvent } from './securityUtils';
import {
  getPreviewBudgetHeader,
  getPreviewBudgetHeaders,
  getPreviewBudgetItems,
  isPreviewModeEnabled,
} from './devPreview';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface ApiEndpoints {
  [key: string]: string;
}

export interface ApiFetchOptions extends RequestInit {
  retryCount?: number;
  retryDelay?: number;          // ms
  skipRateLimit?: boolean;
  onNetworkError?: (error: Error) => void;
  suppressErrorLog?: boolean;
}

type JsonRecord = Record<string, unknown>;

export interface UserProfile extends JsonRecord {
  userId: string;
  username?: string;
  email?: string;
  role?: string;
}

export interface TeamMember {
  userId: string;
  role?: string;
  [k: string]: unknown;
}

export interface QuickLink {
  id?: string;
  title?: string;
  url?: string;
  [k: string]: unknown;
}

export interface Project {
  projectId: string;
  title?: string;
  description?: string;
  status?: string;
  team?: TeamMember[];
  timelineEvents?: TimelineEvent[];
  thumbnails?: string[];
  color?: string;
  finishline?: string;
  productionStart?: string;
  dateCreated?: string;
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  invoiceBrandPhone?: string;
  clientName?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  previewUrl?: string;
  quickLinks?: QuickLink[];
  [key: string]: unknown;
}

export interface Task extends JsonRecord {
  taskId?: string;
  projectId: string;
  title: string;
  description?: string;
  budgetItemId?: string | null;
  status?: 'todo' | 'in_progress' | 'done';
  assigneeId?: string;
  dueDate?: string; // ISO
  createdBy?: string;
  createdById?: string;
  createdByName?: string;
  createdByUsername?: string;
  createdByEmail?: string;
}

export interface TimelineEvent extends JsonRecord {
  id?: string;
  eventId?: string;
  timelineEventId?: string;
  projectId?: string;
  budgetItemId?: string;
  date?: string; // ISO YYYY-MM-DD
  hours?: string | number;
  description?: string;
  title?: string;
  createdAt?: string;
  createdBy?: string;
  payload?: { description?: string; title?: string } & JsonRecord;
}

export interface NotificationItem extends JsonRecord {
  userId: string;
  ['timestamp#uuid']: string;
  type?: string;
  message?: string;
  read: boolean;
  timestamp: string;
  senderId?: string;
  projectId?: string;
}

export interface Gallery extends JsonRecord {
  galleryId?: string;
  projectId: string;
  title?: string;
  slug?: string;
}

export interface BudgetHeader extends JsonRecord {
  budgetItemId: `HEADER-${string}`;
  projectId: string;
  budgetId?: string;
  revision?: number;
  clientRevisionId?: number | null;
}

export interface BudgetLine extends JsonRecord {
  budgetItemId: `LINE-${string}`;
  projectId: string;
  budgetId: string;
  revision?: number;
}

export type BudgetItem = BudgetHeader | BudgetLine;

export interface Invite extends JsonRecord {
  inviteId?: string;
  projectId?: string;
  recipientUsername?: string;
  status?: 'pending' | 'accepted' | 'declined' | 'canceled';
}

// Common API shapes
type MaybeItems<T> = { Items?: T[] } | T[];
type MaybeItem<T> = { Item?: T } | T;

// ───────────────────────────────────────────────────────────────────────────────
// Endpoints (env-overridable)
// ───────────────────────────────────────────────────────────────────────────────

const ENV = import.meta.env.VITE_APP_ENV || 'development';

const FILE_BUCKET = import.meta.env.VITE_FILE_BUCKET ||
  import.meta.env.VITE_S3_FILES_BUCKET ||
  'mylg-files-v12';
const FILE_REGION = import.meta.env.VITE_AWS_REGION ||
  import.meta.env.VITE_S3_REGION ||
  'us-west-2';
const FILE_CDN = import.meta.env.VITE_FILE_CDN || import.meta.env.VITE_S3_PUBLIC_BASE || '';

export function getFileUrl(keyOrUrl: string): string {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return keyOrUrl;

  // If it's already a full URL, extract the key
  if (keyOrUrl.startsWith('http')) {
    try {
      const parsed = new URL(keyOrUrl);
      const host = parsed.hostname;
      const cdnHost = FILE_CDN ? new URL(FILE_CDN).hostname : '';
      const shouldRewrite =
        host.includes(FILE_BUCKET) ||
        host.endsWith('amazonaws.com') ||
        (cdnHost && host === cdnHost);
      if (!shouldRewrite) {
        return keyOrUrl;
      }
      const path = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
      keyOrUrl = decodeURIComponent(path);
    } catch {
      // If parsing fails, use as-is
      return keyOrUrl;
    }
  }

  // Normalize project thumbnail paths:
  // older data may omit the `public/` prefix and/or include a `thumbnail-` filename
  // which no longer exists. Convert such keys to the canonical public path.
  if (!keyOrUrl.startsWith('http')) {
    keyOrUrl = keyOrUrl.replace(/^\/+/, '');
  }
  if (keyOrUrl.startsWith('project-thumbnails/')) {
    keyOrUrl = `public/${keyOrUrl}`;
  }
  keyOrUrl = keyOrUrl.replace(
    /(project-thumbnails\/[^/]+\/)(thumbnail-)(.+)/,
    (_m, prefix, _thumb, name) => `${prefix}${name}`
  );

  const base = FILE_CDN || `https://${FILE_BUCKET}.s3.${FILE_REGION}.amazonaws.com`;
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(keyOrUrl)}`;
}

export function normalizeFileUrl(urlOrKey: string): string {
  if (!urlOrKey) return urlOrKey;
  if (urlOrKey.startsWith('http')) {
    return urlOrKey.replace(/mylg-files-v\d+/, FILE_BUCKET);
  }
  return getFileUrl(urlOrKey);
}

export function fileUrlsToKeys(urls: string[]): string[] {
  return urls.map((url) => {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
      return decodeURIComponent(path);
    } catch {
      return url;
    }
  });
}

export const S3_PUBLIC_BASE = `${FILE_CDN || `https://${FILE_BUCKET}.s3.${FILE_REGION}.amazonaws.com`}/`;

const BASE_ENDPOINTS = {
  development: {
    // Core v1.2 Services (us-west-2)
    AUTH_SERVICE_URL: 'https://ictxcba2wf.execute-api.us-west-2.amazonaws.com',
    PROJECTS_SERVICE_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com',
    USER_SERVICE_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com',
    MESSAGES_SERVICE_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com',
    WEBSOCKET_URL: 'wss://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev',
    
    // Mapped endpoints using v1.2 services with correct routes
    API_BASE_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com',
    EDIT_PROJECT_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects',
    USER_PROFILES_API_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/userProfiles',
    USER_PROFILES_PENDING_API_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/userProfilesPending',
    USER_PROFILES_PENDING_API_KEY: '',
    REGISTERED_USER_TEAM_NOTIFICATION_API_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/user/notifications',
    MESSAGES_INBOX_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages/inbox',
    MESSAGES_THREADS_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages/threads',
    DELETE_PROJECT_MESSAGE_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages',
    GET_PROJECT_MESSAGES_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages',
    EDIT_PROJECT_MESSAGE_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages',
    EDIT_MESSAGE_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages',
  GALLERY_UPLOAD_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects/galleries/upload',
  // create-gallery is deployed as a separate service; use its HTTP API 'process' endpoint for function-style actions
  CREATE_GALLERY_FUNCTION_URL: 'https://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev/projects/galleries/process',
  DELETE_GALLERY_FUNCTION_URL: 'https://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev/projects/galleries/process',
  GALLERIES_API_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects/galleries',
    POST_PROJECTS_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects',
    POST_PROJECT_TO_USER_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/postProjectToUserId',
    SEND_PROJECT_NOTIFICATION_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com/messages/notifications',
    PROJECTS_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects',
    EVENTS_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects/events',
    NOTIFICATIONS_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/user/notifications',
    BUDGETS_API_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/budgets',
    PROJECT_INVITES_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/sendProjectInvitation',
    COLLAB_INVITES_BASE_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/invites',
    USER_INVITES_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com/invites/users',
    TASKS_API_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects/',
    
    // External services (unchanged)
    NOMINATIM_SEARCH_URL: 'https://nominatim.openstreetmap.org/search?format=json&q=',
    
    
    // Legacy endpoints that may need special handling or removal
    NEWSLETTER_SUBSCRIBE_URL: 'https://jmmn5p5yhe.execute-api.us-west-1.amazonaws.com/default/notifyNewSubscriber',
    ZIP_FILES_URL: 'https://o01t8q8mjk.execute-api.us-west-1.amazonaws.com/default/zipFiles',
  },
  staging: {},
  production: {},
};

const defaults = (BASE_ENDPOINTS as Record<string, Record<string, string>>)[ENV] || BASE_ENDPOINTS.development;

export const API_ENDPOINTS: ApiEndpoints = Object.keys(BASE_ENDPOINTS.development).reduce<ApiEndpoints>(
  (acc, key) => {
    const envKey = `VITE_${key}` as keyof ImportMetaEnv;
    acc[key] = (import.meta.env as Record<string, string | undefined>)[envKey] || (defaults as Record<string, string>)[key];
    return acc;
  },
  {}
);

export const {
  // v1.2 Service Base URLs
  AUTH_SERVICE_URL,
  PROJECTS_SERVICE_URL,
  USER_SERVICE_URL,
  MESSAGES_SERVICE_URL,
  // Core endpoints
  API_BASE_URL,
  USER_PROFILES_API_URL,
  USER_PROFILES_PENDING_API_URL,
  USER_PROFILES_PENDING_API_KEY,
  REGISTERED_USER_TEAM_NOTIFICATION_API_URL,
  WEBSOCKET_URL,
  NEWSLETTER_SUBSCRIBE_URL,
  MESSAGES_INBOX_URL,
  MESSAGES_THREADS_URL,
  ZIP_FILES_URL,
  DELETE_PROJECT_MESSAGE_URL,
  GET_PROJECT_MESSAGES_URL,
  EDIT_PROJECT_MESSAGE_URL,
  EDIT_MESSAGE_URL,
  GALLERY_UPLOAD_URL,
  CREATE_GALLERY_FUNCTION_URL,
  DELETE_GALLERY_FUNCTION_URL,
  GALLERIES_API_URL,
  POST_PROJECTS_URL,
  POST_PROJECT_TO_USER_URL,
  SEND_PROJECT_NOTIFICATION_URL,
  PROJECTS_URL,
  EDIT_PROJECT_URL,
  EVENTS_URL,
  NOTIFICATIONS_URL,
  NOMINATIM_SEARCH_URL,
  BUDGETS_API_URL,
  PROJECT_INVITES_URL,
  COLLAB_INVITES_BASE_URL,
  USER_INVITES_URL,
  TASKS_API_URL,
} = API_ENDPOINTS as Record<string, string>;

/**
 * POST /projects/{projectId}/files/delete
 * Removes one or more project files via the v1.2 projects service.
 */
export const projectFileDeleteUrl = (projectId: string): string =>
  `${PROJECTS_URL}/${projectId}/files/delete`;

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

/** Extracts array results from either `{ Items: T[] }`, `{ items: T[] }`, `{ notifications: T[] }`, `{ tasks: T[] }`, or `T[]`. */
function extractItems<T>(data: MaybeItems<T> | JsonRecord): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    if ('Items' in data && Array.isArray((data as Record<string, unknown>).Items)) {
      return (data as Record<string, unknown>).Items as T[];
    }
    if ('items' in data && Array.isArray((data as Record<string, unknown>).items)) {
      return (data as Record<string, unknown>).items as T[];
    }
    if ('notifications' in data && Array.isArray((data as Record<string, unknown>).notifications)) {
      return (data as Record<string, unknown>).notifications as T[];
    }
    if ('tasks' in data && Array.isArray((data as Record<string, unknown>).tasks)) {
      return (data as Record<string, unknown>).tasks as T[];
    }
  }
  return [];
}
/** Extracts single item from `{ Item: T }` or returns `null` if missing. */
function extractItem<T>(data: MaybeItem<T> | JsonRecord): T | null {
  if ('Item' in (data as Record<string, unknown>)) return ((data as Record<string, unknown>).Item ?? null) as T | null;
  return (data as T) ?? null;
}

const clone = <T,>(value: T): T => {
  const structured = (globalThis as { structuredClone?: <U>(val: U) => U }).structuredClone;
  if (typeof structured === 'function') {
    return structured(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const userProfilesCache = new Map<string, UserProfile>();

// ───────────────────────────────────────────────────────────────────────────────
// Core fetch with logging + retries + auth + CSRF + rate limiting
// ───────────────────────────────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    retryCount = 3,
    retryDelay = 500,
    skipRateLimit = false,
    onNetworkError,
    suppressErrorLog = false,
    ...fetchOptions
  } = options;

  // Rate limiting (per endpoint path)
  if (!skipRateLimit) {
    const rateLimitKey = `api_${new URL(url).pathname}`;
    if (!rateLimiter.isAllowed(rateLimitKey, 30, 60_000)) {
      const error = new Error('Rate limit exceeded. Please try again later.');
      logSecurityEvent('rate_limit_exceeded', { url, rateLimitKey });
      throw error;
    }
  }

  const token = await waitForAuthReady();

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (fetchOptions.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method.toUpperCase())) {
    Object.assign(headers, csrfProtection.addToHeaders());
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // console.log(`[apiFetch] (${fetchOptions.method || 'GET'}) → ${url} (attempt ${attempt + 1}/${retryCount + 1})`);

      const res = await fetch(url, { ...fetchOptions, headers });

      if (res.status === 503 && attempt < retryCount) {
        if (!suppressErrorLog) {
          console.warn('[apiFetch] 503 Service Unavailable — retrying after delay');
        }
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (!suppressErrorLog) {
          console.error(`[apiFetch] ❌ ${url} → ${res.status} ${res.statusText} — ${text}`);
        }

        if (res.status === 401 || res.status === 403) {
          logSecurityEvent('authentication_error', { url, status: res.status, statusText: res.statusText });
        } else if (res.status === 429) {
          logSecurityEvent('server_rate_limit', { url, status: res.status });
        }

        throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
      }

      // Try to parse JSON, but handle 204 or empty/non-JSON bodies gracefully
      const contentType = res.headers?.get?.('content-type') || '';
      if (res.status === 204) {
        // No content
        console.log('[apiFetch] No content (204):', { url });
        return ({} as unknown) as T;
      }
      // Some endpoints may return empty body with 200
      if (!contentType || !/application\/json/i.test(contentType)) {
        const text = await res.text().catch(() => '');
        if (!text) {
          console.log('[apiFetch] Empty response body, treating as {}:', { url });
          return ({} as unknown) as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          if (!suppressErrorLog) {
            console.warn('[apiFetch] Non-JSON response, returning {}:', { url, text });
          }
          return ({} as unknown) as T;
        }
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        if (!suppressErrorLog) {
          console.warn('[apiFetch] Failed to parse JSON, returning {}:', { url });
        }
        return ({} as unknown) as T;
      }
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes((fetchOptions.method || '').toUpperCase())) {
        logSecurityEvent('api_state_change', { url: new URL(url).pathname, method: fetchOptions.method });
      }

      // console.log('[apiFetch] ✅ Success:', { url, method: fetchOptions.method || 'GET' });
       return data as T;

    } catch (err) {
      lastError = err;
      if (attempt < retryCount) {
        if (!suppressErrorLog) {
          console.warn('[apiFetch] Error, will retry:', (err as Error)?.message);
        }
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }

  if (lastError instanceof TypeError && /Failed to fetch/i.test((lastError as Error).message)) {
    const networkErr = new Error('Network request failed. Please check your connection and try again.');
    if (onNetworkError) onNetworkError(networkErr);
    lastError = networkErr;
  }

  if (!suppressErrorLog) {
    console.error('[apiFetch] Final error:', lastError);
  }
  logSecurityEvent('api_request_failed', { url: new URL(url).pathname, error: (lastError as Error).message });
  throw lastError;
}

// ───────────────────────────────────────────────────────────────────────────────
// Users
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchAllUsers(): Promise<UserProfile[]> {
  try {
    const data = await apiFetch<MaybeItems<UserProfile>>(USER_PROFILES_API_URL);
    return extractItems<UserProfile>(data);
  } catch (error) {
    // If scanning is not allowed, return empty array to prevent CORS errors
    console.warn("fetchAllUsers failed (scanning may be disabled):", error);
    return [];
  }
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const endpoint = `${USER_PROFILES_API_URL}/${encodeURIComponent(userId)}`;
  const data = await apiFetch<MaybeItem<UserProfile>>(endpoint);
  return extractItem<UserProfile>(data);
}

// Batch with in-memory cache
export async function fetchUserProfilesBatch(userIds: string[] = []): Promise<UserProfile[]> {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];

  const resultsMap = new Map<string, UserProfile>();
  const idsToFetch: string[] = [];

  for (const id of userIds) {
    const cached = userProfilesCache.get(id);
    if (cached) {
      resultsMap.set(id, cached);
    } else {
      idsToFetch.push(id);
    }
  }

  if (idsToFetch.length > 0) {
    const ids = encodeURIComponent(idsToFetch.join(','));
    const endpoint = `${USER_PROFILES_API_URL}?ids=${ids}`;
    const data = await apiFetch<MaybeItems<UserProfile>>(endpoint);
    const fetched = extractItems<UserProfile>(data);
    for (const profile of fetched) {
      if (profile?.userId) {
        userProfilesCache.set(profile.userId, profile);
        resultsMap.set(profile.userId, profile);
      }
    }
  }

  return Array.from(resultsMap.values());
}

export function invalidateUserProfilesCache(userIds?: string | string[]): void {
  if (!userIds) {
    userProfilesCache.clear();
    return;
  }
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  ids.forEach((id) => userProfilesCache.delete(id));
}

export async function updateUserProfile(profile: UserProfile): Promise<UserProfile> {
  const data = await apiFetch<UserProfile>(USER_PROFILES_API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (profile.userId) userProfilesCache.set(profile.userId, data);
  return data;
}

export async function updateUserProfilePending(
  profile: Partial<UserProfile> & Record<string, unknown>
): Promise<UserProfile> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (USER_PROFILES_PENDING_API_KEY) headers['x-api-key'] = USER_PROFILES_PENDING_API_KEY;

  return apiFetch<UserProfile>(USER_PROFILES_PENDING_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(profile),
    // skipRateLimit? usually not necessary here
  });
}

export async function updateUserRole(userId: string, role: string): Promise<UserProfile> {
  const current = await fetchUserProfile(userId);
  if (!current) throw new Error(`User profile not found for ${userId}`);
  const nextRole = String(role).toLowerCase();
  return updateUserProfile({ ...current, role: nextRole });
}

// ───────────────────────────────────────────────────────────────────────────────
// Projects
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchProjectsFromApi(userId: string): Promise<Project[]> {
  if (!userId) {
    console.log('fetchProjectsFromApi: No userId provided');
    return [];
  }
  const url = `${PROJECTS_SERVICE_URL}/projects?userId=${encodeURIComponent(userId)}`;
  console.log('fetchProjectsFromApi: Calling', url);
  const data = await apiFetch<MaybeItems<Project>>(url);
  console.log('fetchProjectsFromApi: Raw response data:', data);
  const result = extractItems<Project>(data);
  console.log('fetchProjectsFromApi: Extracted items:', result);
  return result;
}

export async function fetchProjectById(projectId: string): Promise<Project | null> {
  if (!projectId) return null;
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}`;
  const raw = await apiFetch<Project>(url);
  return raw || null;
}

export async function updateProjectFields(projectId: string, fields: Partial<Project> & JsonRecord): Promise<Project> {
  if (!projectId) throw new Error('projectId is required for updateProjectFields');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}`;
  return apiFetch<Project>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Tasks
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchTasks(projectId?: string): Promise<Task[]> {
  if (!projectId) return [];
  const url = `${TASKS_API_URL}${encodeURIComponent(projectId)}/tasks`;
  const res = await apiFetch(url);

  if (Array.isArray(res)) return res;
  const obj = res as Record<string, unknown>;
  if (Array.isArray(obj?.Items)) return obj.Items as Task[];
  if (Array.isArray(obj?.tasks)) return obj.tasks as Task[];

  return [];
}

export async function createTask(task: Task): Promise<Task> {
  const { projectId, ...payload } = task;
  if (!projectId) throw new Error('projectId is required for createTask');
  if (payload.budgetItemId === '' || payload.budgetItemId == null) delete payload.budgetItemId;
  const url = `${TASKS_API_URL}${encodeURIComponent(projectId)}/tasks`;
  const res = await apiFetch<{ projectId?: string; task?: Task } | Task>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, projectId }),
  });
  if (res && typeof res === 'object' && 'task' in res && res.task) {
    return res.task as Task;
  }
  return res as Task;
}

export async function updateTask(task: Task): Promise<Task> {
  const { projectId, taskId, ...payload } = task;
  if (!projectId || !taskId) throw new Error('projectId and taskId are required for updateTask');
  if (payload.budgetItemId === '' || payload.budgetItemId == null) delete payload.budgetItemId;
  const url = `${TASKS_API_URL}${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
  return apiFetch<Task>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteTask({ projectId, taskId }: { projectId: string; taskId: string }): Promise<{ ok: true }> {
  if (!projectId || !taskId) throw new Error('projectId and taskId are required for deleteTask');
  const url = `${TASKS_API_URL}${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
  await apiFetch<JsonRecord>(url, { method: 'DELETE' });
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────────
// Events / Timeline
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchEvents(projectId: string): Promise<TimelineEvent[]> {
  if (!projectId) return [];
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/events`;
  const data = await apiFetch<MaybeItems<TimelineEvent> | { events?: TimelineEvent[] }>(url);

  const items = Array.isArray(data) ? data
    : ('Items' in (data as Record<string, unknown>) && Array.isArray((data as Record<string, unknown>).Items)) ? (data as Record<string, unknown>).Items
    : (data as Record<string, unknown>).events || [];

  return (items as TimelineEvent[]).map((ev) => {
    let date = ev.date;
    if (!date && ev.createdAt) {
      const match = String(ev.createdAt).match(/^\d{4}-\d{2}-\d{2}/);
      date = match ? match[0] : undefined;
    }
    return {
      ...ev,
      id: ev.id || ev.eventId || ev.timelineEventId,
      date,
      description: ev.description || ev.payload?.description || '',
    };
  });
}

export async function createEvent(projectId: string, event: TimelineEvent): Promise<TimelineEvent> {
  if (!projectId) throw new Error('projectId is required for createEvent');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/events`;
  return apiFetch<TimelineEvent>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}

export async function updateEvent(event: TimelineEvent & { projectId: string; eventId: string }): Promise<TimelineEvent> {
  const { projectId, eventId, ...rest } = event;
  if (!projectId || !eventId) throw new Error('projectId and eventId are required for updateEvent');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/events/${encodeURIComponent(eventId)}`;
  return apiFetch<TimelineEvent>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rest),
  });
}

export async function deleteEvent(projectId: string, eventId: string): Promise<{ ok: true }> {
  if (!projectId || !eventId) throw new Error('projectId and eventId are required for deleteEvent');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/events/${encodeURIComponent(eventId)}`;
  await apiFetch<JsonRecord>(url, { method: 'DELETE' });
  return { ok: true };
}

export async function updateTimelineEvents(projectId: string, events: TimelineEvent[]): Promise<{ ok: true } & JsonRecord> {
  if (!projectId) throw new Error('projectId is required for updateTimelineEvents');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/events`;
  return apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
}

// Optional bulk assignment
export async function assignEventIdsBatch(projectIds: string[] = []): Promise<{ ok?: boolean } & JsonRecord> {
  const url = `${PROJECTS_SERVICE_URL}/assignEventIdsBatch`;
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds }),
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Galleries
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchGalleries(projectId: string): Promise<Gallery[]> {
  if (!projectId) return [];
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/galleries`;
  const data = await apiFetch<MaybeItems<Gallery>>(url);
  return extractItems<Gallery>(data);
}

export async function createGallery(projectId: string, gallery: Partial<Gallery>): Promise<Gallery> {
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/galleries`;
  return apiFetch<Gallery>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gallery),
  });
}

export async function updateGallery(galleryId: string, fields: Partial<Gallery> & { projectId: string }): Promise<Gallery> {
  const { projectId, ...updateFields } = fields;
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/galleries/${encodeURIComponent(galleryId)}`;
  return apiFetch<Gallery>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateFields),
  });
}

export async function deleteGallery(galleryId: string, projectId: string): Promise<{ ok: true }> {
  if (!projectId) throw new Error('projectId is required for deleteGallery');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/galleries/${encodeURIComponent(galleryId)}`;
  await apiFetch<JsonRecord>(url, { method: 'DELETE' });
  return { ok: true };
}

export async function deleteGalleryFiles(projectId: string, galleryId?: string, gallerySlug?: string): Promise<{ ok?: boolean } & JsonRecord | void> {
  if (!projectId) return;
  const slug = gallerySlug || galleryId; // fallback to galleryId if slug not provided
  if (!slug) return;
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/galleries/${encodeURIComponent(slug)}/files/delete`;
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    retryCount: 0,
    suppressErrorLog: true,
    onNetworkError: (err: Error) => {
      try {
        console.error('[deleteGalleryFiles] Network error callback:', err);
      } catch (e) {
        console.debug('failed logging network error callback', e);
      }
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Notifications
// ───────────────────────────────────────────────────────────────────────────────

export async function getNotifications(userId: string): Promise<NotificationItem[]> {
  if (!userId) return [];
  const url = `${NOTIFICATIONS_URL}?userId=${encodeURIComponent(userId)}`;
  console.log('📡 Fetching URL:', url);
  const data = await apiFetch<MaybeItems<NotificationItem>>(url);
  return extractItems<NotificationItem>(data);
}

export async function markNotificationRead(userId: string, timestampUuid: string): Promise<{ ok: true }> {
  if (!userId || !timestampUuid) return { ok: true };
  const params = new URLSearchParams({ userId, 'timestamp#uuid': timestampUuid });
  const url = `${NOTIFICATIONS_URL}?${params.toString()}`;
  await apiFetch<JsonRecord>(url, { method: 'PATCH' });
  return { ok: true };
}

export async function deleteNotification(userId: string, timestampUuid: string): Promise<{ ok: true }> {
  if (!userId || !timestampUuid) return { ok: true };
  const params = new URLSearchParams({ userId, 'timestamp#uuid': timestampUuid });
  const url = `${NOTIFICATIONS_URL}?${params.toString()}`;
  await apiFetch<JsonRecord>(url, { method: 'DELETE' });
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────────
// Budgets
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchBudgetHeader(
  projectId: string,
  preferredRevision?: number | null,
): Promise<BudgetHeader | null> {
  if (!projectId) return null;
  if (isPreviewModeEnabled()) {
    const preview = getPreviewBudgetHeader(projectId);
    return preview ? (clone(preview) as BudgetHeader) : null;
  }
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/budget?headers=true`;
  const data = await apiFetch<MaybeItems<BudgetItem>>(url);
  const items = extractItems<BudgetItem>(data);

  const headers = items.filter(
    (item): item is BudgetHeader =>
      typeof item?.budgetItemId === 'string' && item.budgetItemId.startsWith('HEADER-')
  );

  if (headers.length === 0) return null;

  const clientHolder = headers.find((h) => h.clientRevisionId != null);
  const globalClientRevision =
    clientHolder && clientHolder.clientRevisionId != null
      ? Number(clientHolder.clientRevisionId)
      : null;

  const normalizedPreferred =
    preferredRevision != null && Number.isFinite(Number(preferredRevision))
      ? Number(preferredRevision)
      : null;

  if (normalizedPreferred != null) {
    const preferredMatch = headers.find(
      (h) => Number(h.revision ?? 0) === normalizedPreferred,
    );
    if (preferredMatch) {
      return {
        ...preferredMatch,
        ...(globalClientRevision != null ? { clientRevisionId: globalClientRevision } : {}),
      };
    }
  }

  if (clientHolder) {
    return {
      ...clientHolder,
      ...(globalClientRevision != null ? { clientRevisionId: globalClientRevision } : {}),
    };
  }

  headers.sort((a, b) => Number(b.revision ?? 0) - Number(a.revision ?? 0));
  const fallback = headers[0] ?? null;
  if (!fallback) return null;

  return {
    ...fallback,
    ...(globalClientRevision != null ? { clientRevisionId: globalClientRevision } : {}),
  };
}

export async function fetchBudgetHeaders(projectId: string): Promise<BudgetHeader[]> {
  if (!projectId) return [];
  if (isPreviewModeEnabled()) {
    return getPreviewBudgetHeaders(projectId).map((header) => clone(header) as BudgetHeader);
  }
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/budget?headers=true`;
  const data = await apiFetch<MaybeItems<BudgetItem>>(url);
  const items = extractItems<BudgetItem>(data);

  const headers = items.filter(
    (item): item is BudgetHeader =>
      typeof item?.budgetItemId === 'string' && item.budgetItemId.startsWith('HEADER-')
  );

  const holder = headers.find((h) => h.clientRevisionId != null);
  if (holder) {
    headers.forEach((h) => {
      h.clientRevisionId = holder.clientRevisionId;
    });
  }

  headers.sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));
  return headers;
}

export async function fetchBudgetItems(budgetId: string, revision?: number): Promise<BudgetLine[]> {
  if (!budgetId) return [];
  if (isPreviewModeEnabled()) {
    return getPreviewBudgetItems(budgetId, revision).map((item) => clone(item) as BudgetLine);
  }
  const url = `${PROJECTS_SERVICE_URL}/budgets/byBudgetId/${encodeURIComponent(budgetId)}`;
  const data = await apiFetch<MaybeItems<BudgetItem>>(url);
  const items = extractItems<BudgetItem>(data);

  const lines = items.filter(
    (item): item is BudgetLine =>
      typeof item?.budgetItemId === 'string' && item.budgetItemId.startsWith('LINE-')
  );

  return revision != null ? lines.filter((it) => (it.revision ?? 0) === revision) : lines;
}

export async function createBudgetItem(
  projectId: string,
  budgetId: string,
  payload: Partial<BudgetLine | BudgetHeader>
): Promise<BudgetItem> {
  if (!projectId) throw new Error('projectId is required for createBudgetItem');
  const body: Record<string, unknown> = { budgetId, ...payload };
  if (body.revision === undefined) body.revision = 1;

  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/budget`;
  return apiFetch<BudgetItem>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateBudgetItem(
  projectId: string,
  budgetItemId: string,
  fields: Partial<BudgetItem>
): Promise<BudgetItem> {
  if (!projectId || !budgetItemId) throw new Error('projectId and budgetItemId are required for updateBudgetItem');
  const body: Record<string, unknown> = { ...fields };
  if (body.revision === undefined) body.revision = 1;

  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/budget/items/${encodeURIComponent(budgetItemId)}`;
  return apiFetch<BudgetItem>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteBudgetItem(projectId: string, budgetItemId: string): Promise<{ ok: true }> {
  if (!projectId || !budgetItemId) throw new Error('projectId and budgetItemId are required for deleteBudgetItem');
  const url = `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/budget/items/${encodeURIComponent(budgetItemId)}`;
  await apiFetch<JsonRecord>(url, { method: 'DELETE' });
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────────
// Project Invites
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchPendingInvites(userId: string): Promise<Invite[]> {
  if (!userId) return [];
  const url = `${COLLAB_INVITES_BASE_URL}/incoming?userId=${encodeURIComponent(userId)}`;
  const data = await apiFetch<{ userId: string; invites: Invite[] }>(url);
  return data.invites || [];
}

export async function sendProjectInvite(projectId: string, recipientUsername: string): Promise<Invite> {
  return apiFetch<Invite>(PROJECT_INVITES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, recipientUsername }),
  });
}

export async function acceptProjectInvite(inviteId: string): Promise<{ ok: true }> {
  const params = new URLSearchParams({ inviteId, action: 'accept' });
  const url = `${PROJECT_INVITES_URL}?${params.toString()}`;
  await apiFetch<JsonRecord>(url, { method: 'PATCH' });
  return { ok: true };
}

export async function declineProjectInvite(inviteId: string): Promise<{ ok: true }> {
  const params = new URLSearchParams({ inviteId, action: 'decline' });
  const url = `${PROJECT_INVITES_URL}?${params.toString()}`;
  await apiFetch<JsonRecord>(url, { method: 'PATCH' });
  return { ok: true };
}

export async function cancelProjectInvite(inviteId: string): Promise<{ ok: true }> {
  const params = new URLSearchParams({ inviteId, action: 'cancel' });
  const url = `${PROJECT_INVITES_URL}?${params.toString()}`;
  await apiFetch<JsonRecord>(url, { method: 'PATCH' });
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────────
// Collaborator & User Invites
// ───────────────────────────────────────────────────────────────────────────────

export async function fetchOutgoingCollabInvites(userId: string): Promise<Invite[]> {
  if (!userId) return [];
  const url = `${COLLAB_INVITES_BASE_URL}/outgoing?userId=${encodeURIComponent(userId)}`;
  const data = await apiFetch<MaybeItems<Invite>>(url);
  return extractItems<Invite>(data);
}

export async function fetchIncomingCollabInvites(userId: string): Promise<Invite[]> {
  if (!userId) return [];
  const url = `${COLLAB_INVITES_BASE_URL}/incoming?userId=${encodeURIComponent(userId)}`;
  const data = await apiFetch<MaybeItems<Invite>>(url);
  return extractItems<Invite>(data);
}

export async function sendCollabInvite(toUserId: string, message = ''): Promise<Invite> {
  const url = `${COLLAB_INVITES_BASE_URL}/send`;
  return apiFetch<Invite>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId, message }),
  });
}

export async function sendUserInvite(email: string, role: string): Promise<{ ok?: boolean } & JsonRecord> {
  const url = `${USER_INVITES_URL}/send`;
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
}

export async function updateCollabInvite(inviteId: string, action: 'accept' | 'decline' | 'cancel'): Promise<Invite> {
  const url = `${COLLAB_INVITES_BASE_URL}/${action}/${inviteId}`;
  return apiFetch<Invite>(url, { method: 'POST' });
}

export const acceptCollabInvite = (inviteId: string) => updateCollabInvite(inviteId, 'accept');
export const declineCollabInvite = (inviteId: string) => updateCollabInvite(inviteId, 'decline');
export const cancelCollabInvite  = (inviteId: string) => updateCollabInvite(inviteId, 'cancel');









