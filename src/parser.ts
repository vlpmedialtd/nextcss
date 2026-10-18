import type { Document, Node, RoleNode } from './ast.js';
import { Diagnostics, suggest } from './diag.js';
import { LineLexer, type LineTokens } from './lexer.js';
import { ROLES } from './schema.js';

interface Frame {
  level: number;
  node: RoleNode | null; // null = document root
  children: Node[];
}

/** Line format → AST. Only syntax is checked here; vocabulary is checked in validate.ts. */
export function parse(src: string, diag: Diagnostics): Document {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const root: Frame = { level: -1, node: null, children: [] };
  const stack: Frame[] = [root];

  for (let n = 0; n < lines.length; n++) {
    const text = lines[n];
    const lineNo = n + 1;
    if (text.trim() === '') continue;
    let indent = /^( *)/.exec(text)![1].length;
    if (text[indent] === '\t') {
      diag.error({ line: lineNo, col: indent + 1 }, 'tabs are not allowed; indent with two spaces');
      continue;
    }
    if (indent % 2 !== 0) {
      diag.error({ line: lineNo, col: 1 }, `indent with multiples of two spaces (found ${indent})`);
      indent -= 1;
    }
    let level = indent / 2;
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    if (level > parent.level + 1) {
      diag.error({ line: lineNo, col: 1 }, 'indentation jumps more than one level');
      level = parent.level + 1;
    }
    const content = text.slice(indent).replace(/\s+$/, '');
    const tokens = new LineLexer(content, lineNo, indent, diag).lex();
    if (!tokens) continue;
    const node = buildNode(tokens, diag);
    if (!node) continue;

    parent.children.push(node);

    if (node.kind === 'node' && isVerbatim(node)) {
      const body: string[] = [];
      const minIndent = indent + 2;
      while (n + 1 < lines.length) {
        const next = lines[n + 1];
        const nextIndent = /^( *)/.exec(next)![1].length;
        if (next.trim() !== '' && nextIndent < minIndent) break;
        body.push(next.trim() === '' ? '' : next.slice(minIndent));
        n++;
      }
      while (body.length && body[body.length - 1] === '') body.pop();
      node.verbatim = body;
      continue;
    }
    if (node.kind === 'node') stack.push({ level, node, children: node.children });
    else stack.push({ level, node: null, children: rejecting(node.kind === 'text' ? 'a text line' : 'a comment', diag) });
  }
  return { nodes: root.children };
}

function isVerbatim(node: RoleNode): boolean {
  return !!ROLES[node.role]?.verbatim;
}

function rejecting(what: string, diag: Diagnostics): Node[] {
  const arr: Node[] = [];
  arr.push = (...items: Node[]) => {
    for (const it of items) diag.error(it.pos, `${what} cannot have children`);
    return arr.length;
  };
  return arr;
}

/** Parses a single line (used for inline elements inside text: {link "x" to:/y}). */
export function parseLine(src: string, pos: { line: number; col: number }, diag: Diagnostics): Node | null {
  const tokens = new LineLexer(src, pos.line, pos.col - 1, diag).lex();
  return tokens ? buildNode(tokens, diag) : null;
}

function buildNode(tokens: LineTokens, diag: Diagnostics): Node | null {
  const { head, items } = tokens;
  if (head.kind === 'comment') return { kind: 'comment', text: head.text, pos: head.pos };
  if (head.kind === 'string') return { kind: 'text', raw: head.raw, form: 'quoted', pos: head.pos };
  if (head.kind === 'pipe') return { kind: 'text', raw: head.text, form: 'pipe', pos: head.pos };

  const hm = /^([A-Za-z][A-Za-z0-9-]*)(?:#([A-Za-z][A-Za-z0-9_-]*))?$/.exec(head.text);
  if (!hm) {
    if (head.text.startsWith('.') || head.text.includes('.')) {
      diag.error(head.pos, 'nextcss has no classes – style with keys like tone:subtle gap:l, or use css:"…"');
    } else diag.error(head.pos, `invalid line start "${head.text}"`);
    return null;
  }
  const role = hm[1];
  if (!/^[A-Z]/.test(role) && !ROLES[role]) {
    diag.error(head.pos, `unknown role "${role}"${suggest(role, Object.keys(ROLES))}`);
    return null;
  }
  const node: RoleNode = {
    kind: 'node',
    role,
    ...(hm[2] ? { id: hm[2] } : {}),
    flags: [],
    texts: [],
    props: [],
    attrs: [],
    blocks: [],
    children: [],
    pos: head.pos,
    ...(tokens.rest !== undefined ? { rest: tokens.rest } : {}),
  };
  for (const it of items) {
    switch (it.kind) {
      case 'flag':
        node.flags.push(it);
        break;
      case 'string':
        node.texts.push(it);
        break;
      case 'prop':
        node.props.push(it);
        break;
      case 'attr':
        node.attrs.push(it);
        break;
      case 'block':
        node.blocks.push(it);
        break;
      case 'classref':
        diag.error(it.pos, 'nextcss has no classes – style with keys like tone:subtle gap:l, or use css:"…"');
        break;
    }
  }
  return node;
}
