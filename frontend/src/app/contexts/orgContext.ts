import React from "react";

export type OrgRole = "owner" | "admin" | "member";

export type OrgListItem = {
  orgId: string;
  name: string | null;
  role: OrgRole | string;
  isAdmin: boolean;
};

export type OrgContextValue = {
  isLoading: boolean;
  orgs: OrgListItem[];
  activeOrgId: string | null;
  activeOrgRole: OrgRole | string | null;
  setActiveOrgId: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
};

export const OrgContext = React.createContext<OrgContextValue | null>(null);
