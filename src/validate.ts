// Checks expanded nodes against the schema. Every message says how to fix it.

import type { Block, Node, Prop, RoleNode } from './ast.js';
import { parseColor } from './color.js';
import { BOOLEAN_ATTRS, HTML_TAGS, isCustomElement } from './data/tags.js';
import { Diagnostics, suggest } from './diag.js';
import { BLOCK_CONDS, ROLES, SPACE, TEXT_SIZES, TONES, WIDTHS, isPassthroughKey, type KeyType } from './schema.js';

export const LENGTH_RE =
  /^(-?(\d+\.?\d*|\.\d+)(px|rem|em|%|vw|vh|dvh|svh|lvh|ch|ex|vmin|vmax|fr|lh|rlh|cqi|cqw|cqh|cqb)|0|(calc|min|max|clamp|var|env)\(.*\))$/;

/** Flags that may appear inside wide{} / narrow{} blocks. */
const STYLE_FLAGS = new Set(['grow', 'nowrap', 'vertical', 'reverse', 'muted', 'lead', 'full', 'striped', 'sticky', 'plain']);

export interface ValidateResult {
  ids: Map<string, RoleNode>;
}

export function checkValue(type: KeyType, v: string): string | null {
  switch (type.t) {
    case 'enum':
      return type.values.includes(v) ? null : `one of ${type.values.join(', ')}${suggest(v, type.values)}`;
    case 'space':
      return SPACE.includes(v) ? null : `a space step: ${SPACE.join(' ')}${suggest(v, SPACE)}`;
    case 'textsize':
      return TEXT_SIZES.includes(v) ? null : `a text size: ${TEXT_SIZES.join(' ')}${suggest(v, TEXT_SIZES)}`;
    case 'tone':
      return TONES.includes(v) ? null : `a tone: ${TONES.join(', ')}${suggest(v, TONES)}`;
    case 'width':
      return WIDTHS.includes(v) || LENGTH_RE.test(v) ? null : `narrow, text, wide, full or a length like 50rem${suggest(v, WIDTHS)}`;
    case 'length':
      return LENGTH_RE.test(v) ? null : 'a length with unit, e.g. 16rem or 240px';
    case 'int': {
      const n = Number(v);
      return Number.isInteger(n) && n >= type.min && n <= type.max ? null : `a whole number from ${type.min} to ${type.max}`;
    }
    case 'ratio':
      return /^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/.test(v) ? null : 'a ratio like 16/9';
    case 'idref':
      return /^#?[A-Za-z][\w-]*$/.test(v) ? null : 'the id of an element, e.g. menu';
    case 'color':
      return parseColor(v) ? null : 'a color like #0a66c2 or oklch(0.55 0.15 250)';
    case 'url':
    case 'string':
    case 'css':
    case 'data': // checked when the items are loaded (expand.ts)
      return null;
  }
}

export function validate(nodes: Node[], diag: Diagnostics, plain: boolean): ValidateResult {
  const ids = new Map<string, RoleNode>();
  const refs: { node: RoleNode; prop: Prop }[] = [];

  const walk = (list: Node[], parent: RoleNode | null) => {
    for (const n of list) {
      if (n.kind === 'comment') continue;
      if (n.kind === 'text') {
        if (parent) {
          const pdef = ROLES[parent.role];
          if (pdef.children === 'none' || (Array.isArray(pdef.children) && !pdef.children.includes('text'))) {
            diag.error(n.pos, `"${parent.role}" cannot contain text lines`);
          }
        }
        continue;
      }
      const def = ROLES[n.role];
      if (!def) {
        diag.error(n.pos, `unknown role "${n.role}"${suggest(n.role, Object.keys(ROLES))}`);
        continue;
      }
      // placement
      if (def.topOnly && parent && parent.role !== 'body') diag.error(n.pos, `"${n.role}" must be at the top level (no indentation)`);
      if (n.role === 'slot') diag.error(n.pos, 'slot is only allowed inside define');
      if (parent) {
        const pdef = ROLES[parent.role];
        if (pdef.children === 'none') diag.error(n.pos, `"${parent.role}" cannot have child lines`);
        else if (pdef.children === 'inline' && !def.inline) diag.error(n.pos, `"${n.role}" cannot be inside "${parent.role}" (only text and inline roles)`);
        else if (Array.isArray(pdef.children) && !pdef.children.includes(n.role)) {
          diag.error(n.pos, `"${parent.role}" can only contain ${pdef.children.filter((c) => c !== 'comment').join(', ')}`);
        }
      }
      if (n.role === 'columns' || n.role === 'cells') {
        if (parent?.role !== 'table') diag.error(n.pos, `"${n.role}" belongs inside table`);
      }
      if (n.role === 'option' && !(parent?.role === 'field')) diag.error(n.pos, 'option belongs inside field type:select');
      if (n.role === 'tab' && parent?.role !== 'tabs') diag.error(n.pos, 'tab belongs inside tabs');

      // id
      if (n.id) {
        if (ids.has(n.id)) diag.error(n.pos, `id "#${n.id}" is used twice`);
        ids.set(n.id, n);
      }

      // texts
      const texts = n.texts.length;
      if (def.text === 'none' && texts) diag.error(n.texts[0].pos, `"${n.role}" takes no text string`);
      if ((def.text === 'optional' || def.text === 'required') && texts > 1) diag.error(n.texts[1].pos, `"${n.role}" takes one text string`);
      if (def.text === 'required' && !texts) diag.error(n.pos, `"${n.role}" needs a text: ${n.role} "…"`, `${n.role} "…"`);

      // flags
      const flagNames = new Set<string>();
      const elTag = n.role === 'el' ? n.flags[0]?.name : undefined;
      n.flags.forEach((f, i) => {
        if (n.role === 'el') {
          if (i === 0) {
            if (!HTML_TAGS.has(f.name) && !isCustomElement(f.name) && f.name !== 'svg' && f.name !== 'math') {
              diag.error(f.pos, `unknown HTML element "${f.name}"${suggest(f.name, HTML_TAGS)}`);
            }
          } else if (!BOOLEAN_ATTRS.has(f.name)) diag.error(f.pos, `"${f.name}" is not a boolean attribute; write ${f.name}:"…"`);
          return;
        }
        if (!(f.name in def.flags)) {
          diag.error(f.pos, `"${f.name}" is not a flag of ${n.role}${suggest(f.name, Object.keys(def.flags))}${hint(def)}`);
        }
        flagNames.add(f.name);
      });
      if (n.role === 'el' && !elTag) diag.error(n.pos, 'el needs a tag: el abbr "WHO"');

      // props
      const seen = new Set<string>();
      for (const p of n.props) {
        if (seen.has(p.key)) diag.error(p.pos, `"${p.key}" is set twice`);
        seen.add(p.key);
        checkProp(n, p, diag, false);
        if (p.key === 'opens' || p.key === 'closes') refs.push({ node: n, prop: p });
      }
      for (const [key, kd] of Object.entries(def.keys)) {
        if (kd.required && !seen.has(key)) diag.error(n.pos, `"${n.role}" needs ${key}:…`, `${key}:"…"`);
      }
      for (const b of n.blocks) checkBlock(n, b, diag);

      // role specifics
      if (n.role === 'image' && !plain) {
        if (!seen.has('alt') && !flagNames.has('decorative')) {
          diag.error(n.pos, 'image needs alt:"…" (what it shows), or the flag decorative', 'alt:"…"');
        }
      }
      if ((n.role === 'menu' || n.role === 'dialog') && !n.id) diag.error(n.pos, `${n.role} needs an id: ${n.role}#name`);
      if (n.role === 'link' && !texts && !n.children.length) diag.error(n.pos, 'link needs a text: link "…" to:/url');
      if (n.role === 'button' && !texts && !n.children.length && !n.attrs.some((a) => a.name === 'aria-label')) {
        diag.error(n.pos, 'button needs a text: button "…"');
      }
      if (n.role === 'check' && n.props.some((p) => p.key === 'type' && p.value.raw === 'radio') && !seen.has('name')) {
        diag.error(n.pos, 'radio buttons of one group need the same name:…');
      }
      if (n.role === 'field') {
        const type = n.props.find((p) => p.key === 'type')?.value.raw;
        const hasOptions = n.children.some((c) => c.kind === 'node' && c.role === 'option');
        if (hasOptions && type !== 'select') diag.error(n.pos, 'a field with options needs type:select');
        if (type === 'select' && !hasOptions) diag.error(n.pos, 'type:select needs option lines');
      }
      if (n.role === 'tabs') {
        const tabs = n.children.filter((c): c is RoleNode => c.kind === 'node' && c.role === 'tab');
        if (!tabs.length) diag.error(n.pos, 'tabs needs tab lines: tab "Label"');
        for (const extra of tabs.filter((t) => t.flags.some((f) => f.name === 'open')).slice(1)) {
          diag.warn(extra.pos, 'only one tab can be open initially; the first one with open is shown');
        }
      }

      walk(n.children, n);
    }
  };
  walk(nodes, null);

  for (const { node, prop } of refs) {
    const target = ids.get(prop.value.raw.replace(/^#/, ''));
    if (!target) diag.error(prop.pos, `no element with id "${prop.value.raw}"${suggest(prop.value.raw, ids.keys())}`);
    else if (target.role !== 'menu' && target.role !== 'dialog') {
      diag.error(prop.pos, `${prop.key} needs a menu or dialog, but #${target.id} is a ${target.role}`);
    }
    void node;
  }
  return { ids };
}

function hint(def: { flags: Record<string, string> }): string {
  const f = Object.keys(def.flags);
  return f.length ? ` (flags: ${f.join(', ')})` : ' (this role has no flags; keys need a value: key:value)';
}

function checkProp(n: RoleNode, p: Prop, diag: Diagnostics, inBlock: boolean): void {
  const def = ROLES[n.role];
  if (n.role === 'el' && !['css', 'hide'].includes(p.key)) return; // el: keys become attributes
  const kd = def.keys[p.key];
  if (!kd) {
    if (isPassthroughKey(p.key) && !inBlock) return;
    diag.error(
      p.pos,
      `"${n.role}" has no key "${p.key}"${suggest(p.key, Object.keys(def.keys))}` +
        (Object.keys(def.keys).length ? ` (keys: ${Object.keys(def.keys).join(', ')})` : ''),
    );
    return;
  }
  if (inBlock && ['url', 'string', 'idref', 'data'].includes(kd.type.t)) {
    diag.error(p.pos, `"${p.key}" cannot change inside a block`);
    return;
  }
  const err = checkValue(kd.type, p.value.raw);
  if (err) {
    const fixMatch = /did you mean "([^"]+)"/.exec(err);
    diag.error(p.pos, `${p.key}:${p.value.raw} – expected ${err}`, fixMatch ? `${p.key}:${fixMatch[1]}` : undefined);
  }
}

function checkBlock(n: RoleNode, b: Block, diag: Diagnostics): void {
  if (!BLOCK_CONDS.includes(b.cond)) {
    diag.error(b.pos, `unknown block "${b.cond}{…}" – use wide{…} or narrow{…}${suggest(b.cond, BLOCK_CONDS)}`);
    return;
  }
  for (const it of b.items) {
    if (it.kind === 'prop') checkProp(n, it, diag, true);
    else if (it.kind === 'flag') {
      if (!(it.name in ROLES[n.role].flags) || !STYLE_FLAGS.has(it.name)) diag.error(it.pos, `"${it.name}" cannot be used inside ${b.cond}{…}`);
    } else if (it.kind === 'block') diag.error(it.pos, 'blocks cannot be nested');
    else diag.error((it as { pos: Block['pos'] }).pos, 'only keys and flags are allowed inside a block');
  }
}
