// ClientInvoicePreviewModal.tsx
import React, { useCallback, useMemo } from "react";

import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import type { Project } from "@/app/contexts/DataProvider";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { updateBudgetItem } from "@/shared/utils/api";
import { toast } from "react-toastify";
import type { RevisionInvoiceSaveResult } from "@/dashboard/project/features/budget/components/invoicePreviewTypes";

interface RevisionLike {
  revision?: number;
  budgetItemId?: string | number | null;
  [k: string]: unknown;
}

interface ClientInvoicePreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  revision: RevisionLike;
  project: Project;
  items?: Array<Record<string, unknown>> | null;
}

const ClientInvoicePreviewModal: React.FC<ClientInvoicePreviewModalProps> = ({
  isOpen,
  onRequestClose,
  revision,
  project,
  items = null,
}) => {
  const { refresh } = useBudget();

  const projectId = useMemo(() => {
    const value = project?.projectId;
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }, [project?.projectId]);

  const revisionNumber = useMemo(() => {
    const value = revision?.revision;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [revision?.revision]);

  const budgetItemId = useMemo(() => {
    const value = revision?.budgetItemId;
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }, [revision?.budgetItemId]);

  const handleInvoiceSaved = useCallback(
    (result: RevisionInvoiceSaveResult) => {
      if (!projectId || !budgetItemId || revisionNumber == null) {
        return;
      }

      void (async () => {
        try {
          await updateBudgetItem(projectId, budgetItemId, {
            invoiceFileKey: result.fileKey,
            revision: revisionNumber,
          });
          void refresh();
        } catch (error) {
          console.error("Failed to attach invoice to revision", error);
          toast.error("Invoice saved, but attaching it to the revision failed. Please try again.");
        }
      })();
    },
    [budgetItemId, projectId, refresh, revisionNumber]
  );

  return (
    <InvoicePreviewModal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      revision={revision}
      project={project}
      allowSave
      onInvoiceSaved={handleInvoiceSaved}
      itemsOverride={items as Array<Record<string, unknown>> | null}
    />
  );
};

export default ClientInvoicePreviewModal;











