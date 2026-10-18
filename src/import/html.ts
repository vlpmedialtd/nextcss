// HTML/CSS → nextcss in plain mode. Goal: the same DOM and the same computed styles.
// The result can then be lifted to roles and tones step by step (by a person or an AI).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse, serialize, serializeOuter } from 'parse5';
import type { Attr, Node, Pos, Prop, RoleNode } from '../ast.js';
import { INLINE_TAGS } from '../data/tags.js';
import { print } from '../print.js';
import { ROLES } from '../schema.js';

type P5Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  data?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: P5Node[];
  content?: P5Node;
  namespaceURI?: string;
  name?: string;
};

export interface ImportOptions {
  file?: string; // for resolving local stylesheets
  readFile?: (path: string) => string | null;
}

export interface ImportResult {
  source: string;
  warnings: string[];
}

const ATTR_NAME = /^[A-Za-z_:@][A-Za-z0-9_:@.-]*$/;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SECTIONING = new Set(['section', 'aside', 'article']);
// HTML element → role that renders exactly the same element in plain mode
const SIMPLE_ROLE: Record<string, string> = {
  header: 'header',
  nav: 'nav',
  main: 'main',
  footer: 'footer',
  aside: 'aside',
  section: 'section',
  article: 'card',
  div: 'box',
  p: 'text',
  hr: 'divider',
};
const RAW_HTML = new Set(['pre', 'textarea', 'svg', 'math', 'template', 'noscript', 'iframe', 'object']);

export function importHtml(html: string, opts: ImportOptions = {}): ImportResult {
  const warnings: string[] = [];
  const doc = parse(html) as unknown as P5Node;
  const pos = (): Pos => ({ line: 0, col: 0 });
  const read =
    opts.readFile ??
    ((p: string) => {
      try {
        return existsSync(p) ? readFileSync(p, 'utf8') : null;
      } catch {
        return null;
      }
    });
  const baseDir = opts.file ? dirname(resolve(opts.file)) : process.cwd();

  const htmlEl = doc.childNodes?.find((n) => n.nodeName === 'html');
  const head = htmlEl?.childNodes?.find((n) => n.nodeName === 'head');
  const body = htmlEl?.childNodes?.find((n) => n.nodeName === 'body');
  const hasDoctype = doc.childNodes?.some((n) => n.nodeName === '#documentType');

  // --- stylesheets, in document order
  const css: string[] = [];
  const collectCss = (el: P5Node): boolean => {
    if (el.nodeName === 'style') {
      const text = (el.childNodes ?? []).map((t) => t.value ?? '').join('');
      const media = attr(el, 'media');
      css.push(media && media !== 'all' ? `@media ${media}{${text}}` : text);
      return true;
    }
    if (el.nodeName === 'link' && /(^|\s)stylesheet(\s|$)/i.test(attr(el, 'rel') ?? '') && attr(el, 'href')) {
      const href = attr(el, 'href')!;
      const media = attr(el, 'media');
      if (/^([a-z]+:)?\/\//i.test(href)) {
        css.push(`@import url("${href}")${media && media !== 'all' ? ` ${media}` : ''};`);
        return true;
      }
      const path = join(baseDir, href.split(/[?#]/)[0]);
      const text = read(path);
      if (text === null) {
        warnings.push(`stylesheet ${href} not found – kept as a link`);
        return false;
      }
      const rewritten = rewriteUrls(text, dirname(path), baseDir);
      css.push(media && media !== 'all' ? `@media ${media}{${rewritten}}` : rewritten);
      return true;
    }
    return false;
  };

  // --- head: everything except stylesheets stays raw
  const headParts: string[] = [];
  for (const c of head?.childNodes ?? []) {
    if (c.nodeName === '#comment') continue;
    if (c.nodeName === '#text') {
      if ((c.value ?? '').trim()) headParts.push(c.value!);
      continue;
    }
    if (collectCss(c)) continue;
    headParts.push(serializeOuter(c as never));
  }

  // --- body
  const madeInline = inlineTargets(css.join('\n'));
  const keepAllSpaces = madeInline.all;

  const makeNode = (role: string, extra: Partial<RoleNode> = {}): RoleNode => ({
    kind: 'node',
    role,
    flags: [],
    texts: [],
    props: [],
    attrs: [],
    blocks: [],
    children: [],
    pos: pos(),
    ...extra,
  });
  const prop = (key: string, raw: string): Prop => ({ kind: 'prop', key, value: { raw, quoted: true }, pos: pos() });
  const rawAttr = (name: string, raw: string): Attr => ({ kind: 'attr', name, value: { raw, quoted: true }, pos: pos() });

  /** Puts id, class, style and the remaining attributes on a node. Returns false if an attribute cannot be expressed. */
  const applyAttrs = (n: RoleNode, el: P5Node, consumed: string[] = []): boolean => {
    for (const a of el.attrs ?? []) {
      if (consumed.includes(a.name)) continue;
      if (!ATTR_NAME.test(a.name)) return false;
      if (a.name === 'id' && ID_RE.test(a.value) && !n.id) n.id = a.value;
      else if (a.name === 'class' && a.value.trim()) n.props.push(prop('class', a.value.trim().replace(/\s+/g, ' ')));
      else if (a.name === 'style' && a.value.trim()) n.props.push(prop('css', a.value.trim()));
      else n.attrs.push(rawAttr(a.name, a.value));
    }
    return true;
  };

  const rawHtml = (el: P5Node): RoleNode => makeNode('html', { verbatim: serializeOuter(el as never).split('\n') });

  let depth = 0;
  const convertChildren = (el: P5Node, parentTag: string): Node[] => {
    const kids = el.childNodes ?? [];
    const out: Node[] = [];
    kids.forEach((c, i) => {
      if (c.nodeName === '#comment') return;
      if (c.nodeName === '#text') {
        const t = collapse(c.value ?? '');
        if (t.trim() === '') {
          if (keepWhitespace(kids, i, madeInline)) out.push({ kind: 'text', raw: ' ', form: 'quoted', pos: pos() });
          return;
        }
        out.push({ kind: 'text', raw: escapeText(t), form: 'quoted', pos: pos() });
        return;
      }
      if (c.nodeName === 'style' || (c.nodeName === 'link' && collectCssPeek(c))) {
        collectCss(c);
        return;
      }
      const n = convert(c);
      if (n) out.push(n);
    });
    return mergeInline(out);
  };

  const collectCssPeek = (c: P5Node) => /(^|\s)stylesheet(\s|$)/i.test(attr(c, 'rel') ?? '');

  const convert = (el: P5Node): RoleNode | null => {
    const tag = el.nodeName;
    if (el.namespaceURI && !el.namespaceURI.endsWith('xhtml')) return rawHtml(el);
    if (RAW_HTML.has(tag)) return rawHtml(el);
    if (tag === 'script') {
      const n = makeNode('script', { verbatim: (el.childNodes ?? []).map((t) => t.value ?? '').join('').split('\n') });
      if (!applyAttrs(n, el)) return rawHtml(el);
      if ((n.verbatim ?? []).join('').trim() === '') n.verbatim = [];
      return n;
    }
    // headings
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      const level = Number(h[1]);
      const n = makeNode('title');
      if (level !== Math.min(6, 1 + depth)) n.props.push(prop('level', String(level)));
      return finish(n, el, tag);
    }
    if (tag === 'a' && attr(el, 'href') !== undefined) {
      const n = makeNode('link');
      n.props.push(prop('to', attr(el, 'href')!));
      return finish(n, el, tag, ['href']);
    }
    if (tag === 'img' && attr(el, 'src') !== undefined) {
      const n = makeNode('image');
      n.props.push(prop('src', attr(el, 'src')!));
      if (attr(el, 'alt') !== undefined) n.props.push(prop('alt', attr(el, 'alt')!));
      if (!applyAttrs(n, el, ['src', 'alt'])) return rawHtml(el);
      return n;
    }
    if (
      (tag === 'ul' || tag === 'ol') &&
      !keepAllSpaces &&
      !(el.childNodes ?? []).some((c) => c.nodeName === 'li' && madeInline.matches(c)) &&
      (el.childNodes ?? []).every((c) => c.nodeName === 'li' || c.nodeName === '#text' || c.nodeName === '#comment')
    ) {
      const n = makeNode('list');
      if (tag === 'ol') n.flags.push({ kind: 'flag', name: 'ordered', pos: pos() });
      return finish(n, el, tag, [], true);
    }
    if (tag === 'li') return finish(makeNode('item'), el, tag);
    const simple = SIMPLE_ROLE[tag];
    if (simple) return finish(makeNode(simple), el, tag);
    // anything else: el <tag>
    const n = makeNode('el');
    n.flags.push({ kind: 'flag', name: tag, pos: pos() });
    return finish(n, el, tag);
  };

  /** attributes + content; falls back to raw HTML when something does not fit */
  const finish = (n: RoleNode, el: P5Node, tag: string, consumed: string[] = [], listOnly = false): RoleNode => {
    if (!applyAttrs(n, el, consumed)) return rawHtml(el);
    if (SECTIONING.has(tag)) depth++;
    let kids = convertChildren(el, tag);
    if (SECTIONING.has(tag)) depth--;
    if (listOnly) kids = kids.filter((k) => !(k.kind === 'text' && k.raw === ' '));
    // inline-only roles cannot hold block children
    const inlineOnly = ['title', 'text', 'link'].includes(n.role);
    if (inlineOnly && kids.some((k) => k.kind === 'node' && !['link', 'image', 'el', 'html'].includes(k.role))) {
      return rawHtml(el);
    }
    if (kids.length === 1 && kids[0].kind === 'text' && n.role !== 'html' && ROLES[n.role].text !== 'none') {
      n.texts.push({ kind: 'string', raw: kids[0].raw, pos: pos() });
    } else n.children = kids;
    return n;
  };

  const content: Node[] = [];
  let bodyNode: RoleNode | null = null;
  if (body) {
    const kids = convertChildren(body, 'body');
    if ((body.attrs ?? []).length) {
      bodyNode = makeNode('body');
      if (!applyAttrs(bodyNode, body)) warnings.push('body attributes could not be imported');
      bodyNode.children = kids;
    } else content.push(...kids);
  }

  // --- assemble
  const nodes: Node[] = [];
  const page = makeNode('page');
  page.flags.push({ kind: 'flag', name: 'plain', pos: pos() });
  if (!hasDoctype) page.flags.push({ kind: 'flag', name: 'nodoctype', pos: pos() });
  for (const a of htmlEl?.attrs ?? []) {
    if (a.name === 'lang') page.props.push(prop('lang', a.value));
    else if (ATTR_NAME.test(a.name)) page.attrs.push(rawAttr(a.name, a.value));
  }
  nodes.push(page);
  if (headParts.length) nodes.push(makeNode('head', { verbatim: headParts.join('').split('\n') }));
  if (css.length) nodes.push(makeNode('css', { verbatim: css.join('\n').split('\n') }));
  if (bodyNode) nodes.push(bodyNode);
  else nodes.push(...content);

  return { source: print({ nodes }), warnings };
}

function attr(el: P5Node, name: string): string | undefined {
  return el.attrs?.find((a) => a.name === name)?.value;
}

function collapse(s: string): string {
  return s.replace(/[\t\n\f\r ]+/g, ' ');
}

/** Text → nextcss string source (Markdown and string syntax escaped). */
export function escapeText(t: string): string {
  return t
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/([{}*`[\]])/g, '\\$1')
    .replace(/&(?=[a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

interface InlineTargets {
  all: boolean;
  matches(el: P5Node): boolean;
}

/** Which elements does the stylesheet turn into inline boxes? (whitespace between them renders) */
function inlineTargets(css: string): InlineTargets {
  const tags = new Set<string>();
  const classes = new Set<string>();
  const ids = new Set<string>();
  let all = false;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display\s*:\s*inline/i.test(m[2])) continue;
    for (const sel of m[1].split(',')) {
      const last = sel.trim().split(/[\s>+~]+/).pop() ?? '';
      const compound = last.replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
      const tag = /^[a-z][a-z0-9-]*/i.exec(compound)?.[0];
      const cls = [...compound.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
      const id = [...compound.matchAll(/#([\w-]+)/g)].map((x) => x[1]);
      if (!tag && !cls.length && !id.length) all = true;
      if (tag && !cls.length && !id.length) tags.add(tag.toLowerCase());
      cls.forEach((c) => classes.add(c));
      id.forEach((i) => ids.add(i));
    }
  }
  return {
    all,
    matches(el: P5Node) {
      if (!el.attrs) return false;
      if (tags.has(el.nodeName)) return true;
      if (/display\s*:\s*inline/i.test(attr(el, 'style') ?? '')) return true;
      const id = attr(el, 'id');
      if (id && ids.has(id)) return true;
      return (attr(el, 'class') ?? '').split(/\s+/).some((c) => classes.has(c));
    },
  };
}

/** Whitespace-only text between elements: does it render? */
function keepWhitespace(kids: P5Node[], i: number, t: InlineTargets): boolean {
  if (t.all) return true;
  const neighbor = (dir: -1 | 1): P5Node | undefined => {
    for (let j = i + dir; j >= 0 && j < kids.length; j += dir) if (kids[j].nodeName !== '#comment') return kids[j];
    return undefined;
  };
  const inl = (n?: P5Node) => !!n && (n.nodeName === '#text' || INLINE_TAGS.has(n.nodeName) || t.matches(n));
  return inl(neighbor(-1)) && inl(neighbor(1));
}

/** Simple <strong>, <em>, <code> and <a href> become inline Markdown inside one string. */
function mergeInline(nodes: Node[]): Node[] {
  const md = (n: Node): string | null => {
    if (n.kind === 'text') return n.raw;
    if (n.kind !== 'node' || n.attrs.length || n.id || n.blocks.length) return null;
    const onlyText = n.children.length === 0 && n.texts.length === 1;
    if (!onlyText) return null;
    const t = n.texts[0].raw;
    if (t.startsWith(' ') || t.endsWith(' ') || t === '') return null;
    if (n.role === 'el' && n.props.length === 0 && n.flags.length === 1) {
      const tag = n.flags[0].name;
      if (tag === 'strong') return `**${t}**`;
      if (tag === 'em') return `*${t}*`;
      if (tag === 'code') return '`' + t.replace(/\\(.)/g, '$1') + '`';
    }
    if (n.role === 'link' && n.props.length === 1 && n.flags.length === 0) {
      const to = n.props[0].value.raw;
      if (!/[\s()]/.test(to)) return `[${t}](${to})`;
    }
    return null;
  };
  const out: Node[] = [];
  let run: string[] = [];
  let runNodes: Node[] = [];
  const flush = () => {
    if (!run.length) return;
    const hasText = runNodes.some((n) => n.kind === 'text');
    if (runNodes.length === 1 && !hasText) out.push(runNodes[0]);
    else out.push({ kind: 'text', raw: run.join(''), form: 'quoted', pos: { line: 0, col: 0 } });
    run = [];
    runNodes = [];
  };
  for (const n of nodes) {
    const m = md(n);
    if (m === null) {
      flush();
      out.push(n);
    } else {
      run.push(m);
      runNodes.push(n);
    }
  }
  flush();
  return out;
}

/** Relative url() in a stylesheet must keep pointing to the same file after inlining. */
function rewriteUrls(css: string, cssDir: string, htmlDir: string): string {
  if (resolve(cssDir) === resolve(htmlDir)) return css;
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q: string, u: string) => {
    if (/^([a-z]+:|\/|#)/i.test(u)) return all;
    const rel = relative(htmlDir, join(cssDir, u)).replace(/\\/g, '/');
    return `url(${q}${rel}${q})`;
  });
}

export { serialize };
