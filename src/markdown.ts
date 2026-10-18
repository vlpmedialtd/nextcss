// Markdown: the inline subset used in every text string, and the block subset used by `prose`.

import type { Pos } from './ast.js';

export interface InlineHooks {
  /** Renders `{role …}` inline elements. Receives the source between the braces. */
  element(src: string, pos: Pos): string;
  error(pos: Pos, message: string): void;
  pos: Pos;
}

const ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});/;

export function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes text but keeps valid HTML entities such as &nbsp; */
function escTextKeepEntities(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '&') {
      const m = ENTITY.exec(s.slice(i));
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else out += '&amp;';
    } else if (c === '<') out += '&lt;';
    else if (c === '>') out += '&gt;';
    else out += c;
  }
  return out;
}

export function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const PUNCT = /[!-/:-@[-`{-~]/;

/** Inline Markdown → HTML. */
export function inline(src: string, hooks: InlineHooks): string {
  return new InlineParser(src, hooks).run();
}

class InlineParser {
  i = 0;
  constructor(
    private s: string,
    private h: InlineHooks,
  ) {}

  run(stop?: string): string {
    const s = this.s;
    let out = '';
    let buf = '';
    const flush = () => {
      out += escTextKeepEntities(buf);
      buf = '';
    };
    while (this.i < s.length) {
      const c = s[this.i];
      if (stop && s.startsWith(stop, this.i) && this.closes(stop)) {
        flush();
        return out;
      }
      if (c === '\\' && this.i + 1 < s.length && PUNCT.test(s[this.i + 1])) {
        buf += s[this.i + 1];
        this.i += 2;
        continue;
      }
      if (c === '`') {
        const end = s.indexOf('`', this.i + 1);
        if (end > this.i + 1) {
          flush();
          out += `<code>${escText(unescape(s.slice(this.i + 1, end)))}</code>`;
          this.i = end + 1;
          continue;
        }
      }
      if (s.startsWith('**', this.i) && this.opens(2) && this.findClose('**', 2) > 0) {
        flush();
        this.i += 2;
        out += `<strong>${this.run('**')}</strong>`;
        this.i += 2;
        continue;
      }
      if (c === '*' && !s.startsWith('**', this.i) && this.opens(1) && this.findClose('*', 1) > 0) {
        flush();
        this.i += 1;
        out += `<em>${this.run('*')}</em>`;
        this.i += 1;
        continue;
      }
      if ((c === '[' || (c === '!' && s[this.i + 1] === '[')) && this.link(flush, (h) => (out += h))) continue;
      if (c === '{') {
        const end = matchBrace(s, this.i);
        if (end < 0) {
          this.h.error(this.h.pos, 'unclosed "{" in text (write \\{ for a literal brace)');
          buf += c;
          this.i++;
          continue;
        }
        flush();
        const inner = s.slice(this.i + 1, end);
        if (/^\$[A-Za-z_][\w-]*$/.test(inner)) {
          this.h.error(this.h.pos, `unknown variable ${inner} (only defined inside a component)`);
        } else out += this.h.element(inner, this.h.pos);
        this.i = end + 1;
        continue;
      }
      buf += c;
      this.i++;
    }
    flush();
    return out;
  }

  private opens(n: number): boolean {
    const next = this.s[this.i + n];
    return next !== undefined && next !== ' ' && next !== '*';
  }

  private closes(marker: string): boolean {
    const prev = this.s[this.i - 1];
    if (prev === undefined || prev === ' ') return false;
    if (marker === '*' && this.s[this.i + 1] === '*') return false;
    return true;
  }

  private findClose(marker: string, n: number): number {
    for (let j = this.i + n + 1; j < this.s.length; j++) {
      if (this.s[j] === '\\') {
        j++;
        continue;
      }
      if (this.s.startsWith(marker, j) && this.s[j - 1] !== ' ') {
        if (marker === '*' && (this.s[j + 1] === '*' || this.s[j - 1] === '*')) continue;
        return j;
      }
    }
    return -1;
  }

  private link(flush: () => void, emit: (html: string) => void): boolean {
    const s = this.s;
    const isImage = s[this.i] === '!';
    const start = this.i + (isImage ? 1 : 0);
    let depth = 0;
    let j = start;
    for (; j < s.length; j++) {
      if (s[j] === '\\') {
        j++;
        continue;
      }
      if (s[j] === '[') depth++;
      else if (s[j] === ']' && --depth === 0) break;
    }
    if (j >= s.length || s[j + 1] !== '(') return false;
    const close = s.indexOf(')', j + 2);
    if (close < 0) return false;
    const label = s.slice(start + 1, j);
    const url = s.slice(j + 2, close).trim();
    flush();
    if (isImage) emit(`<img src="${escAttr(url)}" alt="${escAttr(unescape(label))}" loading=lazy decoding=async>`);
    else emit(`<a href="${escAttr(url)}">${inline(label, this.h)}</a>`);
    this.i = close + 1;
    return true;
  }
}

function unescape(s: string): string {
  return s.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** Index of the brace matching s[i] === '{', honoring nested strings and braces. */
export function matchBrace(s: string, i: number): number {
  let depth = 0;
  let inStr = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (inStr) {
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j;
  }
  return -1;
}

// ---------------------------------------------------------------- blocks

export interface BlockOptions {
  baseLevel: number; // the highest heading in the block maps to this level
  hooks: InlineHooks;
}

export function blocks(lines: string[], opts: BlockOptions): string {
  const headingLevels = lines.map((l) => /^(#{1,6})\s/.exec(l)?.[1].length ?? 99);
  const minLevel = Math.min(...headingLevels);
  return renderBlocks(lines, opts, minLevel === 99 ? 1 : minLevel);
}

function renderBlocks(lines: string[], opts: BlockOptions, minLevel: number): string {
  const out: string[] = [];
  const il = (s: string) => inline(s, opts.hooks);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      const level = Math.min(6, opts.baseLevel + (m[1].length - minLevel));
      out.push(`<h${level}>${il(m[2])}</h${level}>`);
      i++;
      continue;
    }
    if ((m = /^```\s*([\w-]*)\s*$/.exec(line))) {
      const lang = m[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escText(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(body, opts, minLevel)}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const [html, next] = renderList(lines, i, opts, minLevel);
      out.push(html);
      i = next;
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows: string[][] = [];
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const header = cells(line);
      i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${header.map((c) => `<th>${il(c)}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${il(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>',
      );
      continue;
    }
    // paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|(-{3,}|\*{3,})\s*$)/.test(lines[i])
    ) {
      para.push(lines[i++].trim());
    }
    if (para.length === 1 && /^!\[[^\]]*\]\([^)]+\)$/.test(para[0])) out.push(il(para[0]));
    else out.push(`<p>${il(para.join('\n'))}</p>`);
  }
  return out.join('');
}

function renderList(lines: string[], start: number, opts: BlockOptions, minLevel: number): [string, number] {
  const indent = /^(\s*)/.exec(lines[start])![1].length;
  const ordered = /^\s*\d+[.)]/.test(lines[start]);
  const items: string[][] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      // a blank line ends the list unless the next line continues it
      const next = lines[i + 1];
      if (next !== undefined && new RegExp(`^\\s{${indent}}([-*+]|\\d+[.)])\\s+`).test(next)) {
        i++;
        continue;
      }
      break;
    }
    const lead = /^(\s*)/.exec(line)![1].length;
    const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (m && lead === indent) {
      items.push([m[2]]);
      i++;
    } else if (lead > indent && items.length) {
      items[items.length - 1].push(line.slice(Math.min(lead, indent + 2)));
      i++;
    } else break;
  }
  const tag = ordered ? 'ol' : 'ul';
  const html = items
    .map((item) => {
      const [first, ...rest] = item;
      const il = inline(first, opts.hooks);
      return `<li>${il}${rest.length ? renderBlocks(rest, opts, minLevel) : ''}</li>`;
    })
    .join('');
  return [`<${tag}>${html}</${tag}>`, i];
}
