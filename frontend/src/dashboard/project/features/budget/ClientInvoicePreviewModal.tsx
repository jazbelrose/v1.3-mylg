// ClientInvoicePreviewModal.tsx
import React from "react";

import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import { BudgetProvider } from "@/dashboard/project/features/budget/context/BudgetProvider";
import { Project } from "@/app/contexts/DataProvider";

interface RevisionLike {
  revision?: number;
  [k: string]: unknown;
}

interface ClientInvoicePreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  revision: RevisionLike;
  project: Project;
}

const ClientInvoicePreviewModal: React.FC<ClientInvoicePreviewModalProps> = ({
  isOpen,
  onRequestClose,
  revision,
  project,
}) => (
  <BudgetProvider projectId={project?.projectId}>
    <InvoicePreviewModal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      revision={revision}
      project={project}
      showSidebar={false}
      allowSave={false}
    />
  </BudgetProvider>
);

export default ClientInvoicePreviewModal;











