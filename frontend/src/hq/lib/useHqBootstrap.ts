import React from "react";
import { fetchHqSummary, fetchHqTransactions } from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState } from "@/hq/lib/hqStore";
import type { HqStoreStateV1 } from "@/hq/types";

const loadedForOrg = new Set<string>();

export function useHqBootstrap(orgId: string | null) {
  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    let inflight = false;

    const load = async () => {
      if (inflight) return;
      if (loadedForOrg.has(orgId)) return;
      inflight = true;
      loadedForOrg.add(orgId);

      try {
        const summary = await fetchHqSummary(orgId);
        const txnsRes = await fetchHqTransactions({ orgId, limit: 500 });

        if (cancelled) return;

        const prev = readHqState(orgId);
        const next: HqStoreStateV1 = {
          ...prev,
          orgId,
          accounts: Array.isArray(summary.accounts) ? summary.accounts : [],
          importRuns: Array.isArray(summary.importRuns) ? summary.importRuns : [],
          transactions: Array.isArray(txnsRes.transactions) ? txnsRes.transactions : [],
          categoryRules: Array.isArray(summary.categoryRules) ? summary.categoryRules : prev.categoryRules,
          cashOnHandAggregate:
            typeof (summary as { cashOnHandAggregate?: unknown }).cashOnHandAggregate === "number"
              ? ((summary as { cashOnHandAggregate: number }).cashOnHandAggregate as number)
              : null,
          missingAnchorAccountIds: Array.isArray((summary as { missingAnchorAccountIds?: unknown }).missingAnchorAccountIds)
            ? ((summary as { missingAnchorAccountIds: string[] }).missingAnchorAccountIds as string[])
            : [],
        };

        hydrateHqState(orgId, next);
      } catch (err) {
        // If service URLs are not configured yet, avoid hard-crashing HQ.
        // UI can still operate on local cache until backend endpoints are wired.
        console.warn("hq_bootstrap_failed", err);
        loadedForOrg.delete(orgId);
      } finally {
        inflight = false;
      }
    };

    const handleRefresh = () => {
      loadedForOrg.delete(orgId);
      void load();
    };

    // Listen for websocket hqUpdated events from other org members
    const handleWsMessage = (event: CustomEvent<{ action?: string; orgId?: string; updateType?: string }>) => {
      const data = event.detail;
      if (data?.action === "hqUpdated" && data?.orgId === orgId) {
        console.log("📊 [useHqBootstrap] Received hqUpdated from another org member, refreshing...", data.updateType);
        handleRefresh();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("mylg:hq-refresh", handleRefresh);
      window.addEventListener("ws-message", handleWsMessage as EventListener);
    }

    void load();

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("mylg:hq-refresh", handleRefresh);
        window.removeEventListener("ws-message", handleWsMessage as EventListener);
      }
    };
  }, [orgId]);
}

export function invalidateHqBootstrap(orgId: string) {
  loadedForOrg.delete(orgId);
}
