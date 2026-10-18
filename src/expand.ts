// Components: `define`, `slot`, `use`, and {$param} interpolation.

import type { Node, Pos, RoleNode } from './ast.js';
import { Diagnostics, suggest } from './diag.js';
import { parse } from './parser.js';

export interface Component {
  name: string;
  params: { name: string; def?: string }[];
  root: RoleNode;
  pos: Pos;
  external?: boolean; // defined in a file loaded with `use`
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
        const c = parseDefine(n, diag);
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

function parseDefine(n: RoleNode, diag: Diagnostics): Component | null {
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
  return { name: m[1], params, root: roots[0], pos: n.pos };
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

/** Replaces component instances by their expanded templates. */
export function expand(nodes: Node[], components: Map<string, Component>, diag: Diagnostics, depth = 0): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.kind !== 'node') {
      out.push(n);
      continue;
    }
    if (/^[A-Z]/.test(n.role)) {
      const c = components.get(n.role);
      if (!c) {
        diag.error(n.pos, `unknown component "${n.role}"${suggest(n.role, components.keys())}`);
        continue;
      }
      if (depth > 30) {
        diag.error(n.pos, `component "${n.role}" uses itself`);
        continue;
      }
      const inst = instantiate(n, c, components, diag, depth);
      if (inst) out.push(inst);
      continue;
    }
    out.push({ ...n, children: expand(n.children, components, diag, depth) });
  }
  return out;
}

function instantiate(inst: RoleNode, c: Component, components: Map<string, Component>, diag: Diagnostics, depth: number): RoleNode | null {
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
  const sub = (s: string) =>
    s.replace(/\{\$([A-Za-z_][\w-]*)\}/g, (all, name: string) => {
      if (values.has(name)) return values.get(name)!;
      diag.error(inst.pos, `component "${c.name}" has no parameter "${name}"`);
      return all;
    });

  // positions inside another file mean nothing here: point to the instance line instead
  const at = (p: Pos): Pos => (c.external ? inst.pos : p);
  const clone = (node: Node): Node[] => {
    if (node.kind === 'comment') return [];
    if (node.kind === 'text') return [{ ...node, raw: sub(node.raw), pos: at(node.pos) }];
    if (node.role === 'slot') return inst.children.map((ch) => ch);
    return [
      {
        ...node,
        pos: at(node.pos),
        texts: node.texts.map((t) => ({ ...t, raw: sub(t.raw) })),
        props: node.props
          .map((p) => ({ ...p, value: { ...p.value, raw: sub(p.value.raw) }, fromParam: p.value.raw.includes('{$') }))
          .filter((p) => !(p.fromParam && p.value.raw === ''))
          .map(({ fromParam: _, ...p }) => p),
        attrs: node.attrs.map((a) => ({ ...a, value: { ...a.value, raw: sub(a.value.raw) } })),
        verbatim: node.verbatim?.map(sub),
        children: node.children.flatMap(clone),
      },
    ];
  };

  const hasSlot = (node: Node): boolean => node.kind === 'node' && (node.role === 'slot' || node.children.some(hasSlot));
  if (inst.children.some((ch) => ch.kind !== 'comment') && !hasSlot(c.root)) {
    diag.error(inst.pos, `component "${c.name}" has no slot for child lines`);
  }
  const [root] = clone(c.root) as RoleNode[];
  const merged: RoleNode = {
    ...root,
    id: inst.id ?? root.id,
    flags: [...root.flags, ...extraFlags],
    props: [...root.props.filter((p) => !extraProps.some((e) => e.key === p.key)), ...extraProps],
    attrs: [...root.attrs, ...inst.attrs],
    blocks: [...root.blocks, ...inst.blocks],
    pos: inst.pos,
  };
  dropEmpty(merged);
  return expand([merged], components, diag, depth + 1)[0] as RoleNode;
}

/** Text lines and texts that became empty through empty optional params are removed. */
function dropEmpty(n: RoleNode): void {
  n.texts = n.texts.filter((t) => t.raw !== '');
  n.children = n.children.filter((c) => {
    if (c.kind === 'text') return c.raw !== '';
    if (c.kind === 'node') {
      dropEmpty(c);
      // a content role whose only text became empty disappears
      const textual = ['text', 'title', 'badge', 'item'];
      if (textual.includes(c.role) && c.texts.length === 0 && c.children.length === 0) return false;
    }
    return true;
  });
}
