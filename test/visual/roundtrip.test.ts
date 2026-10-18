import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { importHtml } from '../../src/import/html.js';
import { compile } from '../../src/compile.js';
import { compare, launch, widthsFor } from './compare.js';

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

describe('HTML → nextcss → HTML renders identically', () => {
  for (const name of ['blog', 'form', 'legacy']) {
    it(name, async () => {
      const file = `test/fixtures/${name}/index.html`;
      const html = readFileSync(file, 'utf8');
      const imported = importHtml(html, { file });
      const out = compile(imported.source, { file: `test/fixtures/${name}/index.ncss` });
      expect(out.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
      const target = `test/fixtures/${name}/index.roundtrip.html`;
      writeFileSync(target, out.html);
      const widths = widthsFor(html + out.css);
      const diffs = await compare(browser, file, target, widths);
      expect(diffs).toEqual([]);
    }, 240_000);
  }
});
