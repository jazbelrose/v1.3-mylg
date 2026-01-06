import React from "react";
import { OrgContext, type OrgContextValue } from "@/app/contexts/orgContext";

const fallbackOrgContext: OrgContextValue = {
  isLoading: true,
  orgs: [],
  activeOrgId: null,
  activeOrgRole: null,
  setActiveOrgId: () => {
    // no-op when provider is missing
  },
  refreshOrgs: async () => {
    // no-op when provider is missing
  },
  createOrg: async () => {
    throw new Error("OrgProvider is not mounted");
  },
  deleteOrg: async () => {
    throw new Error("OrgProvider is not mounted");
  },
};

export function useOrg() {
  const ctx = React.useContext(OrgContext);
  return ctx ?? fallbackOrgContext;
}

export function isOrgAdmin(role: string | null | undefined): boolean {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}
