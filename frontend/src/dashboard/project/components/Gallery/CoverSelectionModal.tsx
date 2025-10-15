import React from "react";
import Modal from "../../../../shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faImage, faPlus } from "@fortawesome/free-solid-svg-icons";

import styles from "./gallery-component.module.css";
import type { GalleryController } from "./types";
import { getFileUrl } from "../../../../shared/utils/api";

interface CoverSelectionModalProps {
  controller: GalleryController;
}

const CoverSelectionModal: React.FC<CoverSelectionModalProps> = ({ controller }) => {
  const {
    coverOptions,
    setCoverOptions,
    currentCoverUrls,
    totalCoverPages,
    coverStartIndex,
    coverPage,
    setCoverPage,
    chooseCoverUrl,
    handleUploadNewCover,
  } = controller;

  return (
    <Modal
      isOpen={!!coverOptions}
      onRequestClose={() => setCoverOptions(null)}
      contentLabel="Select Cover Image"
      className={{
        base: `${styles.modalContent} ${styles.coverModal}`,
        afterOpen: `${styles.modalContentAfterOpen} ${styles.coverModal}`,
        beforeClose: `${styles.modalContentBeforeClose} ${styles.coverModal}`,
      }}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
    >
      <FontAwesomeIcon icon={faImage} className={styles.coverModalIcon} style={{ fontSize: 40 }} />
      <h2>Select Cover Image</h2>

      <div className={styles.coverSelectGrid}>
        {currentCoverUrls.map((url, i) => (
          <div
            className={styles.coverSelectOption}
            onClick={() => chooseCoverUrl(url)}
            key={`${coverStartIndex + i}`}
          >
            <img src={getFileUrl(url)} alt={`Cover option ${coverStartIndex + i + 1}`} />
          </div>
        ))}
      </div>

      {totalCoverPages > 1 && (
        <div className={styles.coverPagination}>
          <button
            className={styles.iconButton}
            onClick={() => setCoverPage((p) => Math.max(p - 1, 0))}
            disabled={coverPage === 0}
            aria-label="Previous"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            className={styles.iconButton}
            onClick={() => setCoverPage((p) => Math.min(p + 1, totalCoverPages - 1))}
            disabled={coverPage >= totalCoverPages - 1}
            aria-label="Next"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      )}

      <div className={styles.modalActions}>
        <button className="modal-submit-button uploads" onClick={handleUploadNewCover}>
          <FontAwesomeIcon icon={faPlus} style={{ marginRight: 8 }} />
          Upload New
        </button>
        <button className="modal-submit-button" onClick={() => setCoverOptions(null)}>
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default CoverSelectionModal;
