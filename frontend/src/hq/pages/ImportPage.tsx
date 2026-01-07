import React from "react";
import { Link } from "react-router-dom";
import HQLayout from "../components/HQLayout";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import CategorizationSpellbookSheet from "@/hq/components/CategorizationSpellbookSheet";
import AddAccountModal from "@/hq/components/AddAccountModal";
import { useHqStore } from "@/hq/lib/hqStore";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { deleteHqImportRun } from "@/hq/lib/hqApi";
import { invalidateHqBootstrap, useHqBootstrap } from "@/hq/lib/useHqBootstrap";
import { toast } from "react-toastify";
import styles from "./ImportPage.module.css";

const ImportPage: React.FC = () => {
  useUser();
  const { activeOrgId, activeOrgRole } = useOrg();
  const hasOrg = Boolean(activeOrgId);
  const orgId = activeOrgId ?? "__no_org__";
  const canAdmin = hasOrg && isOrgAdmin(activeOrgRole);
  useHqBootstrap(activeOrgId);

  const accounts = useHqStore(orgId, (s) => s.accounts);
  const importRuns = useHqStore(orgId, (s) => s.importRuns);

  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);
  const [spellbook, setSpellbook] = React.useState<{ isOpen: boolean; importRunId?: string }>({ isOpen: false });

  const openImport = React.useCallback(() => {
    if (!canAdmin) return;
    setSpellbook({ isOpen: false });
    setIsImportOpen(true);
  }, [canAdmin]);

  const openAddAccount = React.useCallback(() => {
    if (!canAdmin) return;
    setSpellbook({ isOpen: false });
    setIsAddAccountOpen(true);
  }, [canAdmin]);

  const openSpellbook = React.useCallback((input: { importRunId?: string }) => {
    setIsImportOpen(false);
    setIsAddAccountOpen(false);
    setSpellbook({ isOpen: true, importRunId: input.importRunId });
  }, []);

  const actions = (
    <div className={styles.actions}>
      {canAdmin ? (
        <>
          <button type="button" className={styles.secondaryButton} onClick={openImport}>
            Import CSV
          </button>
          <button type="button" className={styles.primaryButton} onClick={openAddAccount}>
            Add account
          </button>
        </>
      ) : null}
    </div>
  );

  const handleDeleteImportRun = React.useCallback(
    async (importRunId: string) => {
      if (!activeOrgId) return;
      try {
        await deleteHqImportRun(activeOrgId, importRunId);
        toast.success("Import run deleted.");
        invalidateHqBootstrap(activeOrgId);
        // Reload latest state
        window.dispatchEvent(new Event("mylg:hq-refresh"));
      } catch (err) {
        console.error(err);
        toast.error("Could not delete import run.");
      }
    },
    [activeOrgId]
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

        {importRuns.length ? (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent imports</div>
            <ol className={styles.list}>
              {importRuns.slice(0, 10).map((run) => (
                <li key={run.importRunId}>
                  {run.filename} · {new Date(run.createdAt).toLocaleString()} · {run.importedCount} imported
                  {canAdmin ? (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => handleDeleteImportRun(run.importRunId)}
                      style={{ marginLeft: 12 }}
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      {activeOrgId ? (
        <>
          <ImportCsvModal
            orgId={activeOrgId}
            isOpen={isImportOpen}
            onRequestClose={() => setIsImportOpen(false)}
            onOpenCategorization={({ importRunId }) => openSpellbook({ importRunId })}
          />
          <CategorizationSpellbookSheet
            orgId={activeOrgId}
            importRunId={spellbook.importRunId}
            isOpen={spellbook.isOpen}
            onRequestClose={() => setSpellbook({ isOpen: false })}
          />
          <AddAccountModal
            orgId={activeOrgId}
            isOpen={isAddAccountOpen}
            onRequestClose={() => setIsAddAccountOpen(false)}
          />
        </>
      ) : null}
    </HQLayout>
  );
};

export default ImportPage;

