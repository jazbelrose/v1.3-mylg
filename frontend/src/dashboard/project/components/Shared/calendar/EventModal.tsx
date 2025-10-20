import React, { ChangeEvent, FocusEvent, FormEvent, MouseEvent } from "react";
import { X } from "lucide-react";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "./event-modal.module.css";
import { CATEGORY_OPTIONS, UNIT_OPTIONS } from "./constants";

export interface EventModalProps {
  isOpen: boolean;
  isEditing: boolean;
  startDateInput: string;
  endDateInput: string;
  eventDesc: string;
  eventHours: string;
  createLineItem: boolean;
  category: string;
  elementKey: string;
  elementId: string;
  quantity: number | string;
  unit: string;
  budgetedCost: string;
  markup: string;
  finalCost: string;
  descOptions: string[];
  onRequestClose: (event?: MouseEvent) => void;
  onSubmit: (event: FormEvent) => void;
  onChangeStartDate: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeEndDate: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeDescription: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeHours: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleCreateLineItem: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeCategory: (event: ChangeEvent<HTMLSelectElement>) => void;
  onChangeElementKey: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeElementId: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeQuantity: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeUnit: (event: ChangeEvent<HTMLSelectElement>) => void;
  onChangeBudgetedCost: (event: ChangeEvent<HTMLInputElement>) => void;
  onBudgetedCostBlur: (event: FocusEvent<HTMLInputElement>) => void;
  onChangeMarkup: (event: ChangeEvent<HTMLInputElement>) => void;
  onMarkupBlur: (event: FocusEvent<HTMLInputElement>) => void;
}

const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  isEditing,
  startDateInput,
  endDateInput,
  eventDesc,
  eventHours,
  createLineItem,
  category,
  elementKey,
  elementId,
  quantity,
  unit,
  budgetedCost,
  markup,
  finalCost,
  descOptions,
  onRequestClose,
  onSubmit,
  onChangeStartDate,
  onChangeEndDate,
  onChangeDescription,
  onChangeHours,
  onToggleCreateLineItem,
  onChangeCategory,
  onChangeElementKey,
  onChangeElementId,
  onChangeQuantity,
  onChangeUnit,
  onChangeBudgetedCost,
  onBudgetedCostBlur,
  onChangeMarkup,
  onMarkupBlur,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel={isEditing ? "Edit Event" : "Add Event"}
      overlayClassName={styles.modalOverlay}
      className={styles.modalContent}
      bodyOpenClassName="ReactModal__Body--open"
    >
      <div className={styles.modalShell}>
        <header className={styles.header}>
          <div>
            <p className={styles.headerEyebrow}>{isEditing ? "Update timeline" : "New timeline event"}</p>
            <h3 className={styles.headerTitle}>{isEditing ? "Edit Event" : "Add Event"}</h3>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={(event) => onRequestClose(event)}
            aria-label="Close event modal"
          >
            <X aria-hidden className={styles.closeIcon} />
          </button>
        </header>

        <form onSubmit={onSubmit} className={styles.form}>
          <div className={styles.formBody}>
            <input
              type="date"
              placeholder="Start Date"
              value={startDateInput}
              onChange={onChangeStartDate}
              className="modal-input"
            />
            <input
              type="date"
              placeholder="End Date"
              value={endDateInput}
              onChange={onChangeEndDate}
              className="modal-input"
            />
            <input
              type="text"
              placeholder="Description"
              value={eventDesc}
              onChange={onChangeDescription}
              className="modal-input-description"
              list="event-desc-options"
            />

            <div className="unit-input-wrapper">
              <input
                type="text"
                placeholder="Hours"
                value={eventHours}
                onChange={onChangeHours}
                className="modal-input unit-input"
              />
              <span className="unit-suffix">Hrs</span>
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={createLineItem}
                onChange={onToggleCreateLineItem}
              />
              <span>Create budget line item</span>
            </label>

            {createLineItem && (
              <div className={styles.lineItemFields}>
                <select value={category} onChange={onChangeCategory} className="modal-input">
                  <option hidden value="" />
                  {CATEGORY_OPTIONS.map((c) => (
                    <option value={c} key={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Element Key"
                  value={elementKey}
                  onChange={onChangeElementKey}
                  className="modal-input"
                />

                <input
                  type="text"
                  placeholder="Element ID"
                  value={elementId}
                  onChange={onChangeElementId}
                  className="modal-input"
                />

                <div className="unit-input-wrapper">
                  <input
                    type="number"
                    placeholder={unit.toLowerCase().includes("hr") ? "Hours" : "Quantity"}
                    value={quantity}
                    onChange={onChangeQuantity}
                    className="modal-input unit-input"
                  />
                  {unit.toLowerCase().includes("hr") && <span className="unit-suffix">hrs</span>}
                </div>

                <select value={unit} onChange={onChangeUnit} className="modal-input">
                  <option hidden value="" />
                  {UNIT_OPTIONS.map((u) => (
                    <option value={u} key={u}>
                      {u}
                    </option>
                  ))}
                </select>

                <div className="currency-input-wrapper">
                  {budgetedCost && <span className="currency-prefix">$</span>}
                  <input
                    type="text"
                    placeholder="Budgeted Cost"
                    value={budgetedCost}
                    onChange={onChangeBudgetedCost}
                    onBlur={onBudgetedCostBlur}
                    className={`modal-input ${budgetedCost ? "currency-input" : ""}`}
                  />
                </div>

                <input
                  type="text"
                  placeholder="Markup %"
                  value={markup}
                  onChange={onChangeMarkup}
                  onBlur={onMarkupBlur}
                  className="modal-input"
                />

                <input
                  type="text"
                  placeholder="Final Cost"
                  value={finalCost}
                  readOnly
                  className="modal-input"
                />
              </div>
            )}
          </div>

          <datalist id="event-desc-options">
            {descOptions.map((option) => (
              <option value={option} key={option} />
            ))}
          </datalist>

          <div className={styles.footer}>
            <button className={`modal-submit-button ${styles.saveButton}`} type="submit">
              Save
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default EventModal;
