import React from "react";
import { apiFetch, API_BASE_URL } from "@/shared/utils/api";
import { OrgContext, type OrgListItem, type OrgContextValue } from "@/app/contexts/orgContext";

const LAST_ORG_KEY = "mylg.lastOrgId";

function getOrgsServiceBaseUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_ORGS_SERVICE_URL;
  return raw?.trim() || API_BASE_URL;
}

export const OrgProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [orgs, setOrgs] = React.useState<OrgListItem[]>([]);
  const [activeOrgId, setActiveOrgIdState] = React.useState<string | null>(null);

  const createOrg = React.useCallback(async (name: string) => {
    const trimmed = String(name || "").trim();
    if (trimmed.length < 2) throw new Error("Organization name required");

    const base = getOrgsServiceBaseUrl();
    const created = await apiFetch<{ org: { orgId: string; name: string; role: string } }>(`${base}/orgs`, {
      method: "POST",
      body: JSON.stringify({ name: trimmed }),
    });

    const orgId = created?.org?.orgId;
    if (!orgId) throw new Error("Failed to create organization");

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_ORG_KEY, orgId);
    }

    // Refresh list & select newly created org
    const res = await apiFetch<{ orgs: OrgListItem[] }>(`${base}/orgs`, { method: "GET", suppressErrorLog: true });
    const nextOrgs = Array.isArray(res?.orgs) ? res.orgs : [];
    setOrgs(nextOrgs);
    setActiveOrgIdState(orgId);
    return orgId;
  }, []);

  const refreshOrgs = React.useCallback(async () => {
    const base = getOrgsServiceBaseUrl();
    const res = await apiFetch<{ orgs: OrgListItem[] }>(`${base}/orgs`, {
      method: "GET",
      suppressErrorLog: true,
    });
    const nextOrgs = Array.isArray(res?.orgs) ? res.orgs : [];
    setOrgs(nextOrgs);

    const last = typeof window !== "undefined" ? window.localStorage.getItem(LAST_ORG_KEY) : null;
    const lastValid = last && nextOrgs.some((o) => o.orgId === last) ? last : null;

    setActiveOrgIdState((prev) => {
      if (prev && nextOrgs.some((o) => o.orgId === prev)) return prev;
      if (lastValid) return lastValid;
      return nextOrgs[0]?.orgId ?? null;
    });
  }, []);

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    refreshOrgs()
      .catch(() => {
        if (!mounted) return;
        setOrgs([]);
        setActiveOrgIdState(null);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [refreshOrgs]);

  const setActiveOrgId = React.useCallback((orgId: string) => {
    setActiveOrgIdState(orgId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_ORG_KEY, orgId);
    }
  }, []);

  const activeOrgRole = React.useMemo(() => {
    const match = orgs.find((o) => o.orgId === activeOrgId);
    return match?.role ?? null;
  }, [activeOrgId, orgs]);

  const value = React.useMemo<OrgContextValue>(
    () => ({
      isLoading,
      orgs,
      activeOrgId,
      activeOrgRole,
      setActiveOrgId,
      refreshOrgs,
      createOrg,
    }),
    [activeOrgId, activeOrgRole, createOrg, isLoading, orgs, refreshOrgs, setActiveOrgId]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};
