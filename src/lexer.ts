import type { Block, Item, Pos, Value } from './ast.js';
import type { Diagnostics } from './diag.js';

export type Head =
  | { kind: 'name'; text: string; pos: Pos }
  | { kind: 'string'; raw: string; pos: Pos }
  | { kind: 'pipe'; text: string; pos: Pos }
  | { kind: 'comment'; text: string; pos: Pos };

export interface LineTokens {
  head: Head;
  items: Item[];
  rest?: string; // raw remainder (for @def)
}

const NAME_CHAR = /[A-Za-z0-9_:@.\-]/;
const HEAD_CHAR = /[A-Za-z0-9_.#\-]/;

/** Tokenizes the content of one line (indentation already removed). */
export class LineLexer {
  i = 0;
  constructor(
    private s: string,
    private line: number,
    private colOffset: number,
    private diag: Diagnostics,
  ) {}

  pos(i = this.i): Pos {
    return { line: this.line, col: this.colOffset + i + 1 };
  }

  lex(): LineTokens | null {
    const s = this.s;
    if (s.startsWith('//')) return { head: { kind: 'comment', text: s.slice(2).trim(), pos: this.pos(0) }, items: [] };
    if (s[0] === '|') {
      return { head: { kind: 'pipe', text: s[1] === ' ' ? s.slice(2) : s.slice(1), pos: this.pos(0) }, items: [] };
    }
    if (s[0] === '"') {
      const raw = this.readTextString();
      if (raw === null) return null;
      const head: Head = { kind: 'string', raw, pos: this.pos(0) };
      this.skipWs();
      if (this.i < s.length) this.diag.error(this.pos(), 'a text line contains only one string');
      return { head, items: [] };
    }
    let j = 0;
    while (j < s.length && HEAD_CHAR.test(s[j])) j++;
    if (j === 0) {
      this.diag.error(this.pos(0), `unexpected character "${s[0]}" at line start`);
      return null;
    }
    if (j < s.length && s[j] !== ' ') {
      this.diag.error(this.pos(j), `expected a space after "${s.slice(0, j)}"`);
      return null;
    }
    const head: Head = { kind: 'name', text: s.slice(0, j), pos: this.pos(0) };
    this.i = j;
    if (head.text === 'define') return { head, items: [], rest: s.slice(j).trim() };
    return { head, items: this.readItems(false) };
  }

  private skipWs(): void {
    while (this.i < this.s.length && this.s[this.i] === ' ') this.i++;
  }

  readItems(inBlock: boolean): Item[] {
    const s = this.s;
    const items: Item[] = [];
    for (;;) {
      this.skipWs();
      if (this.i >= s.length) {
        if (inBlock) this.diag.error(this.pos(), 'missing "}"');
        return items;
      }
      const start = this.i;
      const ch = s[start];
      if (ch === '}') {
        this.i++;
        if (!inBlock) this.diag.error(this.pos(start), 'unexpected "}"');
        else return items;
        continue;
      }
      if (ch === '"') {
        const raw = this.readTextString();
        if (raw === null) return items;
        items.push({ kind: 'string', raw, pos: this.pos(start) });
        continue;
      }
      if (ch === '.') {
        let j = start + 1;
        while (j < s.length && /[A-Za-z0-9_-]/.test(s[j])) j++;
        items.push({ kind: 'classref', name: s.slice(start + 1, j), pos: this.pos(start) });
        this.i = j;
        continue;
      }
      let j = start;
      while (j < s.length && NAME_CHAR.test(s[j])) j++;
      if (j === start) {
        this.diag.error(this.pos(start), `unexpected character "${ch}"`);
        // skip to next space
        while (this.i < s.length && s[this.i] !== ' ') this.i++;
        continue;
      }
      const run = s.slice(start, j);
      const next = s[j];
      if (next === '=') {
        this.i = j + 1;
        const value = this.readAttrValue();
        items.push({ kind: 'attr', name: run, value, pos: this.pos(start) });
        continue;
      }
      const colon = run.indexOf(':');
      if (colon > 0) {
        const key = run.slice(0, colon);
        this.i = start + colon + 1;
        const value = this.readStyleValue();
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
          this.diag.error(this.pos(start), `invalid key "${key}"`);
          continue;
        }
        if (value.raw === '' && !value.quoted) this.diag.error(this.pos(start), `missing value for "${key}"`);
        items.push({ kind: 'prop', key, value, pos: this.pos(start) });
        continue;
      }
      if (colon === 0 || run[0] === '@') {
        this.diag.error(this.pos(start), `raw attribute "${run}" needs a value: ${run}="…"`);
        this.i = j;
        continue;
      }
      if (next === '{') {
        this.i = j + 1;
        const block: Block = { kind: 'block', cond: run, items: this.readItems(true) as Block['items'], pos: this.pos(start) };
        items.push(block);
        continue;
      }
      if (next === '"' && run === 'media') {
        this.i = j;
        const arg = this.readPlainString();
        if (s[this.i] !== '{') {
          this.diag.error(this.pos(), 'expected "{" after media"…"');
          continue;
        }
        this.i++;
        items.push({ kind: 'block', cond: 'media', arg: arg.raw, items: this.readItems(true) as Block['items'], pos: this.pos(start) });
        continue;
      }
      this.i = j;
      items.push({ kind: 'flag', name: run, pos: this.pos(start) });
    }
  }

  private readAttrValue(): Value {
    if (this.s[this.i] === '"') return this.readPlainString();
    return { raw: this.readBare(), quoted: false };
  }

  private readStyleValue(): Value {
    if (this.s[this.i] === '"') return this.readPlainString();
    return { raw: this.readBare(), quoted: false };
  }

  private readBare(): string {
    const s = this.s;
    const start = this.i;
    let depth = 0;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === ' ' || c === '"' || c === '{' || c === '}')) break;
      this.i++;
    }
    return s.slice(start, this.i);
  }

  /** "…" with escapes \" and \\ resolved. Cursor on the opening quote. */
  readPlainString(): Value {
    const s = this.s;
    const startPos = this.i;
    let out = '';
    let j = this.i + 1;
    while (j < s.length) {
      const c = s[j];
      if (c === '\\' && j + 1 < s.length) {
        const n = s[j + 1];
        out += n === '"' || n === '\\' ? n : c + n;
        j += 2;
        continue;
      }
      if (c === '"') {
        this.i = j + 1;
        return { raw: out, quoted: true };
      }
      out += c;
      j++;
    }
    this.diag.error(this.pos(startPos), 'unterminated string');
    this.i = s.length;
    return { raw: out, quoted: true };
  }

  /** Text string: braces may contain nested strings. Returns the raw inner source. */
  readTextString(): string | null {
    const startPos = this.i;
    const end = this.skipString(this.i);
    if (end < 0) {
      this.diag.error(this.pos(startPos), 'unterminated string');
      this.i = this.s.length;
      return null;
    }
    this.i = end;
    return this.s.slice(startPos + 1, end - 1);
  }

  private skipString(j: number): number {
    const s = this.s;
    j++; // opening quote
    while (j < s.length) {
      const c = s[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === '"') return j + 1;
      if (c === '{') {
        j = this.skipBrace(j);
        if (j < 0) return -1;
        continue;
      }
      j++;
    }
    return -1;
  }

  private skipBrace(j: number): number {
    const s = this.s;
    j++;
    while (j < s.length) {
      const c = s[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === '"') {
        j = this.skipString(j);
        if (j < 0) return -1;
        continue;
      }
      if (c === '{') {
        j = this.skipBrace(j);
        if (j < 0) return -1;
        continue;
      }
      if (c === '}') return j + 1;
      j++;
    }
    return -1;
  }
}
