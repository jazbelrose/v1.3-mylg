import React from 'react';
import './spinner.css';

interface SpinnerProps {
  className?: string;
  style?: React.CSSProperties;
}

const Spinner: React.FC<SpinnerProps> = ({ className = '', style = {} }) => (
  <div className={`spinner-container ${className}`} style={style}>
    <div className="spin" />
  </div>
);

export default Spinner;








