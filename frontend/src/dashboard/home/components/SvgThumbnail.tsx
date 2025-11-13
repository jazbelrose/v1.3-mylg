import React from 'react';
import { getSquirclePath } from '@/shared/ui/squircle/getSquirclePath';

interface SVGThumbnailProps {
  initial: string;
  className?: string;
  roundness?: number; // 0..1
  size?: number; // size in pixels, default 250
}

const SVGThumbnail: React.FC<SVGThumbnailProps> = ({ initial, className, roundness = 1.0, size = 250 }) => {
  const w = size * 0.944, h = size * 0.944; // 236/250 ≈ 0.944
  const r = Math.min(w, h) * 0.5 * roundness;
  const k = 0.55 + 0.45 * roundness;  // smoother mapping
  const squirclePath = React.useMemo(() => getSquirclePath(w, h, r, k), [w, h, r, k]);

  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path
        d={squirclePath}
        transform={`translate(${size * 0.028} ${size * 0.028})`} // 7/250 ≈ 0.028
        style={{ fill: 'none', stroke: '#fff', strokeMiterlimit: 10, strokeWidth: `${size * 0.028}px` }} // 7/250 ≈ 0.028
      />
      <text
        x={size / 2}
        y={size * 0.568} // 142/250 ≈ 0.568
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fill: '#fff',
          fontFamily: "HelveticaNeueLT-Roman, 'HelveticaNeue LT 55 Roman', 'Helvetica'",
          fontSize: `${size * 0.72}px`, // 180/250 ≈ 0.72
        }}
      >
        {initial}
      </text>
    </svg>
  );
};


export default SVGThumbnail;









