import React from "react";
import HQLayout from "../components/HQLayout";
import AddAccountModal from "@/hq/components/AddAccountModal";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import SetAnchorModal from "@/hq/components/SetAnchorModal";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { toast } from "react-toastify";
import { deleteHqAccount, patchHqAccount } from "@/hq/lib/hqApi";
import { computeCashOnHand } from "@/hq/lib/hqMetrics";
import { updateAccount as updateAccountLocal, useHqStore } from "@/hq/lib/hqStore";
import { useHqBootstrap } from "@/hq/lib/useHqBootstrap";
import type { HqAccount } from "@/hq/types";
import styles from "./AccountsPage.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const AccountsPage: React.FC = () => {
  useUser();
  const { activeOrgId, activeOrgRole } = useOrg();
  const hasOrg = Boolean(activeOrgId);
  const orgId = activeOrgId ?? "__no_org__";
  const canAdmin = hasOrg && isOrgAdmin(activeOrgRole);

  useHqBootstrap(activeOrgId);

  const accounts = useHqStore(orgId, (s) => s.accounts);
  const transactions = useHqStore(orgId, (s) => s.transactions);
  const cashOnHandAggregate = useHqStore(orgId, (s) => s.cashOnHandAggregate ?? null);
  const missingAnchorAccountIds = useHqStore(orgId, (s) => s.missingAnchorAccountIds ?? []);

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [anchorAccount, setAnchorAccount] = React.useState<HqAccount | null>(null);

  const cashOnHand = React.useMemo(() => {
    if (typeof cashOnHandAggregate === "number") return cashOnHandAggregate;
    return computeCashOnHand(accounts, transactions);
  }, [accounts, cashOnHandAggregate, transactions]);

  const includedAccounts = React.useMemo(
    () => accounts.filter((a) => !a.archivedAt && a.includeInCashOnHand !== false),
    [accounts]
  );

  const derivedMissingAnchors = React.useMemo(() => {
    if (missingAnchorAccountIds.length) return missingAnchorAccountIds;
    return includedAccounts
      .filter((a) => !(a.anchorDate && typeof a.anchorBalance === "number"))
      .map((a) => a.accountId);
  }, [includedAccounts, missingAnchorAccountIds]);

  const openAdd = React.useCallback(() => {
    if (!canAdmin) return;
    setIsAddOpen(true);
  }, [canAdmin]);

  const openImport = React.useCallback(() => {
    if (!canAdmin) return;
    setIsImportOpen(true);
  }, [canAdmin]);

  const handleToggleInclude = React.useCallback(
    async (account: HqAccount, next: boolean) => {
      if (!activeOrgId || !canAdmin) return;

      updateAccountLocal(orgId, account.accountId, { includeInCashOnHand: next, updatedAt: new Date().toISOString() });

      try {
        await patchHqAccount(activeOrgId, account.accountId, { includeInCashOnHand: next });
        window.dispatchEvent(new Event("mylg:hq-refresh"));
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Could not update account.");
        window.dispatchEvent(new Event("mylg:hq-refresh"));
      }
    },
    [activeOrgId, canAdmin, orgId]
  );

  const handleDeleteAccount = React.useCallback(
    async (account: HqAccount) => {
      if (!activeOrgId || !canAdmin) return;
      const confirmText = window.prompt(
        `Type DELETE to permanently delete account "${account.name ?? account.accountName}" and all its HQ data.`
      );
      if (confirmText !== "DELETE") return;

      try {
        await deleteHqAccount(activeOrgId, account.accountId);
        toast.success("Account deleted.");
        window.dispatchEvent(new Event("mylg:hq-refresh"));
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Could not delete account.");
      }
    },
    [activeOrgId, canAdmin]
  );

  const actions = (
    <div className={styles.actions}>
      {canAdmin ? (
        <>
          <button type="button" className={styles.primaryButton} onClick={openImport}>
            Import CSV
          </button>
          <button type="button" className={styles.secondaryButton} onClick={openAdd}>
            Add account
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <HQLayout
      title="Accounts"
      description="Accounts live here. Set a balance anchor per account to unlock Cash on Hand + runway."
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Cash on hand</div>
            <div className={styles.summaryValue}>
              {cashOnHand === null ? "—" : currency.format(cashOnHand)}
            </div>
            <div className={styles.summaryHint}>
              {includedAccounts.length === 0
                ? "No accounts included"
                : derivedMissingAnchors.length > 0
                  ? `${derivedMissingAnchors.length} included account(s) missing anchors`
                  : "Anchored balances + net flow since anchor"}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Accounts</div>
            <div className={styles.summaryValue}>{accounts.length}</div>
            <div className={styles.summaryHint}>Checking, savings, cards (CSV-driven)</div>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <div className={styles.emptyTitle}>Add an account to get started</div>
            <p className={styles.emptyDescription}>
              Create a company account (e.g. “WF Checking”), then import your bank CSV to populate the ledger.
            </p>
            {canAdmin ? (
              <div className={styles.actionsInline}>
                <button type="button" className={styles.primaryButton} onClick={openAdd}>
                  Add account
                </button>
                <button type="button" className={styles.secondaryButton} onClick={openImport}>
                  Import CSV
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.accountsGrid}>
            {accounts.map((account) => {
              const isAnchored = account.anchorDate && typeof account.anchorBalance === "number";
              const isIncluded = !account.archivedAt && account.includeInCashOnHand !== false;
              return (
                <article key={account.accountId} className={styles.accountCard}>
                  <header className={styles.accountHeader}>
                    <div>
                      <div className={styles.accountName}>{account.name ?? account.accountName}</div>
                      <div className={styles.accountInstitution}>{account.institution}</div>
                    </div>
                    <span className={[styles.statusBadge, isAnchored ? styles.statusGood : styles.statusWarn].join(" ")}>
                      {isAnchored ? "Anchored" : "No anchor"}
                    </span>
                  </header>

                  <div className={styles.balanceRow}>
                    <div className={styles.balanceLabel}>Anchor</div>
                    <div className={styles.balanceValue}>
                      {isAnchored ? currency.format(account.anchorBalance as number) : "—"}
                    </div>
                  </div>

                  <div className={styles.metaRow}>
                    <span>{account.currency}</span>
                    {account.accountMask ? <span>•••• {account.accountMask}</span> : null}
                    {account.anchorDate ? <span>as-of {account.anchorDate}</span> : null}
                    <label className={styles.includeToggle}>
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        disabled={!canAdmin}
                        onChange={(e) => handleToggleInclude(account, e.target.checked)}
                      />
                      Include in Cash on Hand
                    </label>
                  </div>

                  <div className={styles.cardActions}>
                    {canAdmin ? (
                      <>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setAnchorAccount(account)}
                        >
                          {isAnchored ? "Update anchor" : "Set anchor"}
                        </button>
                        <button type="button" className={styles.primaryButton} onClick={openImport}>
                          Import
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => void handleDeleteAccount(account)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {activeOrgId ? (
        <>
          <AddAccountModal orgId={activeOrgId} isOpen={isAddOpen} onRequestClose={() => setIsAddOpen(false)} />
          <ImportCsvModal orgId={activeOrgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
        </>
      ) : null}
      {activeOrgId && anchorAccount ? (
        <SetAnchorModal
          orgId={activeOrgId}
          isOpen={Boolean(anchorAccount)}
          onRequestClose={() => setAnchorAccount(null)}
          account={anchorAccount}
        />
      ) : null}
    </HQLayout>
  );
};

export default AccountsPage;
