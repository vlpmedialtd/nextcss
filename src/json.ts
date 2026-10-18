// The JSON form of nextcss: same tree, one object per line. Made for tool calls and
// structured output, where a JSON Schema guarantees that every generated page is valid.

import type { Block, Document, Node, Pos, RoleNode } from './ast.js';
import { ROLES, SPACE, TEXT_SIZES, TONES, WIDTHS, type KeyType } from './schema.js';

export type JsonNode =
  | { text: string }
  | { pipe: string }
  | { comment: string }
  | ({ role: string; id?: string; text?: string; texts?: string[]; children?: JsonNode[]; content?: string; signature?: string; tag?: string; attrs?: Record<string, string>; wide?: Record<string, string | true>; narrow?: Record<string, string | true> } & Record<string, unknown>);

export interface JsonDocument {
  $schema?: string;
  nextcss: string;
  nodes: JsonNode[];
}

export function toJson(doc: Document): JsonDocument {
  return { nextcss: '0.1', nodes: doc.nodes.map(nodeToJson) };
}

function nodeToJson(n: Node): JsonNode {
  if (n.kind === 'text') return n.form === 'pipe' ? { pipe: n.raw } : { text: unq(n.raw) };
  if (n.kind === 'comment') return { comment: n.text };
  const o: Record<string, unknown> = { role: n.role };
  if (n.id) o.id = n.id;
  if (n.role === 'define') o.signature = n.rest ?? '';
  let flags = n.flags;
  if (n.role === 'el' && flags[0]) {
    o.tag = flags[0].name;
    flags = flags.slice(1);
  }
  if (n.role === 'columns' || n.role === 'cells') o.texts = n.texts.map((t) => unq(t.raw));
  else if (n.texts[0]) o.text = unq(n.texts[0].raw);
  for (const f of flags) o[f.name] = true;
  for (const p of n.props) o[p.key] = p.value.raw;
  if (n.attrs.length) o.attrs = Object.fromEntries(n.attrs.map((a) => [a.name, a.value.raw]));
  for (const b of n.blocks) o[b.cond] = Object.fromEntries(b.items.map((it) => (it.kind === 'prop' ? [it.key, it.value.raw] : it.kind === 'flag' ? [it.name, true] : [it.cond, '…'])));
  if (n.verbatim) o.content = n.verbatim.join('\n');
  if (n.children.length) o.children = n.children.map(nodeToJson);
  return o as JsonNode;
}

/** Raw string source → plain text with \" resolved (inline Markdown stays). */
function unq(raw: string): string {
  return raw.replace(/\\"/g, '"');
}

/** Text → raw string source. */
function q(text: string): string {
  return text.replace(/(^|[^\\])"/g, '$1\\"').replace(/(^|[^\\])"/g, '$1\\"');
}

export function fromJson(json: JsonDocument): Document {
  let line = 0;
  const pos = (): Pos => ({ line: ++line, col: 1 });
  const conv = (j: JsonNode): Node => {
    if ('text' in j && !('role' in j)) return { kind: 'text', raw: q(String(j.text)), form: 'quoted', pos: pos() };
    if ('pipe' in j) return { kind: 'text', raw: String(j.pipe), form: 'pipe', pos: pos() };
    if ('comment' in j) return { kind: 'comment', text: String(j.comment), pos: pos() };
    const o = j as Record<string, unknown>;
    const p = pos();
    const n: RoleNode = { kind: 'node', role: String(o.role), flags: [], texts: [], props: [], attrs: [], blocks: [], children: [], pos: p };
    for (const [k, v] of Object.entries(o)) {
      switch (k) {
        case 'role':
          break;
        case 'id':
          n.id = String(v);
          break;
        case 'signature':
          n.rest = String(v);
          break;
        case 'tag':
          n.flags.unshift({ kind: 'flag', name: String(v), pos: p });
          break;
        case 'text':
          n.texts.push({ kind: 'string', raw: q(String(v)), pos: p });
          break;
        case 'texts':
          for (const t of v as string[]) n.texts.push({ kind: 'string', raw: q(String(t)), pos: p });
          break;
        case 'attrs':
          for (const [an, av] of Object.entries(v as Record<string, string>)) n.attrs.push({ kind: 'attr', name: an, value: { raw: String(av), quoted: true }, pos: p });
          break;
        case 'content':
          n.verbatim = String(v).split('\n');
          break;
        case 'children':
          n.children = (v as JsonNode[]).map(conv);
          break;
        case 'wide':
        case 'narrow': {
          const items: Block['items'] = [];
          for (const [bk, bv] of Object.entries(v as Record<string, string | true>)) {
            items.push(bv === true ? { kind: 'flag', name: bk, pos: p } : { kind: 'prop', key: bk, value: { raw: String(bv), quoted: false }, pos: p });
          }
          n.blocks.push({ kind: 'block', cond: k, items, pos: p });
          break;
        }
        default:
          if (v === true) n.flags.push({ kind: 'flag', name: k, pos: p });
          else if (v !== false && v !== null && v !== undefined) n.props.push({ kind: 'prop', key: k, value: { raw: String(v), quoted: false }, pos: p });
      }
    }
    return n;
  };
  return { nodes: json.nodes.map(conv) };
}

// ------------------------------------------------------------------ JSON Schema

function keySchema(t: KeyType): Record<string, unknown> {
  switch (t.t) {
    case 'enum':
      return { enum: t.values };
    case 'space':
      return { enum: SPACE };
    case 'textsize':
      return { enum: TEXT_SIZES };
    case 'tone':
      return { enum: TONES };
    case 'width':
      return { anyOf: [{ enum: WIDTHS }, { type: 'string', pattern: '^\\d*\\.?\\d+(px|rem|em|%|ch|vw)$' }] };
    case 'length':
      return { type: 'string', pattern: '^(-?\\d*\\.?\\d+(px|rem|em|%|vw|vh|svh|dvh|ch|fr)|0|(calc|min|max|clamp|var)\\(.*\\))$' };
    case 'int':
      return { type: 'string', pattern: '^\\d+$', description: `${t.min}–${t.max}` };
    case 'ratio':
      return { type: 'string', pattern: '^\\d+(\\.\\d+)?(/\\d+(\\.\\d+)?)?$' };
    case 'idref':
      return { type: 'string', pattern: '^#?[A-Za-z][\\w-]*$' };
    case 'color':
      return { type: 'string', pattern: '^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|oklch\\(.*\\)|rgb\\(.*\\))$' };
    default:
      return { type: 'string' };
  }
}

export function jsonSchema(): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  const roleRefs: { $ref: string }[] = [];
  for (const [role, def] of Object.entries(ROLES)) {
    const props: Record<string, unknown> = { role: { const: role } };
    const styleProps: Record<string, unknown> = {};
    props.id = { type: 'string', pattern: '^[A-Za-z][\\w-]*$' };
    if (def.text === 'multi') props.texts = { type: 'array', items: { type: 'string' } };
    else if (def.text !== 'none') props.text = { type: 'string', description: 'inline Markdown: **bold**, *italic*, `code`, [link](url)' };
    if (role === 'el') props.tag = { type: 'string', description: 'HTML element name' };
    if (role === 'define') props.signature = { type: 'string', description: 'Name(param, other="default")' };
    for (const [k, kd] of Object.entries(def.keys)) {
      props[k] = { ...keySchema(kd.type), description: kd.doc };
      if (!['url', 'string', 'idref'].includes(kd.type.t)) styleProps[k] = props[k];
    }
    for (const [f, doc] of Object.entries(def.flags)) props[f] = { const: true, description: doc };
    if (def.verbatim) props.content = { type: 'string', description: def.verbatim === 'markdown' ? 'Markdown' : 'literal content' };
    if (def.children !== 'none') props.children = { type: 'array', items: { $ref: '#/$defs/node' } };
    props.attrs = { type: 'object', additionalProperties: { type: 'string' }, description: 'raw HTML attributes' };
    if (Object.keys(styleProps).length) {
      props.wide = { type: 'object', properties: styleProps, additionalProperties: false };
      props.narrow = { type: 'object', properties: styleProps, additionalProperties: false };
    }
    const required = ['role', ...Object.entries(def.keys).filter(([, kd]) => kd.required).map(([k]) => k)];
    if (def.text === 'required') required.push('text');
    defs[role] = {
      type: 'object',
      description: def.doc,
      properties: props,
      required,
      patternProperties: role === 'el' ? { '^[a-z][\\w:-]*$': { type: 'string' } } : { '^(data|aria)-[a-z0-9-]+$': { type: 'string' } },
      additionalProperties: false,
    };
    roleRefs.push({ $ref: `#/$defs/${role}` });
  }
  defs.textLine = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false };
  defs.pipeLine = { type: 'object', properties: { pipe: { type: 'string' } }, required: ['pipe'], additionalProperties: false };
  defs.node = { anyOf: [...roleRefs, { $ref: '#/$defs/textLine' }, { $ref: '#/$defs/pipeLine' }] };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/vlpmedialtd/nextcss/schema/nextcss.schema.json',
    title: 'nextcss document',
    type: 'object',
    properties: { nextcss: { const: '0.1' }, nodes: { type: 'array', items: { $ref: '#/$defs/node' } } },
    required: ['nodes'],
    $defs: defs,
  };
}
