import React, { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import {
  importHqBundle,
  type MemryBundle,
  type ImportBundleConflictResolution,
  type ImportBundleMode,
  type ImportBundleResponse,
} from "@/hq/lib/hqApi";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import styles from "./ImportBundleModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type ImportBundleModalProps = {
  orgId: string;
  isOpen: boolean;
  onRequestClose: () => void;
  onImported?: (result: ImportBundleResponse) => void;
};

type ImportStep = "upload" | "preview" | "options" | "conflicts" | "result";

async function readFileAsJson(file: File): Promise<MemryBundle> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || "{}"));
        resolve(json as MemryBundle);
      } catch (err) {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.readAsText(file);
  });
}

const ImportBundleModal: React.FC<ImportBundleModalProps> = ({
  orgId,
  isOpen,
  onRequestClose,
  onImported,
}) => {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<MemryBundle | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<ImportBundleResponse | null>(null);

  // Options
  const [mode, setMode] = useState<ImportBundleMode>("categorization");
  const [conflictResolution, setConflictResolution] = useState<ImportBundleConflictResolution>("merge");
  const [createMissingAccounts, setCreateMissingAccounts] = useState(true);
  const [createCategoryRules, setCreateCategoryRules] = useState(true);

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      setStep("upload");
      setFile(null);
      setBundle(null);
      setIsWorking(false);
      setResult(null);
      setMode("categorization");
      setConflictResolution("merge");
      setCreateMissingAccounts(true);
      setCreateCategoryRules(true);
    }
  }, [isOpen]);

  const handlePickFile = useCallback(async (nextFile: File | null) => {
    setFile(nextFile);
    setBundle(null);
    if (!nextFile) return;

    try {
      const parsed = await readFileAsJson(nextFile);
      if (parsed._format !== "memry-ledger-bundle") {
        toast.error("Invalid file format. Expected a .memry.json bundle.");
        return;
      }
      setBundle(parsed);
      setStep("preview");
    } catch (err) {
      console.error(err);
      toast.error("Could not read bundle file.");
    }
  }, []);

  const handleDryRun = useCallback(async () => {
    if (!bundle) return;
    setIsWorking(true);
    try {
      const res = await importHqBundle(orgId, bundle, {
        mode,
        conflictResolution,
        createMissingAccounts: mode === "full" ? createMissingAccounts : false,
        createCategoryRules: mode === "full" ? createCategoryRules : false,
        dryRun: true,
      });
      setResult(res);
      if (res.results.transactions.conflicts.length > 0) {
        setStep("conflicts");
      } else {
        setStep("options");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to analyze bundle.");
    } finally {
      setIsWorking(false);
    }
  }, [bundle, conflictResolution, createCategoryRules, createMissingAccounts, mode, orgId]);

  const handleImport = useCallback(async () => {
    if (!bundle) return;
    setIsWorking(true);
    try {
      const res = await importHqBundle(orgId, bundle, {
        mode,
        conflictResolution,
        createMissingAccounts: mode === "full" ? createMissingAccounts : false,
        createCategoryRules: mode === "full" ? createCategoryRules : false,
        dryRun: false,
      });
      setResult(res);
      setStep("result");
      toast.success(`Imported! Updated ${res.results.transactions.updated} transactions.`);
      onImported?.(res);
    } catch (err) {
      console.error(err);
      toast.error("Failed to import bundle.");
    } finally {
      setIsWorking(false);
    }
  }, [bundle, conflictResolution, createCategoryRules, createMissingAccounts, mode, onImported, orgId]);

  const bundleStats = useMemo(() => {
    if (!bundle) return null;
    const categorized = bundle.transactions.filter(
      (t) => t.categoryId && t.categoryId !== "OTHER"
    ).length;
    const recurring = bundle.transactions.filter((t) => t.isRecurring).length;
    return { ...bundle.stats, categorized, recurring };
  }, [bundle]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Import Memry Backup"
      className={styles.modal}
      overlayClassName={styles.overlay}
    >
      <header className={styles.header}>
        <h2>Import Memry Backup</h2>
        <button
          type="button"
          onClick={onRequestClose}
          className={styles.closeButton}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div className={styles.content}>
        {step === "upload" && (
          <div className={styles.uploadStep}>
            <p>
              Select a <code>.memry.json</code> backup file to restore your
              categorization work.
            </p>
            <label className={styles.fileLabel}>
              <input
                type="file"
                accept=".json,.memry.json"
                onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
                className={styles.fileInput}
              />
              <span className={styles.fileButton}>Choose File</span>
              {file && <span className={styles.fileName}>{file.name}</span>}
            </label>
          </div>
        )}

        {step === "preview" && bundle && bundleStats && (
          <div className={styles.previewStep}>
            <h3>Bundle Preview</h3>
            <dl className={styles.statsList}>
              <dt>Source Org</dt>
              <dd>{bundle.sourceOrgId.slice(0, 8)}…</dd>
              <dt>Exported</dt>
              <dd>{new Date(bundle.exportedAt).toLocaleDateString()}</dd>
              <dt>Transactions</dt>
              <dd>{bundleStats.transactionCount.toLocaleString()}</dd>
              <dt>Categorized</dt>
              <dd>{bundleStats.categorized.toLocaleString()}</dd>
              <dt>Recurring</dt>
              <dd>{bundleStats.recurring.toLocaleString()}</dd>
              <dt>Accounts</dt>
              <dd>{bundleStats.accountCount}</dd>
              <dt>Category Rules</dt>
              <dd>{bundleStats.categoryRuleCount}</dd>
            </dl>

            <h3>Import Mode</h3>
            <div className={styles.radioGroup}>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="categorization"
                  checked={mode === "categorization"}
                  onChange={() => setMode("categorization")}
                />
                <span>Categorization Only</span>
                <small>Apply categories to matching transactions (by dedupeHash)</small>
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="full"
                  checked={mode === "full"}
                  onChange={() => setMode("full")}
                />
                <span>Full Restore</span>
                <small>Create missing accounts, rules, then apply categories</small>
              </label>
            </div>

            {mode === "full" && (
              <div className={styles.checkboxGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={createMissingAccounts}
                    onChange={(e) => setCreateMissingAccounts(e.target.checked)}
                  />
                  <span>Create missing accounts</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={createCategoryRules}
                    onChange={(e) => setCreateCategoryRules(e.target.checked)}
                  />
                  <span>Import category rules</span>
                </label>
              </div>
            )}

            <h3>Conflict Handling</h3>
            <p className={styles.hint}>
              When a transaction already has a category different from the backup:
            </p>
            <div className={styles.radioGroup}>
              <label>
                <input
                  type="radio"
                  name="conflict"
                  value="merge"
                  checked={conflictResolution === "merge"}
                  onChange={() => setConflictResolution("merge")}
                />
                <span>Merge</span>
                <small>Only fill in empty fields, keep existing categories</small>
              </label>
              <label>
                <input
                  type="radio"
                  name="conflict"
                  value="overwrite"
                  checked={conflictResolution === "overwrite"}
                  onChange={() => setConflictResolution("overwrite")}
                />
                <span>Overwrite</span>
                <small>Replace existing categories with backup values</small>
              </label>
              <label>
                <input
                  type="radio"
                  name="conflict"
                  value="skip"
                  checked={conflictResolution === "skip"}
                  onChange={() => setConflictResolution("skip")}
                />
                <span>Skip</span>
                <small>Don't touch transactions that are already categorized</small>
              </label>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className={styles.secondaryButton}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleDryRun}
                disabled={isWorking}
                className={styles.primaryButton}
              >
                {isWorking ? "Analyzing…" : "Preview Changes"}
              </button>
            </div>
          </div>
        )}

        {step === "options" && result && (
          <div className={styles.optionsStep}>
            <h3>Ready to Import</h3>
            <dl className={styles.statsList}>
              <dt>Transactions matched</dt>
              <dd>{result.results.transactions.matched.toLocaleString()}</dd>
              <dt>Will be updated</dt>
              <dd>{result.results.transactions.updated.toLocaleString()}</dd>
              <dt>Will be skipped</dt>
              <dd>{result.results.transactions.skipped.toLocaleString()}</dd>
              <dt>Not found in current data</dt>
              <dd>{result.results.transactions.notFound.toLocaleString()}</dd>
              {mode === "full" && (
                <>
                  <dt>Accounts to create</dt>
                  <dd>{result.results.accounts.created}</dd>
                  <dt>Rules to create</dt>
                  <dd>{result.results.categoryRules.created}</dd>
                </>
              )}
            </dl>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => setStep("preview")}
                className={styles.secondaryButton}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isWorking}
                className={styles.primaryButton}
              >
                {isWorking ? "Importing…" : "Import Now"}
              </button>
            </div>
          </div>
        )}

        {step === "conflicts" && result && (
          <div className={styles.conflictsStep}>
            <h3>Category Conflicts Detected</h3>
            <p>
              {result.results.transactions.conflicts.length} transactions have
              different categories in the backup vs current data.
            </p>
            <div className={styles.conflictsList}>
              {result.results.transactions.conflicts.slice(0, 10).map((c) => (
                <div key={c.dedupeHash} className={styles.conflictItem}>
                  <span className={styles.conflictVendor}>
                    {c.vendor || c.dedupeHash.slice(0, 12)}
                  </span>
                  <span className={styles.conflictDate}>{c.postedAt}</span>
                  <span className={styles.conflictCats}>
                    <span className={styles.existingCat}>
                      {HQ_CATEGORY_LABEL[c.existingCategory] || c.existingCategory}
                    </span>
                    →
                    <span className={styles.bundleCat}>
                      {HQ_CATEGORY_LABEL[c.bundleCategory] || c.bundleCategory}
                    </span>
                  </span>
                </div>
              ))}
              {result.results.transactions.conflicts.length > 10 && (
                <p className={styles.moreConflicts}>
                  …and {result.results.transactions.conflicts.length - 10} more
                </p>
              )}
            </div>

            <p className={styles.hint}>
              Your conflict resolution is set to:{" "}
              <strong>{conflictResolution}</strong>
            </p>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => setStep("preview")}
                className={styles.secondaryButton}
              >
                Change Settings
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isWorking}
                className={styles.primaryButton}
              >
                {isWorking ? "Importing…" : "Proceed with Import"}
              </button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className={styles.resultStep}>
            <h3>Import Complete ✓</h3>
            <dl className={styles.statsList}>
              <dt>Transactions updated</dt>
              <dd>{result.results.transactions.updated.toLocaleString()}</dd>
              <dt>Skipped</dt>
              <dd>{result.results.transactions.skipped.toLocaleString()}</dd>
              {mode === "full" && (
                <>
                  <dt>Accounts created</dt>
                  <dd>{result.results.accounts.created}</dd>
                  <dt>Rules created</dt>
                  <dd>{result.results.categoryRules.created}</dd>
                </>
              )}
            </dl>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={onRequestClose}
                className={styles.primaryButton}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportBundleModal;
