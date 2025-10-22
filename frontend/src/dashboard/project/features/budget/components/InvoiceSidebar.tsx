import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

import styles from "./invoice-preview-modal.module.css";
import type { GroupField, SavedInvoice } from "./invoicePreviewTypes";

interface InvoiceSidebarProps {
  groupFields: Array<{ label: string; value: GroupField }>;
  groupField: GroupField;
  onGroupFieldChange: (field: GroupField) => void;
  groupOptions: string[];
  groupValues: string[];
  onToggleGroupValue: (value: string) => void;
  onToggleAllGroupValues: (checked: boolean) => void;
  savedInvoices: SavedInvoice[];
  selectedInvoiceKeys: Set<string>;
  onToggleInvoice: (invoice: SavedInvoice) => void;
  onSelectAllInvoices: (checked: boolean) => void;
  onLoadInvoice: (invoice: SavedInvoice) => void;
  onDeleteInvoice: (invoice: SavedInvoice) => void;
  onDeleteSelected: () => void;
  isDirty: boolean;
  onSaveHeader: () => void;
  showSaved: boolean;
}

const InvoiceSidebar: React.FC<InvoiceSidebarProps> = ({
  groupFields,
  groupField,
  onGroupFieldChange,
  groupOptions,
  groupValues,
  onToggleGroupValue,
  onToggleAllGroupValues,
  savedInvoices,
  selectedInvoiceKeys,
  onToggleInvoice,
  onSelectAllInvoices,
  onLoadInvoice,
  onDeleteInvoice,
  onDeleteSelected,
  isDirty,
  onSaveHeader,
  showSaved,
}) => (
  <div className={styles.sidebar}>
    <label htmlFor="group-field-select">Group By:&nbsp;</label>
    <select
      id="group-field-select"
      value={groupField}
      onChange={(e) => onGroupFieldChange(e.target.value as GroupField)}
    >
      {groupFields.map((g) => (
        <option key={g.value} value={g.value}>
          {g.label}
        </option>
      ))}
    </select>

    <div className={styles.groupSelect} role="group" aria-label="Groups">
      <label className={styles.groupItem}>
        <input
          type="checkbox"
          checked={groupValues.length === groupOptions.length}
          onChange={(e) => onToggleAllGroupValues(e.target.checked)}
        />
        Select All
      </label>
      {groupOptions.map((val) => (
        <label key={val} className={styles.groupItem}>
          <input
            type="checkbox"
            checked={groupValues.includes(val)}
            onChange={() => onToggleGroupValue(val)}
          />
          {val}
        </label>
      ))}
    </div>

    {savedInvoices.length > 0 && (
      <div className={styles.invoiceList}>
        <div className={styles.listHeader}>Saved Invoices</div>
        <label className={styles.groupItem}>
          <input
            type="checkbox"
            checked={selectedInvoiceKeys.size === savedInvoices.length}
            onChange={(e) => onSelectAllInvoices(e.target.checked)}
          />
          Select All
        </label>
        {savedInvoices.map((inv, idx) => (
          <div key={idx} className={styles.invoiceRow}>
            <input
              type="checkbox"
              checked={selectedInvoiceKeys.has(inv.key)}
              onChange={() => onToggleInvoice(inv)}
            />
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onLoadInvoice(inv)}
              title="Load invoice"
            >
              {inv.name}
            </button>
            <button
              className={styles.iconButton}
              onClick={() => onDeleteInvoice(inv)}
              aria-label="Delete invoice"
              title="Delete"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        ))}
        {selectedInvoiceKeys.size > 0 && (
          <button
            className={styles.iconButton}
            onClick={onDeleteSelected}
            aria-label="Delete selected invoices"
          >
            <FontAwesomeIcon icon={faTrash} /> Delete Selected
          </button>
        )}
      </div>
    )}

    {isDirty && (
      <button className={styles.saveButton} onClick={onSaveHeader}>
        Save as my default invoice header
      </button>
    )}
    {showSaved && (
      <div className={styles.savedMsg} role="status">
        Header info saved! Future invoices will use this by default.
      </div>
    )}
  </div>
);

export default InvoiceSidebar;
