import Modal from "@/shared/ui/ModalWithStack";

import styles from "./invoice-info-modal.module.css";

import type { InvoiceInfoModalState } from "../projectHeaderTypes";

interface InvoiceInfoModalProps {
  modal: InvoiceInfoModalState;
}

const InvoiceInfoModal = ({ modal }: InvoiceInfoModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Invoice Info"
    closeTimeoutMS={300}
    className={{
      base: styles.modalContent,
      afterOpen: styles.modalContentAfterOpen,
      beforeClose: styles.modalContentBeforeClose,
    }}
    overlayClassName={styles.modalOverlay}
  >
    <h4 className={styles.heading}>Invoice Info</h4>
    <form onSubmit={modal.submit} className={styles.form}>
      <input
        className={styles.input}
        type="text"
        placeholder="Brand Name"
        value={modal.fields.invoiceBrandName}
        onChange={(event) => modal.setField("invoiceBrandName", event.target.value)}
      />
      <input
        className={styles.input}
        type="text"
        placeholder="Brand Address"
        value={modal.fields.invoiceBrandAddress}
        onChange={(event) => modal.setField("invoiceBrandAddress", event.target.value)}
      />
      <input
        className={styles.input}
        type="text"
        placeholder="Brand Phone"
        value={modal.fields.invoiceBrandPhone}
        onChange={(event) => modal.setField("invoiceBrandPhone", event.target.value)}
      />
      <input
        className={styles.input}
        type="text"
        placeholder="Client Name"
        value={modal.fields.clientName}
        onChange={(event) => modal.setField("clientName", event.target.value)}
      />
      <input
        className={styles.input}
        type="text"
        placeholder="Client Address"
        value={modal.fields.clientAddress}
        onChange={(event) => modal.setField("clientAddress", event.target.value)}
      />
      <input
        className={styles.input}
        type="text"
        placeholder="Client Phone"
        value={modal.fields.clientPhone}
        onChange={(event) => modal.setField("clientPhone", event.target.value)}
      />
      <input
        className={styles.input}
        type="email"
        placeholder="Client Email"
        value={modal.fields.clientEmail}
        onChange={(event) => modal.setField("clientEmail", event.target.value)}
      />

      <div className={styles.actions}>
        <button className={styles.primaryButton} type="submit">
          Save
        </button>
        <button className={styles.secondaryButton} type="button" onClick={modal.close}>
          Cancel
        </button>
      </div>
    </form>
  </Modal>
);

export default InvoiceInfoModal;
