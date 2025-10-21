import React from 'react';

interface EditableTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}

const EditableTextField: React.FC<EditableTextFieldProps> = ({
  id,
  label,
  value,
  onChange,
  type = 'text',
}) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    <input
      type={type}
      id={id}
      className="modal-input settings"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  </div>
);

export default EditableTextField;










