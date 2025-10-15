import React from 'react';

import { getSquirclePath, type SquircleCornerRadii } from './squircle/getSquirclePath';

const hasWindow = typeof window !== 'undefined';
const hasResizeObserver = hasWindow && 'ResizeObserver' in window;

let cachedMaskSupport: boolean | null = null;
const supportsMask = (): boolean => {
  if (cachedMaskSupport !== null) {
    return cachedMaskSupport;
  }

  if (!hasWindow || typeof document === 'undefined') {
    cachedMaskSupport = false;
    return cachedMaskSupport;
  }

  const style = document.createElement('div').style as CSSStyleDeclaration & {
    webkitMaskImage?: string;
  };
  cachedMaskSupport =
    typeof style.maskImage !== 'undefined' || typeof style.webkitMaskImage !== 'undefined';
  return cachedMaskSupport;
};

const useIsomorphicLayoutEffect = hasWindow ? React.useLayoutEffect : React.useEffect;

type ElementType = React.ElementType;

export type SquircleProps<T extends React.ElementType = 'div'> = {
  as?: T;
  radius?: number;
  roundness?: number;
  smoothing?: number;
  cornerRadii?: SquircleCornerRadii;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'style' | 'className'>;

type ElementRef<T extends React.ElementType> = React.ComponentPropsWithRef<T> extends {
  ref?: React.Ref<infer R>;
}
  ? R
  : never;

function encodeSvg(svg: string): string {
  return encodeURIComponent(svg)
    .replace(/%0A/g, '')
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')
    .replace(/%22/g, "'");
}

const defaultGetRect = (node: Element) => node.getBoundingClientRect();

const SquircleInner = <T extends React.ElementType = 'div'>(
  {
    as,
    radius = 20,
    roundness,
    smoothing = 0.6,
    cornerRadii,
    className,
    style,
    children,
    ...rest
  }: SquircleProps<T>,
  forwardedRef: React.ForwardedRef<ElementRef<T>>,
): React.ReactElement | null => {
  const Component = (as ?? 'div') as ElementType;
  const localRef = React.useRef<Element | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [prefersReducedTransparency, setPrefersReducedTransparency] = React.useState<boolean>(() => {
    if (!hasWindow || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  });

  const combinedRef = React.useCallback(
    (node: Element | null) => {
      localRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node as ElementRef<T> | null);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<ElementRef<T> | null>).current = node as ElementRef<T> | null;
      }
    },
    [forwardedRef],
  );

  useIsomorphicLayoutEffect(() => {
    const node = localRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      const { width, height } = defaultGetRect(node);
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    updateSize();

    if (!hasResizeObserver) {
      if (hasWindow) {
        window.addEventListener('resize', updateSize);
        return () => {
          window.removeEventListener('resize', updateSize);
        };
      }

      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== node) {
          continue;
        }

        const boxSize = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize;
        const width = boxSize ? boxSize.inlineSize : entry.contentRect.width;
        const height = boxSize ? boxSize.blockSize : entry.contentRect.height;
        setSize((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height },
        );
      }
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (!hasWindow || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const listener = (event: MediaQueryListEvent) => {
      setPrefersReducedTransparency(event.matches);
    };

    if ('addEventListener' in mediaQuery) {
      (mediaQuery as MediaQueryList).addEventListener('change', listener);
    } else {
      (mediaQuery as MediaQueryList & { addListener: (listener: (event: MediaQueryListEvent) => void) => void }).addListener(listener);
    }

    return () => {
      if ('removeEventListener' in mediaQuery) {
        (mediaQuery as MediaQueryList).removeEventListener('change', listener);
      } else {
        (mediaQuery as MediaQueryList & { removeListener: (listener: (event: MediaQueryListEvent) => void) => void }).removeListener(listener);
      }
    };
  }, []);

  const maskReady = supportsMask() && !prefersReducedTransparency;
  const canMask = maskReady && size.width > 0 && size.height > 0;

  const resolvedRadius = React.useMemo(() => {
    if (
      typeof roundness === 'number' &&
      Number.isFinite(roundness) &&
      size.width > 0 &&
      size.height > 0
    ) {
      const clamped = Math.max(0, Math.min(roundness, 1));
      const maxRadius = Math.min(size.width, size.height) / 2;
      return maxRadius * clamped;
    }
    return radius;
  }, [radius, roundness, size.height, size.width]);

  const maskValue = React.useMemo(() => {
    if (!canMask) {
      return null;
    }

    const path = getSquirclePath(size.width, size.height, resolvedRadius, smoothing, cornerRadii);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><path fill="white" d="${path}" /></svg>`;
    const dataUrl = `url("data:image/svg+xml,${encodeSvg(svg)}")`;
    return dataUrl;
  }, [canMask, cornerRadii, resolvedRadius, size.height, size.width, smoothing]);

  const fallbackBorderRadius = React.useMemo(() => {
    if (!cornerRadii) {
      return resolvedRadius;
    }

    const pickCorner = (specific?: number, shared?: number): number => {
      if (typeof specific === 'number' && Number.isFinite(specific)) {
        return specific;
      }
      if (typeof shared === 'number' && Number.isFinite(shared)) {
        return shared;
      }
      return resolvedRadius;
    };

    const topLeft = pickCorner(cornerRadii.topLeft, cornerRadii.top);
    const topRight = pickCorner(cornerRadii.topRight, cornerRadii.top);
    const bottomRight = pickCorner(cornerRadii.bottomRight, cornerRadii.bottom);
    const bottomLeft = pickCorner(cornerRadii.bottomLeft, cornerRadii.bottom);

    const values = [topLeft, topRight, bottomRight, bottomLeft];
    const [first, ...restValues] = values;
    const allEqual = restValues.every((value) => Math.abs(value - first) < 0.001);

    if (allEqual) {
      return first;
    }

    const formatCssNumber = (value: number) => {
      const safe = Math.max(0, value);
      return `${Number.parseFloat(safe.toFixed(2))}px`;
    };

    return values.map(formatCssNumber).join(' ');
  }, [cornerRadii, resolvedRadius]);

  const mergedStyle = React.useMemo(() => {
    const next: React.CSSProperties = {
      borderRadius: canMask ? 0 : fallbackBorderRadius,
      ...(style ?? {}),
    };

    if (canMask && maskValue) {
      next.WebkitMaskImage = maskValue;
      next.maskImage = maskValue;
      next.WebkitMaskRepeat = 'no-repeat';
      next.maskRepeat = 'no-repeat';
      next.WebkitMaskSize = '100% 100%';
      next.maskSize = '100% 100%';
    } else if (next.overflow === undefined) {
      next.overflow = 'hidden';
    }

    return next;
  }, [canMask, fallbackBorderRadius, maskValue, style]);

  if (Component === React.Fragment) {
    console.warn('Squircle cannot render as a React.Fragment. Falling back to a div.');
    return React.createElement(
      'div',
      {
        ...rest,
        ref: combinedRef as React.Ref<HTMLDivElement>,
        className,
        style: mergedStyle,
      },
      children,
    );
  }

  return React.createElement(
    Component,
    {
      ...rest,
      ref: combinedRef,
      className,
      style: mergedStyle,
    },
    children,
  );
};

const Squircle = React.forwardRef(SquircleInner) as <
  T extends React.ElementType = 'div',
>(
  props: SquircleProps<T> & { ref?: React.Ref<ElementRef<T>> },
) => React.ReactElement | null;

export default Squircle;









