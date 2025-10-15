import React, { useState, useEffect, CSSProperties } from 'react';
import { getFileUrl } from '../utils/api';

interface OptimisticImageProps {
  tempUrl: string;
  finalUrl?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}

const OptimisticImage: React.FC<OptimisticImageProps> = ({
  tempUrl,
  finalUrl,
  alt,
  className = '',
  style = {},
}) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!finalUrl) return;
    const img = new Image();
    img.src = finalUrl;
    img.onload = () => setLoaded(true);
  }, [finalUrl]);

  return (
    <img
      src={loaded && finalUrl ? getFileUrl(finalUrl) : tempUrl}
      alt={alt}
      className={className}
      style={{
        maxWidth: '100%',
        maxHeight: '100px',
        objectFit: 'cover',
        opacity: loaded ? 1 : 0.7,
        transition: 'opacity 0.3s ease-in-out',
        ...style,
      }}
      loading="lazy"
    />
  );
};

export default OptimisticImage;










