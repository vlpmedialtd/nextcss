import type { Diagnostic, Pos } from './ast.js';

export class Diagnostics {
  list: Diagnostic[] = [];
  constructor(public file?: string) {}

  error(pos: Pos, message: string, fix?: string): void {
    this.list.push({ level: 'error', message, line: pos.line, col: pos.col, file: this.file, ...(fix ? { fix } : {}) });
  }

  warn(pos: Pos, message: string, fix?: string): void {
    this.list.push({ level: 'warning', message, line: pos.line, col: pos.col, file: this.file, ...(fix ? { fix } : {}) });
  }

  get hasErrors(): boolean {
    return this.list.some((d) => d.level === 'error');
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  return `${d.file ?? '<input>'}:${d.line}:${d.col}: ${d.level}: ${d.message}`;
}

/** Edit distance where swapping two neighbors counts as one edit (titel → title). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

const SYNONYMS: Record<string, string> = {
  small: 's', medium: 'm', large: 'l', big: 'l', xlarge: 'xl', huge: '2xl', tiny: 'xs', none: 'none',
  dark: 'inverse', light: 'default', brand: 'primary', error: 'danger', red: 'danger', green: 'success',
  middle: 'center', left: 'start', right: 'end', top: 'start', bottom: 'end',
  heading: 'title', h1: 'title', h2: 'title', h3: 'title', p: 'text', paragraph: 'text', img: 'image', a: 'link',
  ul: 'list', li: 'item', div: 'box', article: 'card', container: 'center', columns: 'grid', flex: 'row',
  hstack: 'row', vstack: 'stack', zstack: 'layer', details: 'fold', input: 'field', checkbox: 'check', modal: 'dialog',
  href: 'to', url: 'to', padding: 'pad', spacing: 'gap', color: 'tone', theme: 'tone', bg: 'tone', background: 'tone',
  'font-size': 'size', fontsize: 'size', bold: 'weight', rounded: 'radius', shadow: 'surface', elevation: 'surface',
};

/** " – did you mean "x"?" or "" */
export function suggest(word: string, candidates: Iterable<string>): string {
  const list = [...candidates];
  const syn = SYNONYMS[word.toLowerCase()];
  if (syn && list.includes(syn)) return ` – did you mean "${syn}"?`;
  candidates = list;
  let best = '';
  let bestDist = Infinity;
  const limit = word.length <= 3 ? 1 : 2;
  for (const c of candidates) {
    const d = levenshtein(word.toLowerCase(), c.toLowerCase());
    if (d < bestDist || (d === bestDist && c[0] === word[0] && best[0] !== word[0])) {
      best = c;
      bestDist = d;
    }
  }
  return bestDist <= limit ? ` – did you mean "${best}"?` : '';
}
