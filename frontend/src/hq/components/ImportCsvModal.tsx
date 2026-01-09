import React from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { parseWellsFargoNoHeaderTransactions } from "@/hq/lib/wellsFargoCsv";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { useHqStore, hydrateHqState, readHqState } from "@/hq/lib/hqStore";
import { fetchHqSummary, fetchHqTransactions, importHqCsv } from "@/hq/lib/hqApi";
import type { HqAccount, HqTransaction } from "@/hq/types";
import HqSelect from "@/hq/components/HqSelect";
import styles from "./ImportCsvModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type ImportCsvModalProps = {
  orgId: string;
  isOpen: boolean;
  onRequestClose: () => void;
  defaultAccountId?: string;
  onImported?: (result: { imported: number; duplicates: number }) => void;
  onOpenCategorization?: (input: { importRunId: string }) => void;
};

type ImportStep = 1 | 2 | 3 | 4;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function formatTxnLabel(txn: Pick<HqTransaction, "vendor" | "counterparty" | "rawDescription">) {
  return txn.vendor || txn.counterparty || txn.rawDescription.slice(0, 48);
}

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

const ImportCsvModal: React.FC<ImportCsvModalProps> = ({
  orgId,
  isOpen,
  onRequestClose,
  defaultAccountId,
  onImported,
  onOpenCategorization,
}) => {
  const accounts = useHqStore(orgId, (s) => s.accounts);
  const categoryRules = useHqStore(orgId, (s) => s.categoryRules);

  const [step, setStep] = React.useState<ImportStep>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [csvText, setCsvText] = React.useState<string>("");
  const [accountId, setAccountId] = React.useState<string>(defaultAccountId || "");
  const [parsed, setParsed] = React.useState<HqTransaction[] | null>(null);
  const [isWorking, setIsWorking] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) return;
    setStep(1);
    setFile(null);
    setCsvText("");
    setParsed(null);
    setIsWorking(false);
  }, [isOpen]);

  React.useEffect(() => {
    if (!defaultAccountId) return;
    setAccountId((prev) => prev || defaultAccountId);
  }, [defaultAccountId]);

  const selectedAccount: HqAccount | undefined = React.useMemo(
    () => accounts.find((a) => a.accountId === accountId),
    [accounts, accountId]
  );

  const canContinueFromStep1 = Boolean(file);
  const canContinueFromStep2 = Boolean(accountId);
  const canContinueFromStep3 = Boolean(parsed && parsed.length > 0);

  const handlePickFile = React.useCallback(async (next: File | null) => {
    setFile(next);
    setParsed(null);
    setCsvText("");
    if (!next) return;
    try {
      const text = await readFileText(next);
      setCsvText(text);
    } catch (err) {
      console.error(err);
      toast.error("Could not read CSV file.");
    }
  }, []);

  const handleParse = React.useCallback(async () => {
    if (!csvText) return;
    if (!accountId) return;

    setIsWorking(true);
    try {
      const txns = await parseWellsFargoNoHeaderTransactions({
        orgId,
        accountId,
        csvText,
        categoryRules,
      });

      if (!txns.length) {
        setParsed([]);
        toast.error("No transactions found in that CSV.");
        return;
      }

      setParsed(txns);
      setStep(3);
    } catch (err) {
      console.error(err);
      toast.error("Could not parse that CSV.");
    } finally {
      setIsWorking(false);
    }
  }, [accountId, categoryRules, csvText, orgId]);

  const handleImport = React.useCallback(async () => {
    if (!file) {
      toast.error("Pick a CSV file first.");
      return;
    }
    if (!accountId) {
      toast.error("Select an account.");
      return;
    }
    if (!parsed || parsed.length === 0) {
      toast.error("No transactions to import.");
      return;
    }
    if (isWorking) return;

    setIsWorking(true);
    try {
      const result = await importHqCsv(orgId, {
        accountId,
        filename: file.name,
        transactions: parsed,
      });

      // Refresh local cache from server so HQ pages stay consistent.
      const summary = await fetchHqSummary(orgId);
      const txns = await fetchHqTransactions({ orgId, limit: 500 });
      const prev = readHqState(orgId);
      hydrateHqState(orgId, {
        ...prev,
        accounts: summary.accounts,
        importRuns: summary.importRuns,
        transactions: txns.transactions,
        categoryRules: Array.isArray(summary.categoryRules) ? summary.categoryRules : prev.categoryRules,
        cashOnHandAggregate: typeof summary.cashOnHandAggregate === "number" ? summary.cashOnHandAggregate : null,
        missingAnchorAccountIds: Array.isArray(summary.missingAnchorAccountIds) ? summary.missingAnchorAccountIds : [],
      });

      toast.success(`${result.imported} transactions imported, ${result.duplicates} duplicates skipped.`);
      onImported?.({ imported: result.imported, duplicates: result.duplicates });

      const importRunId = result.importRun?.importRunId;
      onRequestClose();
      if (importRunId && onOpenCategorization) {
        // Let the modal close before opening the sheet (prevents stacked overlays).
        window.setTimeout(() => onOpenCategorization({ importRunId }), 220);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      if (/\b404\b/.test(message) && /Not found/i.test(message)) {
        toast.error("Account not found. Refreshing accounts—please pick again.");
        try {
          const summary = await fetchHqSummary(orgId);
          const prev = readHqState(orgId);
          hydrateHqState(orgId, {
            ...prev,
            accounts: summary.accounts,
            importRuns: summary.importRuns,
            categoryRules: Array.isArray(summary.categoryRules) ? summary.categoryRules : prev.categoryRules,
            cashOnHandAggregate: typeof summary.cashOnHandAggregate === "number" ? summary.cashOnHandAggregate : null,
            missingAnchorAccountIds: Array.isArray(summary.missingAnchorAccountIds) ? summary.missingAnchorAccountIds : [],
          });
          // Force re-select if the selected account no longer exists.
          if (!summary.accounts.some((a) => a.accountId === accountId)) {
            setAccountId("");
          }
          setStep(2);
        } catch {
          // Ignore refresh failures; keep the original error toast.
        }
      } else {
        toast.error("Import failed.");
      }
    } finally {
      setIsWorking(false);
    }
  }, [accountId, file, isWorking, onImported, onOpenCategorization, onRequestClose, orgId, parsed]);

  const previewRows = (parsed || []).slice(0, 20);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onRequestClose={onRequestClose}
      contentLabel="Import CSV"
      closeTimeoutMS={200}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Import CSV</div>
          <div className={styles.subtitle}>Upload a bank export, preview the ledger, then confirm.</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.stepper} aria-label="Import steps">
        {[
          { id: 1 as const, label: "Upload" },
          { id: 2 as const, label: "Account" },
          { id: 3 as const, label: "Preview" },
          { id: 4 as const, label: "Confirm" },
        ].map((s) => (
          <div
            key={s.id}
            className={[styles.step, step === s.id ? styles.stepActive : "", step > s.id ? styles.stepDone : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={styles.stepDot} aria-hidden />
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.body}>
        {step === 1 ? (
          <div className={styles.panel}>
            <label className={styles.fileDrop}>
              <input
                className={styles.hiddenInput}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
              />
              <div className={styles.fileDropTitle}>Drop a CSV here or click to upload</div>
              <div className={styles.fileDropHint}>Wells Fargo exports supported (no-header 5-column).</div>
              {file ? <div className={styles.fileName}>{file.name}</div> : null}
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className={styles.panel}>
            <div className={styles.fieldLabel}>Target account</div>
            <HqSelect
              className={styles.select}
              value={accountId || undefined}
              onValueChange={setAccountId}
              ariaLabel="Select account"
              placeholder="Select an account"
              options={accounts.map((a) => ({
                value: a.accountId,
                label: `${a.name ?? a.accountName} · ${a.institution}`,
              }))}
            />
            {accounts.length === 0 ? (
              <div className={styles.inlineNote}>
                No accounts yet. Add one in Accounts, then come back here.
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className={styles.panel}>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.previewTitle}>Preview</div>
                <div className={styles.inlineNote}>
                  Showing {Math.min(20, parsed?.length ?? 0)} of {parsed?.length ?? 0} rows for{" "}
                  <span className={styles.inlineStrong}>{selectedAccount?.name ?? selectedAccount?.accountName ?? "Account"}</span>.
                </div>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => setStep(1)}>
                Replace file
              </button>
            </div>
            <div className={styles.previewTableWrap} role="region" aria-label="CSV preview table">
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vendor</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th className={styles.amountCol}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((txn) => (
                    <tr key={txn.dedupeHash}>
                      <td>{txn.postedAt}</td>
                      <td>{formatTxnLabel(txn)}</td>
                      <td>{txn.type.replace(/_/g, " ")}</td>
                      <td>{txn.categoryId ? HQ_CATEGORY_LABEL[txn.categoryId] : "—"}</td>
                      <td className={[styles.amountCol, txn.direction === "out" ? styles.out : styles.in].join(" ")}>
                        {txn.direction === "out" ? "-" : "+"}
                        {currency.format(Math.abs(txn.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className={styles.panel}>
            <div className={styles.confirmCard}>
              <div className={styles.confirmTitle}>Ready to import</div>
              <div className={styles.confirmMeta}>
                <div>
                  <div className={styles.metaLabel}>File</div>
                  <div className={styles.metaValue}>{file?.name || "—"}</div>
                </div>
                <div>
                  <div className={styles.metaLabel}>Account</div>
                  <div className={styles.metaValue}>{selectedAccount?.name ?? selectedAccount?.accountName ?? "—"}</div>
                </div>
                <div>
                  <div className={styles.metaLabel}>Rows</div>
                  <div className={styles.metaValue}>{parsed?.length ?? 0}</div>
                </div>
              </div>
              <div className={styles.inlineNote}>
                Re-importing the same file is safe—duplicates are skipped deterministically.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryButton} onClick={onRequestClose}>
          Cancel
        </button>

        {step === 1 ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canContinueFromStep1}
            onClick={() => setStep(2)}
          >
            Continue
          </button>
        ) : null}

        {step === 2 ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canContinueFromStep2 || !csvText || isWorking}
            onClick={handleParse}
          >
            {isWorking ? "Detecting…" : "Detect & preview"}
          </button>
        ) : null}

        {step === 3 ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canContinueFromStep3}
            onClick={() => setStep(4)}
          >
            Continue
          </button>
        ) : null}

        {step === 4 ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!parsed || !accountId || !file || isWorking}
            onClick={handleImport}
          >
            {isWorking ? "Importing…" : "Confirm import"}
          </button>
        ) : null}
      </div>
      </Modal>
    </>
  );
};

export default ImportCsvModal;

