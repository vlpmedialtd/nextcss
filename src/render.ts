// AST → HTML. Classes are registered in the StyleRegistry as they are used.

import type { Node, Pos, Prop, RoleNode, TextNode } from './ast.js';
import type { Design } from './design.js';
import { VOID_TAGS } from './data/tags.js';
import type { Diagnostics } from './diag.js';
import { blocks, escAttr, escText, inline, type InlineHooks } from './markdown.js';
import { parseLine } from './parser.js';
import { ROLES, isPassthroughKey } from './schema.js';
import { Bucket, FLAG_CSS, ROLE_CSS, StyleRegistry, modifier, type Rule } from './styles.js';
import { checkValue, validate } from './validate.js';

export interface RenderOptions {
  plain: boolean;
  optimize: boolean;
  design: Design;
  styles: StyleRegistry;
  diag: Diagnostics;
  ids: Map<string, RoleNode>;
  imageSize?: (src: string) => { width: number; height: number } | null;
  readFile?: (path: string) => string | null;
  debugLines?: boolean;
}

interface Ctx {
  depth: number; // sectioning depth → heading level
  inHero: boolean;
  inCard: boolean;
  inNav: boolean;
  eager: boolean;
  accordion?: string;
  tabs?: { name: string; open: Node | undefined };
}

const ROOT_CTX: Ctx = { depth: 0, inHero: false, inCard: false, inNav: false, eager: false };

export class Renderer {
  private accordionCount = 0;
  private tabsCount = 0;
  headings: { level: number; text: string; pos: Pos }[] = [];
  constructor(private o: RenderOptions) {}

  renderTop(nodes: Node[]): string {
    let firstContent = true;
    return this.joinTexts(nodes)
      .map((n) => {
        const eager = firstContent || (n.kind === 'node' && (n.role === 'header' || n.role === 'hero'));
        if (n.kind === 'node' && n.role !== 'header') firstContent = false;
        return this.node(n, { ...ROOT_CTX, eager });
      })
      .join('');
  }

  // ------------------------------------------------------------ helpers

  private hooks(pos: Pos, ctx: Ctx): InlineHooks {
    return {
      pos,
      error: (p, m) => this.o.diag.error(p, m),
      element: (src, p) => {
        const node = parseLine(src.trim(), p, this.o.diag);
        if (!node || node.kind !== 'node') return '';
        if (!ROLES[node.role]?.inline) {
          this.o.diag.error(p, `"${node.role}" cannot be used inside text (inline roles: link, button, badge, icon, image, el)`);
          return '';
        }
        const sub = validate([node], this.o.diag, this.o.plain);
        for (const [k, v] of sub.ids) this.o.ids.set(k, v);
        return this.node(node, ctx);
      },
    };
  }

  private inline(raw: string, pos: Pos, ctx: Ctx): string {
    return inline(raw, this.hooks(pos, ctx));
  }

  /** Joins consecutive `| …` lines into one text node. */
  private joinTexts(nodes: Node[]): Node[] {
    const out: Node[] = [];
    for (const n of nodes) {
      const prev = out[out.length - 1];
      if (n.kind === 'text' && n.form === 'pipe' && prev?.kind === 'text' && prev.form === 'pipe') {
        out[out.length - 1] = { ...prev, raw: `${prev.raw}\n${n.raw}` } as TextNode;
      } else out.push(n);
    }
    return out;
  }

  private children(n: RoleNode, ctx: Ctx): string {
    const list = this.joinTexts(n.children);
    if (ROLES[n.role]?.children === 'inline' || n.role === 'item') this.checkTouching(list);
    return list.map((c) => this.node(c, ctx)).join('');
  }

  /** Sibling lines never produce whitespace: warn when words would be glued together. */
  private checkTouching(list: Node[]): void {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (a.kind === 'comment' || b.kind === 'comment') continue;
      const end = a.kind === 'text' ? a.raw : 'x';
      const start = b.kind === 'text' ? b.raw : 'x';
      if (/[\p{L}\p{N})\]*`]$/u.test(end) && /^[\p{L}\p{N}(\[*`]/u.test(start)) {
        this.o.diag.warn(b.pos, 'no space between this line and the previous one – sibling lines are joined without whitespace (add a space inside the string)');
      }
    }
  }

  /** text string of the line + child lines */
  private content(n: RoleNode, ctx: Ctx): string {
    const t = n.texts[0] ? this.inline(n.texts[0].raw, n.texts[0].pos, ctx) : '';
    return t + this.children(n, ctx);
  }

  private prop(n: RoleNode, key: string): string | undefined {
    return n.props.find((p) => p.key === key)?.value.raw;
  }

  private flag(n: RoleNode, name: string): boolean {
    return n.flags.some((f) => f.name === name);
  }

  private add(rule: Rule | null, bucket: Bucket): string | null {
    return rule ? this.o.styles.add(rule, bucket) : null;
  }

  /** Classes for role, keys, flags and wide/narrow blocks. `defaults` are applied unless the key is set. */
  private classes(n: RoleNode, cssRole = n.role, defaults: Record<string, string> = {}): string[] {
    const out: string[] = [];
    const push = (c: string | null) => c && !out.includes(c) && out.push(c);
    const { design, styles } = this.o;
    if (!this.o.plain && ROLE_CSS[cssRole]) push(styles.add({ cls: `n-${cssRole}`, css: ROLE_CSS[cssRole] }, Bucket.Role));
    const keys = new Set(n.props.map((p) => p.key));
    const order = Object.keys(ROLES[n.role].keys);
    const props: { key: string; v: string }[] = [
      ...Object.entries(defaults)
        .filter(([k]) => !keys.has(k))
        .map(([key, v]) => ({ key, v })),
      ...n.props.map((p) => ({ key: p.key, v: p.value.raw })),
    ].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    const valid = (key: string, v: string) => {
      const kd = ROLES[n.role].keys[key];
      return !!kd && checkValue(kd.type, v) === null;
    };
    for (const { key, v } of props) {
      if (this.o.plain && key !== 'css' && key !== 'hide') continue;
      if (n.role === 'el' && key !== 'css' && key !== 'hide') continue;
      if (!valid(key, v)) continue;
      const bucket = key === 'tone' ? Bucket.Tone : key === 'css' ? Bucket.Css : Bucket.Mod;
      push(this.add(modifier(n.role, key, v, design), bucket));
    }
    if (!this.o.plain) {
      for (const f of n.flags) {
        const rule = FLAG_CSS[f.name];
        if (rule && f.name in ROLES[n.role].flags) push(styles.add(rule, Bucket.Mod));
      }
      for (const b of n.blocks) {
        const cond = b.cond === 'narrow' ? 'narrow' : 'wide';
        for (const it of b.items) {
          let rule: Rule | null = null;
          if (it.kind === 'prop' && valid(it.key, it.value.raw)) rule = modifier(n.role, it.key, it.value.raw, design);
          else if (it.kind === 'flag') rule = FLAG_CSS[it.name] ?? null;
          if (rule) push(styles.addVariant(rule, cond, design));
        }
      }
    }
    // class:"…" passthrough
    const user = this.prop(n, 'class');
    if (user) user.split(/\s+/).forEach(push);
    return out;
  }

  /** Renders the opening tag. */
  private open(tag: string, n: RoleNode | null, cls: string[], extra: [string, string | true | undefined][] = []): string {
    const attrs: [string, string | true][] = [];
    if (n?.id) attrs.push(['id', n.id]);
    const raw = n?.attrs ?? [];
    const rawClass = raw.find((a) => a.name === 'class');
    const allCls = [...cls, ...(rawClass ? rawClass.value.raw.split(/\s+/) : [])].filter(Boolean);
    if (allCls.length) attrs.push(['class', allCls.join(' ')]);
    for (const [k, v] of extra) if (v !== undefined) attrs.push([k, v]);
    if (n) {
      for (const p of n.props) {
        if (p.key === 'class') continue;
        if (n.role === 'el' ? !['css', 'hide'].includes(p.key) : isPassthroughKey(p.key) && !ROLES[n.role].keys[p.key]) {
          attrs.push([p.key, p.value.raw]);
        }
      }
      for (const a of raw) if (a.name !== 'class') attrs.push([a.name, a.value.raw]);
      if (this.o.debugLines) attrs.push(['data-nc', String(n.pos.line)]);
    }
    return `<${tag}${attrs.map(([k, v]) => attr(k, v)).join('')}>`;
  }

  // ------------------------------------------------------------ nodes

  node(n: Node, ctx: Ctx): string {
    if (n.kind === 'comment') return '';
    if (n.kind === 'text') return this.inline(n.raw, n.pos, ctx);
    const r = n.role;
    const o = this.o;
    const sectionCtx = (extra: Partial<Ctx> = {}): Ctx => ({ ...ctx, depth: ctx.depth + 1, ...extra });

    switch (r) {
      case 'page':
      case 'theme':
      case 'use':
      case 'define':
      case 'css':
      case 'head':
      case 'slot':
        return '';

      case 'header':
        return this.open('header', n, this.classes(n)) + this.children(n, { ...ctx, inNav: true, eager: true }) + '</header>';
      case 'footer':
        return this.open('footer', n, this.classes(n)) + this.children(n, { ...ctx, inNav: true }) + '</footer>';
      case 'nav':
        return (
          this.open('nav', n, this.classes(n), [['aria-label', this.prop(n, 'label')]]) +
          this.children(n, { ...ctx, inNav: true }) +
          '</nav>'
        );
      case 'main':
        return this.open('main', n, this.classes(n)) + this.children(n, ctx) + '</main>';
      case 'aside':
        return this.open('aside', n, this.classes(n)) + this.children(n, sectionCtx()) + '</aside>';
      case 'section':
        return (
          this.open('section', n, this.classes(n), [['aria-label', this.prop(n, 'label')]]) +
          this.children(n, sectionCtx()) +
          '</section>'
        );
      case 'hero': {
        const defaults: Record<string, string> = {};
        if (this.prop(n, 'image')) defaults.tone = 'inverse';
        return this.open('section', n, this.classes(n, 'hero', defaults)) + this.children(n, { ...ctx, inHero: true, eager: true }) + '</section>';
      }
      case 'card': {
        const to = this.prop(n, 'to');
        const cls = this.classes(n);
        if (to && !o.plain) cls.push(o.styles.add(CARD_LINK, Bucket.Mod));
        const tag = to ? 'a' : 'article';
        return this.open(tag, n, cls, [['href', to]]) + this.children(n, sectionCtx({ inCard: true })) + `</${tag}>`;
      }
      case 'box':
      case 'stack':
      case 'row':
      case 'bar':
      case 'split':
      case 'grid':
      case 'center':
      case 'cover':
      case 'layer':
      case 'sidebar':
        return this.open('div', n, this.classes(n)) + this.children(n, ctx) + '</div>';
      case 'accordion': {
        const name = `acc${++this.accordionCount}`;
        return this.open('div', n, this.classes(n)) + this.children(n, { ...ctx, accordion: name }) + '</div>';
      }
      case 'tabs': {
        // exclusive <details> (same name): one panel open at a time, laid out as tabs by CSS
        const tabs = n.children.filter((c): c is RoleNode => c.kind === 'node' && c.role === 'tab');
        const open = tabs.find((t) => this.flag(t, 'open')) ?? tabs[0];
        return this.open('div', n, this.classes(n)) + this.children(n, { ...ctx, tabs: { name: `tabs${++this.tabsCount}`, open } }) + '</div>';
      }
      case 'tab': {
        const summary = `<summary>${this.inline(n.texts[0]?.raw ?? '', n.pos, ctx)}</summary>`;
        // like fold, a tab is not sectioning: its label is not a heading
        const inner: Ctx = { ...ctx, tabs: undefined, accordion: undefined };
        const body = o.plain ? this.children(n, inner) : `<div>${this.children(n, inner)}</div>`;
        return (
          this.open('details', n, this.classes(n), [
            ['name', ctx.tabs?.name],
            ['open', (ctx.tabs ? ctx.tabs.open === n : this.flag(n, 'open')) || undefined],
          ]) +
          summary +
          body +
          '</details>'
        );
      }
      case 'menu': {
        const cls = this.classes(n);
        if (!o.plain) cls.push(o.styles.add(popoverRule(n.id!), Bucket.Mod));
        return this.open('div', n, cls, [['popover', true]]) + this.children(n, { ...ctx, inNav: true }) + '</div>';
      }
      case 'dialog':
        return this.open('dialog', n, this.classes(n)) + this.children(n, sectionCtx()) + '</dialog>';
      case 'alert': {
        const role = this.prop(n, 'tone') === 'danger' ? 'alert' : 'status';
        return this.open('div', n, this.classes(n), [['role', role]]) + this.content(n, ctx) + '</div>';
      }
      case 'form':
        return (
          this.open('form', n, this.classes(n), [
            ['action', this.prop(n, 'to')],
            ['method', this.prop(n, 'method') ?? (this.prop(n, 'to') ? 'post' : undefined)],
          ]) +
          this.children(n, ctx) +
          '</form>'
        );

      case 'title': {
        const explicit = this.prop(n, 'level');
        const level = explicit ? Number(explicit) : Math.min(6, 1 + ctx.depth);
        const defaults: Record<string, string> = {};
        if (!o.plain && !this.flag(n, 'lead')) {
          defaults.size =
            level === 1 ? (ctx.inHero ? '4xl' : '3xl') : ctx.inCard ? 'l' : level === 2 ? '2xl' : level === 3 ? 'xl' : level === 4 ? 'l' : 'm';
        }
        this.headings.push({ level, text: plainText(n.texts[0]?.raw ?? ''), pos: n.pos });
        return this.open(`h${level}`, n, this.classes(n, 'title', defaults)) + this.content(n, ctx) + `</h${level}>`;
      }
      case 'text': {
        const defaults: Record<string, string> = {};
        if (ctx.inHero && !this.flag(n, 'muted')) defaults.size = 'l';
        return this.open('p', n, this.classes(n, 'text', defaults)) + this.content(n, ctx) + '</p>';
      }
      case 'prose': {
        const html = blocks(n.verbatim ?? [], { baseLevel: Math.min(6, 1 + ctx.depth), hooks: this.hooks(n.pos, ctx) });
        return this.open('div', n, this.classes(n)) + html + '</div>';
      }
      case 'list': {
        const tag = this.flag(n, 'ordered') ? 'ol' : 'ul';
        return this.open(tag, n, this.classes(n)) + this.children(n, ctx) + `</${tag}>`;
      }
      case 'item':
        return this.open('li', n, this.classes(n)) + this.content(n, ctx) + '</li>';
      case 'quote': {
        const by = this.prop(n, 'by');
        const body = `<blockquote>${this.content(n, ctx)}</blockquote>`;
        if (o.plain && !by) return this.open('blockquote', n, this.classes(n)) + this.content(n, ctx) + '</blockquote>';
        return this.open('figure', n, this.classes(n)) + body + (by ? `<figcaption>${escText(by)}</figcaption>` : '') + '</figure>';
      }
      case 'code': {
        const lang = this.prop(n, 'lang');
        const text = (n.verbatim ?? []).join('\n');
        return (
          this.open('pre', n, this.classes(n)) +
          `<code${lang ? attr('class', `language-${lang}`) : ''}>${text.startsWith('\n') ? '\n' : ''}${escText(text)}</code></pre>`
        );
      }
      case 'image':
        return this.image(n, ctx);
      case 'video': {
        const auto = this.flag(n, 'autoplay');
        return (
          this.open('video', n, this.classes(n), [
            ['src', this.prop(n, 'src')],
            ['poster', this.prop(n, 'poster')],
            ['aria-label', this.prop(n, 'label')],
            ...(auto
              ? ([
                  ['autoplay', true],
                  ['muted', true],
                  ['loop', true],
                  ['playsinline', true],
                ] as [string, true][])
              : ([
                  ['controls', true],
                  ['preload', 'metadata'],
                  ['playsinline', true],
                ] as [string, string | true][])),
          ]) + '</video>'
        );
      }
      case 'icon':
        return this.icon(n);
      case 'divider':
        return this.open('hr', n, this.classes(n));
      case 'table':
        return this.table(n, ctx);
      case 'columns':
      case 'cells':
        return ''; // rendered by table
      case 'badge':
        return this.open('span', n, this.classes(n)) + this.content(n, ctx) + '</span>';
      case 'link': {
        const cls = this.classes(n);
        if (ctx.inNav && !o.plain && !this.prop(n, 'tone')) cls.push(o.styles.add(NAV_LINK, Bucket.Mod));
        const external = this.flag(n, 'new');
        return (
          this.open('a', n, cls, [
            ['href', this.prop(n, 'to')],
            ['target', external ? '_blank' : undefined],
            ['rel', external ? 'noopener' : undefined],
          ]) +
          this.content(n, ctx) +
          '</a>'
        );
      }
      case 'button':
        return this.button(n, ctx);
      case 'fold': {
        const summary = `<summary>${this.inline(n.texts[0]?.raw ?? '', n.pos, ctx)}</summary>`;
        const body = o.plain ? this.children(n, ctx) : `<div>${this.children(n, ctx)}</div>`;
        return (
          this.open('details', n, this.classes(n), [
            ['open', this.flag(n, 'open') || undefined],
            ['name', ctx.accordion],
          ]) +
          summary +
          body +
          '</details>'
        );
      }
      case 'field':
        return this.field(n, ctx);
      case 'check':
        return this.check(n, ctx);
      case 'option':
        return (
          `<option${optAttr('value', this.prop(n, 'value'))}${this.flag(n, 'selected') ? ' selected' : ''}>` +
          escText(plainText(n.texts[0]?.raw ?? '')) +
          '</option>'
        );
      case 'el': {
        const tag = n.flags[0]?.name ?? 'div';
        const bools = n.flags.slice(1).map((f) => [f.name, true] as [string, true]);
        const open = this.open(tag, n, this.classes(n), bools);
        if (VOID_TAGS.has(tag)) return open;
        return open + this.content(n, ctx) + `</${tag}>`;
      }
      case 'html':
        return (n.verbatim ?? []).join('\n');
      case 'script': {
        const type = this.flag(n, 'module') ? 'module' : this.prop(n, 'type');
        const body = (n.verbatim ?? []).join('\n');
        if (/<\/script/i.test(body)) o.diag.error(n.pos, 'script content cannot contain </script');
        return (
          this.open('script', n, [], [
            ['src', this.prop(n, 'src')],
            ['type', type],
            ['defer', this.flag(n, 'defer') || undefined],
            ['async', this.flag(n, 'async') || undefined],
          ]) +
          body +
          '</script>'
        );
      }
      case 'body':
        return this.open('body', n, this.classes(n)) + this.renderTop(n.children) + '</body>';
    }
    o.diag.error(n.pos, `cannot render "${r}"`);
    return '';
  }

  private image(n: RoleNode, ctx: Ctx): string {
    const o = this.o;
    const src = this.prop(n, 'src') ?? '';
    const decorative = this.flag(n, 'decorative');
    const lcp = this.flag(n, 'lcp');
    const extra: [string, string | true | undefined][] = [
      ['src', src],
      ['alt', decorative ? '' : this.prop(n, 'alt')],
    ];
    if (o.optimize && !o.plain) {
      const size = isLocal(src) ? o.imageSize?.(src) : null;
      if (size) extra.push(['width', String(size.width)], ['height', String(size.height)]);
      if (!ctx.eager && !lcp) extra.push(['loading', 'lazy']);
      extra.push(['decoding', 'async']);
      if (lcp) extra.push(['fetchpriority', 'high']);
    }
    const caption = this.prop(n, 'caption');
    const img = this.open('img', n, this.classes(n), extra);
    if (!caption) return img;
    const fig = o.plain ? '' : o.styles.add({ cls: 'n-figure', css: ROLE_CSS.figure }, Bucket.Role);
    return `<figure${fig ? attr('class', fig) : ''}>${img}<figcaption>${this.inline(caption, n.pos, ctx)}</figcaption></figure>`;
  }

  private icon(n: RoleNode): string {
    const src = this.prop(n, 'src') ?? '';
    const svg = this.o.readFile?.(src);
    if (!svg || !/<svg[\s>]/i.test(svg)) {
      this.o.diag.error(n.pos, `cannot read SVG icon "${src}"`);
      return '';
    }
    const label = this.prop(n, 'label');
    const a11y = label ? `role="img" aria-label="${escAttr(label)}"` : 'aria-hidden="true" focusable="false"';
    const clean = svg
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .trim()
      .replace(/<svg\b/i, `<svg ${a11y}`);
    return this.open('span', n, this.classes(n)) + clean + '</span>';
  }

  private table(n: RoleNode, ctx: Ctx): string {
    const caption = this.prop(n, 'caption');
    const rows = n.children.filter((c): c is RoleNode => c.kind === 'node');
    const head = rows.filter((r) => r.role === 'columns');
    const body = rows.filter((r) => r.role === 'cells');
    const cell = (tag: string, r: RoleNode, scope?: string) =>
      r.texts.map((t) => `<${tag}${scope ? ` scope=${scope}` : ''}>${this.inline(t.raw, t.pos, ctx)}</${tag}>`).join('');
    let inner = caption ? `<caption>${escText(caption)}</caption>` : '';
    if (head.length) inner += `<thead>${head.map((r) => `<tr>${cell('th', r, 'col')}</tr>`).join('')}</thead>`;
    inner += `<tbody>${body.map((r) => `<tr>${cell('td', r)}</tr>`).join('')}</tbody>`;
    if (this.o.plain) return this.open('table', n, this.classes(n)) + inner + '</table>';
    return this.open('div', n, this.classes(n)) + `<table>${inner}</table></div>`;
  }

  private button(n: RoleNode, ctx: Ctx): string {
    const o = this.o;
    const to = this.prop(n, 'to');
    const cls = this.classes(n);
    const content = this.content(n, ctx);
    if (to) {
      const external = this.flag(n, 'new');
      return (
        this.open('a', n, cls, [
          ['href', to],
          ['target', external ? '_blank' : undefined],
          ['rel', external ? 'noopener' : undefined],
        ]) +
        content +
        '</a>'
      );
    }
    const extra: [string, string | true | undefined][] = [['type', this.flag(n, 'submit') ? 'submit' : 'button']];
    for (const key of ['opens', 'closes'] as const) {
      const ref = this.prop(n, key)?.replace(/^#/, '');
      if (!ref) continue;
      const target = o.ids.get(ref);
      if (target?.role === 'dialog') {
        extra.push(['commandfor', ref], ['command', key === 'opens' ? 'show-modal' : 'close']);
      } else {
        extra.push(['popovertarget', ref]);
        if (key === 'closes') extra.push(['popovertargetaction', 'hide']);
        else if (!o.plain) cls.push(o.styles.add(anchorRule(ref), Bucket.Mod));
      }
    }
    return this.open('button', n, cls, extra) + content + '</button>';
  }

  private field(n: RoleNode, ctx: Ctx): string {
    const label = n.texts[0]?.raw ?? '';
    const type = this.prop(n, 'type') ?? 'text';
    const name = this.prop(n, 'name') ?? slugify(plainText(label));
    const hint = this.prop(n, 'hint');
    const hintId = hint ? `hint-${name}` : undefined;
    const autocomplete = this.prop(n, 'autocomplete') ?? (type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined);
    const common: [string, string | true | undefined][] = [
      ['name', name],
      ['placeholder', this.prop(n, 'placeholder')],
      ['autocomplete', autocomplete],
      ['required', this.flag(n, 'required') || undefined],
      ['multiple', this.flag(n, 'multiple') || undefined],
      ['disabled', this.flag(n, 'disabled') || undefined],
      ['aria-describedby', hintId],
    ];
    let control: string;
    if (type === 'textarea') {
      control = `<textarea${common.map(([k, v]) => (v === undefined ? '' : attr(k, v))).join('')}>${escText(this.prop(n, 'value') ?? '')}</textarea>`;
    } else if (type === 'select') {
      control = `<select${common.map(([k, v]) => (v === undefined ? '' : attr(k, v))).join('')}>${this.children(n, ctx)}</select>`;
    } else {
      const all: [string, string | true | undefined][] = [
        ['type', type === 'text' ? undefined : type],
        ...common,
        ['value', this.prop(n, 'value')],
        ['min', this.prop(n, 'min')],
        ['max', this.prop(n, 'max')],
      ];
      control = `<input${all.map(([k, v]) => (v === undefined ? '' : attr(k, v))).join('')}>`;
    }
    return (
      this.open('label', n, this.classes(n)) +
      `<span>${this.inline(label, n.pos, ctx)}</span>` +
      control +
      (hint ? `<small id="${escAttr(hintId!)}">${escText(hint)}</small>` : '') +
      '</label>'
    );
  }

  private check(n: RoleNode, ctx: Ctx): string {
    const label = n.texts[0]?.raw ?? '';
    const type = this.prop(n, 'type') ?? 'checkbox';
    const input: [string, string | true | undefined][] = [
      ['type', type === 'radio' ? 'radio' : 'checkbox'],
      ['role', type === 'switch' ? 'switch' : undefined],
      ['name', this.prop(n, 'name') ?? slugify(plainText(label))],
      ['value', this.prop(n, 'value')],
      ['required', this.flag(n, 'required') || undefined],
      ['checked', this.flag(n, 'checked') || undefined],
      ['disabled', this.flag(n, 'disabled') || undefined],
    ];
    return (
      this.open('label', n, this.classes(n)) +
      `<input${input.map(([k, v]) => (v === undefined ? '' : attr(k, v))).join('')}>` +
      `<span>${this.inline(label, n.pos, ctx)}</span></label>`
    );
  }
}

const NAV_LINK: Rule = {
  cls: 'n-navlink',
  css: '&{display:inline-block;padding-block:.2em;color:inherit;text-decoration:none;font-weight:500}&:hover{color:var(--n-accent);text-decoration:underline;text-underline-offset:.3em}',
};
const CARD_LINK: Rule = {
  cls: 'n-cardlink',
  css:
    '&{text-decoration:none;transition:box-shadow .2s,translate .2s}&:hover{box-shadow:var(--n-shadow-m);translate:0 -2px}' +
    '@media (prefers-reduced-motion:reduce){&:hover{translate:none}}',
};

function anchorRule(id: string): Rule {
  return { cls: `n-anchor-${id}`, css: `@supports (position-area:block-end){&{anchor-name:--n-${id}}}` };
}

function popoverRule(id: string): Rule {
  return {
    cls: `n-pop-${id}`,
    css: `@supports (position-area:block-end){&{position-anchor:--n-${id};inset:auto;margin:var(--n-s-xs) 0 0;position-area:block-end span-inline-start;position-try-fallbacks:flip-inline}}`,
  };
}

function optAttr(k: string, v: string | undefined): string {
  return v === undefined ? '' : attr(k, v);
}

export function attr(k: string, v: string | true): string {
  if (v === true) return ` ${k}`;
  if (v !== '' && /^[^\s"'=<>`&]+$/.test(v)) return ` ${k}=${v}`;
  return ` ${k}="${escAttr(v)}"`;
}

function isLocal(src: string): boolean {
  return !/^([a-z]+:|\/\/)/i.test(src);
}

/** Strips inline Markdown for use in attributes / names. */
export function plainText(raw: string): string {
  return raw
    .replace(/\\(.)/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'field'
  );
}

export type { Prop };
