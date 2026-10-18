// Measures source size (bytes, LLM tokens) and delivered size (raw, gzip, brotli).
// Baseline: the same page as hand-written HTML + CSS (the compiler output, formatted
// the way a person would write it). This is the HTML/CSS you would otherwise have to write.
import { readFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { getEncoding } from 'js-tiktoken';
import { compileFile } from '../src/node.js';

const enc = getEncoding('o200k_base');
const tokens = (s: string) => enc.encode(s).length;
const kb = (n: number) => (n / 1024).toFixed(1) + ' KB';

const BLOCK = new Set('html head body header nav main section article aside footer div p h1 h2 h3 h4 h5 h6 ul ol li figure figcaption blockquote form label select option textarea table thead tbody tr th td details summary dialog meta link title style script'.split(' '));

/** Formats HTML with one block element per line, like hand-written markup. */
function prettyHtml(html: string): string {
  let depth = 0;
  let out = '';
  for (const tok of html.split(/(<[^>]+>)/).filter(Boolean)) {
    const m = /^<(\/?)([a-z0-9]+)/i.exec(tok);
    if (m && BLOCK.has(m[2].toLowerCase())) {
      if (m[1]) depth = Math.max(0, depth - 1);
      out += '\n' + '  '.repeat(depth) + tok;
      if (!m[1] && !/^<(meta|link)/i.test(tok)) depth++;
    } else out += tok;
  }
  return out.trim() + '\n';
}

/** Formats CSS one declaration per line. */
function prettyCss(css: string): string {
  return css
    .replace(/\{/g, ' {\n  ')
    .replace(/;/g, ';\n  ')
    .replace(/\}/g, '\n}\n')
    .replace(/\n\s*\n/g, '\n');
}

const file = process.argv[2] ?? 'examples/landing/index.ncss';
const src = readFileSync(file, 'utf8');
const r = compileFile(file);
const html = r.html.replace(/<style>[\s\S]*<\/style>/, '<link rel="stylesheet" href="style.css">');
const handHtml = prettyHtml(html);
const handCss = prettyCss(r.css);

const rows = [
  ['', 'bytes', 'LLM tokens (o200k)', 'lines'],
  ['nextcss source', String(src.length), String(tokens(src)), String(src.split('\n').length)],
  ['HTML + CSS for the same page', String(handHtml.length + handCss.length), String(tokens(handHtml) + tokens(handCss)), String(handHtml.split('\n').length + handCss.split('\n').length)],
];
const ratio = (tokens(handHtml) + tokens(handCss)) / tokens(src);
console.log(`\n${file}\n`);
console.log('| ' + rows[0].join(' | ') + ' |');
console.log('|' + rows[0].map(() => '---').join('|') + '|');
for (const row of rows.slice(1)) console.log('| ' + row.join(' | ') + ' |');
console.log(`\n→ ${ratio.toFixed(1)}× fewer tokens to write and read\n`);

const delivered = r.html;
console.log('| delivered page (HTML with inline CSS) | raw | gzip | brotli |');
console.log('|---|---|---|---|');
console.log(`| ${file} | ${kb(delivered.length)} | ${kb(gzipSync(delivered).length)} | ${kb(brotliCompressSync(delivered).length)} |`);
console.log(`\nCSS: ${kb(r.css.length)} raw, ${kb(gzipSync(r.css).length)} gzip · JavaScript: 0 bytes · requests for HTML+CSS: 1\n`);
