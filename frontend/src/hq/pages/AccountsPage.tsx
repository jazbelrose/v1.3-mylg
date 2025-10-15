import React from "react";
import HQLayout from "../components/HQLayout";
import HQPlaidConnectButton from "../components/HQPlaidConnectButton";
import type { HQAccount } from "../types";
import styles from "./AccountsPage.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const MOCK_ACCOUNTS: HQAccount[] = [
  {
    id: "acct-operating",
    institution: "First Republic",
    name: "Operating Checking",
    mask: "4321",
    type: "depository",
    subtype: "checking",
    currency: "USD",
    current: 86520.32,
    available: 84520.32,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: "acct-savings",
    institution: "First Republic",
    name: "Reserve Savings",
    mask: "2190",
    type: "depository",
    subtype: "savings",
    currency: "USD",
    current: 98500,
    available: 98500,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: "acct-card",
    institution: "Amex",
    name: "Corporate Platinum",
    mask: "0011",
    type: "credit",
    subtype: "credit card",
    currency: "USD",
    current: -5240.87,
    available: undefined,
    lastSyncAt: new Date().toISOString(),
  },
];

const AccountsPage: React.FC = () => {
  const hasAccounts = MOCK_ACCOUNTS.length > 0;

  return (
    <HQLayout
      title="Accounts"
      description="Link banking, credit, and investment accounts to bring balances and transactions into HQ."
      actions={<HQPlaidConnectButton />}
    >
      <div className={styles.page}>
        {hasAccounts ? (
          <div className={styles.accountsGrid}>
            {MOCK_ACCOUNTS.map((account) => (
              <article key={account.id} className={styles.accountCard}>
                <header className={styles.accountHeader}>
                  <div>
                    <div className={styles.accountName}>{account.name}</div>
                    <div className={styles.accountInstitution}>{account.institution}</div>
                  </div>
                  <span className={styles.statusBadge}>Synced</span>
                </header>
                <div className={styles.balance}>{currency.format(account.current)}</div>
                <div className={styles.metaRow}>
                  <span>{account.type}</span>
                  {account.mask ? <span>•••{account.mask}</span> : null}
                  <span>
                    Updated {new Date(account.lastSyncAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <div className={styles.emptyStateTitle}>Link an account to see balances</div>
            <p className={styles.emptyStateDescription}>
              Connect a checking, savings, or credit account with Plaid to get cash positions, runway, and transaction history
              in minutes.
            </p>
            <HQPlaidConnectButton />
          </div>
        )}
      </div>
    </HQLayout>
  );
};

export default AccountsPage;
