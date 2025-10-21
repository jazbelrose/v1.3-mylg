import React from "react";

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
  type = "text",
}) => (
  <div className="account-field">
    <label htmlFor={id} className="account-field__label">
      {label}
    </label>
    <input
      type={type}
      id={id}
      aria-label={label}
      className="account-settings-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export default EditableTextField;










