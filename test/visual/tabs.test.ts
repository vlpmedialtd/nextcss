import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { compile } from '../../src/compile.js';
import { launch } from './compare.js';

let browser: Browser;
let dir: string;
beforeAll(async () => {
  browser = await launch();
  dir = mkdtempSync(join(tmpdir(), 'nextcss-tabs-'));
});
afterAll(async () => {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
});

const SRC = `page "Tabs" lang:de
title "Tabs"
section
  title "Preise"
  tabs
    tab "Monatlich"
      text "29 € im Monat"
    tab "Jährlich"
      text "290 € im Jahr"
      text "zwei Monate gratis"
    tab "Einmalig"
      text "900 €"
  text "Danach"`;

/** Tab labels, panels and the text below, as boxes (after pending transitions). */
async function measure() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const tabs = [...document.querySelectorAll('details')];
  const open = tabs.find((d) => d.open)!;
  return {
    labels: tabs.map((d) => box(d.querySelector('summary')!)),
    open: tabs.indexOf(open),
    panel: box(open.querySelector('summary + div')!),
    after: box(document.querySelector('section > p:last-child')!),
    color: getComputedStyle(open.querySelector('summary')!).color,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--n-accent').trim(),
  };
}

async function open(width: number): Promise<Page> {
  const file = join(dir, 'tabs.html');
  const r = compile(SRC);
  expect(r.diagnostics).toEqual([]);
  writeFileSync(file, r.html);
  const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.goto(pathToFileURL(file).href);
  return page;
}

describe('tabs in Chrome', () => {
  for (const width of [375, 1280]) {
    it(`labels form one row, only the open panel takes space (${width}px)`, async () => {
      const page = await open(width);
      const m = await page.evaluate(measure);
      expect(m.open).toBe(0);
      const [a, b, c] = m.labels;
      expect(b.y).toBe(a.y);
      expect(c.y).toBe(a.y);
      expect(b.x).toBeGreaterThan(a.x + a.w - 1);
      expect(m.panel.y).toBeGreaterThan(a.y + a.h);
      // closed panels collapse: the text after the tabs follows the open panel directly
      expect(m.after.y - (m.panel.y + m.panel.h)).toBeLessThan(80);

      await page.click('summary >> text=Jährlich');
      const m2 = await page.evaluate(measure);
      expect(m2.open).toBe(1);
      expect(m2.panel.y).toBe(m.panel.y);
      expect(m2.after.y).toBeGreaterThan(m.after.y); // the second panel is taller
      expect(m2.labels).toEqual(m.labels);

      // the open tab shows the accent color and does not close when clicked again
      const accent = await page.evaluate((c) => {
        const el = document.createElement('span');
        el.style.color = c;
        document.body.append(el);
        return getComputedStyle(el).color;
      }, m2.accent);
      expect(m2.color).toBe(accent);
      await page.click('summary >> text=Jährlich', { force: true });
      expect((await page.evaluate(measure)).open).toBe(1);

      // keyboard: Tab reaches the labels, Enter switches
      await page.focus('summary >> text=Einmalig');
      await page.keyboard.press('Enter');
      expect((await page.evaluate(measure)).open).toBe(2);
      await page.close();
    }, 60_000);
  }
});
