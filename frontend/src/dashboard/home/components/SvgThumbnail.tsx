import React from 'react';
import { getSquirclePath } from '@/shared/ui/squircle/getSquirclePath';

interface SVGThumbnailProps {
  initial: string;
  className?: string;
  roundness?: number; // 0..1
}

const SVGThumbnail: React.FC<SVGThumbnailProps> = ({ initial, className, roundness = 1.0 }) => {
  const w = 236, h = 236;
  const r = Math.min(w, h) * 0.5 * roundness;
  const k = 0.55 + 0.45 * roundness;  // smoother mapping
  const squirclePath = React.useMemo(() => getSquirclePath(w, h, r, k), [w, h, r, k]);

  return (
    <svg className={className} width="250" height="250" viewBox="0 0 250 250">
      <path
        d={squirclePath}
        transform="translate(7 7)"
        style={{ fill: 'none', stroke: '#fff', strokeMiterlimit: 10, strokeWidth: '7px' }}
      />
      <text
        x={125}
        y={142}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fill: '#fff',
          fontFamily: "HelveticaNeueLT-Roman, 'HelveticaNeue LT 55 Roman', 'Helvetica'",
          fontSize: '180px',
        }}
      >
        {initial}
      </text>
    </svg>
  );
};


export default SVGThumbnail;









