// CSS for roles and modifiers. Every class is generated once and only when used.
// "&" in a rule stands for the class selector.

import { toneCss, type Design } from './design.js';

const BAND_PAD = 'padding-inline:max(var(--n-gutter),(100% - var(--n-cw,var(--n-w-wide)))/2)';

export const ROLE_CSS: Record<string, string> = {
  header:
    '&{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--n-s-s) var(--n-s-l);' +
    `padding-block:var(--n-s-s);${BAND_PAD};border-block-end:1px solid var(--n-line)}`,
  nav: '&{display:flex;flex-wrap:wrap;align-items:center;gap:var(--n-s-xs) var(--n-s-m)}',
  footer:
    `&{display:flex;flex-direction:column;gap:var(--n-s-s);padding-block:var(--n-s-xl);${BAND_PAD};` +
    'border-block-start:1px solid var(--n-line);font-size:var(--n-t-s);color:var(--n-muted)}',
  aside: '&{display:flex;flex-direction:column;gap:var(--n-s-m)}',
  section: `&{display:flex;flex-direction:column;gap:var(--n-s-l);padding-block:var(--n-s-2xl);${BAND_PAD}}`,
  hero:
    '&{display:flex;flex-direction:column;justify-content:center;gap:var(--n-s-m);min-block-size:min(80vh,42rem);' +
    `padding-block:var(--n-s-3xl);${BAND_PAD}}`,
  stack: '&{display:flex;flex-direction:column;gap:var(--n-s-m)}',
  row: '&{display:flex;flex-wrap:wrap;align-items:center;gap:var(--n-s-m)}',
  bar: '&{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--n-s-m)}',
  split: '&{display:flex;flex-wrap:wrap;gap:var(--n-s-xl)}&>*{flex-grow:1;flex-basis:calc((var(--n-at,40rem) - 100%)*999)}',
  grid:
    '&{display:grid;--n-gap:var(--n-s-l);gap:var(--n-gap);' +
    'grid-template-columns:repeat(auto-fit,minmax(min(var(--n-min,16rem),100%),1fr))}',
  center: '&{display:flex;flex-direction:column;gap:var(--n-s-m);margin-inline:auto;inline-size:100%;max-inline-size:var(--n-cw,var(--n-w-wide))}',
  cover: '&{display:flex;flex-direction:column;justify-content:center;gap:var(--n-s-m);min-block-size:min(80vh,42rem)}',
  layer: '&{display:grid}&>*{grid-area:1/1}',
  sidebar:
    '&{display:flex;flex-wrap:wrap;gap:var(--n-s-l)}&>:first-child{flex-basis:var(--n-side,16rem);flex-grow:1}' +
    '&>:last-child{flex-basis:0;flex-grow:999;min-inline-size:55%}',
  title: '&{font-family:var(--n-font-heading);font-weight:700;line-height:1.15;letter-spacing:-.015em;text-wrap:balance}',
  text: '&{max-inline-size:70ch;text-wrap:pretty}',
  prose:
    '&{max-inline-size:70ch}&>*+*{margin-block-start:1em}' +
    '&>:is(h1,h2,h3,h4,h5,h6){font-family:var(--n-font-heading);line-height:1.2;text-wrap:balance;margin-block-start:1.6em}' +
    '&>:is(h1,h2,h3,h4,h5,h6)+*{margin-block-start:.6em}&>:first-child{margin-block-start:0}' +
    '& :is(ul,ol){padding-inline-start:1.25em}& li+li{margin-block-start:.3em}' +
    '& blockquote{border-inline-start:3px solid var(--n-line);padding-inline-start:1em;color:var(--n-muted)}' +
    '& pre{font-family:var(--n-font-mono);font-size:var(--n-t-s);background:color-mix(in oklab,var(--n-fg) 6%,var(--n-bg));padding:var(--n-s-m);border-radius:var(--n-r-m);overflow-x:auto}& pre code{font:inherit}' +
    '& :not(pre)>code{font-family:var(--n-font-mono);font-size:.9em;background:color-mix(in oklab,var(--n-fg) 7%,var(--n-bg));padding:.1em .3em;border-radius:var(--n-r-s)}' +
    '& hr{border:0;border-block-start:1px solid var(--n-line)}& img{border-radius:var(--n-r-m)}' +
    '& table{border-collapse:collapse;inline-size:100%}& :is(th,td){padding:.4em .6em;border-block-end:1px solid var(--n-line);text-align:start}',
  list: '&{display:flex;flex-direction:column;gap:var(--n-s-xs);padding-inline-start:1.25em}',
  quote:
    '&{display:flex;flex-direction:column;gap:var(--n-s-xs);border-inline-start:4px solid var(--n-accent);padding-inline-start:var(--n-s-m)}' +
    '&>blockquote{font-size:var(--n-t-l);text-wrap:pretty}&>figcaption{font-size:var(--n-t-s);color:var(--n-muted)}',
  code:
    '&{font-family:var(--n-font-mono);font-size:var(--n-t-s);line-height:1.55;background:color-mix(in oklab,var(--n-fg) 6%,var(--n-bg));' +
    'padding:var(--n-s-m);border-radius:var(--n-r-m);overflow-x:auto;tab-size:2}&>code{font:inherit}',
  image: '&{display:block;max-inline-size:100%;height:auto}',
  figure: '&{display:flex;flex-direction:column;gap:var(--n-s-xs)}&>figcaption{font-size:var(--n-t-s);color:var(--n-muted)}',
  video: '&{display:block;inline-size:100%;height:auto}',
  icon: '&{display:inline-flex;inline-size:1.25em;block-size:1.25em;flex:none;vertical-align:-.25em}&>svg{inline-size:100%;block-size:100%}',
  divider: '&{border:0;border-block-start:1px solid var(--n-line);margin:0;inline-size:100%}',
  table:
    '&{overflow-x:auto}&>table{border-collapse:collapse;inline-size:100%;font-size:var(--n-t-s)}' +
    '& :is(th,td){padding:var(--n-s-xs) var(--n-s-s);border-block-end:1px solid var(--n-line);text-align:start;vertical-align:top}' +
    '& th{font-weight:600}& caption{text-align:start;font-weight:600;padding-block-end:var(--n-s-xs)}',
  card:
    '&{display:flex;flex-direction:column;gap:var(--n-s-s);padding:var(--n-s-l);background:var(--n-surface);color:var(--n-fg);' +
    'border:1px solid var(--n-line);border-radius:var(--n-r-l)}&>.n-button:last-child{margin-block-start:auto}',
  badge:
    '&{display:inline-block;inline-size:fit-content;padding:.2em .65em;border-radius:var(--n-r-full);font-size:var(--n-t-xs);font-weight:600;line-height:1.3;' +
    'background:color-mix(in oklab,var(--n-accent) 14%,var(--n-bg));color:color-mix(in oklab,var(--n-accent) 75%,var(--n-fg))}',
  alert:
    '&{display:flex;flex-direction:column;gap:var(--n-s-xs);padding:var(--n-s-m);border-radius:var(--n-r-m);border-inline-start:4px solid var(--n-accent);' +
    'background:color-mix(in oklab,var(--n-accent) 10%,var(--n-bg))}',
  link: '&{color:var(--n-accent);text-decoration-thickness:.08em;text-underline-offset:.2em}&:hover{text-decoration-thickness:.16em}',
  button:
    '&{display:inline-flex;align-items:center;justify-content:center;gap:.5em;inline-size:fit-content;padding:.65em 1.2em;' +
    'border:2px solid var(--n-accent);border-radius:var(--n-r-m);background:var(--n-accent);color:var(--n-on-accent);' +
    'font:inherit;font-weight:600;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer;' +
    'transition:background-color .15s,border-color .15s,color .15s}' +
    '&:hover{background:color-mix(in oklab,var(--n-accent) 82%,var(--n-fg));border-color:color-mix(in oklab,var(--n-accent) 82%,var(--n-fg))}',
  fold:
    '&{border-block-end:1px solid var(--n-line)}' +
    '&>summary{display:flex;justify-content:space-between;align-items:center;gap:var(--n-s-s);padding-block:var(--n-s-s);cursor:pointer;font-weight:600;list-style:none}' +
    '&>summary::-webkit-details-marker{display:none}' +
    '&>summary::after{content:"+";font-size:1.5em;line-height:1;color:var(--n-accent);transition:rotate .2s}&[open]>summary::after{rotate:45deg}' +
    '&>div{display:flex;flex-direction:column;gap:var(--n-s-s);padding-block-end:var(--n-s-m)}',
  accordion: '&{display:flex;flex-direction:column}',
  menu:
    '&{padding:var(--n-s-s);border:1px solid var(--n-line);border-radius:var(--n-r-m);background:var(--n-surface);color:var(--n-fg);' +
    'box-shadow:var(--n-shadow-l);min-inline-size:12rem}&:popover-open{display:flex;flex-direction:column;gap:var(--n-s-xs)}',
  dialog:
    '&{border:0;padding:var(--n-s-l);border-radius:var(--n-r-l);background:var(--n-surface);color:var(--n-fg);box-shadow:var(--n-shadow-l);' +
    'inline-size:min(32rem,calc(100% - 2*var(--n-gutter)))}&[open]{display:flex;flex-direction:column;gap:var(--n-s-m)}' +
    '&::backdrop{background:rgb(0 0 0/.5)}',
  form: '&{display:flex;flex-direction:column;gap:var(--n-s-m)}',
  field:
    '&{display:flex;flex-direction:column;gap:var(--n-s-2xs)}&>span{font-weight:600;font-size:var(--n-t-s)}' +
    '&>small{font-size:var(--n-t-xs);color:var(--n-muted)}' +
    '& :is(input,select,textarea){font:inherit;padding:.6em .75em;border:1px solid color-mix(in oklab,var(--n-fg) 50%,var(--n-bg));' +
    'border-radius:var(--n-r-m);background:var(--n-bg);color:var(--n-fg);inline-size:100%}' +
    '& textarea{min-block-size:8em;resize:vertical}' +
    '& :is(input,select,textarea):focus-visible{outline:2px solid var(--n-accent);outline-offset:1px;border-color:var(--n-accent)}',
  check:
    '&{display:flex;align-items:flex-start;gap:var(--n-s-xs);cursor:pointer}' +
    '&>input{accent-color:var(--n-accent);inline-size:1.1em;block-size:1.1em;margin:.25em 0 0;flex:none}' +
    '&>input[role=switch]{appearance:none;inline-size:2.3em;block-size:1.3em;border-radius:999px;background:color-mix(in oklab,var(--n-fg) 35%,var(--n-bg));position:relative;transition:background-color .2s;margin-block-start:.15em}' +
    '&>input[role=switch]::before{content:"";position:absolute;inset:.15em auto .15em .15em;aspect-ratio:1;border-radius:50%;background:#fff;transition:translate .2s}' +
    '&>input[role=switch]:checked{background:var(--n-accent)}&>input[role=switch]:checked::before{translate:1em 0}',
};

/** Roles whose content column is centered with padding (full-bleed background). */
export const BAND_ROLES = new Set(['section', 'hero', 'header', 'footer']);
/** Roles laid out as a flex column (for align/valign). */
const COLUMN_ROLES = new Set(['section', 'hero', 'footer', 'aside', 'stack', 'card', 'center', 'cover', 'form', 'dialog', 'menu', 'alert']);
const ROW_ROLES = new Set(['row', 'nav', 'header', 'bar', 'split']);
const ACCENT_ROLES = new Set(['button', 'badge', 'alert', 'link']);

const ALIGN_FLEX: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const ALIGN_TEXT: Record<string, string> = { start: 'start', center: 'center', end: 'end' };
const HEIGHT: Record<string, string> = { auto: 'auto', half: '50vh', tall: 'min(80vh,42rem)', screen: '100svh' };
const WEIGHT: Record<string, string> = { normal: '400', medium: '500', bold: '700' };

export interface Rule {
  cls: string;
  css: string; // with "&"
}

/** Class name safe version of a free value. */
export function slug(v: string): string {
  if (v.length <= 20 && /^[a-z0-9./-]+$/i.test(v)) return v.toLowerCase().replace(/[./]/g, '_');
  return hash(v);
}

export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** CSS for one key on one role. null = no CSS (structural key). */
export function modifier(role: string, key: string, v: string, design: Design): Rule | null {
  const space = (s: string) => (s === 'none' ? '0' : `var(--n-s-${s})`);
  switch (key) {
    case 'gap':
      return { cls: `n-gap-${v}`, css: `&{gap:${space(v)};--n-gap:${space(v)}}` };
    case 'pad':
      if (BAND_ROLES.has(role)) return { cls: `n-padb-${v}`, css: `&{padding-block:${space(v)}}` };
      return { cls: `n-pad-${v}`, css: `&{padding:${space(v)}}` };
    case 'tone': {
      if (ACCENT_ROLES.has(role)) {
        const a = design.accents[v];
        return { cls: `n-accent-${v}`, css: `&{--n-accent:${a.accent};--n-on-accent:${a.onAccent}}` };
      }
      return { cls: `n-tone-${v}`, css: `&{${toneCss(design.tones[v])};background:var(--n-bg);color:var(--n-fg)}` };
    }
    case 'surface': {
      const css: Record<string, string> = {
        flat: 'background:transparent;border-color:transparent;box-shadow:none',
        raised: 'background:var(--n-surface);border-color:transparent;box-shadow:var(--n-shadow-m)',
        outline: 'border:1px solid var(--n-line);box-shadow:none',
        sunken: 'background:color-mix(in oklab,var(--n-fg) 5%,var(--n-bg));border-color:transparent;box-shadow:none',
      };
      return { cls: `n-surface-${v}`, css: `&{${css[v]}}` };
    }
    case 'radius':
      return { cls: `n-radius-${v}`, css: `&{border-radius:${v === 'none' ? '0' : `var(--n-r-${v})`}}` };
    case 'width': {
      const val = v === 'full' ? '100%' : ['narrow', 'text', 'wide'].includes(v) ? `var(--n-w-${v})` : v;
      if (role === 'image') return { cls: `n-w-${slug(v)}`, css: `&{inline-size:${v}}` };
      if (role === 'sidebar') return { cls: `n-side-${slug(v)}`, css: `&{--n-side:${v}}` };
      if (BAND_ROLES.has(role) || role === 'center') return { cls: `n-cw-${slug(v)}`, css: `&{--n-cw:${val}}` };
      return { cls: `n-maxw-${slug(v)}`, css: `&{max-inline-size:${v === 'full' ? 'none' : val}}` };
    }
    case 'align': {
      if (role === 'title' || role === 'text') return { cls: `n-talign-${v}`, css: `&{text-align:${ALIGN_TEXT[v]}}` };
      if (role === 'layer') return { cls: `n-xi-${v}`, css: `&{justify-items:${v}}` };
      if (ROW_ROLES.has(role)) return { cls: `n-ralign-${v}`, css: `&{justify-content:${ALIGN_FLEX[v]}}` };
      if (COLUMN_ROLES.has(role)) return { cls: `n-calign-${v}`, css: `&{align-items:${ALIGN_FLEX[v]};text-align:${ALIGN_TEXT[v]}}` };
      return { cls: `n-talign-${v}`, css: `&{text-align:${ALIGN_TEXT[v]}}` };
    }
    case 'valign': {
      if (role === 'grid' || role === 'layer') return { cls: `n-yi-${v}`, css: `&{align-items:${v}}` };
      if (ROW_ROLES.has(role)) return { cls: `n-rvalign-${v}`, css: `&{align-items:${ALIGN_FLEX[v]}}` };
      return { cls: `n-cvalign-${v}`, css: `&{justify-content:${ALIGN_FLEX[v] === 'stretch' ? 'stretch' : ALIGN_FLEX[v]}}` };
    }
    case 'size':
      if (role === 'button') {
        const css: Record<string, string> = { s: 'font-size:var(--n-t-s);padding:.45em .9em', m: '', l: 'font-size:var(--n-t-l);padding:.75em 1.4em' };
        return css[v] ? { cls: `n-btn-${v}`, css: `&{${css[v]}}` } : null;
      }
      return { cls: `n-size-${v}`, css: `&{font-size:var(--n-t-${v})}` };
    case 'weight':
      return { cls: `n-weight-${v}`, css: `&{font-weight:${WEIGHT[v]}}` };
    case 'hide':
      if (v === 'all') return { cls: 'n-hide', css: '&{display:none}' };
      if (v === 'narrow') return { cls: 'n-hide-narrow', css: `@media (max-width:${narrowMax(design)}){&{display:none}}` };
      return { cls: 'n-hide-wide', css: `@media (min-width:${design.breakpoint}){&{display:none}}` };
    case 'min':
      return { cls: `n-min-${slug(v)}`, css: `&{--n-min:${v}}` };
    case 'cols': {
      const n = Number(v);
      return {
        cls: `n-cols-${n}`,
        css: `&{grid-template-columns:repeat(auto-fit,minmax(max(min(var(--n-min,12rem),100%),(100% - ${n - 1}*var(--n-gap))/${n}),1fr))}`,
      };
    }
    case 'at':
      return { cls: `n-at-${slug(v)}`, css: `&{--n-at:${v}}` };
    case 'ratio': {
      const [a, b = '1'] = v.split('/');
      if (role === 'split') return { cls: `n-ratio-${slug(v)}`, css: `&>:first-child{flex-grow:${a}}&>:last-child{flex-grow:${b}}` };
      return { cls: `n-ar-${slug(v)}`, css: `&{aspect-ratio:${a}/${b};inline-size:100%;object-fit:cover}` };
    }
    case 'fit':
      return { cls: `n-fit-${v}`, css: `&{object-fit:${v}}` };
    case 'height':
      if (v === 'auto' && role === 'hero') return { cls: 'n-h-auto', css: '&{min-block-size:auto;padding-block:var(--n-s-xl)}' };
      return { cls: `n-h-${v}`, css: `&{min-block-size:${HEIGHT[v]}}` };
    case 'side':
      return v === 'right'
        ? {
            cls: 'n-side-right',
            css: '&>:first-child{flex-basis:0;flex-grow:999;min-inline-size:55%}&>:last-child{flex-basis:var(--n-side,16rem);flex-grow:1;min-inline-size:auto}',
          }
        : null;
    case 'variant': {
      if (v === 'solid') return null;
      if (v === 'outline') {
        return {
          cls: 'n-btn-outline',
          css: '&{background:transparent;color:var(--n-accent)}&:hover{background:color-mix(in oklab,var(--n-accent) 12%,transparent);color:var(--n-accent)}',
        };
      }
      return {
        cls: 'n-btn-ghost',
        css: '&{background:transparent;border-color:transparent;color:var(--n-accent)}&:hover{background:color-mix(in oklab,var(--n-accent) 12%,transparent);border-color:transparent;color:var(--n-accent)}',
      };
    }
    case 'marker': {
      const css: Record<string, string> = {
        disc: '',
        none: '&{list-style:none;padding-inline-start:0}',
        number: '&{list-style:decimal}',
        check:
          '&{list-style:none;padding-inline-start:0}&>li{position:relative;padding-inline-start:1.6em}' +
          '&>li::before{content:"✓";position:absolute;inset-inline-start:0;color:var(--n-accent);font-weight:700}',
      };
      return css[v] ? { cls: `n-marker-${v}`, css: css[v] } : null;
    }
    case 'image':
      if (role === 'hero') {
        return {
          cls: `n-bg-${hash(v)}`,
          css: `&{background:linear-gradient(rgb(0 0 0/.55),rgb(0 0 0/.35)),url("${v.replace(/"/g, '%22').replace(/&/g, '\\26 ')}") center/cover}`,
        };
      }
      return null;
    case 'css':
      return { cls: `n-css-${hash(v)}`, css: `&{${v}}` };
  }
  return null;
}

export const FLAG_CSS: Record<string, Rule> = {
  muted: { cls: 'n-muted', css: '&{color:var(--n-muted)}' },
  grow: { cls: 'n-grow', css: '&{flex-grow:1}' },
  lead: { cls: 'n-size-l', css: '&{font-size:var(--n-t-l)}' },
  sticky: { cls: 'n-sticky', css: '&{position:sticky;top:0;z-index:10;background:var(--n-bg)}' },
  vertical: { cls: 'n-vertical', css: '&{flex-direction:column;align-items:flex-start}' },
  nowrap: { cls: 'n-nowrap', css: '&{flex-wrap:nowrap}' },
  reverse: { cls: 'n-reverse', css: '&{flex-direction:row-reverse}' },
  full: { cls: 'n-full', css: '&{inline-size:100%}' },
  striped: { cls: 'n-striped', css: '& tbody tr:nth-child(odd){background:color-mix(in oklab,var(--n-fg) 4%,var(--n-bg))}' },
  plain: { cls: 'n-plain', css: '&{text-decoration:none}&:hover{text-decoration:underline}' },
};

export function narrowMax(design: Design): string {
  const bp = parseFloat(design.breakpoint);
  return `${bp - 0.02}rem`;
}

// ------------------------------------------------------------------ registry

export const enum Bucket {
  Role = 1,
  Tone = 2,
  Mod = 3,
  Wide = 4,
  Narrow = 5,
  Css = 6,
}

export class StyleRegistry {
  private rules = new Map<string, { bucket: Bucket; css: string; order: number }>();
  private n = 0;

  add(rule: Rule, bucket: Bucket): string {
    if (!this.rules.has(rule.cls)) this.rules.set(rule.cls, { bucket, css: rule.css, order: this.n++ });
    return rule.cls;
  }

  /** wide{} / narrow{} variant of a rule */
  addVariant(rule: Rule, cond: 'wide' | 'narrow', design: Design): string {
    const cls = `${rule.cls}--${cond[0]}`;
    if (!this.rules.has(cls)) {
      const media = cond === 'wide' ? `(min-width:${design.breakpoint})` : `(max-width:${narrowMax(design)})`;
      this.rules.set(cls, { bucket: cond === 'wide' ? Bucket.Wide : Bucket.Narrow, css: `@media ${media}{${rule.css}}`, order: this.n++ });
    }
    return cls;
  }

  get size(): number {
    return this.rules.size;
  }

  css(): string {
    return [...this.rules.entries()]
      .sort((a, b) => a[1].bucket - b[1].bucket || a[1].order - b[1].order)
      .map(([cls, r]) => (r.bucket === Bucket.Css ? r.css.replace('&', `.${cls}`) : r.css.replace(/&/g, `.${cls}`)))
      .join('');
  }
}
