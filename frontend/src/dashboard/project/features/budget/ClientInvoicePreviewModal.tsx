// ClientInvoicePreviewModal.tsx
import React from "react";

import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import type { Project } from "@/app/contexts/DataProvider";

interface RevisionLike {
  revision?: number;
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
}) => (
  <InvoicePreviewModal
    isOpen={isOpen}
    onRequestClose={onRequestClose}
    revision={revision}
    project={project}
    showSidebar={false}
    allowSave={false}
    itemsOverride={items as Array<Record<string, unknown>> | null}
  />
);

export default ClientInvoicePreviewModal;











