import React, { Fragment } from "react";

import Modal from "../../../../shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";

import GalleryTrigger from "./GalleryTrigger";
import GalleryModal from "./GalleryModal";
import CoverSelectionModal from "./CoverSelectionModal";
import useGalleryController from "./hooks/useGalleryController";
import styles from "./gallery-component.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const GalleryComponent: React.FC = () => {
  const controller = useGalleryController();
  const {
    saving,
    combinedGalleries,
    clientGallery,
    hasClientGallerySelection,
    openModal,
    isConfirmingDelete,
    setIsConfirmingDelete,
    setDeleteIndex,
    confirmDeleteGallery,
  } = controller;

  return (
    <Fragment>
      {saving && <div style={{ color: "#FA3356", marginBottom: "10px" }}>Saving...</div>}

      <GalleryTrigger
        gallery={clientGallery}
        hasGalleries={combinedGalleries.length > 0}
        hasClientGallerySelection={hasClientGallerySelection}
        onOpenModal={openModal}
      />

      <GalleryModal controller={controller} />
      <CoverSelectionModal controller={controller} />

      <ConfirmModal
        isOpen={isConfirmingDelete}
        onRequestClose={() => {
          setIsConfirmingDelete(false);
          setDeleteIndex(null);
        }}
        onConfirm={confirmDeleteGallery}
        message="Delete this gallery?"
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
      />
    </Fragment>
  );
};

export default GalleryComponent;
