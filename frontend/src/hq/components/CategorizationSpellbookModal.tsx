import React from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { HQ_CATEGORIES, HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { applyHqCategoryRules, createHqCategoryRule, fetchHqUncategorizedVendors } from "@/hq/lib/hqApi";
import styles from "./CategorizationSpellbookModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type VendorGroup = {
  vendor: string;
  vendorKey: string;
  count: number;
  example: {
    postedAt: string;
    amount: number;
    rawDescription: string;
    normalizedDescription: string;
    vendor?: string;
    type: string;
  } | null;
  suggestedCategoryId: string | null;
};

type Props = {
  orgId: string;
  importRunId?: string;
  isOpen: boolean;
  onRequestClose: () => void;
};

const CategorizationSpellbookModal: React.FC<Props> = ({ orgId, importRunId, isOpen, onRequestClose }) => {
  const [vendors, setVendors] = React.useState<VendorGroup[]>([]);
  const [isWorking, setIsWorking] = React.useState(false);
  const [selection, setSelection] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsWorking(true);
    void (async () => {
      try {
        const res = await fetchHqUncategorizedVendors(orgId, { importRunId });
        if (cancelled) return;
        setVendors(Array.isArray(res.vendors) ? (res.vendors as VendorGroup[]) : []);
        const next: Record<string, string> = {};
        for (const v of res.vendors || []) {
          if (v.vendorKey && v.suggestedCategoryId && v.suggestedCategoryId !== "OTHER") {
            next[v.vendorKey] = v.suggestedCategoryId;
          }
        }
        setSelection(next);
      } catch (err) {
        console.error(err);
        toast.error("Could not load uncategorized vendors.");
      } finally {
        if (!cancelled) setIsWorking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [importRunId, isOpen, orgId]);

  const applyForVendor = React.useCallback(
    async (vendorKey: string) => {
      const group = vendors.find((v) => v.vendorKey === vendorKey);
      const categoryId = selection[vendorKey];
      if (!group || !categoryId) return;

      setIsWorking(true);
      try {
        const created = await createHqCategoryRule(orgId, {
          matchType: "vendor",
          pattern: group.vendor,
          categoryId,
          priority: 250,
          enabled: true,
        });

        const applied = await applyHqCategoryRules(orgId, {
          importRunId,
          ruleIds: [created.rule.ruleId],
        });

        toast.success(`Rule saved. Updated ${applied.updated} transactions.`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("mylg:hq-refresh"));
        }

        // Optimistically remove from list.
        setVendors((prev) => prev.filter((v) => v.vendorKey !== vendorKey));
      } catch (err) {
        console.error(err);
        toast.error("Could not save/apply rule.");
      } finally {
        setIsWorking(false);
      }
    },
    [importRunId, orgId, selection, vendors]
  );

  const hasItems = vendors.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Categorization Spellbook"
      closeTimeoutMS={200}
      className={styles.modalContent}
      overlayClassName={styles.modalOverlay}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Categorization Spellbook</div>
          <div className={styles.subtitle}>Create vendor rules and apply them to uncategorized transactions.</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.body}>
        {!hasItems && !isWorking ? (
          <div className={styles.inlineNote}>No uncategorized vendors to review.</div>
        ) : null}

        {hasItems ? (
          <div className={styles.table} role="region" aria-label="Uncategorized vendors">
            <div className={styles.headerRow}>
              <div>Vendor</div>
              <div>Count</div>
              <div>Category</div>
              <div />
            </div>

            {vendors.map((v) => {
              const current = selection[v.vendorKey] || "";
              return (
                <div key={v.vendorKey} className={styles.row}>
                  <div className={styles.vendor}>
                    <div className={styles.vendorName}>{v.vendor}</div>
                    {v.example ? (
                      <div className={styles.example} title={v.example.rawDescription}>
                        e.g. {v.example.postedAt} · {v.example.rawDescription}
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.count}>{v.count}</div>

                  <div>
                    <select
                      className={styles.select}
                      value={current}
                      disabled={isWorking}
                      onChange={(e) =>
                        setSelection((prev) => ({
                          ...prev,
                          [v.vendorKey]: e.target.value,
                        }))
                      }
                      aria-label={`Set category for ${v.vendor}`}
                    >
                      <option value="">{HQ_CATEGORY_LABEL.OTHER}</option>
                      {HQ_CATEGORIES.filter((c) => c.id !== "OTHER" && c.id !== "TRANSFERS").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isWorking || !current}
                      onClick={() => void applyForVendor(v.vendorKey)}
                    >
                      Save rule
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <div className={styles.inlineNote}>
          Rules are org-scoped and apply deterministically on future imports.
        </div>
        <div>
          <button type="button" className={styles.secondaryButton} onClick={onRequestClose} disabled={isWorking}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CategorizationSpellbookModal;
