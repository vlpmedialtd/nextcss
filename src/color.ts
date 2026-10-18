// Minimal color math: sRGB <-> OKLab/OKLCH, gamut mapping, WCAG 2 contrast.

export interface Lch {
  l: number; // 0..1
  c: number; // 0..~0.37
  h: number; // degrees
}
type Rgb = [number, number, number]; // 0..1, gamma encoded

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch([r0, g0, b0]: Rgb): Lch {
  const r = toLinear(r0);
  const g = toLinear(g0);
  const b = toLinear(b0);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function oklchToLinear({ l: L, c, h }: Lch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → sRGB, reducing chroma until the color fits. */
export function oklchToRgb(c: Lch): Rgb {
  const lch = { ...c, l: Math.min(1, Math.max(0, c.l)) };
  let lin = oklchToLinear(lch);
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = lch.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...lch, c: mid }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ ...lch, c: lo });
  }
  return lin.map((v) => toGamma(Math.min(1, Math.max(0, v)))) as Rgb;
}

export function hex(rgb: Rgb): string {
  const h = rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  // short form when possible
  if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) return `#${h[0]}${h[2]}${h[4]}`;
  return `#${h}`;
}

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const v = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as Rgb;
  }
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => Math.min(255, +x) / 255) as Rgb;
  m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(s);
  if (m) {
    const l = m[2] ? +m[1] / 100 : +m[1];
    return oklchToRgb({ l, c: +m[3], h: +m[4] });
  }
  return null;
}

export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Move fg lightness away from bg until the contrast reaches `min`. */
export function ensureContrast(fg: Lch, bg: Rgb, min: number): Lch {
  const bgIsLight = luminance(bg) > 0.18;
  let cur = { ...fg };
  for (let i = 0; i < 100 && contrast(oklchToRgb(cur), bg) < min; i++) {
    cur = { ...cur, l: cur.l + (bgIsLight ? -0.01 : 0.01) };
    if (cur.l <= 0 || cur.l >= 1) break;
  }
  return cur;
}

/** Mix two colors in OKLab space (t = weight of b). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const A = rgbToOklch(a);
  const B = rgbToOklch(b);
  const toLab = (x: Lch) => [x.l, x.c * Math.cos((x.h * Math.PI) / 180), x.c * Math.sin((x.h * Math.PI) / 180)];
  const la = toLab(A);
  const lb = toLab(B);
  const m = la.map((v, i) => v * (1 - t) + lb[i] * t);
  const c = Math.hypot(m[1], m[2]);
  let h = (Math.atan2(m[2], m[1]) * 180) / Math.PI;
  if (h < 0) h += 360;
  return oklchToRgb({ l: m[0], c, h });
}
