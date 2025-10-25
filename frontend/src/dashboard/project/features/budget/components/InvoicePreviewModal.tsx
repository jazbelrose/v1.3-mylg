import React, { Fragment } from "react";
import { createPortal } from "react-dom";
import Modal from "@/shared/ui/ModalWithStack";

import InvoiceModalHeader from "./InvoiceModalHeader";
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
  allowSave = true,
  itemsOverride = null,
  onInvoiceSaved,
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
    invoiceNumber,
    handleInvoiceNumberBlur,
    issueDate,
    handleIssueDateBlur,
    projectName,
    handleProjectNameBlur,
    customerSummary,
    handleCustomerSummaryBlur,
    rowsData,
    organizationLines,
    organizationName,
    handleOrganizationNameBlur,
    organizationAddress,
    handleOrganizationAddressBlur,
    organizationPhone,
    handleOrganizationPhoneBlur,
    organizationEmail,
    handleOrganizationEmailBlur,
    subtotal,
    depositReceived,
    handleDepositBlur,
    taxRate,
    handleTaxRateBlur,
    taxAmount,
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
  } = useInvoicePreviewModal({
    isOpen,
    onRequestClose,
    revision,
    project,
    itemsOverride,
    onInvoiceSaved,
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
              <div className={styles.contentRow}>
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
                  isDirty={isDirty}
                  onSaveHeader={handleSaveHeader}
                  showSaved={showSaved}
                  brandName={brandName}
                  onBrandNameBlur={handleBrandNameBlur}
                  brandTagline={brandTagline}
                  onBrandTaglineBlur={handleBrandTaglineBlur}
                  project={project}
                  invoiceNumber={invoiceNumber}
                  onInvoiceNumberBlur={handleInvoiceNumberBlur}
                  issueDate={issueDate}
                  onIssueDateBlur={handleIssueDateBlur}
                  projectName={projectName}
                  onProjectNameBlur={handleProjectNameBlur}
                  customerSummary={customerSummary}
                  onCustomerSummaryBlur={handleCustomerSummaryBlur}
                  rowsData={rowsData}
                  organizationLines={organizationLines}
                  organizationName={organizationName}
                  onOrganizationNameBlur={handleOrganizationNameBlur}
                  organizationAddress={organizationAddress}
                  onOrganizationAddressBlur={handleOrganizationAddressBlur}
                  organizationPhone={organizationPhone}
                  onOrganizationPhoneBlur={handleOrganizationPhoneBlur}
                  organizationEmail={organizationEmail}
                  onOrganizationEmailBlur={handleOrganizationEmailBlur}
                  currentPage={currentPage}
                  totalPages={pages.length}
                  subtotal={subtotal}
                  depositReceived={depositReceived}
                  onDepositBlur={handleDepositBlur}
                  taxRate={taxRate}
                  taxAmount={taxAmount}
                  onTaxRateBlur={handleTaxRateBlur}
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
    </Fragment>
  );
};

export default InvoicePreviewModal;
