import React from "react";
import HQLayout from "../components/HQLayout";
import AddAccountModal from "@/hq/components/AddAccountModal";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import SetAnchorModal from "@/hq/components/SetAnchorModal";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { computeCashOnHand } from "@/hq/lib/hqMetrics";
import { useHqStore } from "@/hq/lib/hqStore";
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
  const orgId = activeOrgId || "local";
  const canAdmin = isOrgAdmin(activeOrgRole);

  useHqBootstrap(activeOrgId);

  const accounts = useHqStore(orgId, (s) => s.accounts);
  const transactions = useHqStore(orgId, (s) => s.transactions);

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [anchorAccount, setAnchorAccount] = React.useState<HqAccount | null>(null);

  const cashOnHand = React.useMemo(() => computeCashOnHand(accounts, transactions), [accounts, transactions]);

  const actions = (
    <div className={styles.actions}>
      {canAdmin ? (
        <>
          <button type="button" className={styles.primaryButton} onClick={() => setIsImportOpen(true)}>
            Import CSV
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setIsAddOpen(true)}>
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
              {accounts.some((a) => a.anchorDate && typeof a.anchorBalance === "number")
                ? "Anchored balances + net flow since anchor"
                : "Set anchors to enable"}
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
            <div className={styles.actionsInline}>
              <button type="button" className={styles.primaryButton} onClick={() => setIsAddOpen(true)}>
                Add account
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsImportOpen(true)}>
                Import CSV
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.accountsGrid}>
            {accounts.map((account) => {
              const isAnchored = account.anchorDate && typeof account.anchorBalance === "number";
              return (
                <article key={account.accountId} className={styles.accountCard}>
                  <header className={styles.accountHeader}>
                    <div>
                      <div className={styles.accountName}>{account.accountName}</div>
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
                  </div>

                  <div className={styles.cardActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setAnchorAccount(account)}>
                      {isAnchored ? "Update anchor" : "Set anchor"}
                    </button>
                    <button type="button" className={styles.primaryButton} onClick={() => setIsImportOpen(true)}>
                      Import
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <AddAccountModal orgId={orgId} isOpen={isAddOpen} onRequestClose={() => setIsAddOpen(false)} />
      <ImportCsvModal orgId={orgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
      {anchorAccount ? (
        <SetAnchorModal
          orgId={orgId}
          isOpen={Boolean(anchorAccount)}
          onRequestClose={() => setAnchorAccount(null)}
          account={anchorAccount}
        />
      ) : null}
    </HQLayout>
  );
};

export default AccountsPage;
