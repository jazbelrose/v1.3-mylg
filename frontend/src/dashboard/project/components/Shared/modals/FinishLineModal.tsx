import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "./project-settings-modal.module.css";

import type { FinishLineModalState } from "../projectHeaderTypes";

interface FinishLineModalProps {
  modal: FinishLineModalState;
}

const FinishLineModal = ({ modal }: FinishLineModalProps) => {
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
      contentLabel="Production dates"
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
            <h2 className={styles.title}>Production timeline</h2>
            <p className={styles.subtitle}>
              Set the production start and finish line to keep stakeholders aligned on key dates.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={modal.close}
            aria-label="Close production timeline"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        <form onSubmit={modal.submit} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Production start</span>
            <input
              type="date"
              aria-label="Production start date"
              value={modal.productionStart}
              onChange={(event) => modal.setProductionStart(event.target.value)}
              className={styles.dateInput}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Finish line</span>
            <input
              type="date"
              aria-label="Finish line date"
              value={modal.finishLine}
              onChange={(event) => modal.setFinishLine(event.target.value)}
              className={styles.dateInput}
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

export default FinishLineModal;
