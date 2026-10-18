// "Eyes for the AI": renders a page in headless Chrome and describes the result as text.

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatDiagnostic } from './diag.js';
import { compileFile } from './node.js';

export interface InspectOptions {
  widths: number[];
  root?: string;
}

interface Box {
  line: number;
  what: string;
}

interface WidthReport {
  width: number;
  height: number;
  overflow: (Box & { right: number })[];
  layout: (Box & { cols: number; rows: number })[];
  contrast: { min: number; minAt?: Box; failures: (Box & { ratio: number; need: number })[]; onImage: number };
  smallTargets: (Box & { w: number; h: number })[];
  brokenImages: Box[];
}

export interface InspectData {
  file: string;
  outline: { level: number; tag: string; text: string; line: number }[];
  widths: WidthReport[];
  problems: string[];
}

export async function inspect(file: string, opts: InspectOptions): Promise<{ text: string; data: InspectData }> {
  const r = compileFile(file, { debugLines: true, root: opts.root });
  const errors = r.diagnostics.filter((d) => d.level === 'error');
  const data: InspectData = { file, outline: [], widths: [], problems: [] };
  if (errors.length) {
    data.problems.push(...errors.map(formatDiagnostic));
    return { text: data.problems.join('\n'), data };
  }
  const srcLines = readFileSync(file, 'utf8').split('\n');
  const tmp = join(dirname(file), `.${basename(file)}.inspect.html`);
  writeFileSync(tmp, r.html);
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    for (const width of opts.widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript({ content: 'window.__name = (f) => f;' });
      await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const rep = (await page.evaluate(measure)) as WidthReport & { outline: InspectData['outline'] };
      if (!data.outline.length) data.outline = rep.outline;
      const { outline: _o, ...w } = rep;
      data.widths.push({ ...w, width });
      await page.close();
    }
  } finally {
    await browser.close();
    unlinkSync(tmp);
  }

  // problems
  for (const w of data.widths) {
    for (const o of w.overflow) data.problems.push(`${w.width}px: L${o.line} ${o.what} overflows the screen by ${o.right - w.width}px`);
    for (const c of w.contrast.failures) data.problems.push(`${w.width}px: L${c.line} ${c.what} contrast ${c.ratio}:1 (needs ${c.need}:1)`);
    for (const t of w.smallTargets) data.problems.push(`${w.width}px: L${t.line} ${t.what} is only ${t.w}×${t.h}px (tap targets need 24×24px)`);
    for (const b of w.brokenImages) data.problems.push(`L${b.line} image does not load: ${b.what}`);
  }
  const h1 = data.outline.filter((h) => h.level === 1).length;
  if (h1 !== 1) data.problems.push(`page has ${h1} h1 headings (expected 1)`);
  data.problems = [...new Set(data.problems)];

  const src = (line: number) => (srcLines[line - 1] ?? '').trim();
  const out: string[] = [`nextcss inspect ${file}`, '', 'Outline'];
  for (const h of data.outline) out.push(`${'  '.repeat(h.level)}${h.tag} "${h.text}"  L${h.line}`);
  for (const w of data.widths) {
    out.push('', `At ${w.width}px – page is ${w.height}px tall`);
    out.push(w.overflow.length ? `  ✗ ${w.overflow.length} element(s) wider than the screen` : '  ✓ nothing wider than the screen');
    for (const l of w.layout) {
      out.push(`  L${l.line} ${src(l.line)}  →  ${l.cols} column${l.cols === 1 ? '' : 's'} × ${l.rows} row${l.rows === 1 ? '' : 's'}`);
    }
    const c = w.contrast;
    out.push(
      c.failures.length
        ? `  ✗ ${c.failures.length} text element(s) below the contrast minimum`
        : `  ✓ all text readable (lowest contrast ${c.min}:1${c.minAt ? ` at L${c.minAt.line} ${c.minAt.what}` : ''})` +
            (c.onImage ? `, ${c.onImage} on images not measured` : ''),
    );
    out.push(w.smallTargets.length ? `  ✗ ${w.smallTargets.length} tap target(s) smaller than 24×24px` : '  ✓ all buttons and links are at least 24×24px');
  }
  out.push('', data.problems.length ? `Problems (${data.problems.length})` : 'No problems found.');
  for (const p of data.problems) out.push(`  - ${p}`);
  return { text: out.join('\n'), data };
}

/** Runs in the page. Must be self-contained. */
function measure() {
  const vw = innerWidth;
  const lineOf = (el: Element): number => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const v = e.getAttribute('data-nc');
      if (v) return Number(v);
    }
    return 0;
  };
  const describe = (el: Element) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('dialog:not([open]),[popover]:not(:popover-open),details:not([open])>:not(summary)'));

  // overflow (outermost offenders only)
  const overflow: { line: number; what: string; right: number }[] = [];
  const offenders = new Set<Element>();
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && ![...offenders].some((o) => o.contains(el))) {
      let clipped = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === 'auto' || ov === 'scroll' || ov === 'hidden' || ov === 'clip') clipped = true;
      }
      if (!clipped) {
        offenders.add(el);
        overflow.push({ line: lineOf(el), what: describe(el), right: Math.round(r.right) });
      }
    }
  }

  // layout of flex/grid containers that come from a source line
  const layout: { line: number; what: string; cols: number; rows: number }[] = [];
  for (const el of document.querySelectorAll('[data-nc]')) {
    const cs = getComputedStyle(el);
    if (!/flex|grid/.test(cs.display) || !visible(el)) continue;
    const kids = [...el.children].filter(visible);
    if (kids.length < 2) continue;
    // children that overlap vertically are in the same row
    const rowsList: { bottom: number; count: number }[] = [];
    const rects = kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    for (const r of rects) {
      const row = rowsList[rowsList.length - 1];
      if (row && r.top < row.bottom - 1) {
        row.count++;
        row.bottom = Math.max(row.bottom, r.bottom);
      } else rowsList.push({ bottom: r.bottom, count: 1 });
    }
    const cols = Math.max(...rowsList.map((r) => r.count));
    const rows = rowsList.length;
    const role = el.className.toString().match(/n-(grid|split|row|bar|sidebar|nav)\b/)?.[1];
    if (role) layout.push({ line: Number(el.getAttribute('data-nc')), what: role, cols, rows });
  }

  // contrast
  const ctx = document.createElement('canvas').getContext('2d')!;
  const rgba = (c: string): number[] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (top: number[], under: number[]) => {
    const a = top[3] / 255;
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(255);
  };
  let min = 99;
  let minAt: { line: number; what: string } | undefined;
  let onImage = 0;
  const failures: { line: number; what: string; ratio: number; need: number }[] = [];
  for (const el of all) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    if (!hasText || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const layers: number[][] = [];
    let image = false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const ecs = getComputedStyle(e);
      if (ecs.backgroundImage.includes('url(')) image = true;
      const c = rgba(ecs.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 255) break;
    }
    if (image) {
      onImage++;
      continue;
    }
    let bg = [255, 255, 255, 255];
    for (const l of layers.reverse()) bg = blend(l, bg);
    const fg = blend(rgba(cs.color), bg);
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < min) {
      min = ratio;
      minAt = { line: lineOf(el), what: describe(el) };
    }
    if (ratio < need) failures.push({ line: lineOf(el), what: describe(el), ratio, need });
  }

  // tap targets (links inside running text are exempt)
  const smallTargets: { line: number; what: string; w: number; h: number }[] = [];
  for (const el of all) {
    if (!el.matches('a,button,input:not([type=hidden]),select,summary') || !visible(el)) continue;
    if (el.matches('a') && el.closest('p,li,td,figcaption,small')) continue;
    if (el.matches('input[type=checkbox],input[type=radio]') && el.closest('label')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) smallTargets.push({ line: lineOf(el), what: describe(el), w: Math.round(r.width), h: Math.round(r.height) });
  }

  const brokenImages = [...document.images]
    .filter((img) => img.complete && img.naturalWidth === 0)
    .map((img) => ({ line: lineOf(img), what: img.getAttribute('src') ?? '' }));

  const outline = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
    level: Number(h.tagName[1]),
    tag: h.tagName.toLowerCase(),
    text: (h.textContent ?? '').trim().slice(0, 60),
    line: lineOf(h),
  }));

  return {
    height: document.documentElement.scrollHeight,
    overflow,
    layout,
    contrast: { min: min === 99 ? 0 : min, minAt, failures, onImage },
    smallTargets,
    brokenImages,
    outline,
  };
}
