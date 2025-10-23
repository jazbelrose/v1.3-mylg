import React, { Fragment } from "react";
import { createPortal } from "react-dom";
import Modal from "@/shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";

import InvoiceModalHeader from "./InvoiceModalHeader";
import InvoiceSidebar from "./InvoiceSidebar";
import InvoicePreviewContent from "./InvoicePreviewContent";
import styles from "./invoice-preview-modal.module.css";
import type { InvoicePreviewModalProps } from "./invoicePreviewTypes";
import { groupFields } from "./invoicePreviewConstants";
import useInvoicePreviewModal from "./useInvoicePreviewModal";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onRequestClose,
  revision,
  project,
  showSidebar = true,
  allowSave = true,
  itemsOverride = null,
}) => {
  const {
    items,
    invoiceRef,
    previewRef,
    fileInputRef,
    handleSaveClick,
    currentPage,
    pages,
    groupField,
    handleGroupFieldChange,
    groupOptions,
    groupValues,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
    selectedPages,
    handleTogglePage,
    handleToggleAllPages,
    savedInvoices,
    selectedInvoices,
    toggleInvoiceSelect,
    selectAllInvoices,
    loadInvoice,
    handleDeleteInvoice,
    handleDeleteSelectedInvoices,
    isDirty,
    handleSaveHeader,
    showSaved,
    logoDataUrl,
    brandLogoKey,
    handleLogoSelect,
    handleLogoDrop,
    brandName,
    handleBrandNameBlur,
    brandTagline,
    handleBrandTaglineBlur,
    brandAddress,
    handleBrandAddressBlur,
    brandPhone,
    handleBrandPhoneBlur,
    useProjectAddress,
    handleToggleProjectAddress,
    invoiceNumber,
    handleInvoiceNumberBlur,
    issueDate,
    handleIssueDateBlur,
    dueDate,
    handleDueDateChange,
    serviceDate,
    handleServiceDateChange,
    projectTitle,
    handleProjectTitleBlur,
    customerSummary,
    handleCustomerSummaryBlur,
    invoiceSummary,
    handleInvoiceSummaryBlur,
    paymentSummary,
    handlePaymentSummaryBlur,
    rowsData,
    subtotal,
    depositReceived,
    handleDepositBlur,
    totalDue,
    handleTotalDueBlur,
    notes,
    handleNotesBlur,
    pdfPreviewUrl,
    closePdfPreview,
    showUnsavedPrompt,
    handleStayOpen,
    handleConfirmLeave,
    handleAttemptClose,
    isConfirmingDelete,
    closeDeleteConfirm,
    performDeleteInvoices,
  } = useInvoicePreviewModal({
    isOpen,
    onRequestClose,
    revision,
    project,
    itemsOverride,
  });

  return (
    <Fragment>
      <Modal
        isOpen={isOpen}
        onRequestClose={handleAttemptClose}
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
        <InvoiceModalHeader onClose={handleAttemptClose} />

        <div className={styles.modalBody}>
          {items.length === 0 ? (
            <div className={styles.emptyPlaceholder}>No budget line items available</div>
          ) : (
            <Fragment>
              <div
                className={styles.contentRow}
                style={showSidebar ? undefined : { minWidth: "850px" }}
              >
                {showSidebar && (
                  <InvoiceSidebar
                    groupFields={groupFields}
                    groupField={groupField}
                    onGroupFieldChange={handleGroupFieldChange}
                    groupOptions={groupOptions}
                    groupValues={groupValues}
                    onToggleGroupValue={handleToggleGroupValue}
                    onToggleAllGroupValues={handleToggleAllGroupValues}
                    pages={pages}
                    selectedPages={selectedPages}
                    onTogglePage={handleTogglePage}
                    onToggleAllPages={handleToggleAllPages}
                    savedInvoices={savedInvoices}
                    selectedInvoices={selectedInvoices}
                    onToggleInvoice={toggleInvoiceSelect}
                    onSelectAllInvoices={selectAllInvoices}
                    onLoadInvoice={loadInvoice}
                    onDeleteInvoice={handleDeleteInvoice}
                    onDeleteSelected={handleDeleteSelectedInvoices}
                    isDirty={isDirty}
                    onSaveHeader={handleSaveHeader}
                    showSaved={showSaved}
                  />
                )}

                <InvoicePreviewContent
                  invoiceRef={invoiceRef}
                  previewRef={previewRef}
                  fileInputRef={fileInputRef}
                  allowSave={allowSave}
                  onSaveInvoice={handleSaveClick}
                  logoDataUrl={logoDataUrl}
                  brandLogoKey={brandLogoKey}
                  onLogoSelect={handleLogoSelect}
                  onLogoDrop={handleLogoDrop}
                  brandName={brandName}
                  onBrandNameBlur={handleBrandNameBlur}
                  brandTagline={brandTagline}
                  onBrandTaglineBlur={handleBrandTaglineBlur}
                  brandAddress={brandAddress}
                  onBrandAddressBlur={handleBrandAddressBlur}
                  brandPhone={brandPhone}
                  onBrandPhoneBlur={handleBrandPhoneBlur}
                  useProjectAddress={useProjectAddress}
                  onToggleProjectAddress={handleToggleProjectAddress}
                  project={project}
                  invoiceNumber={invoiceNumber}
                  onInvoiceNumberBlur={handleInvoiceNumberBlur}
                  issueDate={issueDate}
                  onIssueDateBlur={handleIssueDateBlur}
                  dueDate={dueDate}
                  onDueDateChange={handleDueDateChange}
                  serviceDate={serviceDate}
                  onServiceDateChange={handleServiceDateChange}
                  projectTitle={projectTitle}
                  onProjectTitleBlur={handleProjectTitleBlur}
                  customerSummary={customerSummary}
                  onCustomerSummaryBlur={handleCustomerSummaryBlur}
                  invoiceSummary={invoiceSummary}
                  onInvoiceSummaryBlur={handleInvoiceSummaryBlur}
                  paymentSummary={paymentSummary}
                  onPaymentSummaryBlur={handlePaymentSummaryBlur}
                  rowsData={rowsData}
                  currentPage={currentPage}
                  totalPages={pages.length}
                  subtotal={subtotal}
                  depositReceived={depositReceived}
                  onDepositBlur={handleDepositBlur}
                  totalDue={totalDue}
                  onTotalDueBlur={handleTotalDueBlur}
                  notes={notes}
                  onNotesBlur={handleNotesBlur}
                  pdfPreviewUrl={pdfPreviewUrl}
                  onClosePdfPreview={closePdfPreview}
                />
              </div>
            </Fragment>
          )}
        </div>
      </Modal>

      {showUnsavedPrompt &&
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
                  onClick={handleStayOpen}
                >
                  Stay
                </button>
                <button
                  type="button"
                  className={`${styles.unsavedButton} ${styles.unsavedButtonPrimary}`}
                  onClick={handleConfirmLeave}
                >
                  Leave Anyway
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmModal
        isOpen={isConfirmingDelete}
        onRequestClose={closeDeleteConfirm}
        onConfirm={performDeleteInvoices}
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
