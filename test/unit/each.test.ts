import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, type CompileOptions } from '../../src/compile.js';
import { Diagnostics } from '../../src/diag.js';
import { fromJson, jsonSchema, toJson } from '../../src/json.js';
import { compileFile } from '../../src/node.js';
import { parse } from '../../src/parser.js';
import { print } from '../../src/print.js';

const html = (src: string, opts?: CompileOptions) => compile(src, opts).html;
const errors = (src: string, opts?: CompileOptions) => compile(src, opts).diagnostics.filter((d) => d.level === 'error');

/** A loader that serves files from memory. */
const files = (map: Record<string, unknown>): CompileOptions => ({
  load: (path) => (path in map ? { src: typeof map[path] === 'string' ? (map[path] as string) : JSON.stringify(map[path]), file: path } : null),
});

describe('each', () => {
  it('repeats its lines for an inline array, with {$item} and {$index}', () => {
    const src = 'list\n  each items:["Schnell","Sicher"]\n    item "{$index}. {$item}"';
    expect(html(src)).toBe('<ul class=n-list><li>1. Schnell</li><li>2. Sicher</li></ul>');
    expect(errors(src)).toEqual([]);
  });

  it('reads the fields of objects, nested ones as {$a.b}', () => {
    const src = 'each items:[{"name":"Anna","team":{"city":"Hamburg"}},{"name":"Ben","team":{"city":"Köln"}}]\n  text "{$name} aus {$team.city}"';
    expect(html(src)).toBe('<p class=n-text>Anna aus Hamburg</p><p class=n-text>Ben aus Köln</p>');
  });

  it('loads .json files through the loader', () => {
    const opts = files({ './team.json': [{ name: 'Anna', role: 'CEO' }, { name: 'Ben', role: 'CTO' }] });
    const out = html('grid\n  each items:"./team.json"\n    card\n      title "{$name}"\n      text "{$role}"', opts);
    expect(out).toBe(
      '<div class=n-grid><article class=n-card><h2 class="n-title n-size-l">Anna</h2><p class=n-text>CEO</p></article>' +
        '<article class=n-card><h2 class="n-title n-size-l">Ben</h2><p class=n-text>CTO</p></article></div>',
    );
  });

  it('resolves paths against the file the each line is written in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nextcss-each-'));
    try {
      mkdirSync(join(dir, 'parts'));
      writeFileSync(join(dir, 'parts', 'people.json'), JSON.stringify([{ name: 'Anna' }, { name: 'Ben' }]));
      writeFileSync(join(dir, 'parts', 'cards.ncss'), 'define People()\n  list\n    each items:"./people.json"\n      item "{$name}"\n');
      writeFileSync(join(dir, 'index.ncss'), 'use "./parts/cards.ncss"\n\nPeople\n');
      const r = compileFile(join(dir, 'index.ncss'));
      expect(r.diagnostics).toEqual([]);
      expect(r.html).toBe('<ul class=n-list><li>Anna</li><li>Ben</li></ul>');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops lines and keys whose field is missing in an item', () => {
    const src = 'each items:[{"name":"Anna","tag":"neu","to":"/anna"},{"name":"Ben"}]\n  card\n    badge "{$tag}"\n    link "{$name}" to:/team title:"{$to}"';
    expect(html(src)).toBe(
      '<article class=n-card><span class=n-badge>neu</span><a class=n-link href=/team title=/anna>Anna</a></article>' +
        '<article class=n-card><a class=n-link href=/team>Ben</a></article>',
    );
    expect(errors(src)).toEqual([]);
  });

  it('nested loops: inner fields win, outer fields stay visible', () => {
    const data = '[{"name":"Anna","skills":[{"name":"UX"},{"name":"SEO"}]},{"name":"Ben","skills":[]}]';
    const src = `each items:${data}\n  stack\n    title "{$name}"\n    each items:"{$skills}"\n      text "{$name} ({$item.name})"`;
    // {$item} is the whole item as JSON, so {$item.name} is not a field: only {$name} of the inner item
    expect(errors(src).map((e) => e.message)).toEqual(['the items of each have no field "item.name" (fields: item, index, name)']);
    const ok = `each items:${data}\n  stack\n    title "{$name}"\n    each items:"{$skills}"\n      badge "{$name} {$index}"`;
    expect(html(ok)).toBe(
      '<div class=n-stack><h1 class="n-title n-size-3xl">Anna</h1><span class=n-badge>UX 1</span><span class=n-badge>SEO 2</span></div>' +
        '<div class=n-stack><h1 class="n-title n-size-3xl">Ben</h1></div>',
    );
  });

  it('outer fields reach inner loops', () => {
    const src = 'each items:[{"team":"A","people":["x","y"]}]\n  each items:"{$people}"\n    text "{$team}: {$item}"';
    expect(html(src)).toBe('<p class=n-text>A: x</p><p class=n-text>A: y</p>');
  });

  it('data is text: Markdown works, quotes and braces are literal', () => {
    const src = 'each items:["Sehr **schnell**","Sag \\"hi\\" {nicht}"]\n  text "{$item}"';
    expect(html(src)).toBe('<p class=n-text>Sehr <strong>schnell</strong></p><p class=n-text>Sag "hi" {nicht}</p>');
    expect(errors(src)).toEqual([]);
  });

  it('works with components in both directions', () => {
    const inside = 'define Person(name, role="")\n  card\n    title "{$name}"\n    text "{$role}" muted\n\neach items:[{"name":"Anna","role":"CEO"},{"name":"Ben"}]\n  Person "{$name}" role:"{$role}"';
    expect(html(inside)).toBe(
      '<article class=n-card><h2 class="n-title n-size-l">Anna</h2><p class="n-text n-muted">CEO</p></article>' +
        '<article class=n-card><h2 class="n-title n-size-l">Ben</h2></article>',
    );
    // a loop inside a component: parameters and item fields together
    const outside = 'define Tags(label)\n  row\n    each items:["a","b"]\n      badge "{$label} {$item}"\n\nTags "Tag"';
    expect(html(outside)).toBe('<div class=n-row><span class=n-badge>Tag a</span><span class=n-badge>Tag b</span></div>');
    expect(errors('define T(label)\n  row\n    badge "{$lable}"\n\nT "x"').map((e) => e.message)).toContain('component "T" has no parameter "lable"');
  });

  it('fills lists, tables, selects and tabs whose children are restricted', () => {
    expect(errors('table\n  columns "A" "B"\n  each items:[{"a":1,"b":2}]\n    cells "{$a}" "{$b}"')).toEqual([]);
    expect(errors('form\n  field "Paket" type:select\n    each items:["S","M"]\n      option "{$item}"')).toEqual([]);
    expect(errors('tabs\n  each items:["A","B"]\n    tab "{$item}"\n      text "{$item}"')).toEqual([]);
  });

  it('reports problems with a fix, once per line', () => {
    expect(errors('each items:["a","b","c"]\n  text "{$nmae}"').map((e) => e.message)).toEqual([
      'the items of each have no field "nmae" (fields: item, index)',
    ]);
    expect(errors('each items:[{"name":"a"}]\n  text "{$nmae}"')[0].message).toContain('did you mean "name"?');
    expect(errors('each item:["a"]\n  text "{$item}"').map((e) => e.message)).toEqual([
      '"each" needs items:…',
      '"each" has no key "item" – did you mean "items"? (keys: items)',
    ]);
    expect(errors('each\n  text "x"')[0].message).toBe('"each" needs items:…');
    expect(errors('each items:"./team.json"\n  text "x"')[0].message).toMatch(/needs a file loader/);
    expect(errors('each items:"./nope.json"\n  text "x"', files({}))[0].message).toBe('cannot read "./nope.json"');
    expect(errors('each items:"./bad.json"\n  text "x"', files({ './bad.json': '[1,' }))[0].message).toMatch(/^"\.\/bad\.json" is not valid JSON/);
    expect(errors('each items:"./obj.json"\n  text "x"', files({ './obj.json': { a: 1 } }))[0].message).toBe('items needs a JSON array, but "./obj.json" is an object');
    expect(errors('each items:[1,\n  text "x"').map((e) => e.message)).toContainEqual(expect.stringMatching(/unterminated "\["/));
  });

  it('an empty array or an empty inner list renders nothing', () => {
    expect(html('each items:[]\n  text "x"')).toBe('');
    expect(errors('each items:[{"tags":[]},{}]\n  each items:"{$tags}"\n    text "{$item}"')).toEqual([]);
  });

  it('formats, converts to JSON and back', () => {
    const src = 'list\n  each items:["a b","c"]\n    item "{$item}"\n';
    const doc = parse(src, new Diagnostics());
    expect(print(doc)).toBe(src);
    expect(print(parse('each items:"[\\"a\\"]"\n  text "{$item}"', new Diagnostics()))).toBe('each items:["a"]\n  text "{$item}"\n');
    const json = toJson(doc);
    expect((json.nodes[0] as { children: { items: unknown }[] }).children[0].items).toEqual(['a b', 'c']);
    expect(compile(print(fromJson(JSON.parse(JSON.stringify(json))))).html).toBe(compile(src).html);
    const schema = jsonSchema() as { $defs: Record<string, { properties: Record<string, unknown>; required: string[] }> };
    expect(schema.$defs.each.required).toContain('items');
  });
});
