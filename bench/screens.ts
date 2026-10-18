// Screenshots of a built page at phone and desktop width (for the README).
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
const [file, out] = [process.argv[2] ?? 'examples/landing/dist/index.html', process.argv[3] ?? 'docs/landing'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [w, name] of [[1280, 'desktop'], [390, 'phone']] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href);
  await page.screenshot({ path: `${out}-${name}.png`, fullPage: false });
}
await browser.close();
