import type { Project, Thread, UserLite } from "@/app/contexts/DataProvider";
import type { ProjectMessagesMap } from "@/app/contexts/MessagesContextValue";

type PreviewNumber = number | string;

export interface PreviewBudgetHeader {
  budgetItemId: string;
  projectId: string;
  budgetId: string;
  revision: number;
  clientRevisionId?: number | null;
  createdAt?: string;
  projectTitle?: string;
  headerBallPark?: PreviewNumber;
  headerBudgetedTotalCost?: PreviewNumber;
  headerActualTotalCost?: PreviewNumber;
  headerFinalTotalCost?: PreviewNumber;
  headerEffectiveMarkup?: PreviewNumber;
  [key: string]: unknown;
}

export interface PreviewBudgetLine {
  budgetItemId: string;
  projectId: string;
  budgetId: string;
  revision: number;
  invoiceGroup?: string;
  elementId?: string;
  elementKey?: string;
  itemBudgetedCost?: PreviewNumber;
  itemActualCost?: PreviewNumber;
  itemFinalCost?: PreviewNumber;
  description?: string;
  [key: string]: unknown;
}

interface PreviewBudgetRevision {
  header: PreviewBudgetHeader;
  items: PreviewBudgetLine[];
}

interface PreviewBudgetProject {
  revisions: PreviewBudgetRevision[];
}

export interface PreviewBudgetData {
  projects: Record<string, PreviewBudgetProject>;
}

const PREVIEW_STORAGE_KEY = "dashboardPreviewMode";
const PREVIEW_EVENT = "dashboard-preview-mode-change";

export interface PreviewActivityItem {
  id: string;
  type: "project" | "message";
  projectId: string;
  projectTitle: string;
  text: string;
  timestamp: string;
}

export interface DevPreviewData {
  user: UserLite;
  allUsers: UserLite[];
  projects: Project[];
  inbox: Thread[];
  projectMessages: ProjectMessagesMap;
  recentActivity: PreviewActivityItem[];
  budget: PreviewBudgetData;
}

const PREVIEW_USER_ID = "preview-user";

const DEV_PREVIEW_DATA: DevPreviewData = {
  user: {
    userId: PREVIEW_USER_ID,
    firstName: "Preview",
    lastName: "User",
    email: "preview.user@example.com",
    role: "admin",
    occupation: "Design Lead",
    phoneNumber: "+1 (555) 010-0101",
    company: "MYLG Labs",
    organizationAddress: "145 Dock Street, Suite 400\nWestbridge, NY 11201",
    collaborators: ["avery-harper", "max-ramirez"],
    projects: ["preview-riverside", "preview-harbor"],
    thumbnailUrl: "https://avatars.githubusercontent.com/u/000?v=4",
    messages: [],
  },
  allUsers: [
    {
      userId: PREVIEW_USER_ID,
      firstName: "Preview",
      lastName: "User",
      email: "preview.user@example.com",
      role: "admin",
      occupation: "Design Lead",
      phoneNumber: "+1 (555) 010-0101",
    },
    {
      userId: "avery-harper",
      firstName: "Avery",
      lastName: "Harper",
      email: "avery@mylg.dev",
      role: "designer",
      occupation: "UX Designer",
      phoneNumber: "+1 (555) 010-0102",
    },
    {
      userId: "max-ramirez",
      firstName: "Max",
      lastName: "Ramirez",
      email: "max@mylg.dev",
      role: "builder",
      occupation: "Site Lead",
      phoneNumber: "+1 (555) 010-0103",
    },
    {
      userId: "devon-wells",
      firstName: "Devon",
      lastName: "Wells",
      email: "devon@mylg.dev",
      role: "vendor",
      occupation: "Lighting Vendor",
      phoneNumber: "+1 (555) 010-0104",
    },
  ],
  projects: [
    {
      projectId: "preview-riverside",
      title: "Riverside Park Redesign",
      status: "In Progress",
      description:
        "A public space refresh with new wayfinding, lighting, and modular seating zones.",
      color: "#0F62FE",
      invoiceBrandName: "MYLG Lighting Group",
      invoiceBrandAddress: "145 Dock Street, Suite 400\nWestbridge, NY 11201",
      invoiceBrandPhone: "+1 (555) 010-0190",
      clientName: "City of Westbridge",
      clientAddress: "123 Riverwalk Ave, Westbridge, NY 11201",
      clientPhone: "+1 (555) 020-0110",
      clientEmail: "parks@westbridge.gov",
      address: "Riverside Park Conservancy HQ\n12 Riverside Dr, Westbridge, NY 11209",
      previewUrl: "project-thumbnails/riverside/main.jpg",
      quickLinks: [
        { id: "brief", title: "Project Brief", url: "https://example.com/brief" },
        { id: "site-plan", title: "Site Plan", url: "https://example.com/site-plan" },
      ],
      timelineEvents: [
        {
          id: "event-kickoff",
          title: "Kickoff workshop",
          date: "2024-04-04",
          description: "Stakeholder alignment session with Parks & Rec.",
        },
        {
          id: "event-fabrication",
          title: "Fabrication lock",
          date: "2024-06-12",
          description: "Sign-off on lighting fixture order and bench fabrication.",
        },
        {
          id: "event-install",
          title: "Install week",
          date: "2024-07-22",
          description: "Nightly install for new lighting grid and furniture.",
        },
      ],
      team: [
        { userId: PREVIEW_USER_ID, role: "admin" },
        { userId: "avery-harper", role: "designer" },
        { userId: "max-ramirez", role: "builder" },
      ],
    },
    {
      projectId: "preview-harbor",
      title: "Harbor Pavilion Pop-up",
      status: "Planning",
      description:
        "Seasonal retail pavilion with interactive lighting and vendor stalls.",
      color: "#FF7A45",
      invoiceBrandName: "Harbor Events Collective",
      invoiceBrandAddress: "9 Wharfside Road\nHarborport, NY 11221",
      invoiceBrandPhone: "+1 (555) 010-0215",
      clientName: "Port Authority",
      clientAddress: "88 Bay Terminal, Harborport, NY 11221",
      clientPhone: "+1 (555) 020-0225",
      clientEmail: "events@harborport.io",
      address: "Pier 9 Event Lot\nHarborport, NY 11221",
      previewUrl: "project-thumbnails/harbor/main.jpg",
      quickLinks: [
        { id: "budget", title: "Budget Snapshot", url: "https://example.com/budget" },
        { id: "deck", title: "Concept Deck", url: "https://example.com/deck" },
      ],
      timelineEvents: [
        {
          id: "event-scoping",
          title: "Scoping walk",
          date: "2024-05-10",
          description: "Harbor site walk + vendor orientation.",
        },
        {
          id: "event-permits",
          title: "Permits submitted",
          date: "2024-05-24",
          description: "Permitting packet delivered to Port Authority.",
        },
      ],
      team: [
        { userId: PREVIEW_USER_ID, role: "admin" },
        { userId: "devon-wells", role: "vendor" },
      ],
    },
  ],
  inbox: [
    {
      conversationId: "thread-avery",
      otherUserId: "avery-harper",
      lastMsgTs: "2024-05-21T15:30:00.000Z",
      snippet: "Moodboard feedback looks great — I dropped comments.",
      read: false,
    },
    {
      conversationId: "thread-max",
      otherUserId: "max-ramirez",
      lastMsgTs: "2024-05-20T20:45:00.000Z",
      snippet: "Confirmed overnight install crew for July 22 start.",
      read: true,
    },
  ],
  projectMessages: {
    "preview-riverside": [
      {
        messageId: "riverside-1",
        body: "Uploaded revised site plan with adjusted lighting grid.",
        timestamp: "2024-05-21T14:10:00.000Z",
        reactions: { "👍": [PREVIEW_USER_ID, "avery-harper"] },
      },
      {
        messageId: "riverside-2",
        body: "Reminder: fabrication lock is June 12 — review fixtures.",
        timestamp: "2024-05-20T09:00:00.000Z",
      },
    ],
    "preview-harbor": [
      {
        messageId: "harbor-1",
        body: "Permitting packet submitted to Port Authority today.",
        timestamp: "2024-05-19T18:25:00.000Z",
      },
    ],
  },
  recentActivity: [
    {
      id: "activity-1",
      type: "project",
      projectId: "preview-riverside",
      projectTitle: "Riverside Park Redesign",
      text: "Avery Harper uploaded a new lighting concept.",
      timestamp: "2024-05-21T16:10:00.000Z",
    },
    {
      id: "activity-2",
      type: "message",
      projectId: "preview-harbor",
      projectTitle: "Harbor Pavilion Pop-up",
      text: "Max Ramirez added install notes in Messages.",
      timestamp: "2024-05-20T22:45:00.000Z",
    },
  ],
  budget: {
    projects: {
      "preview-riverside": {
        revisions: [
          {
            header: {
              budgetItemId: "HEADER-preview-riverside",
              budgetId: "budget-preview-riverside",
              projectId: "preview-riverside",
              projectTitle: "Riverside Park Redesign",
              revision: 3,
              clientRevisionId: 3,
              createdAt: "2024-05-18T17:45:00.000Z",
              headerBallPark: 4200,
              headerBudgetedTotalCost: 3960,
              headerActualTotalCost: 3120,
              headerFinalTotalCost: 3960,
              headerEffectiveMarkup: 0.18,
            },
            items: [
              {
                budgetItemId: "LINE-preview-riverside-lighting",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 3,
                invoiceGroup: "Lighting",
                elementId: "LG-101",
                elementKey: "lighting-grid",
                description: "Architectural lighting grid",
                itemBudgetedCost: 1520,
                itemActualCost: 1295,
                itemFinalCost: 1520,
              },
              {
                budgetItemId: "LINE-preview-riverside-furniture",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 3,
                invoiceGroup: "Furniture",
                elementId: "FN-207",
                elementKey: "modular-seating",
                description: "Modular seating clusters",
                itemBudgetedCost: 980,
                itemActualCost: 760,
                itemFinalCost: 980,
              },
              {
                budgetItemId: "LINE-preview-riverside-wayfinding",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 3,
                invoiceGroup: "Wayfinding",
                elementId: "WF-118",
                elementKey: "wayfinding-kit",
                description: "Directional signage kit",
                itemBudgetedCost: 820,
                itemActualCost: 640,
                itemFinalCost: 820,
              },
              {
                budgetItemId: "LINE-preview-riverside-electrical",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 3,
                invoiceGroup: "Electrical",
                elementId: "EL-302",
                elementKey: "power-upgrade",
                description: "Temporary power upgrades",
                itemBudgetedCost: 640,
                itemActualCost: 425,
                itemFinalCost: 640,
              },
            ],
          },
          {
            header: {
              budgetItemId: "HEADER-preview-riverside-r2",
              budgetId: "budget-preview-riverside",
              projectId: "preview-riverside",
              projectTitle: "Riverside Park Redesign",
              revision: 2,
              clientRevisionId: 3,
              createdAt: "2024-04-28T10:15:00.000Z",
              headerBallPark: 3900,
              headerBudgetedTotalCost: 3720,
              headerActualTotalCost: 2900,
              headerFinalTotalCost: 3720,
              headerEffectiveMarkup: 0.16,
            },
            items: [
              {
                budgetItemId: "LINE-preview-riverside-lighting-r2",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 2,
                invoiceGroup: "Lighting",
                elementId: "LG-101",
                elementKey: "lighting-grid",
                description: "Architectural lighting grid",
                itemBudgetedCost: 1400,
                itemActualCost: 1180,
                itemFinalCost: 1400,
              },
              {
                budgetItemId: "LINE-preview-riverside-furniture-r2",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 2,
                invoiceGroup: "Furniture",
                elementId: "FN-207",
                elementKey: "modular-seating",
                description: "Modular seating clusters",
                itemBudgetedCost: 920,
                itemActualCost: 740,
                itemFinalCost: 920,
              },
              {
                budgetItemId: "LINE-preview-riverside-wayfinding-r2",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 2,
                invoiceGroup: "Wayfinding",
                elementId: "WF-118",
                elementKey: "wayfinding-kit",
                description: "Directional signage kit",
                itemBudgetedCost: 780,
                itemActualCost: 610,
                itemFinalCost: 780,
              },
              {
                budgetItemId: "LINE-preview-riverside-electrical-r2",
                budgetId: "budget-preview-riverside",
                projectId: "preview-riverside",
                revision: 2,
                invoiceGroup: "Electrical",
                elementId: "EL-302",
                elementKey: "power-upgrade",
                description: "Temporary power upgrades",
                itemBudgetedCost: 620,
                itemActualCost: 470,
                itemFinalCost: 620,
              },
            ],
          },
        ],
      },
      "preview-harbor": {
        revisions: [
          {
            header: {
              budgetItemId: "HEADER-preview-harbor",
              budgetId: "budget-preview-harbor",
              projectId: "preview-harbor",
              projectTitle: "Harbor Pavilion Pop-up",
              revision: 1,
              clientRevisionId: 1,
              createdAt: "2024-05-12T13:20:00.000Z",
              headerBallPark: 52000,
              headerBudgetedTotalCost: 48750,
              headerActualTotalCost: 31200,
              headerFinalTotalCost: 50210,
              headerEffectiveMarkup: 0.22,
            },
            items: [
              {
                budgetItemId: "LINE-preview-harbor-structure",
                budgetId: "budget-preview-harbor",
                projectId: "preview-harbor",
                revision: 1,
                invoiceGroup: "Structure",
                elementId: "ST-410",
                elementKey: "pavilion-structure",
                description: "Modular pavilion structure",
                itemBudgetedCost: 17800,
                itemActualCost: 13200,
                itemFinalCost: 18450,
              },
              {
                budgetItemId: "LINE-preview-harbor-lighting",
                budgetId: "budget-preview-harbor",
                projectId: "preview-harbor",
                revision: 1,
                invoiceGroup: "Lighting",
                elementId: "LG-265",
                elementKey: "interactive-lighting",
                description: "Interactive lighting ribbon",
                itemBudgetedCost: 12400,
                itemActualCost: 8600,
                itemFinalCost: 12680,
              },
              {
                budgetItemId: "LINE-preview-harbor-vendors",
                budgetId: "budget-preview-harbor",
                projectId: "preview-harbor",
                revision: 1,
                invoiceGroup: "Vendor Ops",
                elementId: "VN-502",
                elementKey: "vendor-program",
                description: "Vendor onboarding & ops",
                itemBudgetedCost: 9600,
                itemActualCost: 5800,
                itemFinalCost: 10180,
              },
              {
                budgetItemId: "LINE-preview-harbor-graphics",
                budgetId: "budget-preview-harbor",
                projectId: "preview-harbor",
                revision: 1,
                invoiceGroup: "Branding",
                elementId: "BR-144",
                elementKey: "graphics",
                description: "Seasonal graphics + signage",
                itemBudgetedCost: 8960,
                itemActualCost: 6600,
                itemFinalCost: 8900,
              },
            ],
          },
        ],
      },
    },
  },
};

const clone = <T,>(value: T): T => {
  const structured = (globalThis as { structuredClone?: <U>(val: U) => U }).structuredClone;
  if (typeof structured === "function") {
    return structured(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

interface BudgetRevisionIndexEntry extends PreviewBudgetRevision {
  projectId: string;
}

const PREVIEW_BUDGET_INDEX = new Map<string, BudgetRevisionIndexEntry>();
const PREVIEW_HEADERS_BY_PROJECT = new Map<string, PreviewBudgetHeader[]>();

for (const [projectId, projectBudget] of Object.entries(DEV_PREVIEW_DATA.budget.projects)) {
  const sorted = [...projectBudget.revisions].sort(
    (a, b) => (b.header.revision ?? 0) - (a.header.revision ?? 0)
  );
  PREVIEW_HEADERS_BY_PROJECT.set(projectId, sorted.map((rev) => clone(rev.header)));
  for (const revision of sorted) {
    const key = `${revision.header.budgetId}|${revision.header.revision}`;
    PREVIEW_BUDGET_INDEX.set(key, { ...revision, projectId });
  }
}

export const getPreviewBudgetHeader = (projectId: string): PreviewBudgetHeader | null => {
  const headers = PREVIEW_HEADERS_BY_PROJECT.get(projectId);
  if (!headers || headers.length === 0) return null;
  return clone(headers[0]);
};

export const getPreviewBudgetHeaders = (projectId: string): PreviewBudgetHeader[] => {
  const headers = PREVIEW_HEADERS_BY_PROJECT.get(projectId);
  if (!headers) return [];
  return clone(headers);
};

export const getPreviewBudgetItems = (
  budgetId: string,
  revision?: number
): PreviewBudgetLine[] => {
  if (!budgetId) return [];
  if (revision != null) {
    const entry = PREVIEW_BUDGET_INDEX.get(`${budgetId}|${revision}`);
    return entry ? clone(entry.items) : [];
  }

  let latest: BudgetRevisionIndexEntry | null = null;
  for (const entry of PREVIEW_BUDGET_INDEX.values()) {
    if (entry.header.budgetId !== budgetId) continue;
    if (!latest || (entry.header.revision ?? 0) > (latest.header.revision ?? 0)) {
      latest = entry;
    }
  }

  return latest ? clone(latest.items) : [];
};

const noop = () => undefined;

export const isPreviewModeSupported = (): boolean => Boolean(import.meta.env.DEV);

export const isPreviewModeEnabled = (): boolean => {
  if (!isPreviewModeSupported() || typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) === "on" ||
      window.localStorage.getItem(PREVIEW_STORAGE_KEY) === "on"
    );
  } catch {
    return false;
  }
};

export const setPreviewModeEnabled = (enabled: boolean): void => {
  if (!isPreviewModeSupported() || typeof window === "undefined") return;
  try {
    if (enabled) {
      window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, "on");
    } else {
      window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
      window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors in dev */
  }
  try {
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT));
  } catch {
    noop();
  }
};

export const syncPreviewModeFromSearch = (search: string): boolean => {
  if (!isPreviewModeSupported() || typeof window === "undefined") return false;
  let handled = false;
  try {
    const params = new URLSearchParams(search);
    const value = params.get("preview");
    if (value !== null) {
      const enable = !["0", "false", "off"].includes(value.toLowerCase());
      setPreviewModeEnabled(enable);
      handled = true;
    }
  } catch {
    noop();
  }
  return handled;
};

export const subscribeToPreviewMode = (callback: () => void): (() => void) => {
  if (!isPreviewModeSupported() || typeof window === "undefined") {
    return () => undefined;
  }
  const handler = () => callback();
  window.addEventListener(PREVIEW_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(PREVIEW_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};

export const getDevPreviewData = (): DevPreviewData => DEV_PREVIEW_DATA;

