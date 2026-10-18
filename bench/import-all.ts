// Re-imports the fixtures (writes test/fixtures/*/index.ncss).
import { readFileSync, writeFileSync } from 'node:fs';
import { importHtml } from '../src/import/html.js';
for (const f of ['blog', 'form', 'legacy']) {
  const file = `test/fixtures/${f}/index.html`;
  const r = importHtml(readFileSync(file, 'utf8'), { file });
  writeFileSync(`test/fixtures/${f}/index.ncss`, r.source);
  if (r.warnings.length) console.log(f, r.warnings);
}
