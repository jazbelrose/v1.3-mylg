import React, { Fragment } from "react";
import { createPortal } from "react-dom";

import Modal from "@/shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";

import InvoiceModalHeader from "./InvoiceModalHeader";
import InvoiceFileActions from "./InvoiceFileActions";
import InvoiceNavControls from "./InvoiceNavControls";
import InvoiceSidebar from "./InvoiceSidebar";
import InvoicePreviewContent from "./InvoicePreviewContent";
import styles from "./invoice-preview-modal.module.css";
import type { InvoicePreviewModalProps } from "./invoicePreviewTypes";
import { useInvoicePreviewModal } from "./hooks/useInvoicePreviewModal";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = (props) => {
  const {
    allowSave,
    showSidebar,
    modal,
    header,
    fileActions,
    itemsLength,
    pagesLength,
    navControls,
    sidebar,
    preview,
    unsavedPrompt,
    confirmDelete,
  } = useInvoicePreviewModal(props);

  return (
    <Fragment>
      <Modal
        isOpen={modal.isOpen}
        onRequestClose={modal.onRequestClose}
        contentLabel="Invoice Preview"
        closeTimeoutMS={300}
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
        <InvoiceModalHeader onClose={header.onClose} />

        <InvoiceFileActions
          fileName={fileActions.fileName}
          allowSave={allowSave}
          onSave={fileActions.onSave}
          onSavePdf={fileActions.onSavePdf}
          onPreviewPdf={fileActions.onPreviewPdf}
        />

        <div className={styles.modalBody}>
          {itemsLength === 0 ? (
            <div className={styles.emptyPlaceholder}>No budget line items available</div>
          ) : (
            <Fragment>
              <InvoiceNavControls
                currentPage={navControls.currentPage}
                totalPages={pagesLength}
                onPrev={() => navControls.setCurrentPage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  navControls.setCurrentPage((p) => Math.min(p + 1, Math.max(0, pagesLength - 1)))
                }
              />

              <div
                className={styles.contentRow}
                style={showSidebar ? undefined : { minWidth: "850px" }}
              >
                {showSidebar && sidebar && (
                  <InvoiceSidebar
                    groupFields={sidebar.groupFields}
                    groupField={sidebar.groupField}
                    onGroupFieldChange={sidebar.onGroupFieldChange}
                    groupOptions={sidebar.groupOptions}
                    groupValues={sidebar.groupValues}
                    onToggleGroupValue={sidebar.onToggleGroupValue}
                    onToggleAllGroupValues={sidebar.onToggleAllGroupValues}
                    pages={sidebar.pages}
                    selectedPages={sidebar.selectedPages}
                    onTogglePage={sidebar.onTogglePage}
                    onToggleAllPages={sidebar.onToggleAllPages}
                    savedInvoices={sidebar.savedInvoices}
                    selectedInvoices={sidebar.selectedInvoices}
                    onToggleInvoice={sidebar.onToggleInvoice}
                    onSelectAllInvoices={sidebar.onSelectAllInvoices}
                    onLoadInvoice={sidebar.onLoadInvoice}
                    onDeleteInvoice={sidebar.onDeleteInvoice}
                    onDeleteSelected={sidebar.onDeleteSelected}
                    isDirty={sidebar.isDirty}
                    onSaveHeader={sidebar.onSaveHeader}
                    showSaved={sidebar.showSaved}
                  />
                )}

                <InvoicePreviewContent
                  invoiceRef={preview.invoiceRef}
                  previewRef={preview.previewRef}
                  fileInputRef={preview.fileInputRef}
                  logoDataUrl={preview.logoDataUrl}
                  brandLogoKey={preview.brandLogoKey}
                  onLogoSelect={preview.onLogoSelect}
                  onLogoDrop={preview.onLogoDrop}
                  brandName={preview.brandName}
                  onBrandNameBlur={preview.onBrandNameBlur}
                  brandTagline={preview.brandTagline}
                  onBrandTaglineBlur={preview.onBrandTaglineBlur}
                  brandAddress={preview.brandAddress}
                  onBrandAddressBlur={preview.onBrandAddressBlur}
                  brandPhone={preview.brandPhone}
                  onBrandPhoneBlur={preview.onBrandPhoneBlur}
                  useProjectAddress={preview.useProjectAddress}
                  onToggleProjectAddress={preview.onToggleProjectAddress}
                  project={preview.project}
                  invoiceNumber={preview.invoiceNumber}
                  onInvoiceNumberBlur={preview.onInvoiceNumberBlur}
                  issueDate={preview.issueDate}
                  onIssueDateBlur={preview.onIssueDateBlur}
                  dueDate={preview.dueDate}
                  onDueDateChange={preview.onDueDateChange}
                  serviceDate={preview.serviceDate}
                  onServiceDateChange={preview.onServiceDateChange}
                  projectTitle={preview.projectTitle}
                  onProjectTitleBlur={preview.onProjectTitleBlur}
                  customerSummary={preview.customerSummary}
                  onCustomerSummaryBlur={preview.onCustomerSummaryBlur}
                  invoiceSummary={preview.invoiceSummary}
                  onInvoiceSummaryBlur={preview.onInvoiceSummaryBlur}
                  paymentSummary={preview.paymentSummary}
                  onPaymentSummaryBlur={preview.onPaymentSummaryBlur}
                  rowsData={preview.rowsData}
                  currentRows={preview.currentRows}
                  currentPage={preview.currentPage}
                  totalPages={preview.totalPages}
                  subtotal={preview.subtotal}
                  depositReceived={preview.depositReceived}
                  onDepositBlur={preview.onDepositBlur}
                  totalDue={preview.totalDue}
                  onTotalDueBlur={preview.onTotalDueBlur}
                  notes={preview.notes}
                  onNotesBlur={preview.onNotesBlur}
                  pdfPreviewUrl={preview.pdfPreviewUrl}
                  onClosePdfPreview={preview.onClosePdfPreview}
                />
              </div>
            </Fragment>
          )}
        </div>
      </Modal>

      {unsavedPrompt.isVisible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles.unsavedOverlay}
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved invoice changes"
          >
            <div className={styles.unsavedDialog}>
              <p>This invoice has unsaved changes. Leave Anyway?</p>
              <div className={styles.unsavedActions}>
                <button
                  type="button"
                  className={styles.unsavedButton}
                  onClick={unsavedPrompt.onStay}
                >
                  Stay
                </button>
                <button
                  type="button"
                  className={`${styles.unsavedButton} ${styles.unsavedButtonPrimary}`}
                  onClick={unsavedPrompt.onConfirmLeave}
                >
                  Leave Anyway
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        onRequestClose={confirmDelete.onRequestClose}
        onConfirm={confirmDelete.onConfirm}
        message="Delete selected invoices?"
        className={{
          base: styles.confirmModalContent,
          afterOpen: styles.confirmModalContentAfterOpen,
          beforeClose: styles.confirmModalContentBeforeClose,
        }}
        overlayClassName={{
          base: styles.modalOverlay,
          afterOpen: styles.modalOverlayAfterOpen,
          beforeClose: styles.modalOverlayBeforeClose,
        }}
      />
    </Fragment>
  );
};

export default InvoicePreviewModal;
