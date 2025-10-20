import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { CircleDollarSign, Image as ImageIcon, Palette, Pencil, Trash } from "lucide-react";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "@/dashboard/home/components/finish-line-component.module.css";

import type { SettingsModalState } from "../projectHeaderTypes";

interface SettingsModalProps {
  modal: SettingsModalState;
  isAdmin: boolean;
}

const buttonStyle: React.CSSProperties = {
  borderRadius: "5px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  justifyContent: "flex-start",
};

const SettingsModal = ({ modal, isAdmin }: SettingsModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Project Settings"
    closeTimeoutMS={300}
    className={{
      base: styles.modalContent,
      afterOpen: styles.modalContentAfterOpen,
      beforeClose: styles.modalContentBeforeClose,
    }}
    overlayClassName={styles.modalOverlay}
  >
    <h4 style={{ marginBottom: "20px" }}>Project Settings</h4>

    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <button
        className="modal-button primary"
        aria-label="Edit project name"
        onClick={modal.triggerEditName}
        style={buttonStyle}
      >
        <Pencil size={20} color="white" aria-hidden="true" />
        Edit Name
      </button>

      <button
        className="modal-button primary"
        aria-label="Edit project thumbnail"
        onClick={modal.triggerThumbnail}
        style={buttonStyle}
      >
        <ImageIcon size={20} color="white" aria-hidden="true" />
        Edit Thumbnail
      </button>

      <button
        className="modal-button primary"
        aria-label="Change project color"
        onClick={modal.triggerColor}
        style={buttonStyle}
      >
        <Palette size={20} color="white" aria-hidden="true" />
        Change Color
      </button>

      <button
        className="modal-button primary"
        aria-label="Edit invoice info"
        onClick={modal.triggerInvoiceInfo}
        style={buttonStyle}
      >
        <FontAwesomeIcon icon={faPen} color="white" />
        Invoice Info
      </button>

      {modal.triggerBudgetCreateLineItem && (
        <button
          className="modal-button primary"
          aria-label="Create budget line item"
          onClick={modal.triggerBudgetCreateLineItem}
          style={buttonStyle}
        >
          <CircleDollarSign size={20} color="white" aria-hidden="true" />
          Add Budget Line Item
        </button>
      )}

      {isAdmin && (
        <>
          <div
            style={{
              borderTop: "1px solid rgba(255, 255, 255, 0.2)",
              margin: "8px 0",
            }}
          />
          <button
            className="modal-button secondary"
            aria-label="Delete project"
            onClick={modal.triggerDelete}
            style={{
              ...buttonStyle,
              background: "#1a1a1a",
              border: "1px solid #ffffff",
            }}
          >
            <Trash size={20} color="white" aria-hidden="true" />
            Delete Project
          </button>
        </>
      )}
    </div>
  </Modal>
);

export default SettingsModal;
