import React from "react";

export type OrgRole = "owner" | "admin" | "member";

export type OrgBranding = {
  logoFileId?: string | null;
  logoUrl?: string | null;
  brandName?: string;
  brandTagline?: string;
  updatedAt?: string;
};

export type OrgListItem = {
  orgId: string;
  name: string | null;
  role: OrgRole | string;
  isAdmin: boolean;
  branding?: OrgBranding | null;
};

export type OrgContextValue = {
  isLoading: boolean;
  orgs: OrgListItem[];
  activeOrgId: string | null;
  activeOrgRole: OrgRole | string | null;
  activeOrgBranding: OrgBranding | null;
  setActiveOrgId: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<string>;
  deleteOrg: (orgId: string) => Promise<void>;
  updateOrgBranding: (orgId: string, branding: Partial<OrgBranding>) => Promise<void>;
  fetchOrgDetails: (orgId: string) => Promise<{ orgId: string; name: string; branding: OrgBranding | null }>;
};

export const OrgContext = React.createContext<OrgContextValue | null>(null);
