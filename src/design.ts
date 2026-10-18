// The design system: a few theme values in, a complete, contrast-checked token set out.

import { contrast, ensureContrast, hex, mix, oklchToRgb, parseColor, rgbToOklch, type Lch } from './color.js';
import { SPACE, TEXT_SIZES, TONES } from './schema.js';

export interface ThemeInput {
  brand?: string;
  accent?: string;
  font?: string;
  heading?: string;
  mono?: string;
  fonts?: string;
  base?: string;
  radius?: string;
  density?: string;
  width?: string;
  dark?: string;
}

export interface ToneVars {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  surface: string;
  accent: string;
  onAccent: string;
}

export interface ContrastCheck {
  tone: string;
  pair: string;
  ratio: number;
}

export interface Design {
  vars: Record<string, string>; // --n-* scale tokens (without tone vars)
  tones: Record<string, ToneVars>;
  darkTones: Record<string, ToneVars> | null;
  accents: Record<string, { accent: string; onAccent: string }>;
  checks: ContrastCheck[];
  fontsUrl?: string;
  breakpoint: string; // min-width of "wide"
}

const VIEW_MIN = 375;
const VIEW_MAX = 1280;

/** clamp() that grows linearly from minPx at 375px to maxPx at 1280px viewport width. */
export function fluid(minPx: number, maxPx: number): string {
  const r = (px: number) => `${round(px / 16)}rem`;
  if (Math.abs(minPx - maxPx) < 0.01) return r(minPx);
  const slope = (maxPx - minPx) / (VIEW_MAX - VIEW_MIN);
  const intercept = minPx - slope * VIEW_MIN;
  return `clamp(${r(minPx)},${round(intercept / 16)}rem + ${round(slope * 100)}vw,${r(maxPx)})`;
}

function round(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace(/^0\./, '.').replace(/^-0\./, '-.');
}

const SPACE_PX: Record<string, [number, number]> = {
  '2xs': [2, 3],
  xs: [4, 6],
  s: [8, 12],
  m: [14, 20],
  l: [20, 30],
  xl: [28, 44],
  '2xl': [40, 72],
  '3xl': [56, 112],
};
const TEXT_STEP: Record<string, number> = { xs: -2, s: -1, m: 0, l: 1, xl: 2, '2xl': 3, '3xl': 4, '4xl': 5 };
const RADIUS: Record<string, number> = { none: 0, s: 4, m: 8, l: 12, xl: 16 };
const DENSITY: Record<string, number> = { compact: 0.75, normal: 1, airy: 1.3 };
const FALLBACK_SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

function fontStack(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const quoted = /[\s]/.test(name) ? `"${name}"` : name;
  return `${quoted},${fallback}`;
}

export function buildDesign(input: ThemeInput): Design {
  const vars: Record<string, string> = {};
  const density = DENSITY[input.density ?? 'normal'] ?? 1;
  for (const step of SPACE) {
    if (step === 'none') continue;
    const [a, b] = SPACE_PX[step];
    vars[`--n-s-${step}`] = fluid(a * density, b * density);
  }
  const baseMax = input.base ? parseFloat(input.base) * (input.base.endsWith('rem') ? 16 : 1) : 18;
  const baseMin = Math.max(14, baseMax * 0.9);
  for (const size of TEXT_SIZES) {
    const k = TEXT_STEP[size];
    vars[`--n-t-${size}`] = fluid(baseMin * 1.2 ** k, baseMax * 1.25 ** k);
  }
  vars['--n-gutter'] = fluid(16 * density, 32 * density);
  vars['--n-w-narrow'] = '40rem';
  vars['--n-w-text'] = '70ch';
  vars['--n-w-wide'] = input.width ?? '72rem';
  const r = RADIUS[input.radius ?? 'm'] ?? 8;
  vars['--n-r-s'] = `${r / 2}px`;
  vars['--n-r-m'] = `${r}px`;
  vars['--n-r-l'] = `${r * 1.5}px`;
  vars['--n-r-full'] = '999px';
  vars['--n-font'] = fontStack(input.font, FALLBACK_SANS);
  vars['--n-font-heading'] = input.heading ? fontStack(input.heading, FALLBACK_SANS) : 'var(--n-font)';
  vars['--n-font-mono'] = fontStack(input.mono, 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace');
  vars['--n-shadow-s'] = '0 1px 2px rgb(0 0 0/.07),0 1px 3px rgb(0 0 0/.06)';
  vars['--n-shadow-m'] = '0 4px 12px rgb(0 0 0/.08),0 2px 4px rgb(0 0 0/.05)';
  vars['--n-shadow-l'] = '0 16px 40px rgb(0 0 0/.14)';

  const checks: ContrastCheck[] = [];
  const brandRgb = parseColor(input.brand ?? '#2563eb') ?? parseColor('#2563eb')!;
  const accentRgb = parseColor(input.accent ?? '#f59e0b') ?? parseColor('#f59e0b')!;
  const brand = rgbToOklch(brandRgb);
  const hue = brand.h;
  const nc = Math.min(0.015, brand.c * 0.12);
  const neutral = (l: number): Lch => ({ l, c: nc, h: hue });
  const rgb = oklchToRgb;
  const hx = (c: Lch) => hex(rgb(c));

  const lightish = (bgL: number, surfaceL: number, name: string): ToneVars => {
    const bg = rgb(neutral(bgL));
    const fg = ensureContrast(neutral(0.22), bg, 7);
    const muted = ensureContrast(neutral(0.5), bg, 4.6);
    const accent = ensureContrast(brand, bg, 4.6);
    const onAccent = textOn(rgb(accent), hue);
    record(checks, name, bg, fg, muted, accent, onAccent);
    return {
      bg: hex(bg),
      fg: hx(fg),
      muted: hx(muted),
      line: hx(neutral(bgL - 0.08)),
      surface: hx(neutral(surfaceL)),
      accent: hx(accent),
      onAccent: hx(onAccent),
    };
  };
  const darkish = (bgL: number, surfaceL: number, name: string): ToneVars => {
    const bg = rgb(neutral(bgL));
    const fg = ensureContrast(neutral(0.96), bg, 7);
    const muted = ensureContrast(neutral(0.76), bg, 4.6);
    const accent = ensureContrast({ ...brand, l: Math.max(brand.l, 0.72) }, bg, 4.6);
    const onAccent = textOn(rgb(accent), hue);
    record(checks, name, bg, fg, muted, accent, onAccent);
    return {
      bg: hex(bg),
      fg: hx(fg),
      muted: hx(muted),
      line: hx(neutral(bgL + 0.12)),
      surface: hx(neutral(surfaceL)),
      accent: hx(accent),
      onAccent: hx(onAccent),
    };
  };
  const solid = (color: Lch, name: string): ToneVars => {
    const bg = rgb(color);
    const fg = textOn(bg, color.h);
    const fgRgb = rgb(fg);
    const muted = ensureContrast(rgbToOklch(mix(fgRgb, bg, 0.22)), bg, 4.6);
    const surfaceL = color.l > 0.6 ? color.l - 0.05 : color.l + 0.05;
    record(checks, name, bg, fg, muted, fg, color);
    return {
      bg: hex(bg),
      fg: hex(fgRgb),
      muted: hx(muted),
      line: hex(mix(bg, fgRgb, 0.28)),
      surface: hx({ ...color, l: surfaceL }),
      accent: hex(fgRgb),
      onAccent: hex(bg),
    };
  };

  const tones: Record<string, ToneVars> = {
    default: lightish(1, 1, 'default'),
    subtle: lightish(0.975, 1, 'subtle'),
    inverse: darkish(0.21, 0.26, 'inverse'),
    primary: solid(solidBase(brand), 'primary'),
    accent: solid(solidBase(rgbToOklch(accentRgb)), 'accent'),
    danger: solid({ l: 0.55, c: 0.2, h: 27 }, 'danger'),
    success: solid({ l: 0.52, c: 0.13, h: 150 }, 'success'),
    warning: solid({ l: 0.8, c: 0.15, h: 80 }, 'warning'),
  };
  const darkTones =
    input.dark === 'auto'
      ? { default: darkish(0.17, 0.21, 'default (dark)'), subtle: darkish(0.2, 0.24, 'subtle (dark)') }
      : null;

  const accents: Design['accents'] = {};
  for (const t of TONES) {
    const tv = tones[t];
    if (t === 'default') accents[t] = { accent: tones.inverse.bg, onAccent: tones.inverse.fg };
    else if (t === 'subtle') accents[t] = { accent: tones.subtle.line, onAccent: tones.default.fg };
    else if (t === 'inverse') accents[t] = { accent: tones.inverse.bg, onAccent: tones.inverse.fg };
    else accents[t] = { accent: tv.bg, onAccent: tv.fg };
  }

  return {
    vars,
    tones,
    darkTones,
    accents,
    checks,
    fontsUrl: input.fonts,
    breakpoint: '48rem',
  };
}

/** A strong, saturated base for solid tones that still allows readable text. */
function solidBase(c: Lch): Lch {
  return { ...c, l: Math.min(0.75, Math.max(0.45, c.l)) };
}

/** Near-white or near-black text, whichever reads better on bg (≥ 4.5:1 guaranteed). */
function textOn(bg: [number, number, number], hue: number): Lch {
  const light: Lch = { l: 0.985, c: 0.01, h: hue };
  const dark: Lch = { l: 0.2, c: 0.02, h: hue };
  const cl = contrast(oklchToRgb(light), bg);
  const cd = contrast(oklchToRgb(dark), bg);
  const pick = cl >= cd ? light : dark;
  return ensureContrast(pick, bg, 4.6);
}

function record(
  checks: ContrastCheck[],
  tone: string,
  bg: [number, number, number],
  fg: Lch,
  muted: Lch,
  accent: Lch,
  onAccent: Lch,
): void {
  checks.push(
    { tone, pair: 'text', ratio: contrast(oklchToRgb(fg), bg) },
    { tone, pair: 'muted text', ratio: contrast(oklchToRgb(muted), bg) },
    { tone, pair: 'links/buttons', ratio: contrast(oklchToRgb(accent), bg) },
    { tone, pair: 'button text', ratio: contrast(oklchToRgb(onAccent), oklchToRgb(accent)) },
  );
}

export function toneCss(v: ToneVars): string {
  return `--n-bg:${v.bg};--n-fg:${v.fg};--n-muted:${v.muted};--n-line:${v.line};--n-surface:${v.surface};--n-accent:${v.accent};--n-on-accent:${v.onAccent}`;
}
