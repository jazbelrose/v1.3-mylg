import { HexColorPicker, HexColorInput } from "react-colorful";
import { Pipette } from "lucide-react";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "@/dashboard/home/components/finish-line-component.module.css";

import type { ColorModalState } from "../projectHeaderTypes";

interface ColorModalProps {
  modal: ColorModalState;
}

const ColorModal = ({ modal }: ColorModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Choose Color"
    closeTimeoutMS={300}
    className={{
      base: `${styles.modalContent} ${styles.colorModalContent}`,
      afterOpen: `${styles.modalContentAfterOpen} ${styles.colorModalContent}`,
      beforeClose: `${styles.modalContentBeforeClose} ${styles.colorModalContent}`,
    }}
    overlayClassName={styles.modalOverlay}
  >
    <h4 style={{ marginBottom: "20px" }}>Project Color</h4>
    <HexColorPicker
      color={modal.selectedColor}
      onChange={modal.setSelectedColor}
      className={styles.colorPicker}
    />
    <div className={styles.hexRgbWrapper} style={{ marginTop: "10px" }}>
      <HexColorInput
        color={modal.selectedColor}
        onChange={modal.setSelectedColor}
        prefixed
        style={{
          width: "100px",
          padding: "5px",
          borderRadius: "5px",
          textAlign: "center",
          backgroundColor: "#ffffff",
          color: "#000000",
          border: "1px solid #ccc",
        }}
      />
      <div style={{ marginTop: "5px", fontSize: "0.9rem" }}>
        RGB: {modal.hexToRgb(modal.selectedColor)}
      </div>
    </div>

    <div className={styles.pipetteWrapper}>
      <Pipette
        onClick={modal.pickColorFromScreen}
        aria-label="Pick color from screen"
        style={{ cursor: "pointer", width: 24, height: 24 }}
      />
    </div>

    <div
      style={{
        display: "flex",
        justifyContent: "space-around",
        marginTop: "30px",
      }}
    >
      <button
        className="modal-button primary"
        onClick={modal.save}
        style={{ padding: "10px 20px", borderRadius: "5px" }}
      >
        Save
      </button>
      <button
        className="modal-button secondary"
        onClick={modal.close}
        style={{ padding: "10px 20px", borderRadius: "5px" }}
      >
        Cancel
      </button>
    </div>
  </Modal>
);

export default ColorModal;
