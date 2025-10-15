// Deterministically generate a hex color based on an identifier.
// Uses hashing to keep the same color for a given ID across renders.
export function getColor(identifier: string | number): string {
  const idStr = String(identifier);
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Convert hash to an HSL hue to ensure vibrant, visually distinct colors
  const hue = Math.abs(hash) % 360;
  const saturation = 70; // consistent saturation
  const lightness = 50; // consistent lightness
  return hslToHex(hue, saturation, lightness);
}

// Helper to convert HSL color values to hex format
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
  } else if (h >= 120 && h < 180) {
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (v: number): string => {
    const hex = Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
    return hex.toUpperCase();
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Convert a hex color value (with optional alpha) to an rgba string
export function hexToRgba(hex: string): string {
  if (!hex) return '';
  let v = hex.replace('#', '');
  if (v.length === 3) {
    v = v
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  let a = 1;
  if (v.length === 8) {
    a = parseInt(v.slice(6, 8), 16) / 255;
  }
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

// Convert a hex color to HSL components
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let v = hex.replace('#', '');
  if (v.length === 3) {
    v = v
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Generate a sequential camaieu palette from a base color
export function generateSequentialPalette(base: string, count: number): string[] {
  const { h, s, l } = hexToHsl(base);
  const start = Math.min(95, l + 25);
  const end = Math.max(25, l - 25);
  const step = (start - end) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) =>
    hslToHex(h, s, start - i * step)
  );
}

// Shared categorical palette for all charts. Colors follow Tableau 20
// to provide clear differentiation between many categories.
export const CHART_COLORS = [
  '#4e79a7', // blue
  '#f28e2b', // orange
  '#e15759', // red
  '#76b7b2', // teal
  '#59a14f', // green
  '#edc949', // yellow
  '#af7aa1', // purple
  '#ff9da7', // pink
  '#9c755f', // brown
  '#bab0ab', // gray
  '#1f77b4', // deep blue
  '#ff7f0e', // bright orange
  '#2ca02c', // forest green
  '#d62728', // bold red
  '#9467bd', // violet
  '#8c564b', // dark brown
  '#e377c2', // magenta
  '#7f7f7f', // mid gray
  '#bcbd22', // chartreuse
  '#17becf', // cyan
  '#393b79', // navy
  '#637939', // olive
  '#8c6d31', // mustard
  '#843c39', // maroon
  '#7b4173', // plum
];








