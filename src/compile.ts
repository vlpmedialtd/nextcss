import type { Diagnostic, Document, Node, RoleNode } from './ast.js';
import { buildDesign, toneCss, type Design, type ThemeInput } from './design.js';
import { Diagnostics } from './diag.js';
import { collect, expand, type Loader } from './expand.js';
import { escAttr, escText } from './markdown.js';
import { parse } from './parser.js';
import { Renderer, attr } from './render.js';
import { StyleRegistry } from './styles.js';
import { validate } from './validate.js';

export interface CompileOptions {
  file?: string;
  /** Loads `use` files. */
  load?: Loader;
  /** Pixel size of a local image, for width/height attributes. */
  imageSize?: (src: string) => { width: number; height: number } | null;
  /** Reads local files (SVG icons). */
  readFile?: (path: string) => string | null;
  /** Lazy loading, image dimensions. Default true. */
  optimize?: boolean;
  /** Link the CSS from this URL instead of inlining it. */
  cssHref?: string;
  /** Adds data-nc="<line>" to every element (used by inspect). */
  debugLines?: boolean;
  /** Share one registry across pages (one cached stylesheet for a site). */
  styles?: StyleRegistry;
}

export interface CompileResult {
  html: string; // full document, or a fragment when there is no page line
  css: string;
  diagnostics: Diagnostic[];
  design?: Design;
  isPage: boolean;
  rawCss: string;
  plain: boolean;
}

export function compile(src: string, opts: CompileOptions = {}): CompileResult {
  const diag = new Diagnostics(opts.file);
  const doc = parse(src, diag);
  return compileDocument(doc, opts, diag);
}

export function compileDocument(doc: Document, opts: CompileOptions = {}, diag = new Diagnostics(opts.file)): CompileResult {
  const col = collect(doc.nodes, diag, opts.load, opts.file);
  const page = col.page;
  const plain = !!page?.flags.some((f) => f.name === 'plain');
  const content = expand(col.content, col.components, diag);

  const topLevel: Node[] = [...(page ? [page] : []), ...col.themes, ...content];
  const { ids } = validate(topLevel, diag, plain);

  // theme: later values win
  const themeInput: ThemeInput = {};
  for (const t of col.themes) for (const p of t.props) (themeInput as Record<string, string>)[p.key] = p.value.raw;
  if (plain && col.themes.length) diag.warn(col.themes[0].pos, 'theme has no effect on a plain page');
  const design = buildDesign(themeInput);

  const bodyNode = content.find((n): n is RoleNode => n.kind === 'node' && n.role === 'body');
  if (bodyNode) {
    for (const n of content) {
      if (n !== bodyNode && n.kind === 'node' && !['css', 'head', 'html', 'script'].includes(n.role)) {
        diag.error(n.pos, 'with an explicit body line, all content belongs inside it');
      }
    }
  }

  const styles = opts.styles ?? new StyleRegistry();
  const renderer = new Renderer({
    plain,
    optimize: opts.optimize !== false,
    design,
    styles,
    diag,
    ids,
    imageSize: opts.imageSize,
    readFile: opts.readFile,
    debugLines: opts.debugLines,
  });
  const body = renderer.renderTop(content.filter((n) => !(n.kind === 'node' && n.role === 'body'))) + (bodyNode ? renderer.node(bodyNode, { depth: 0, inHero: false, inCard: false, inNav: false, eager: true }) : '');

  const raw = content
    .filter((n): n is RoleNode => n.kind === 'node' && n.role === 'css')
    .map((n) => (n.verbatim ?? []).join('\n'))
    .join('\n');
  const headRaw = content
    .filter((n): n is RoleNode => n.kind === 'node' && n.role === 'head')
    .map((n) => (n.verbatim ?? []).join('\n'))
    .join('');

  lint(renderer, design, !!page, plain, diag);
  const css = buildCss(styles, design, raw, plain);
  const html = page ? document(page, design, body, css, headRaw, plain, !!bodyNode, opts.cssHref) : body;
  sortDiagnostics(diag.list);
  return { html, css, diagnostics: diag.list, design, isPage: !!page, rawCss: raw, plain };
}

function lint(r: Renderer, design: Design, isPage: boolean, plain: boolean, diag: Diagnostics): void {
  if (plain) return;
  const h1 = r.headings.filter((h) => h.level === 1);
  if (isPage && r.headings.length && h1.length === 0) {
    diag.warn(r.headings[0].pos, 'the page has no h1: put the main title in a hero or at the top level');
  }
  for (const extra of h1.slice(1)) diag.warn(extra.pos, `second h1 "${extra.text}" – a page should have one main title (use level:2 or move it into a section)`);
  for (let i = 1; i < r.headings.length; i++) {
    const a = r.headings[i - 1];
    const b = r.headings[i];
    if (b.level > a.level + 1) diag.warn(b.pos, `heading level jumps from h${a.level} to h${b.level}`);
  }
  for (const c of design.checks) {
    if (c.ratio < 4.5) diag.warn({ line: 1, col: 1 }, `contrast of ${c.pair} in tone ${c.tone} is ${c.ratio.toFixed(2)}:1 (below 4.5:1)`);
  }
}

function sortDiagnostics(list: Diagnostic[]): void {
  list.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || a.line - b.line || a.col - b.col);
}

const BASE_CSS =
  '*,::before,::after{box-sizing:border-box}' +
  'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}' +
  'body{margin:0;font-family:var(--n-font);font-size:var(--n-t-m);line-height:1.6;background:var(--n-bg);color:var(--n-fg)}' +
  ':where(h1,h2,h3,h4,h5,h6,p,figure,blockquote,ul,ol,dl,dd,pre){margin:0}' +
  ':where(img,video){max-inline-size:100%;height:auto}' +
  ':where(a){color:var(--n-accent)}' +
  ':where(button,input,select,textarea){font:inherit}' +
  ':focus-visible{outline:2px solid var(--n-accent);outline-offset:2px}' +
  '@media (prefers-reduced-motion:reduce){*,::before,::after{transition-duration:.01ms!important;animation-duration:.01ms!important;scroll-behavior:auto!important}}';

export function buildCss(styles: StyleRegistry, design: Design, raw: string, plain: boolean): string {
  const { imports, rest } = splitImports(raw);
  let out = '@layer n-raw,n;';
  out += imports
    .map((u) => {
      const m = /^(url\([^)]*\)|"[^"]*"|'[^']*')\s*(.*)$/.exec(u);
      return m ? `@import ${m[1]} layer(n-raw)${m[2] ? ` ${m[2]}` : ''};` : `@import ${u} layer(n-raw);`;
    })
    .join('');
  if (rest.trim()) out += `@layer n-raw{${rest.trim()}}`;
  const rules = styles.css();
  if (plain) {
    if (rules) out += `@layer n{${rules}}`;
    return out === '@layer n-raw,n;' ? '' : out;
  }
  let dark = '';
  if (design.darkTones) {
    dark =
      `@media (prefers-color-scheme:dark){:root{${toneCss(design.darkTones.default)};color-scheme:dark}` +
      (rules.includes('.n-tone-default') ? `.n-tone-default{${toneCss(design.darkTones.default)}}` : '') +
      (rules.includes('.n-tone-subtle') ? `.n-tone-subtle{${toneCss(design.darkTones.subtle)}}` : '') +
      '}';
  }
  const body = BASE_CSS + rules + dark;
  // only the scale tokens that are referenced
  const used = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(/var\((--n-[a-z0-9-]+)/g)) {
      if (!used.has(m[1]) && design.vars[m[1]]) {
        used.add(m[1]);
        scan(design.vars[m[1]]);
      }
    }
  };
  scan(body);
  const vars = Object.entries(design.vars)
    .filter(([k]) => used.has(k))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  out += `@layer n{:root{${vars};${toneCss(design.tones.default)}}${body}}`;
  return out;
}

/** Hoists @import (and drops @charset) from raw CSS. */
function splitImports(raw: string): { imports: string[]; rest: string } {
  const imports: string[] = [];
  const rest = raw
    .replace(/@charset\s+[^;]+;/gi, '')
    .replace(/@import\s+([^;]+);/gi, (_, what: string) => {
      imports.push(what.trim().replace(/\s+layer\([^)]*\)/, ''));
      return '';
    });
  return { imports, rest };
}

function document(
  page: RoleNode,
  design: Design,
  body: string,
  css: string,
  headRaw: string,
  plain: boolean,
  explicitBody: boolean,
  cssHref?: string,
): string {
  const prop = (k: string) => page.props.find((p) => p.key === k)?.value.raw;
  const flag = (f: string) => page.flags.some((x) => x.name === f);
  const title = page.texts[0]?.raw.replace(/\\(.)/g, '$1');
  const htmlAttrs: [string, string][] = [];
  const lang = prop('lang');
  if (lang) htmlAttrs.push(['lang', lang]);
  for (const a of page.attrs) htmlAttrs.push([a.name, a.value.raw]);

  let head = '';
  if (!plain) head += '<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">';
  if (title !== undefined) head += `<title>${escText(title)}</title>`;
  const description = prop('description');
  if (description) head += `<meta name=description content="${escAttr(description)}">`;
  const icon = prop('icon');
  if (icon) head += `<link rel=icon${attr('href', icon)}>`;
  const image = prop('image');
  if (image) head += `<meta property=og:image${attr('content', image)}>`;
  if (title && !plain) head += `<meta property=og:title content="${escAttr(title)}">`;
  if (design.fontsUrl && !plain) {
    const origin = /^https?:\/\/[^/]+/.exec(design.fontsUrl)?.[0];
    if (origin) head += `<link rel=preconnect href=${origin} crossorigin>`;
    if (origin?.includes('fonts.googleapis.com')) head += '<link rel=preconnect href=https://fonts.gstatic.com crossorigin>';
    head += `<link rel=stylesheet${attr('href', design.fontsUrl)}>`;
  }
  head += headRaw;
  if (css) head += cssHref ? `<link rel=stylesheet${attr('href', cssHref)}>` : `<style>${css}</style>`;
  const doctype = flag('nodoctype') ? '' : '<!doctype html>';
  const bodyHtml = explicitBody ? body : `<body>${body}</body>`;
  return `${doctype}<html${htmlAttrs.map(([k, v]) => attr(k, v)).join('')}><head>${head}</head>${bodyHtml}</html>`;
}
