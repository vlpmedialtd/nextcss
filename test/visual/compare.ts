// Renders two pages in Chrome and compares DOM, computed styles and pixels.
import { chromium, type Browser, type Page } from 'playwright-core';
import { PNG } from 'pngjs';
import { pathToFileURL } from 'node:url';

export interface Diff {
  width: number;
  mode: string;
  kind: 'dom' | 'style' | 'pixels';
  detail: string;
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ channel: 'chrome', headless: true });
}

async function open(browser: Browser, file: string, width: number, mode: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  if (mode === 'dark') await page.emulateMedia({ colorScheme: 'dark' });
  else await page.emulateMedia({ colorScheme: 'light' });
  if (mode === 'print') await page.emulateMedia({ media: 'print' });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (mode === 'hover' || mode === 'focus') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'body *' });
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [mode === 'hover' ? 'hover' : 'focus-visible'] });
  }
  return page;
}

function snapshot() {
  const els = [document.body, ...document.body.querySelectorAll('*')];
  return els.map((el) => {
    const attrs = [...el.attributes]
      .filter((a) => a.name !== 'style')
      .map((a) => (a.name === 'class' ? `class=${a.value.split(/\s+/).filter((c) => c && !c.startsWith('n-')).join(' ')}` : `${a.name}=${a.value}`))
      .filter((a) => a !== 'class=')
      .sort();
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    const style = (pseudo: string | null) => {
      const cs = getComputedStyle(el, pseudo);
      const out: Record<string, string> = {};
      for (let i = 0; i < cs.length; i++) out[cs[i]] = cs.getPropertyValue(cs[i]);
      return out;
    };
    return { tag: el.tagName.toLowerCase(), attrs: attrs.join(' '), own, style: style(null), before: style('::before').content, after: style('::after').content };
  });
}

async function shot(page: Page): Promise<PNG> {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: page.viewportSize()!.width, height: Math.min(h, 6000) });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
  return PNG.sync.read(await page.screenshot({ animations: 'disabled', caret: 'hide' }));
}

export async function compare(browser: Browser, a: string, b: string, widths: number[], modes = ['light', 'dark', 'print', 'hover']): Promise<Diff[]> {
  const diffs: Diff[] = [];
  for (const mode of modes) {
    for (const width of widths) {
      const pa = await open(browser, a, width, mode);
      const pb = await open(browser, b, width, mode);
      const [sa, sb] = [await pa.evaluate(snapshot), await pb.evaluate(snapshot)];
      if (sa.length !== sb.length) diffs.push({ width, mode, kind: 'dom', detail: `${sa.length} vs ${sb.length} elements` });
      for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
        const x = sa[i];
        const y = sb[i];
        if (x.tag !== y.tag || x.attrs !== y.attrs || x.own !== y.own) {
          diffs.push({ width, mode, kind: 'dom', detail: `#${i} <${x.tag} ${x.attrs}> "${x.own}" vs <${y.tag} ${y.attrs}> "${y.own}"` });
          break;
        }
        for (const k of Object.keys(x.style)) {
          if (x.style[k] !== y.style[k]) diffs.push({ width, mode, kind: 'style', detail: `#${i} <${x.tag}> ${k}: ${x.style[k]} vs ${y.style[k]}` });
        }
        if (x.before !== y.before || x.after !== y.after) diffs.push({ width, mode, kind: 'style', detail: `#${i} <${x.tag}> pseudo content differs` });
      }
      if (mode !== 'print') {
        // a second capture rules out paint timing noise (rare under heavy CPU load)
        let result = '';
        for (let attempt = 0; attempt < 2; attempt++) {
          const [ia, ib] = [await shot(pa), await shot(pb)];
          if (ia.width !== ib.width || ia.height !== ib.height) result = `size ${ia.width}×${ia.height} vs ${ib.width}×${ib.height}`;
          else {
            let n = 0;
            for (let i = 0; i < ia.data.length; i += 4) if (ia.data[i] !== ib.data[i] || ia.data[i + 1] !== ib.data[i + 1] || ia.data[i + 2] !== ib.data[i + 2]) n++;
            result = n ? `${n} pixels differ` : '';
          }
          if (!result) break;
        }
        if (result) diffs.push({ width, mode, kind: 'pixels', detail: result });
      }
      await pa.close();
      await pb.close();
    }
  }
  return diffs;
}

/** Widths at every min/max-width breakpoint of the CSS ±1px, plus phone and desktop. */
export function widthsFor(css: string): number[] {
  const set = new Set([375, 1280]);
  for (const m of css.matchAll(/\((?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\)/g)) {
    const px = Math.round(parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16));
    for (const w of [px - 1, px, px + 1]) if (w >= 320 && w <= 1600) set.add(w);
  }
  return [...set].sort((a, b) => a - b);
}
