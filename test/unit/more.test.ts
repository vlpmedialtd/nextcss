import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compile.js';
import { compileFile } from '../../src/node.js';
import { importHtml } from '../../src/import/html.js';
import { imageSize } from '../../src/imagesize.js';

describe('prose', () => {
  it('renders Markdown with headings relative to the context', () => {
    const { html } = compile('section\n  prose\n    # Eins\n    Text **fett**\n\n    ## Zwei\n    - a\n    - b\n\n    | x | y |\n    |---|---|\n    | 1 | 2 |');
    expect(html).toContain('<h2>Eins</h2><p>Text <strong>fett</strong></p><h3>Zwei</h3><ul><li>a</li><li>b</li></ul>');
    expect(html).toContain('<table><thead><tr><th>x</th><th>y</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
  });
  it('keeps code fences literal', () => {
    const { html } = compile('prose\n  ```js\n  a < b && **c**\n  ```');
    expect(html).toContain('<pre><code class="language-js">a &lt; b &amp;&amp; **c**</code></pre>');
  });
});

describe('files', () => {
  it('use loads components and theme from another file', () => {
    const r = compileFile('examples/site/index.ncss');
    expect(r.diagnostics).toEqual([]);
    expect(r.html).toContain('<header class=n-header>');
    expect(r.html).toContain('fonts.googleapis.com');
    expect(r.css).toContain('--n-accent:'); // brand from parts.ncss
  });
  it('reads image sizes from headers', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"></svg>');
    expect(imageSize(svg)).toEqual({ width: 120, height: 40 });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 0, 0, 0, 1, 0]);
    expect(imageSize(png)).toEqual({ width: 512, height: 256 });
  });
});

describe('import', () => {
  it('maps HTML to roles and keeps exact rendering details', () => {
    const { source } = importHtml(
      '<!doctype html><html lang="de"><head><title>T</title><style>p{color:red}</style></head><body><section><h2>Hallo</h2><p>Ein <strong>fetter</strong> Text mit <a href="/x">Link</a>.</p><div style="color:blue" data-x="1">Box</div></section></body></html>',
    );
    expect(source).toContain('page plain lang:de');
    expect(source).toContain('css\n  p{color:red}');
    expect(source).toContain('  title "Hallo"');
    expect(source).toContain('  text "Ein **fetter** Text mit [Link](/x)."');
    expect(source).toContain('  box css:"color:blue" data-x=1\n    "Box"');
    const back = compile(source).html;
    expect(back).toContain('<section><h2>Hallo</h2><p>Ein <strong>fetter</strong> Text mit <a href="/x">Link</a>.</p>');
  });
  it('escapes Markdown characters in imported text', () => {
    const { source } = importHtml('<p>5 * 3 [x] {y} `z`</p>');
    expect(compile(source).html).toContain('<p>5 * 3 [x] {y} `z`</p>');
  });
});
