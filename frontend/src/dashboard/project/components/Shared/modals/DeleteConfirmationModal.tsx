import Modal from "@/shared/ui/ModalWithStack";

import styles from "@/dashboard/home/components/finish-line-component.module.css";

import type { DeleteConfirmationModalState } from "../projectHeaderTypes";

interface DeleteConfirmationModalProps {
  modal: DeleteConfirmationModalState;
}

const DeleteConfirmationModal = ({ modal }: DeleteConfirmationModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Confirm Delete Project"
    closeTimeoutMS={300}
    className={{
      base: styles.modalContent,
      afterOpen: styles.modalContentAfterOpen,
      beforeClose: styles.modalContentBeforeClose,
    }}
    overlayClassName={styles.modalOverlay}
  >
    <h4 style={{ fontSize: "1rem", paddingBottom: "20px" }}>
      Are you sure you want to delete this project?
    </h4>
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "10px",
        marginTop: "20px",
      }}
    >
      <button
        className="modal-button primary"
        onClick={modal.confirm}
        style={{ borderRadius: "5px" }}
      >
        Yes
      </button>
      <button
        className="modal-button secondary"
        onClick={modal.close}
        style={{ borderRadius: "5px" }}
      >
        No
      </button>
    </div>
  </Modal>
);

export default DeleteConfirmationModal;
