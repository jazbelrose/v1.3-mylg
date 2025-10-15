import React, { useEffect, useRef, useState } from 'react';
import { HexAlphaColorPicker, HexColorInput } from 'react-colorful';

import { hexToRgba } from '../utils/colorUtils';
import './color-picker.css';

export interface ColorPickerProps {
  color?: string;
  onChange?: (e: { target: { value: string } }) => void;
  title?: string;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  color = '',
  onChange,
  title,
}) => {
  const [internalColor, setInternalColor] = useState(color || '');
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInternalColor(color || '');
  }, [color]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (newColor: string) => {
    setInternalColor(newColor);
    onChange?.({ target: { value: newColor } });
  };

  const handleNoColor = () => {
    handleChange('');
  };

  return (
    <div className="color-picker" ref={pickerRef}>
      <button
        type="button"
        className="color-input"
        style={{ backgroundColor: internalColor || 'transparent' }}
        title={title}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="color-popover">
          <HexAlphaColorPicker color={internalColor} onChange={handleChange} />
          <HexColorInput
            color={internalColor}
            onChange={handleChange}
            prefixed
            alpha
            className="hex-input"
          />
          <button type="button" className="no-color" onClick={handleNoColor}>
            No Color
          </button>
          <div className="color-values">
            <div>{internalColor || 'transparent'}</div>
            {internalColor && <div>{hexToRgba(internalColor)}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;










