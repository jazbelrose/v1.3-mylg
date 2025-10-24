import { useMemo, type CSSProperties } from "react";

import Modal from "@/shared/ui/ModalWithStack";
import { useData } from "@/app/contexts/useData";
import { generateSequentialPalette } from "@/shared/utils/colorUtils";

import type { InvoiceInfoModalState } from "../projectHeaderTypes";

import styles from "./invoice-info-modal.module.css";

const DEFAULT_ACCENT_COLOR = "#FA3356";
const DEFAULT_ACCENT_RGB = "250, 51, 86";
const DEFAULT_SHADOW_RGB = "18, 18, 18";

const fields = [
  { field: "invoiceBrandName", label: "Brand Name", placeholder: "Brand Name", type: "text" },
  {
    field: "invoiceBrandAddress",
    label: "Brand Address",
    placeholder: "Brand Address",
    type: "text",
  },
  {
    field: "invoiceBrandPhone",
    label: "Brand Phone",
    placeholder: "Brand Phone",
    type: "text",
  },
  { field: "clientName", label: "Client Name", placeholder: "Client Name", type: "text" },
  {
    field: "clientAddress",
    label: "Client Address",
    placeholder: "Client Address",
    type: "text",
  },
  { field: "clientPhone", label: "Client Phone", placeholder: "Client Phone", type: "text" },
  {
    field: "clientEmail",
    label: "Client Email",
    placeholder: "Client Email",
    type: "email",
  },
] as const;

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  const hex = prefixed.slice(1);
  if (!(hex.length === 3 || hex.length === 6)) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  return `#${hex.toUpperCase()}`;
};

const hexToRgb = (hex: string): [number, number, number] | null => {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (value.length !== 6) return null;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return null;
  }

  return [r, g, b];
};

interface InvoiceInfoModalProps {
  modal: InvoiceInfoModalState;
}

const InvoiceInfoModal = ({ modal }: InvoiceInfoModalProps) => {
  const { activeProject } = useData();

  const accentColor = useMemo(() => {
    if (typeof activeProject?.color === "string" && activeProject.color.trim() !== "") {
      const normalized = normalizeHexColor(activeProject.color);
      if (normalized) {
        return normalized;
      }
    }
    return DEFAULT_ACCENT_COLOR;
  }, [activeProject?.color]);

  const accentRgbString = useMemo(() => {
    const rgb = hexToRgb(accentColor);
    if (!rgb) return DEFAULT_ACCENT_RGB;
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  }, [accentColor]);

  const [gradientStart, gradientEnd] = useMemo(() => {
    const palette = generateSequentialPalette(accentColor, 3);
    const start = palette[0] ?? accentColor;
    const end = palette[palette.length - 1] ?? accentColor;
    return [start, end] as const;
  }, [accentColor]);

  const shadowRgbString = useMemo(() => {
    const rgb = hexToRgb(gradientEnd) ?? hexToRgb(accentColor);
    if (!rgb) return DEFAULT_SHADOW_RGB;
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  }, [gradientEnd, accentColor]);

  const accentStyles = useMemo<CSSProperties>(
    () => ({
      "--invoice-accent": accentColor,
      "--invoice-accent-rgb": accentRgbString,
      "--invoice-accent-gradient-start": gradientStart,
      "--invoice-accent-gradient-end": gradientEnd,
      "--invoice-shadow-rgb": shadowRgbString,
    }),
    [accentColor, accentRgbString, gradientStart, gradientEnd, shadowRgbString]
  );

  return (
    <Modal
      isOpen={modal.isOpen}
      onRequestClose={modal.close}
      contentLabel="Client Info"
      closeTimeoutMS={300}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={styles.modalOverlay}
      style={{ content: accentStyles }}
    >
      <div className={styles.modalInner}>
        <header className={styles.header}>
          <h2 className={styles.title}>Client Info</h2>
          <p className={styles.subtitle}>Update the details that appear on generated invoices.</p>
        </header>
        <form onSubmit={modal.submit} className={styles.form}>
          {fields.map(({ field, label, placeholder, type }) => (
            <label key={field} className={styles.field}>
              <span className={styles.fieldLabel}>{label}</span>
              <input
                className={styles.input}
                type={type}
                placeholder={placeholder}
                value={modal.fields[field]}
                onChange={(event) => modal.setField(field, event.target.value)}
                autoComplete="off"
              />
            </label>
          ))}

          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={modal.close}>
              Cancel
            </button>
            <button className={styles.primaryButton} type="submit">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default InvoiceInfoModal;
