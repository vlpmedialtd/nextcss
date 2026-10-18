// AST → canonical line format (nextcss fmt). The importer and the JSON converter print through this.

import type { Attr, Block, Document, Node, Prop, RoleNode } from './ast.js';
import { ROLES, isPassthroughKey } from './schema.js';

export function print(doc: Document): string {
  const out: string[] = [];
  const top = doc.nodes;
  top.forEach((n, i) => {
    const prev = top[i - 1];
    const isHeader = (x: Node | undefined) => x?.kind === 'node' && ['page', 'theme', 'use'].includes(x.role);
    // a comment belongs to the line below it; header lines (page, theme, use) stay together
    if (i > 0 && prev?.kind !== 'comment' && !(isHeader(n) && isHeader(prev))) out.push('');
    printNode(n, 0, out);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function printNode(n: Node, level: number, out: string[]): void {
  const ind = '  '.repeat(level);
  if (n.kind === 'comment') {
    out.push(`${ind}// ${n.text}`);
    return;
  }
  if (n.kind === 'text') {
    out.push(n.form === 'pipe' ? `${ind}| ${n.raw}` : `${ind}"${quoteRaw(n.raw)}"`);
    return;
  }
  out.push(ind + line(n));
  if (n.verbatim) {
    for (const l of n.verbatim) out.push(l === '' ? '' : `${ind}  ${l}`);
    return;
  }
  for (const c of n.children) printNode(c, level + 1, out);
}

/** One node as a single line (without children). */
export function line(n: RoleNode): string {
  if (n.role === 'define') return `define ${n.rest ?? ''}`.trimEnd();
  const def = ROLES[n.role];
  const parts: string[] = [n.role + (n.id ? `#${n.id}` : '')];
  // el keeps its tag right after the role
  const flags = n.role === 'el' ? n.flags.slice(1) : n.flags;
  if (n.role === 'el' && n.flags[0]) parts.push(n.flags[0].name);
  parts.push(...n.texts.map((t) => `"${quoteRaw(t.raw)}"`));
  // flags follow schema order
  if (n.role === 'el' || !def) parts.push(...flags.map((f) => f.name));
  else {
    const order = Object.keys(def.flags);
    parts.push(...[...n.flags].sort((a, b) => rank(order, a.name) - rank(order, b.name)).map((f) => f.name));
  }
  parts.push(...sortProps(n, n.props).map(propText));
  parts.push(...n.attrs.map(attrText));
  const blocks = [...n.blocks].sort((a, b) => (a.cond === 'wide' ? 0 : 1) - (b.cond === 'wide' ? 0 : 1));
  parts.push(...blocks.map((b) => blockText(n, b)));
  return parts.join(' ');
}

function rank(order: string[], k: string): number {
  const i = order.indexOf(k);
  return i < 0 ? 1000 : i;
}

function sortProps(n: RoleNode, props: Prop[]): Prop[] {
  const def = ROLES[n.role];
  if (!def || n.role === 'el') return props;
  const order = Object.keys(def.keys);
  const keyed = props.filter((p) => !isPassthroughKey(p.key) || def.keys[p.key]);
  const pass = props.filter((p) => isPassthroughKey(p.key) && !def.keys[p.key]);
  // css always last among keys
  return [...keyed.sort((a, b) => rank(order, a.key) - rank(order, b.key))].sort((a, b) => (a.key === 'css' ? 1 : 0) - (b.key === 'css' ? 1 : 0)).concat(pass);
}

function propText(p: Prop): string {
  // raw CSS is always quoted: css:"color:red" reads better than css:color:red
  if (p.key === 'css') return `css:"${p.value.raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `${p.key}:${value(p.value.raw, p.value.quoted)}`;
}

function attrText(a: Attr): string {
  return `${a.name}=${value(a.value.raw, a.value.quoted)}`;
}

function blockText(n: RoleNode, b: Block): string {
  const items = b.items.map((it) => (it.kind === 'prop' ? propText(it) : it.kind === 'flag' ? it.name : blockText(n, it)));
  return `${b.cond}${b.arg !== undefined ? `"${b.arg}"` : ''}{${items.join(' ')}}`;
}

/** Bare when unambiguous, otherwise quoted. */
export function value(raw: string, _wasQuoted = false): string {
  if (raw !== '' && !/[\s"{}]/.test(raw) && !unbalancedParens(raw)) return raw;
  if (raw.startsWith('[') && isJson(raw)) return raw; // inline data: each items:["a","b"]
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function isJson(s: string): boolean {
  if (s.trim() !== s) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

function unbalancedParens(s: string): boolean {
  let d = 0;
  for (const c of s) {
    if (c === '(') d++;
    else if (c === ')') d--;
    if (d < 0) return true;
  }
  return d !== 0;
}

/** Text raw source: quotes must be escaped inside "…". */
export function quoteRaw(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\') {
      out += c + (raw[i + 1] ?? '');
      i++;
    } else if (c === '"' && !insideBraces(raw, i)) out += '\\"';
    else out += c;
  }
  return out;
}

/** Quotes inside {…} inline elements are string delimiters, not text. */
function insideBraces(raw: string, idx: number): boolean {
  let depth = 0;
  for (let i = 0; i < idx; i++) {
    if (raw[i] === '\\') {
      i++;
      continue;
    }
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}
