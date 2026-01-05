import React from "react";
import { OrgContext } from "@/app/contexts/orgContext";

export function useOrg() {
  const ctx = React.useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within <OrgProvider>");
  return ctx;
}

export function isOrgAdmin(role: string | null | undefined): boolean {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}
