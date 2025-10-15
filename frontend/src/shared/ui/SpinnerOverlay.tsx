import React from 'react';
import Spinner from './Spinner';
import './spinner-overlay.css';

interface SpinnerOverlayProps {
  className?: string;
  style?: React.CSSProperties;
  spinnerStyle?: React.CSSProperties;
}

const SpinnerOverlay: React.FC<SpinnerOverlayProps> = ({
  className = '',
  style = {},
  spinnerStyle = {},
}) => (
  <div className={`spinner-overlay ${className}`} style={style}>
    <Spinner style={{ position: 'static', ...spinnerStyle }} />
  </div>
);

export default SpinnerOverlay;








