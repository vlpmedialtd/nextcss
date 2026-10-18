export interface Pos {
  line: number; // 1-based
  col: number; // 1-based
}

export interface Value {
  raw: string; // unescaped value
  quoted: boolean;
}

/** `key:value` — a typed key from the role schema. */
export interface Prop {
  kind: 'prop';
  key: string;
  value: Value;
  pos: Pos;
}

/** `name=value` — a raw HTML attribute (escape hatch). */
export interface Attr {
  kind: 'attr';
  name: string;
  value: Value;
  pos: Pos;
}

/** A bare word. */
export interface Flag {
  kind: 'flag';
  name: string;
  pos: Pos;
}

/** `wide{…}` or `narrow{…}` */
export interface Block {
  kind: 'block';
  cond: string;
  arg?: string;
  items: (Prop | Flag | Block)[];
  pos: Pos;
}

export interface StringItem {
  kind: 'string';
  raw: string; // source between the quotes, escapes kept
  pos: Pos;
}

export type Item = Prop | Attr | Flag | Block | StringItem | ClassRef;

/** Only produced by the lexer for diagnostics (".x" is not valid nextcss). */
export interface ClassRef {
  kind: 'classref';
  name: string;
  pos: Pos;
}

export interface RoleNode {
  kind: 'node';
  role: string; // schema role, or component name (capitalized)
  id?: string;
  flags: Flag[];
  texts: StringItem[];
  props: Prop[];
  attrs: Attr[];
  blocks: Block[];
  children: Node[];
  verbatim?: string[]; // content lines of verbatim roles
  rest?: string; // raw rest of the line (define signature)
  pos: Pos;
}

export interface TextNode {
  kind: 'text';
  raw: string;
  form: 'quoted' | 'pipe';
  pos: Pos;
}

export interface CommentNode {
  kind: 'comment';
  text: string;
  pos: Pos;
}

export type Node = RoleNode | TextNode | CommentNode;

export interface Document {
  nodes: Node[];
}

export interface Diagnostic {
  level: 'error' | 'warning';
  message: string;
  line: number;
  col: number;
  file?: string;
  fix?: string; // suggested replacement, machine-readable
}
