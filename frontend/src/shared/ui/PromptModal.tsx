import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';

import '@/dashboard/home/pages/dashboard-styles.css';
import useModalStack from '../utils/useModalStack';

if (typeof document !== 'undefined') {
  const el = document.getElementById('root');
  if (el) Modal.setAppElement(el);
}

export interface PromptModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  onSubmit: (value: string) => void;
  message?: string;
  defaultValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  className?: string;
  overlayClassName?: string;
}

const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onRequestClose,
  onSubmit,
  message = 'Enter text',
  defaultValue = '',
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  className,
  overlayClassName,
}) => {
  useModalStack(isOpen);

  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Prompt"
      className={className}
      overlayClassName={overlayClassName}
      shouldCloseOnOverlayClick={false}
    >
      <div style={{ textAlign: 'center' }}>
        <p>{message}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="modal-input"
          style={{ marginTop: '10px', width: '100%' }}
        />
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
            onClick={() => onSubmit(value)}
          >
            {submitLabel}
          </button>
          <button className="modal-button secondary" onClick={onRequestClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PromptModal;













