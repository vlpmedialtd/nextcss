#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Diagnostic } from './ast.js';
import { buildCss, type CompileResult } from './compile.js';
import { Diagnostics, formatDiagnostic } from './diag.js';
import { fromJson, jsonSchema, toJson, type JsonDocument } from './json.js';
import { compileFile, parseSource } from './node.js';
import { print } from './print.js';
import { hash, StyleRegistry } from './styles.js';

const HELP = `nextcss – one language for structure and style, made for AI

usage:
  nextcss build <file|dir> [-o out] [--css auto|inline|external] [--root dir] [--no-optimize]
  nextcss check <files…> [--json]          errors and warnings with fix suggestions
  nextcss fmt <files…> [--write|--check]  canonical formatting
  nextcss convert <file> [-o out]         .ncss ⇄ .json
  nextcss schema                           JSON Schema of the JSON form (for structured output)
  nextcss import <page.html> [-o out]      HTML/CSS → nextcss (plain mode, same rendering)
  nextcss inspect <file> [--widths 375,1280] [--json]   what the page looks like, as text
  nextcss docs                             the whole language as a compact reference (llms.txt)
`;

function args(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') flags.o = argv[++i];
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (['css', 'root', 'widths'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function report(list: Diagnostic[], json = false): boolean {
  if (json) console.log(JSON.stringify(list, null, 2));
  else for (const d of list) console.error(formatDiagnostic(d));
  return list.some((d) => d.level === 'error');
}

function sources(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) if (!e.startsWith('.') && e !== 'node_modules' && e !== 'dist') walk(join(p, e));
    } else if (p.endsWith('.ncss') || p.endsWith('.ncss.json')) out.push(p);
  };
  for (const p of paths) walk(p);
  return out;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = args(rest);
  switch (cmd) {
    case 'build':
      return build(pos[0], flags);
    case 'check': {
      let failed = false;
      const all: Diagnostic[] = [];
      for (const f of sources(pos.length ? pos : ['.'])) {
        const r = compileFile(f, { root: flags.root as string | undefined });
        all.push(...r.diagnostics);
      }
      failed = report(all, flags.json === true);
      if (!flags.json && !all.length) console.error('✓ no problems');
      return failed ? 1 : 0;
    }
    case 'fmt': {
      let changed = 0;
      for (const f of sources(pos)) {
        const src = readFileSync(f, 'utf8');
        const diag = new Diagnostics(f);
        const doc = parseSource(src, f, diag);
        if (diag.hasErrors) {
          report(diag.list);
          return 1;
        }
        const out = print(doc);
        if (out !== src) {
          changed++;
          if (flags.write) writeFileSync(f, out);
          else if (flags.check) console.error(`${f} is not formatted`);
          else process.stdout.write(out);
        } else if (!flags.write && !flags.check) process.stdout.write(out);
      }
      return flags.check && changed ? 1 : 0;
    }
    case 'convert': {
      const f = pos[0];
      const src = readFileSync(f, 'utf8');
      const diag = new Diagnostics(f);
      let out: string;
      if (f.endsWith('.json')) out = print(fromJson(JSON.parse(src) as JsonDocument));
      else {
        const doc = parseSource(src, f, diag);
        if (report(diag.list)) return 1;
        out = JSON.stringify(toJson(doc), null, 2) + '\n';
      }
      if (flags.o) writeFileSync(flags.o as string, out);
      else process.stdout.write(out);
      return 0;
    }
    case 'schema':
      process.stdout.write(JSON.stringify(jsonSchema(), null, 2) + '\n');
      return 0;
    case 'import': {
      const { importHtml } = await import('./import/html.js');
      const f = pos[0];
      const out = importHtml(readFileSync(f, 'utf8'), { file: f });
      for (const w of out.warnings) console.error(`${f}: ${w}`);
      const target = (flags.o as string) ?? join(dirname(f), basename(f, extname(f)) + '.ncss');
      writeFileSync(target, out.source);
      console.error(`→ ${target}`);
      return 0;
    }
    case 'inspect': {
      const { inspect } = await import('./inspect.js');
      const widths = String(flags.widths ?? '375,1280')
        .split(',')
        .map(Number);
      const result = await inspect(pos[0], { widths, root: flags.root as string | undefined });
      console.log(flags.json ? JSON.stringify(result.data, null, 2) : result.text);
      return result.data.problems.length ? 1 : 0;
    }
    case 'docs': {
      const { cheatSheet } = await import('./docs.js');
      process.stdout.write(cheatSheet());
      return 0;
    }
    default:
      process.stdout.write(HELP);
      return cmd && cmd !== 'help' && cmd !== '--help' ? 1 : 0;
  }
}

function build(input: string | undefined, flags: Record<string, string | true>): number {
  if (!input) {
    process.stdout.write(HELP);
    return 1;
  }
  const isDir = statSync(input).isDirectory();
  const files = isDir ? sources([input]) : [input];
  const outDir = (flags.o as string) ?? (isDir ? join(input, 'dist') : dirname(input));
  const mode = (flags.css as string) ?? 'auto';
  const root = (flags.root as string) ?? (isDir ? input : undefined);
  const optimize = !flags['no-optimize'];
  const pages: { file: string; r: CompileResult }[] = [];
  const shared = new StyleRegistry();
  const PLACEHOLDER = '__nextcss.css__';
  const multi = files.length > 1;

  let failed = false;
  for (const f of files) {
    const r = compileFile(f, {
      root,
      optimize,
      ...(multi && mode !== 'inline' ? { styles: shared, cssHref: PLACEHOLDER } : {}),
      ...(mode === 'external' && !multi ? { cssHref: PLACEHOLDER } : {}),
    });
    if (report(r.diagnostics)) failed = true;
    if (r.isPage) pages.push({ file: f, r });
  }
  if (failed) return 1;
  mkdirSync(outDir, { recursive: true });

  const writePage = (file: string, html: string) => {
    const rel = isDir ? relative(input, file) : basename(file);
    const target = join(outDir, rel.replace(/\.ncss(\.json)?$/, '.html'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
    return target;
  };

  if (multi && mode !== 'inline') {
    const first = pages[0]?.r;
    if (!first?.design) return 0;
    const raw = [...new Set(pages.map((p) => p.r.rawCss).filter(Boolean))].join('\n');
    const css = buildCss(shared, first.design, raw, first.plain);
    const name = `nextcss.${hash(css)}.css`;
    writeFileSync(join(outDir, name), css);
    for (const p of pages) {
      const depth = relative(outDir, dirname(join(outDir, relative(input, p.file)))) || '.';
      const href = (depth === '.' ? '' : '../'.repeat(depth.split(/[\\/]/).length)) + name;
      console.error(`→ ${writePage(p.file, p.r.html.replace(PLACEHOLDER, href))}`);
    }
    console.error(`→ ${join(outDir, name)} (${css.length} bytes, shared by ${pages.length} pages)`);
    return 0;
  }

  for (const p of pages) {
    let html = p.r.html;
    const external = mode === 'external' || (mode === 'auto' && gzipSync(html + p.r.css).length > 14_000);
    if (external && p.r.css) {
      const name = `${basename(p.file).replace(/\.ncss(\.json)?$/, '')}.${hash(p.r.css)}.css`;
      writeFileSync(join(outDir, name), p.r.css);
      html = html.includes(PLACEHOLDER)
        ? html.replace(PLACEHOLDER, name)
        : html.replace(`<style>${p.r.css}</style>`, `<link rel=stylesheet href=${name}>`);
    }
    const target = writePage(p.file, html);
    const gz = gzipSync(html).length;
    console.error(`→ ${target} (${html.length} bytes, ${gz} gzipped${external ? ', external CSS' : ', CSS inline'})`);
  }
  if (!existsSync(outDir)) return 1;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(2);
  },
);

