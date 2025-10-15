import Modal from "@/shared/ui/ModalWithStack";

import styles from "@/dashboard/home/components/finish-line-component.module.css";

import type { FinishLineModalState } from "../projectHeaderTypes";

interface FinishLineModalProps {
  modal: FinishLineModalState;
}

const FinishLineModal = ({ modal }: FinishLineModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Finish Line"
    closeTimeoutMS={300}
    className={{
      base: styles.modalContent,
      afterOpen: styles.modalContentAfterOpen,
      beforeClose: styles.modalContentBeforeClose,
    }}
    overlayClassName={styles.modalOverlay}
  >
    <h4 style={{ marginBottom: "20px" }}>Production Start & Finish Line</h4>
    <form onSubmit={modal.submit} className={styles.form}>
      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        Production Start
        <input
          type="date"
          aria-label="Production start date"
          value={modal.productionStart}
          onChange={(event) => modal.setProductionStart(event.target.value)}
          className={styles.input}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        Finish Line
        <input
          type="date"
          aria-label="Finish line date"
          value={modal.finishLine}
          onChange={(event) => modal.setFinishLine(event.target.value)}
          className={styles.input}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
        <button
          className="modal-button primary"
          type="submit"
          style={{ borderRadius: "5px", padding: "10px 20px" }}
        >
          Save
        </button>
        <button
          className="modal-button secondary"
          type="button"
          onClick={modal.close}
          style={{ borderRadius: "5px", padding: "10px 20px" }}
        >
          Cancel
        </button>
      </div>
    </form>
  </Modal>
);

export default FinishLineModal;
