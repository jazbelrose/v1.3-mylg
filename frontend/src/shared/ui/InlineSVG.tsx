import React, { useRef, useEffect, useState } from "react";

export interface InlineSvgProps {
  src: string;
  className?: string;
  onReady?: (svg: SVGSVGElement | null) => void;
}

export default function InlineSvg({ src, className, onReady }: InlineSvgProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [markup, setMarkup] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(src, { cache: "force-cache" });
        const text = await res.text();
        const safe = text.replace(/<script[\s\S]*?<\/script>/gi, "");
        if (!alive) return;
        setMarkup(safe);
        queueMicrotask(() => {
          const svgEl = hostRef.current?.querySelector("svg");
          onReady?.(svgEl || null);
        });
      } catch {
        // optional: console.error(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [src, onReady]);

  return (
    <span
      ref={hostRef}
      className={className}
      style={{ display: "block", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: markup }}
      aria-hidden="true"
    />
  );
}










