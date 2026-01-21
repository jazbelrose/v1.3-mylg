import React from "react";
import { apiFetch, API_BASE_URL } from "@/shared/utils/api";
import { OrgContext, type OrgListItem, type OrgContextValue, type OrgBranding } from "@/app/contexts/orgContext";

const LAST_ORG_KEY = "mylg.lastOrgId";

function getOrgsServiceBaseUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_ORGS_SERVICE_URL;
  return raw?.trim() || API_BASE_URL;
}

export const OrgProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [orgs, setOrgs] = React.useState<OrgListItem[]>([]);
  const [activeOrgId, setActiveOrgIdState] = React.useState<string | null>(null);
  const [orgBrandingCache, setOrgBrandingCache] = React.useState<Record<string, OrgBranding | null>>({});

  const fetchOrgDetails = React.useCallback(async (orgId: string) => {
    const base = getOrgsServiceBaseUrl();
    const res = await apiFetch<{ org: { orgId: string; name: string; branding: OrgBranding | null } }>(
      `${base}/orgs/${encodeURIComponent(orgId)}`,
      { method: "GET", suppressErrorLog: true }
    );
    const org = res?.org;
    if (org?.branding) {
      setOrgBrandingCache((prev) => ({ ...prev, [orgId]: org.branding }));
    }
    return org;
  }, []);

  const updateOrgBranding = React.useCallback(async (orgId: string, branding: Partial<OrgBranding>) => {
    const base = getOrgsServiceBaseUrl();
    await apiFetch<{ ok: boolean }>(`${base}/orgs/${encodeURIComponent(orgId)}`, {
      method: "PATCH",
      body: JSON.stringify({ branding }),
    });
    // Update local cache
    setOrgBrandingCache((prev) => ({
      ...prev,
      [orgId]: { ...(prev[orgId] || {}), ...branding, updatedAt: new Date().toISOString() },
    }));
  }, []);

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

  const deleteOrg = React.useCallback(
    async (orgId: string) => {
      const trimmed = String(orgId || "").trim();
      if (!trimmed) throw new Error("Organization id required");

      const base = getOrgsServiceBaseUrl();
      await apiFetch<{ ok: boolean }>(`${base}/orgs/${encodeURIComponent(trimmed)}`, {
        method: "DELETE",
      });

      if (typeof window !== "undefined") {
        const last = window.localStorage.getItem(LAST_ORG_KEY);
        if (last === trimmed) window.localStorage.removeItem(LAST_ORG_KEY);
      }

      await refreshOrgs();
    },
    [refreshOrgs]
  );

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

  const activeOrgBranding = React.useMemo(() => {
    if (!activeOrgId) return null;
    return orgBrandingCache[activeOrgId] ?? null;
  }, [activeOrgId, orgBrandingCache]);

  // Fetch branding when active org changes
  React.useEffect(() => {
    if (!activeOrgId) return;
    if (orgBrandingCache[activeOrgId] !== undefined) return; // Already fetched
    fetchOrgDetails(activeOrgId).catch(() => {
      // Mark as fetched even on error to avoid infinite retries
      setOrgBrandingCache((prev) => ({ ...prev, [activeOrgId]: null }));
    });
  }, [activeOrgId, orgBrandingCache, fetchOrgDetails]);

  const value = React.useMemo<OrgContextValue>(
    () => ({
      isLoading,
      orgs,
      activeOrgId,
      activeOrgRole,
      activeOrgBranding,
      setActiveOrgId,
      refreshOrgs,
      createOrg,
      deleteOrg,
      updateOrgBranding,
      fetchOrgDetails,
    }),
    [activeOrgId, activeOrgRole, activeOrgBranding, createOrg, deleteOrg, fetchOrgDetails, isLoading, orgs, refreshOrgs, setActiveOrgId, updateOrgBranding]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};
