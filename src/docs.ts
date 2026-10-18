// Generates the compact language reference (llms.txt) from the schema.

import { ROLES, SPACE, TEXT_SIZES, TONES, type Group, type KeyDef } from './schema.js';

const GLOBAL_KEYS = new Set(['css', 'hide']);
const GROUP_TITLES: Record<Group, string> = {
  document: 'Document',
  landmark: 'Page regions',
  layout: 'Layout (all responsive without breakpoints)',
  content: 'Content',
  action: 'Actions',
  interactive: 'Interactive (no JavaScript)',
  form: 'Forms',
  escape: 'Escape hatches',
};

const SHARED_ENUMS: Record<string, string> = {
  surface: 'flat|raised|outline|sunken',
  radius: 'none|s|m|l|full',
  align: 'start|center|end',
  valign: 'start|center|end|stretch',
};

function keyText(k: string, kd: KeyDef): string {
  const t = kd.type;
  const suffix = kd.required ? '!' : '';
  if (SHARED_ENUMS[k] && t.t === 'enum' && t.values.join('|') === SHARED_ENUMS[k]) return k + suffix;
  switch (t.t) {
    case 'enum':
      return `${k}${suffix}(${t.values.join('|')})`;
    case 'int':
      return `${k}${suffix}(${t.min}-${t.max})`;
    case 'space':
    case 'textsize':
    case 'tone':
    case 'width':
      return `${k}${suffix}`;
    default:
      return `${k}${suffix}=${t.t}`;
  }
}

export function cheatSheet(): string {
  const out: string[] = [];
  out.push(
    '# nextcss v0.1 – complete reference',
    '',
    'nextcss replaces HTML+CSS. It compiles to static HTML and minimal CSS without JavaScript.',
    '',
    '## Syntax',
    '',
    '- One line is one element. Indent child lines by two spaces. There are no closing tags, no classes and no selectors.',
    '- Line shape: `role[#id] flags "text" key:value wide{key:value} narrow{key:value}`',
    '- A line that is only `"text"` is a text line. `| text` is a long text line. `// comment` is a comment.',
    '- Text supports **bold**, *italic*, `code`, [label](url) and inline roles: {link "here" to:/x}.',
    '- Quote values that contain spaces: alt:"Unser Team".',
    '- `name=value` sets a raw HTML attribute (escape hatch).',
    '- Sibling lines are joined without whitespace, so put spaces inside the strings.',
    '',
    '## Values',
    '',
    `- space: ${SPACE.join(' ')}`,
    `- text size: ${TEXT_SIZES.join(' ')} (fluid: grows with the screen)`,
    `- tone: ${TONES.join(' ')}. It sets background and text color as a pair, contrast ≥ 4.5:1 guaranteed. Nested buttons and links adapt.`,
    '- width: narrow text wide full, or a length like 50rem',
    '- length: a number with unit (16rem, 240px, 50%)',
    ...Object.entries(SHARED_ENUMS).map(([k, v]) => `- ${k}: ${v.replace(/\|/g, ' ')}`),
    '',
    '## Every role accepts',
    '',
    '- `css:"…"` – raw CSS for this element only; nesting allowed: `css:"color:red;&:hover{color:blue}"`',
    '- `hide:narrow|wide|all`',
    '- `data-*`, `aria-*`, `class`, `title`, `lang`, `dir`, `role`, `tabindex` are passed through as attributes.',
    '- `wide{…}` applies keys from 48rem width up, `narrow{…}` below it. This is rarely needed.',
    '',
    '## Rules the compiler enforces',
    '',
    '- Heading levels come from nesting: hero or top level = h1, section = h2, card in a section = h3.',
    '- `image` needs alt:"…" or the flag decorative. Width, height and lazy loading are added automatically.',
    '- `menu` and `dialog` need an #id. Open them with button opens:id, close them with button closes:id.',
    '- Unknown roles, keys or values are errors with a suggested fix. `nextcss check` explains each one.',
    '',
    '## Roles',
    '',
    'Format: `role: what it is · keys · flags`. `key!` is required, `key=url`/`key=string` take free values, other keys take the values listed or a scale above.',
  );
  const groups = new Map<Group, string[]>();
  for (const [role, def] of Object.entries(ROLES)) {
    const keys = Object.entries(def.keys)
      .filter(([k]) => !GLOBAL_KEYS.has(k))
      .map(([k, kd]) => keyText(k, kd));
    const flags = Object.keys(def.flags);
    const short = def.doc.split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    let line = `- ${role}: ${short}`;
    if (keys.length) line += ` · ${keys.join(' ')}`;
    if (flags.length) line += ` · flags ${flags.join(' ')}`;
    if (!groups.has(def.group)) groups.set(def.group, []);
    groups.get(def.group)!.push(line);
  }
  for (const [g, lines] of groups) out.push('', `### ${GROUP_TITLES[g]}`, '', ...lines);
  out.push('');
  return out.join('\n');
}
