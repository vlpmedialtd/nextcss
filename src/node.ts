// Node.js file access for the compiler (the core in compile.ts has no Node dependency).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Document } from './ast.js';
import { compileDocument, type CompileOptions, type CompileResult } from './compile.js';
import { Diagnostics } from './diag.js';
import { imageSize } from './imagesize.js';
import { fromJson, type JsonDocument } from './json.js';
import { parse } from './parser.js';

export interface FileOptions {
  root?: string; // web root for /absolute paths (default: the file's folder)
}

export function fileOptions(file: string, opts: FileOptions = {}): CompileOptions {
  const dir = dirname(resolve(file));
  const root = opts.root ? resolve(opts.root) : dir;
  const local = (src: string, from = dir) => {
    const clean = src.split(/[?#]/)[0];
    if (/^([a-z]+:|\/\/)/i.test(clean)) return null;
    return clean.startsWith('/') ? join(root, clean) : isAbsolute(clean) ? clean : join(from, clean);
  };
  return {
    file,
    load: (path, from) => {
      const p = local(path, from ? dirname(resolve(from)) : dir);
      if (!p || !existsSync(p)) return null;
      return { src: readFileSync(p, 'utf8'), file: p };
    },
    imageSize: (src) => {
      const p = local(src);
      if (!p || !existsSync(p)) return null;
      try {
        return imageSize(readFileSync(p));
      } catch {
        return null;
      }
    },
    readFile: (src) => {
      const p = local(src);
      return p && existsSync(p) ? readFileSync(p, 'utf8') : null;
    },
  };
}

/** Parses .ncss or .json source. */
export function parseSource(src: string, file: string, diag: Diagnostics): Document {
  if (file.endsWith('.json')) {
    try {
      return fromJson(JSON.parse(src) as JsonDocument);
    } catch (e) {
      diag.error({ line: 1, col: 1 }, `invalid JSON: ${(e as Error).message}`);
      return { nodes: [] };
    }
  }
  return parse(src, diag);
}

export function compileFile(file: string, extra: CompileOptions & FileOptions = {}): CompileResult {
  const src = readFileSync(file, 'utf8');
  const diag = new Diagnostics(file);
  const doc = parseSource(src, file, diag);
  return compileDocument(doc, { ...fileOptions(file, extra), ...extra }, diag);
}
