import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compile.js';
import { parse } from '../../src/parser.js';
import { print } from '../../src/print.js';
import { Diagnostics } from '../../src/diag.js';
import { fromJson, toJson, jsonSchema } from '../../src/json.js';
import { buildDesign } from '../../src/design.js';
import { contrast, parseColor } from '../../src/color.js';
import { TONES } from '../../src/schema.js';

const html = (src: string) => compile(src).html;
const errors = (src: string) => compile(src).diagnostics.filter((d) => d.level === 'error');
const warnings = (src: string) => compile(src).diagnostics.filter((d) => d.level === 'warning');

describe('syntax', () => {
  it('nests by indentation, no closing tags', () => {
    expect(html('stack\n  text "a"\n  text "b"')).toBe('<div class=n-stack><p class=n-text>a</p><p class=n-text>b</p></div>');
  });
  it('rejects tabs and odd indentation', () => {
    expect(errors('stack\n\ttext "a"')[0].message).toMatch(/tabs/);
    expect(errors('stack\n   text "a"')[0].message).toMatch(/multiples of two/);
  });
  it('suggests fixes for unknown roles, keys and values', () => {
    expect(errors('secton')[0].message).toContain('did you mean "section"');
    expect(errors('stack gapp:l')[0].message).toContain('did you mean "gap"');
    const e = errors('stack gap:large')[0];
    expect(e.message).toContain('space step');
    expect(errors('section tone:primry')[0].fix).toBe('tone:primary');
  });
  it('has no classes', () => {
    expect(errors('.card')[0].message).toMatch(/no classes/);
  });
  it('raw attributes with = pass through, quoted values with spaces', () => {
    expect(html('box data-x=1 aria-label="Hallo Welt"')).toBe('<div data-x=1 aria-label="Hallo Welt"></div>');
  });
  it('escapes text and attributes', () => {
    expect(html('text "a < b & c"')).toBe('<p class=n-text>a &lt; b &amp; c</p>');
    expect(html('text "&nbsp;ok"')).toBe('<p class=n-text>&nbsp;ok</p>');
    expect(html('link "x" to:"/a?b=1&c=\\"2\\""')).toContain('href="/a?b=1&amp;c=&quot;2&quot;"');
  });
});

describe('inline markdown', () => {
  it('bold, italic, code, links, inline roles', () => {
    expect(html('text "**a** *b* `c` [d](/e) {badge "neu"}"')).toBe(
      '<p class=n-text><strong>a</strong> <em>b</em> <code>c</code> <a href="/e">d</a> <span class=n-badge>neu</span></p>',
    );
  });
  it('a lone * is literal', () => {
    expect(html('text "5 * 3 = 15"')).toBe('<p class=n-text>5 * 3 = 15</p>');
  });
  it('escapes', () => {
    expect(html(String.raw`text "\*not bold\* \{x\}"`)).toBe('<p class=n-text>*not bold* {x}</p>');
  });
});

describe('headings follow nesting', () => {
  it('hero h1, section h2, card h3', () => {
    const out = html('hero\n  title "A"\nsection\n  title "B"\n  card\n    title "C"');
    expect(out).toMatch(/<h1[^>]*>A<\/h1>/);
    expect(out).toMatch(/<h2[^>]*>B<\/h2>/);
    expect(out).toMatch(/<h3[^>]*>C<\/h3>/);
  });
  it('warns about a missing or second h1 on a page', () => {
    expect(warnings('page "x"\nsection\n  title "B"')[0].message).toMatch(/no h1/);
    expect(warnings('page "x"\ntitle "A"\ntitle "B"').some((w) => /second h1/.test(w.message))).toBe(true);
  });
});

describe('accessibility is enforced', () => {
  it('image needs alt or decorative', () => {
    expect(errors('image src:/a.jpg')[0].message).toMatch(/alt/);
    expect(errors('image src:/a.jpg decorative')).toEqual([]);
    expect(html('image src:/a.jpg decorative')).toContain('alt=""');
  });
  it('menu and dialog need ids, opens must point to them', () => {
    expect(errors('menu')[0].message).toMatch(/needs an id/);
    expect(errors('button "x" opens:nope')[0].message).toMatch(/no element with id/);
  });
  it('fields get labels and names', () => {
    const out = html('form\n  field "E-Mail Adresse" type:email required');
    expect(out).toContain('<label class=n-field><span>E-Mail Adresse</span><input type=email name=e-mail-adresse autocomplete=email required></label>');
  });
});

describe('layout and design', () => {
  it('only used CSS is emitted', () => {
    const { css } = compile('stack gap:l\n  text "a"');
    expect(css).toContain('.n-stack{');
    expect(css).toContain('.n-gap-l{');
    expect(css).not.toContain('.n-grid');
    expect(css).not.toContain('--n-t-4xl');
  });
  it('grid is responsive without media queries', () => {
    const { css } = compile('grid min:14rem\n  card\n    text "a"');
    expect(css).toContain('repeat(auto-fit,minmax(min(var(--n-min,16rem),100%),1fr))');
    expect(css).toContain('.n-min-14rem{--n-min:14rem}');
    expect(css).not.toMatch(/@media \(min-width/);
  });
  it('wide{} creates a media variant', () => {
    const { css, html: out } = compile('stack gap:s wide{gap:xl}');
    expect(out).toContain('n-gap-xl--w');
    expect(css).toContain('@media (min-width:48rem){.n-gap-xl--w{');
  });
  it('every tone has readable text for many brand colors', () => {
    for (const brand of ['#0a66c2', '#ffd400', '#e11d48', '#10b981', '#7c3aed', '#111111', '#f5f5f5', '#00ffff']) {
      const d = buildDesign({ brand, dark: 'auto' });
      for (const c of d.checks) expect(c.ratio, `${brand} ${c.tone} ${c.pair}`).toBeGreaterThanOrEqual(4.5);
      for (const t of TONES) {
        const v = d.tones[t];
        expect(contrast(parseColor(v.fg)!, parseColor(v.bg)!)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('buttons open menus and dialogs without JavaScript', () => {
    const out = html('button "M" opens:m\nmenu#m\n  link "a" to:/a\nbutton "D" opens:d\ndialog#d\n  button "x" closes:d');
    expect(out).toContain('popovertarget=m');
    expect(out).toContain('<div id=m class="n-menu n-pop-m" popover>');
    expect(out).toContain('commandfor=d command=show-modal');
    expect(out).toContain('commandfor=d command=close');
    expect(out).not.toContain('<script');
  });
});

describe('components', () => {
  it('expands parameters, slot and extra keys', () => {
    const src = 'define Feature(title, text="")\n  card\n    title "{$title}"\n    text "{$text}"\n    slot\n\nFeature "Schnell" tone:subtle\n  badge "neu"';
    const out = html(src);
    expect(out).toContain('<article class="n-card n-tone-subtle">');
    expect(out).toContain('>Schnell</h2>');
    expect(out).not.toContain('<p'); // empty optional text removed
    expect(out).toContain('<span class=n-badge>neu</span>');
  });
  it('reports missing parameters', () => {
    expect(errors('define A(x)\n  text "{$x}"\n\nA').map((e) => e.message)).toEqual(['component "A" needs x:"…"']);
  });
});

describe('formatter and JSON form', () => {
  const src = 'section tone:subtle gap:l\n  title "Hallo \\"Welt\\""\n  grid cols:3 min:12rem\n    card\n      text "a **b**"';
  it('fmt is idempotent', () => {
    const once = print(parse(src, new Diagnostics()));
    expect(print(parse(once, new Diagnostics()))).toBe(once);
  });
  it('fmt orders keys canonically', () => {
    expect(print(parse('stack tone:subtle gap:l', new Diagnostics()))).toBe('stack gap:l tone:subtle\n');
  });
  it('JSON round trip gives the same HTML', () => {
    const doc = parse(src, new Diagnostics());
    const back = fromJson(JSON.parse(JSON.stringify(toJson(doc))));
    expect(compile(print(back)).html).toBe(compile(src).html);
  });
  it('exports a JSON Schema with every role', () => {
    const s = jsonSchema() as { $defs: Record<string, unknown> };
    expect(Object.keys(s.$defs)).toContain('section');
    expect(Object.keys(s.$defs)).toContain('node');
  });
});

describe('document', () => {
  it('page adds head defaults and inlines CSS', () => {
    const out = html('page "Hallo" lang:de description:"Test"\ntext "x"');
    expect(out.startsWith('<!doctype html><html lang=de><head><meta charset=utf-8><meta name=viewport')).toBe(true);
    expect(out).toContain('<title>Hallo</title>');
    expect(out).toContain('<style>@layer n-raw,n;');
  });
  it('plain mode renders bare HTML', () => {
    const out = html('page plain\nsection\n  title "A" level:1\n  text "b" css:"color:red"');
    expect(out).toContain('<section><h1>A</h1><p class=n-css-');
    expect(out).not.toContain('n-section');
  });
});
