import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "./project-settings-modal.module.css";

import type { EditStatusModalState } from "../projectHeaderTypes";

interface EditStatusModalProps {
  modal: EditStatusModalState;
}

const EditStatusModal = ({ modal }: EditStatusModalProps) => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const rootElement = document.getElementById("root");
    if (rootElement) {
      Modal.setAppElement(rootElement);
    } else {
      Modal.setAppElement("body");
    }
  }, []);

  return (
    <Modal
      isOpen={modal.isOpen}
      onRequestClose={modal.close}
      contentLabel="Edit project status"
      closeTimeoutMS={300}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.overlay,
        afterOpen: styles.overlayAfterOpen,
        beforeClose: styles.overlayBeforeClose,
      }}
    >
      <div className={styles.modal}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Edit status</h2>
            <p className={styles.subtitle}>
              Update the project progress percentage that appears across the dashboard and shared views.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={modal.close}
            aria-label="Close edit status"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        <form onSubmit={modal.submit} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Status</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              max="100"
              step="1"
              value={modal.updatedStatus.replace('%', '')}
              onChange={(event) => {
                const value = event.target.value;
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 0 && num <= 100) {
                  modal.setUpdatedStatus(`${num}%`);
                } else if (value === '') {
                  modal.setUpdatedStatus('0%');
                }
              }}
              placeholder="Enter progress percentage (0-100)"
            />
          </label>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={modal.close}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryButton}>
              Save
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default EditStatusModal;
