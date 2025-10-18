import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

import styles from "./invoice-preview-modal.module.css";

interface InvoiceNavControlsProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

const InvoiceNavControls: React.FC<InvoiceNavControlsProps> = ({
  currentPage,
  totalPages,
  onPrev,
  onNext,
}) => (
  <div className={styles.navControls}>
    <button
      className={styles.navButton}
      onClick={onPrev}
      disabled={currentPage === 0}
      aria-label="Previous Page"
    >
      <FontAwesomeIcon icon={faChevronLeft} />
    </button>
    <span>
      Page {currentPage + 1} of {totalPages || 1}
    </span>
    <button
      className={styles.navButton}
      onClick={onNext}
      disabled={currentPage >= Math.max(0, totalPages - 1)}
      aria-label="Next Page"
    >
      <FontAwesomeIcon icon={faChevronRight} />
    </button>
  </div>
);

export default InvoiceNavControls;
