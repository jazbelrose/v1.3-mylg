import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';

import '@/dashboard/home/pages/dashboard-styles.css';
import useModalStack from '@/shared/utils/useModalStack';

type ClassState = {
  base: string;
  afterOpen: string;
  beforeClose: string;
};

export interface ConfirmModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  onConfirm: () => void;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmText?: string;
  className?: string | ClassState;
  overlayClassName?: string | ClassState;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onRequestClose,
  onConfirm,
  message = 'Are you sure?',
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  confirmText = '',
  className,
  overlayClassName,
}) => {
  useModalStack(isOpen);

  const [text, setText] = useState('');

  useEffect(() => {
    if (isOpen) setText('');
  }, [isOpen, confirmText]);

  const canConfirm = confirmText ? text === confirmText : true;

  const mismatch = confirmText && text !== '' && text !== confirmText;

  return (
    // @ts-expect-error react-modal types are incorrect for className
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Confirmation"
      className={className}
      overlayClassName={overlayClassName}
      shouldCloseOnOverlayClick={false}
    >
      <div style={{ textAlign: 'center' }}>
        <p>{message}</p>
        {confirmText && (
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Type "${confirmText}" to confirm`}
            className="modal-input"
            style={{ marginTop: '10px', width: '100%' }}
            aria-invalid={mismatch}
          />
        )}
        {mismatch && (
          <p
            role="alert"
            style={{ color: 'red', marginTop: '8px' }}
          >
            Confirmation text does not match.
          </p>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            marginTop: '20px',
          }}
        >
          <button
            className="modal-button primary"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </button>
          <button className="modal-button secondary" onClick={onRequestClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;













