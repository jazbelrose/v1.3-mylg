import React from "react";
import { Link } from "react-router-dom";
import HQLayout from "../components/HQLayout";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import AddAccountModal from "@/hq/components/AddAccountModal";
import { useHqStore } from "@/hq/lib/hqStore";
import { useUser } from "@/app/contexts/useUser";
import styles from "./ImportPage.module.css";

const ImportPage: React.FC = () => {
  const { userId } = useUser();
  const orgId = userId || "local";
  const accounts = useHqStore(orgId, (s) => s.accounts);

  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);

  const actions = (
    <div className={styles.actions}>
      <button type="button" className={styles.primaryButton} onClick={() => setIsImportOpen(true)}>
        Import CSV
      </button>
      <button type="button" className={styles.secondaryButton} onClick={() => setIsAddAccountOpen(true)}>
        Add account
      </button>
    </div>
  );

  return (
    <HQLayout
      title="Import"
      description="Upload a bank CSV to ingest transactions into your HQ ledger."
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Primary workflow</div>
          <ol className={styles.list}>
            <li>Upload CSV</li>
            <li>Select target account</li>
            <li>Preview + confirm</li>
            <li>Deduped ingest + categorization</li>
          </ol>
          <div className={styles.metaRow}>
            <span>{accounts.length} accounts</span>
            <span>·</span>
            <span>Wells Fargo CSV supported</span>
            <span>·</span>
            <Link to="/dashboard/hq/transactions" className={styles.link}>
              View transactions
            </Link>
          </div>
        </div>
      </div>

      <ImportCsvModal orgId={orgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
      <AddAccountModal
        orgId={orgId}
        isOpen={isAddAccountOpen}
        onRequestClose={() => setIsAddAccountOpen(false)}
      />
    </HQLayout>
  );
};

export default ImportPage;

