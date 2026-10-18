// Components (`define`, `slot`, `use`), data loops (`each`) and {$name} interpolation.

import type { Node, Pos, RoleNode } from './ast.js';
import { Diagnostics, suggest } from './diag.js';
import { parse } from './parser.js';
import { validate } from './validate.js';

export interface Component {
  name: string;
  params: { name: string; def?: string }[];
  root: RoleNode;
  pos: Pos;
  external?: boolean; // defined in a file loaded with `use`
  file?: string; // the file it is defined in
}

export interface Loader {
  (path: string, from?: string): { src: string; file: string } | null;
}

export interface Collected {
  components: Map<string, Component>;
  page?: RoleNode;
  themes: RoleNode[]; // in order: used files first, then this file
  content: Node[];
}

/** Splits top-level declarations from content and loads `use` files. */
export function collect(nodes: Node[], diag: Diagnostics, load?: Loader, file?: string, seen = new Set<string>()): Collected {
  const out: Collected = { components: new Map(), themes: [], content: [] };
  for (const n of nodes) {
    if (n.kind !== 'node') {
      if (n.kind === 'text') out.content.push(n);
      continue;
    }
    switch (n.role) {
      case 'page':
        if (out.page) diag.error(n.pos, 'only one page line per file');
        else out.page = n;
        break;
      case 'theme':
        out.themes.push(n);
        break;
      case 'define': {
        const c = parseDefine(n, diag, file);
        if (c) {
          if (out.components.has(c.name)) diag.error(n.pos, `component "${c.name}" is defined twice`);
          out.components.set(c.name, c);
        }
        break;
      }
      case 'use': {
        const path = n.texts[0]?.raw;
        if (!path) break;
        if (!load) {
          diag.error(n.pos, 'use is not available here (no file loader)');
          break;
        }
        const loaded = load(path, file);
        if (!loaded) {
          diag.error(n.pos, `cannot read "${path}"`);
          break;
        }
        if (seen.has(loaded.file)) break;
        seen.add(loaded.file);
        const sub = new Diagnostics(loaded.file);
        const doc = parse(loaded.src, sub);
        const c = collect(doc.nodes, sub, load, loaded.file, seen);
        diag.list.push(...sub.list);
        for (const [k, v] of c.components) if (!out.components.has(k)) out.components.set(k, { ...v, external: true });
        out.themes.unshift(...c.themes);
        break;
      }
      default:
        out.content.push(n);
    }
  }
  return out;
}

function parseDefine(n: RoleNode, diag: Diagnostics, file?: string): Component | null {
  const m = /^([A-Z][A-Za-z0-9]*)\s*(?:\((.*)\))?\s*$/.exec(n.rest ?? '');
  if (!m) {
    diag.error(n.pos, 'define needs a capitalized name: define Card(title, text="")');
    return null;
  }
  const params: Component['params'] = [];
  if (m[2]?.trim()) {
    for (const part of splitParams(m[2])) {
      const pm = /^([A-Za-z_][\w-]*)\s*(?:=\s*"((?:[^"\\]|\\.)*)")?$/.exec(part.trim());
      if (!pm) {
        diag.error(n.pos, `invalid parameter "${part.trim()}" (write name or name="default")`);
        continue;
      }
      params.push({ name: pm[1], ...(pm[2] !== undefined ? { def: pm[2].replace(/\\(.)/g, '$1') } : {}) });
    }
  }
  const roots = n.children.filter((c) => c.kind !== 'comment');
  if (roots.length !== 1 || roots[0].kind !== 'node') {
    diag.error(n.pos, `component "${m[1]}" needs exactly one root line`);
    return null;
  }
  return { name: m[1], params, root: roots[0], pos: n.pos, ...(file ? { file } : {}) };
}

function splitParams(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      cur += c + (s[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (c === ',' && !inStr) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}


export interface ExpandOptions {
  /** Loads the .json files of `each items:"…"`. */
  load?: Loader;
  /** The compiled file; relative paths resolve against it. */
  file?: string;
}

interface Ctx {
  components: Map<string, Component>;
  diag: Diagnostics;
  load?: Loader;
  file?: string;
  depth: number; // component nesting
  scope: Map<string, string>; // {$name} values of the enclosing each items
  data: Map<string, unknown>; // parsed .json files
}

/** Replaces component instances by their templates and `each` loops by their repeated lines. */
export function expand(nodes: Node[], components: Map<string, Component>, diag: Diagnostics, opts: ExpandOptions = {}): Node[] {
  return expandList(nodes, { components, diag, load: opts.load, file: opts.file, depth: 0, scope: new Map(), data: new Map() });
}

function expandList(nodes: Node[], ctx: Ctx): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.kind !== 'node') {
      out.push(n);
      continue;
    }
    if (n.role === 'each') {
      out.push(...each(n, ctx));
      continue;
    }
    if (/^[A-Z]/.test(n.role)) {
      const c = ctx.components.get(n.role);
      if (!c) {
        ctx.diag.error(n.pos, `unknown component "${n.role}"${suggest(n.role, ctx.components.keys())}`);
        continue;
      }
      if (ctx.depth > 30) {
        ctx.diag.error(n.pos, `component "${n.role}" uses itself`);
        continue;
      }
      const inst = instantiate(n, c, ctx.diag);
      if (inst) out.push(...expandList([inst], { ...ctx, depth: ctx.depth + 1 }));
      continue;
    }
    out.push({ ...n, children: expandList(n.children, ctx) });
  }
  return out;
}

// ------------------------------------------------------------------ interpolation

const NAME = /\{\$([A-Za-z_][\w.-]*)\}/g;

/** Replaces {$name}; names without a value (undefined) stay as they are. */
function interpolate(s: string, get: (name: string) => string | undefined): string {
  return s.replace(NAME, (all, name: string) => get(name) ?? all);
}

/** How a template is copied. */
interface Subst {
  text: (raw: string) => string; // strings with inline Markdown
  value: (raw: string) => string; // keys, attributes, verbatim lines
  pos?: (p: Pos) => Pos;
  slot?: Node[]; // replaces `slot` lines
  from?: string; // file of the template: paths of its each lines resolve against it
  inner?: Subst | null; // for the lines below an each line; null = copy them unchanged
}

/** Copies a node with {$name} replaced. Keys whose value became empty are dropped. */
function substitute(node: Node, s: Subst): Node[] {
  if (node.kind === 'comment') return [];
  const pos = s.pos ?? ((p: Pos) => p);
  if (node.kind === 'text') return [{ ...node, raw: s.text(node.raw), pos: pos(node.pos) }];
  if (node.role === 'slot' && s.slot) return s.slot;
  const below = node.role === 'each' ? s.inner : s;
  const out: RoleNode = {
    ...node,
    pos: pos(node.pos),
    texts: node.texts.map((t) => ({ ...t, raw: s.text(t.raw) })),
    props: node.props.flatMap((p) => {
      const raw = s.value(p.value.raw);
      // an each whose items became empty repeats nothing
      return raw === '' && p.value.raw.includes('{$') && node.role !== 'each' ? [] : [{ ...p, value: { ...p.value, raw } }];
    }),
    attrs: node.attrs.map((a) => ({ ...a, value: { ...a.value, raw: s.value(a.value.raw) } })),
    verbatim: node.verbatim?.map((l) => s.value(l)),
    children: below === null ? node.children : node.children.flatMap((c) => substitute(c, below ?? s)),
  };
  if (node.role === 'each' && s.from) out.from = s.from;
  return [out];
}

const TEXTUAL = ['text', 'title', 'badge', 'item'];

/** Lines whose only text became empty through an empty value disappear. */
function dropEmpty(list: Node[]): Node[] {
  return list.filter((c) => {
    if (c.kind === 'text') return c.raw !== '';
    if (c.kind === 'node') {
      c.texts = c.texts.filter((t) => t.raw !== '');
      // the lines of an inner loop are not filled in yet
      if (c.role !== 'each') c.children = dropEmpty(c.children);
      if (TEXTUAL.includes(c.role) && c.texts.length === 0 && c.children.length === 0) return false;
    }
    return true;
  });
}

// ------------------------------------------------------------------ components

function instantiate(inst: RoleNode, c: Component, diag: Diagnostics): RoleNode | null {
  const values = new Map<string, string>();
  const paramNames = new Set(c.params.map((p) => p.name));
  const extraProps = inst.props.filter((p) => {
    if (paramNames.has(p.key)) {
      values.set(p.key, p.value.raw);
      return false;
    }
    return true;
  });
  const extraFlags = inst.flags.filter((f) => {
    if (paramNames.has(f.name)) {
      values.set(f.name, 'true');
      return false;
    }
    return true;
  });
  if (inst.texts.length) {
    // a string on the instance line fills the first parameter that has no value yet
    const first = c.params.find((p) => !values.has(p.name));
    if (first) values.set(first.name, inst.texts[0].raw);
    else diag.error(inst.texts[0].pos, `component "${c.name}" has no parameter left for the text`);
  }
  for (const p of c.params) {
    if (!values.has(p.name)) {
      if (p.def !== undefined) values.set(p.name, p.def);
      else {
        diag.error(inst.pos, `component "${c.name}" needs ${p.name}:"…"`, `${p.name}:"…"`);
        values.set(p.name, '');
      }
    }
  }
  const strict = (raw: string) =>
    interpolate(raw, (name) => {
      if (values.has(name)) return values.get(name)!;
      diag.error(inst.pos, `component "${c.name}" has no parameter "${name}"`);
      return undefined;
    });
  // below an each line, other names are fields of its items
  const lenient = (raw: string) => interpolate(raw, (name) => values.get(name));

  // positions inside another file mean nothing here: point to the instance line instead
  const pos = (p: Pos): Pos => (c.external ? inst.pos : p);
  const inner: Subst = { text: lenient, value: lenient, pos, slot: inst.children, ...(c.file ? { from: c.file } : {}) };

  const hasSlot = (node: Node): boolean => node.kind === 'node' && (node.role === 'slot' || node.children.some(hasSlot));
  if (inst.children.some((ch) => ch.kind !== 'comment') && !hasSlot(c.root)) {
    diag.error(inst.pos, `component "${c.name}" has no slot for child lines`);
  }
  const [root] = substitute(c.root, { ...inner, text: strict, value: strict, inner });
  if (root?.kind !== 'node') return null;
  const merged: RoleNode = {
    ...root,
    id: inst.id ?? root.id,
    flags: [...root.flags, ...extraFlags],
    props: [...root.props.filter((p) => !extraProps.some((e) => e.key === p.key)), ...extraProps],
    attrs: [...root.attrs, ...inst.attrs],
    blocks: [...root.blocks, ...inst.blocks],
    pos: inst.pos,
  };
  return (dropEmpty([merged])[0] as RoleNode | undefined) ?? null;
}

// ------------------------------------------------------------------ data loops

/** `each items:…`: its child lines once per item, with the item's fields as {$name}. */
function each(n: RoleNode, ctx: Ctx): Node[] {
  const { diag } = ctx;
  // the loop line disappears before validation, so check it here
  validate([{ ...n, children: [] }], diag, false);
  const src = n.props.find((p) => p.key === 'items')?.value.raw.trim();
  if (!src) return [];
  const items = loadItems(src, n, ctx);
  if (!items) return [];
  const fields = items.map(itemFields);
  const names = [...new Set(fields.flatMap((f) => [...f.keys()]))];
  const known = new Set([...ctx.scope.keys(), ...names]);
  const out: Node[] = [];
  for (const own of fields) {
    const scope = new Map([...ctx.scope, ...own]);
    const get = (name: string): string => {
      if (scope.has(name)) return scope.get(name)!;
      // a field that only some items have is empty in the others
      if (!known.has(name)) diag.error(n.pos, `the items of each have no field "${name}"${suggest(name, known)} (fields: ${names.join(', ')})`);
      return '';
    };
    const s: Subst = {
      // data is text: inline Markdown works, quotes and braces are literal
      text: (raw) => interpolate(raw, (name) => get(name).replace(/[\\"{}]/g, '\\$&')),
      value: (raw) => interpolate(raw, get),
      inner: null,
    };
    out.push(...expandList(dropEmpty(n.children.flatMap((c) => substitute(c, s))), { ...ctx, scope }));
  }
  return out;
}

function loadItems(src: string, n: RoleNode, ctx: Ctx): unknown[] | null {
  const { diag } = ctx;
  let data: unknown;
  if (src.startsWith('[') || src.startsWith('{')) {
    try {
      data = JSON.parse(src);
    } catch (e) {
      diag.error(n.pos, `items is not valid JSON: ${(e as Error).message}`);
      return null;
    }
  } else {
    if (!ctx.load) {
      diag.error(n.pos, `items:"${src}" needs a file loader (compile a file instead of a string), or write the array inline: items:[…]`);
      return null;
    }
    const loaded = ctx.load(src, n.from ?? ctx.file);
    if (!loaded) {
      diag.error(n.pos, `cannot read "${src}"`);
      return null;
    }
    if (!ctx.data.has(loaded.file)) {
      try {
        ctx.data.set(loaded.file, JSON.parse(loaded.src));
      } catch (e) {
        diag.error(n.pos, `"${src}" is not valid JSON: ${(e as Error).message}`);
        return null;
      }
    }
    data = ctx.data.get(loaded.file);
  }
  if (!Array.isArray(data)) {
    const what = data === null ? 'null' : typeof data === 'object' ? 'an object' : `a ${typeof data}`;
    diag.error(n.pos, `items needs a JSON array, but ${src.startsWith('[') || src.startsWith('{') ? 'the value' : `"${src}"`} is ${what}`);
    return null;
  }
  return data;
}

/** The {$name} values of one item: its fields (nested ones as a.b), item and index. */
function itemFields(item: unknown, i: number): Map<string, string> {
  const out = new Map<string, string>([
    ['item', str(item)],
    ['index', String(i + 1)],
  ]);
  const walk = (o: object, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      out.set(prefix + k, str(v));
      if (isObject(v)) walk(v, `${prefix}${k}.`);
    }
  };
  if (isObject(item)) walk(item, '');
  return out;
}

function isObject(v: unknown): v is object {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Arrays and objects become JSON, so an inner loop can use them: each items:"{$tags}". */
function str(v: unknown): string {
  return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
