import React, { useEffect, useId, useMemo, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./edit-ball-park-modal.module.css";

type ModalStyles = {
  content?: React.CSSProperties;
  overlay?: React.CSSProperties;
};

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return null;
  }

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return trimmed.toUpperCase();
};

const hexToRgb = (value: string): [number, number, number] | null => {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (normalized.length !== 6) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null;
  }

  return [r, g, b];
};

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type EditBallparkModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  onSubmit: (value: number) => void;
  initialValue?: number | string;
  accentColor?: string;
};

const EditBallparkModal: React.FC<EditBallparkModalProps> = ({
  isOpen,
  onRequestClose,
  onSubmit,
  initialValue,
  accentColor,
}) => {
  const [value, setValue] = useState<string>(
    initialValue !== undefined && initialValue !== null ? String(initialValue) : ""
  );
  const inputId = useId();

  const accentStyles = useMemo<ModalStyles | undefined>(() => {
    if (typeof accentColor !== "string" || accentColor.trim() === "") {
      return undefined;
    }

    const normalized = normalizeHexColor(accentColor);
    if (!normalized) {
      return undefined;
    }

    const rgb = hexToRgb(normalized);
    if (!rgb) {
      return undefined;
    }

    return {
      content: {
        "--edit-ballpark-accent": normalized,
        "--edit-ballpark-accent-rgb": `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`,
      } as React.CSSProperties,
    };
  }, [accentColor]);

  useEffect(() => {
    setValue(
      initialValue !== undefined && initialValue !== null ? String(initialValue) : ""
    );
  }, [initialValue]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const num = parseFloat(value);
    onSubmit(Number.isNaN(num) ? 0 : num);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Edit Ballpark"
      closeTimeoutMS={300}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      style={accentStyles}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
    >
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>Edit Ballpark</div>
        <button
          className={styles.iconButton}
          onClick={onRequestClose}
          aria-label="Close"
          type="button"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label className={styles.inputLabel} htmlFor={inputId}>
            Estimate amount
          </label>
          <div className={styles.currencyInputWrapper}>
            <span className={styles.currencyPrefix} aria-hidden="true">
              $
            </span>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={styles.input}
              placeholder="0.00"
              autoFocus
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRequestClose}
          >
            Cancel
          </button>
          <button type="submit" className={styles.primaryButton}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditBallparkModal;









