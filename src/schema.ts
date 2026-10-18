// The nextcss vocabulary. Single source of truth for the parser, the compiler,
// the docs (llms.txt, SPEC reference) and the JSON Schema for structured output.

export type KeyType =
  | { t: 'enum'; values: string[] }
  | { t: 'space' } // none 2xs xs s m l xl 2xl 3xl
  | { t: 'textsize' } // xs s m l xl 2xl 3xl 4xl
  | { t: 'tone' }
  | { t: 'width' } // narrow text wide full | length
  | { t: 'length' } // CSS length with unit
  | { t: 'url' }
  | { t: 'string' }
  | { t: 'int'; min: number; max: number }
  | { t: 'ratio' }
  | { t: 'idref' }
  | { t: 'css' }
  | { t: 'color' };

export interface KeyDef {
  type: KeyType;
  doc: string;
  required?: boolean;
}

export type Group = 'document' | 'landmark' | 'layout' | 'content' | 'action' | 'interactive' | 'form' | 'escape';

export interface RoleDef {
  group: Group;
  doc: string;
  tag: string; // HTML element (may be refined by the renderer)
  keys: Record<string, KeyDef>;
  flags: Record<string, string>;
  text: 'none' | 'optional' | 'required' | 'multi';
  children: 'none' | 'any' | 'inline' | string[];
  verbatim?: 'raw' | 'text' | 'markdown';
  sectioning?: boolean; // increases the heading level of nested titles
  inline?: boolean; // allowed inside text / title / item
  topOnly?: boolean; // only at the top level
  example: string;
}

export const SPACE = ['none', '2xs', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl'];
export const TEXT_SIZES = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl'];
export const TONES = ['default', 'subtle', 'primary', 'accent', 'inverse', 'danger', 'success', 'warning'];
export const WIDTHS = ['narrow', 'text', 'wide', 'full'];

const k = (type: KeyType, doc: string, required = false): KeyDef => ({ type, doc, ...(required ? { required } : {}) });
const en = (...values: string[]): KeyType => ({ t: 'enum', values });

// ---- shared key groups ----
const GLOBAL: Record<string, KeyDef> = {
  css: k({ t: 'css' }, 'raw CSS for this element only; supports nesting: css:"color:red;&:hover{color:blue}"'),
  hide: k(en('narrow', 'wide', 'all'), 'hide on narrow screens, wide screens, or always'),
};
const SURFACE: Record<string, KeyDef> = {
  tone: k({ t: 'tone' }, 'color scheme of this area; text and buttons inside adapt, contrast is guaranteed'),
  pad: k({ t: 'space' }, 'inner spacing'),
  surface: k(en('flat', 'raised', 'outline', 'sunken'), 'visual elevation'),
  radius: k(en('none', 's', 'm', 'l', 'full'), 'corner rounding'),
};
const ALIGN: Record<string, KeyDef> = {
  align: k(en('start', 'center', 'end'), 'horizontal position of the content'),
  valign: k(en('start', 'center', 'end', 'stretch'), 'vertical position of the content'),
};
const GAP: Record<string, KeyDef> = { gap: k({ t: 'space' }, 'space between children') };
const BAND: Record<string, KeyDef> = {
  width: k({ t: 'width' }, 'width of the content column (the background stays full width)'),
};
const MAXW: Record<string, KeyDef> = { width: k({ t: 'width' }, 'maximum width') };
const TEXT: Record<string, KeyDef> = {
  size: k({ t: 'textsize' }, 'text size on a fluid scale'),
  weight: k(en('normal', 'medium', 'bold'), 'font weight'),
  align: k(en('start', 'center', 'end'), 'text alignment'),
};
const ACCENT: Record<string, KeyDef> = { tone: k({ t: 'tone' }, 'color family') };
const LAYOUT_FLAGS = { grow: 'take the remaining space in a row' };

export const ROLES: Record<string, RoleDef> = {
  // ---------------- document ----------------
  page: {
    group: 'document',
    doc: 'First line of a page. Its string is the document title. All other lines are top level.',
    tag: 'html',
    keys: {
      lang: k({ t: 'string' }, 'document language, e.g. de'),
      description: k({ t: 'string' }, 'meta description'),
      icon: k({ t: 'url' }, 'favicon'),
      image: k({ t: 'url' }, 'social preview image (og:image)'),
    },
    flags: { plain: 'no design system: roles render as bare HTML (used by the importer)', nodoctype: 'omit the doctype' },
    text: 'optional',
    children: 'none',
    topOnly: true,
    example: 'page "Pixelfarben – Webdesign" lang:de description:"Schnelle Shops."',
  },
  theme: {
    group: 'document',
    doc: 'Design system. Everything visual is derived from these few values.',
    tag: '',
    keys: {
      brand: k({ t: 'color' }, 'main color; the full palette is derived from it'),
      accent: k({ t: 'color' }, 'second color for tone:accent'),
      font: k({ t: 'string' }, 'body font family, e.g. Inter'),
      heading: k({ t: 'string' }, 'heading font family'),
      mono: k({ t: 'string' }, 'code font family'),
      fonts: k({ t: 'url' }, 'stylesheet URL that loads the fonts'),
      base: k({ t: 'length' }, 'body text size on wide screens (default 18px)'),
      radius: k(en('none', 's', 'm', 'l', 'xl'), 'corner style'),
      density: k(en('compact', 'normal', 'airy'), 'overall spacing'),
      width: k({ t: 'length' }, 'width of wide content (default 72rem)'),
      dark: k(en('auto', 'off'), 'follow the system dark mode'),
    },
    flags: {},
    text: 'none',
    children: 'none',
    topOnly: true,
    example: 'theme brand:#0a66c2 font:Inter radius:m',
  },
  use: {
    group: 'document',
    doc: 'Load components and the theme from another file.',
    tag: '',
    keys: {},
    flags: {},
    text: 'required',
    children: 'none',
    topOnly: true,
    example: 'use "./parts.ncss"',
  },
  define: {
    group: 'document',
    doc: 'Define a component. Parameters are used as {$name}. The single root element receives extra keys of the instance.',
    tag: '',
    keys: {},
    flags: {},
    text: 'none',
    children: 'any',
    topOnly: true,
    example: 'define Feature(title, text)\n  card\n    title "{$title}"\n    text "{$text}"',
  },
  slot: {
    group: 'document',
    doc: 'Inside define: where the children of the instance go.',
    tag: '',
    keys: {},
    flags: {},
    text: 'none',
    children: 'none',
    example: 'slot',
  },
  head: {
    group: 'escape',
    doc: 'Raw HTML added to <head> (scripts, meta tags).',
    tag: '',
    keys: {},
    flags: {},
    text: 'none',
    children: 'none',
    verbatim: 'raw',
    topOnly: true,
    example: 'head\n  <meta name="robots" content="noindex">',
  },
  body: {
    group: 'escape',
    doc: 'Explicit <body> (only needed to put attributes on it).',
    tag: 'body',
    keys: { ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    topOnly: true,
    example: 'body class=home',
  },

  // ---------------- landmarks ----------------
  header: {
    group: 'landmark',
    doc: 'Site header: a bar with logo, navigation and actions; wraps on small screens.',
    tag: 'header',
    keys: { ...SURFACE, ...BAND, ...GAP, ...GLOBAL },
    flags: { sticky: 'stays at the top while scrolling' },
    text: 'none',
    children: 'any',
    example: 'header sticky\n  link "Pixelfarben" to:/\n  nav\n    link "Preise" to:/preise',
  },
  nav: {
    group: 'landmark',
    doc: 'Navigation: links in a row that wraps.',
    tag: 'nav',
    keys: { ...GAP, ...ALIGN, label: k({ t: 'string' }, 'accessible name when there are several navs'), ...GLOBAL },
    flags: { vertical: 'links stacked' },
    text: 'none',
    children: 'any',
    example: 'nav\n  link "Leistungen" to:/leistungen',
  },
  main: {
    group: 'landmark',
    doc: 'Main content of the page.',
    tag: 'main',
    keys: { ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'main',
  },
  footer: {
    group: 'landmark',
    doc: 'Site footer: smaller text, separated from the content.',
    tag: 'footer',
    keys: { ...SURFACE, ...BAND, ...GAP, ...ALIGN, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'footer\n  text "© 2026 Pixelfarben" size:s',
  },
  aside: {
    group: 'landmark',
    doc: 'Complementary content.',
    tag: 'aside',
    keys: { ...SURFACE, ...GAP, ...ALIGN, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    sectioning: true,
    example: 'aside tone:subtle pad:m',
  },
  section: {
    group: 'landmark',
    doc: 'A full-width band of the page. Content is centered at the content width and stacked.',
    tag: 'section',
    keys: { ...SURFACE, ...BAND, ...GAP, ...ALIGN, label: k({ t: 'string' }, 'accessible name if there is no title'), ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    sectioning: true,
    example: 'section tone:subtle\n  title "Leistungen"',
  },
  hero: {
    group: 'landmark',
    doc: 'Large opening band. Its title is the page h1. With image: the image fills the background and text turns light.',
    tag: 'section',
    keys: {
      ...SURFACE,
      ...BAND,
      ...GAP,
      ...ALIGN,
      image: k({ t: 'url' }, 'background image'),
      height: k(en('auto', 'half', 'tall', 'screen'), 'minimum height (default tall)'),
      ...GLOBAL,
    },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'hero tone:inverse align:center\n  title "Websites, die verkaufen"',
  },

  // ---------------- layout ----------------
  box: {
    group: 'layout',
    doc: 'Neutral container without layout.',
    tag: 'div',
    keys: { ...SURFACE, ...MAXW, ...GLOBAL },
    flags: { ...LAYOUT_FLAGS },
    text: 'none',
    children: 'any',
    example: 'box tone:subtle pad:m',
  },
  stack: {
    group: 'layout',
    doc: 'Children on top of each other with even spacing.',
    tag: 'div',
    keys: { ...GAP, ...ALIGN, ...SURFACE, ...MAXW, ...GLOBAL },
    flags: { ...LAYOUT_FLAGS },
    text: 'none',
    children: 'any',
    example: 'stack gap:s',
  },
  row: {
    group: 'layout',
    doc: 'Children side by side, vertically centered; wraps when there is not enough room.',
    tag: 'div',
    keys: { ...GAP, ...ALIGN, ...SURFACE, ...GLOBAL },
    flags: { ...LAYOUT_FLAGS, nowrap: 'never wrap' },
    text: 'none',
    children: 'any',
    example: 'row\n  button "Start" to:/start\n  button "Mehr" to:/mehr variant:ghost',
  },
  bar: {
    group: 'layout',
    doc: 'Row with the first and last child pushed to the edges.',
    tag: 'div',
    keys: { ...GAP, valign: ALIGN.valign, ...SURFACE, ...GLOBAL },
    flags: { ...LAYOUT_FLAGS },
    text: 'none',
    children: 'any',
    example: 'bar\n  text "3 Ergebnisse"\n  link "Alle" to:/alle',
  },
  split: {
    group: 'layout',
    doc: 'Two or more parts side by side; they stack automatically when the container is narrower than `at`.',
    tag: 'div',
    keys: {
      ...GAP,
      valign: ALIGN.valign,
      at: k({ t: 'length' }, 'container width below which the parts stack (default 40rem)'),
      ratio: k({ t: 'ratio' }, 'width ratio of first to second part, e.g. 2/1'),
      ...SURFACE,
      ...GLOBAL,
    },
    flags: { reverse: 'show the second part first on wide screens' },
    text: 'none',
    children: 'any',
    example: 'split ratio:3/2 valign:center\n  stack\n    title "Über uns"\n  image src:/team.jpg alt:"Team"',
  },
  grid: {
    group: 'layout',
    doc: 'Equal tiles. As many columns as fit at width `min`, at most `cols`. No breakpoints needed.',
    tag: 'div',
    keys: {
      ...GAP,
      min: k({ t: 'length' }, 'minimum tile width (default 16rem)'),
      cols: k({ t: 'int', min: 1, max: 12 }, 'maximum number of columns'),
      valign: ALIGN.valign,
      ...SURFACE,
      ...GLOBAL,
    },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'grid min:14rem\n  card\n    title "A"',
  },
  center: {
    group: 'layout',
    doc: 'Centers its content at a maximum width.',
    tag: 'div',
    keys: { ...MAXW, ...GAP, align: ALIGN.align, ...SURFACE, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'center width:narrow',
  },
  cover: {
    group: 'layout',
    doc: 'At least `height` tall, content vertically centered.',
    tag: 'div',
    keys: { height: k(en('half', 'tall', 'screen'), 'minimum height (default tall)'), ...GAP, ...ALIGN, ...SURFACE, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'cover height:screen align:center',
  },
  layer: {
    group: 'layout',
    doc: 'Children placed on top of each other (text over an image).',
    tag: 'div',
    keys: { ...ALIGN, ...SURFACE, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'layer\n  image src:/bg.jpg decorative\n  title "Over the image"',
  },
  sidebar: {
    group: 'layout',
    doc: 'A side column of fixed width next to a fluid main column; stacks when the main column would get too narrow.',
    tag: 'div',
    keys: {
      side: k(en('left', 'right'), 'where the side column is (default left = first child)'),
      width: k({ t: 'length' }, 'width of the side column (default 16rem)'),
      ...GAP,
      ...SURFACE,
      ...GLOBAL,
    },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'sidebar width:18rem\n  nav vertical\n  stack',
  },

  // ---------------- content ----------------
  title: {
    group: 'content',
    doc: 'Heading. The level (h1–h6) follows from nesting: top level and hero = h1, in a section = h2, in a card inside a section = h3.',
    tag: 'h',
    keys: { ...TEXT, level: k({ t: 'int', min: 1, max: 6 }, 'force a heading level'), ...GLOBAL },
    flags: { muted: 'secondary color' },
    text: 'optional',
    children: 'inline',
    example: 'title "Leistungen"',
  },
  text: {
    group: 'content',
    doc: 'Paragraph. Supports **bold**, *italic*, `code` and [links](/url).',
    tag: 'p',
    keys: { ...TEXT, ...GLOBAL },
    flags: { muted: 'secondary color', lead: 'larger intro paragraph' },
    text: 'optional',
    children: 'inline',
    example: 'text "Wir bauen **schnelle** Shops." muted',
  },
  prose: {
    group: 'content',
    doc: 'Long-form Markdown (headings, lists, quotes, code). Heading levels continue from the surrounding context.',
    tag: 'div',
    keys: { size: TEXT.size, ...MAXW, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'none',
    verbatim: 'markdown',
    example: 'prose\n  ## Unsere Geschichte\n  Gegründet **2012** in Hamburg.',
  },
  list: {
    group: 'content',
    doc: 'Bulleted list of item lines.',
    tag: 'ul',
    keys: { ...GAP, marker: k(en('disc', 'none', 'check', 'number'), 'bullet style'), ...GLOBAL },
    flags: { ordered: 'numbered list' },
    text: 'none',
    children: ['item', 'comment'],
    example: 'list marker:check\n  item "Schnell"\n  item "Sicher"',
  },
  item: {
    group: 'content',
    doc: 'List item; text or children.',
    tag: 'li',
    keys: { ...GLOBAL },
    flags: {},
    text: 'optional',
    children: 'any',
    example: 'item "Inklusive Hosting"',
  },
  quote: {
    group: 'content',
    doc: 'Quotation, optionally with author.',
    tag: 'blockquote',
    keys: { by: k({ t: 'string' }, 'author / source'), size: TEXT.size, ...GLOBAL },
    flags: {},
    text: 'optional',
    children: 'inline',
    example: 'quote "Beste Agentur." by:"Anna, CEO"',
  },
  code: {
    group: 'content',
    doc: 'Code block; the indented lines below are taken literally.',
    tag: 'pre',
    keys: { lang: k({ t: 'string' }, 'language name'), ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'none',
    verbatim: 'text',
    example: 'code lang:js\n  console.log("hi")',
  },
  image: {
    group: 'content',
    doc: 'Image. alt is required unless the image is decorative. Width/height and lazy loading are added automatically.',
    tag: 'img',
    keys: {
      src: k({ t: 'url' }, 'image file', true),
      alt: k({ t: 'string' }, 'description for screen readers and search engines'),
      caption: k({ t: 'string' }, 'visible caption'),
      ratio: k({ t: 'ratio' }, 'crop to this aspect ratio, e.g. 16/9'),
      fit: k(en('cover', 'contain'), 'how the image fills a ratio'),
      width: k({ t: 'length' }, 'display width'),
      radius: SURFACE.radius,
      ...GLOBAL,
    },
    flags: { decorative: 'purely visual, hidden from screen readers', lcp: 'the main image of the page: load first' },
    text: 'none',
    children: 'none',
    inline: true,
    example: 'image src:/team.jpg alt:"Unser Team" ratio:4/3',
  },
  video: {
    group: 'content',
    doc: 'Video with controls.',
    tag: 'video',
    keys: {
      src: k({ t: 'url' }, 'video file', true),
      poster: k({ t: 'url' }, 'preview image'),
      ratio: k({ t: 'ratio' }, 'aspect ratio'),
      label: k({ t: 'string' }, 'accessible description'),
      ...GLOBAL,
    },
    flags: { autoplay: 'start muted and loop, without controls (background video)' },
    text: 'none',
    children: 'none',
    example: 'video src:/demo.mp4 poster:/demo.jpg',
  },
  icon: {
    group: 'content',
    doc: 'Inline SVG icon from a local file; takes the current text color.',
    tag: 'span',
    keys: { src: k({ t: 'url' }, 'local .svg file', true), label: k({ t: 'string' }, 'accessible name; without it the icon is decorative'), size: TEXT.size, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'none',
    inline: true,
    example: 'icon src:/icons/rocket.svg size:xl',
  },
  divider: {
    group: 'content',
    doc: 'Horizontal rule.',
    tag: 'hr',
    keys: { ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'none',
    example: 'divider',
  },
  table: {
    group: 'content',
    doc: 'Data table: one `columns` line with headers, then `cells` lines. Scrolls horizontally on small screens.',
    tag: 'table',
    keys: { caption: k({ t: 'string' }, 'table caption'), ...GLOBAL },
    flags: { striped: 'alternate row background' },
    text: 'none',
    children: ['columns', 'cells', 'comment'],
    example: 'table\n  columns "Paket" "Preis"\n  cells "Basic" "49 €"',
  },
  columns: {
    group: 'content',
    doc: 'Header row of a table: one string per column.',
    tag: 'tr',
    keys: {},
    flags: {},
    text: 'multi',
    children: 'none',
    example: 'columns "Paket" "Preis"',
  },
  cells: {
    group: 'content',
    doc: 'Data row of a table: one string per cell.',
    tag: 'tr',
    keys: {},
    flags: {},
    text: 'multi',
    children: 'none',
    example: 'cells "Basic" "49 €"',
  },
  card: {
    group: 'content',
    doc: 'Self-contained block (article). With `to`, the whole card is a link.',
    tag: 'article',
    keys: { ...SURFACE, ...GAP, ...ALIGN, to: k({ t: 'url' }, 'link target for the whole card'), ...GLOBAL },
    flags: { ...LAYOUT_FLAGS },
    text: 'none',
    children: 'any',
    sectioning: true,
    example: 'card\n  title "Performance"\n  text "Unter 1 Sekunde."',
  },
  badge: {
    group: 'content',
    doc: 'Small label.',
    tag: 'span',
    keys: { ...ACCENT, ...GLOBAL },
    flags: {},
    text: 'required',
    children: 'none',
    inline: true,
    example: 'badge "Neu" tone:success',
  },
  alert: {
    group: 'content',
    doc: 'Highlighted message. tone:danger is announced to screen readers immediately.',
    tag: 'div',
    keys: { ...ACCENT, ...GLOBAL },
    flags: {},
    text: 'optional',
    children: 'any',
    example: 'alert "Gespeichert." tone:success',
  },

  // ---------------- actions ----------------
  link: {
    group: 'action',
    doc: 'Text link.',
    tag: 'a',
    keys: { to: k({ t: 'url' }, 'target URL or #id', true), ...ACCENT, size: TEXT.size, weight: TEXT.weight, ...GLOBAL },
    flags: { new: 'open in a new tab', muted: 'secondary color', plain: 'no underline until hover' },
    text: 'optional',
    children: 'inline',
    inline: true,
    example: 'link "Impressum" to:/impressum',
  },
  button: {
    group: 'action',
    doc: 'Button. With `to` it navigates, with `opens`/`closes` it controls a menu or dialog, with `submit` it sends a form.',
    tag: 'button',
    keys: {
      to: k({ t: 'url' }, 'navigate to'),
      opens: k({ t: 'idref' }, 'id of a menu or dialog to open'),
      closes: k({ t: 'idref' }, 'id of a menu or dialog to close'),
      ...ACCENT,
      variant: k(en('solid', 'outline', 'ghost'), 'visual weight (default solid)'),
      size: k(en('s', 'm', 'l'), 'button size'),
      ...GLOBAL,
    },
    flags: { submit: 'submits the surrounding form', full: 'full width', new: 'open link in a new tab', grow: LAYOUT_FLAGS.grow },
    text: 'optional',
    children: 'inline',
    inline: true,
    example: 'button "Projekt starten" to:/start',
  },

  // ---------------- interactive ----------------
  fold: {
    group: 'interactive',
    doc: 'Expandable section (FAQ). Its string is the always-visible summary.',
    tag: 'details',
    keys: { ...GLOBAL },
    flags: { open: 'expanded initially' },
    text: 'required',
    children: 'any',
    example: 'fold "Wie lange dauert ein Projekt?"\n  text "4–8 Wochen."',
  },
  accordion: {
    group: 'interactive',
    doc: 'Group of folds where only one is open at a time.',
    tag: 'div',
    keys: { ...GLOBAL },
    flags: {},
    text: 'none',
    children: ['fold', 'comment'],
    example: 'accordion\n  fold "Frage 1"\n    text "Antwort"',
  },
  menu: {
    group: 'interactive',
    doc: 'Pop-up panel opened by a button with opens:<id>. Needs an #id. No JavaScript.',
    tag: 'div',
    keys: { ...GAP, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'button "Menü" opens:menu\nmenu#menu\n  link "Preise" to:/preise',
  },
  dialog: {
    group: 'interactive',
    doc: 'Modal dialog opened by a button with opens:<id>. Needs an #id. No JavaScript.',
    tag: 'dialog',
    keys: { ...GAP, ...MAXW, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    sectioning: true,
    example: 'dialog#hello\n  title "Hallo"\n  button "Schließen" closes:hello',
  },

  // ---------------- forms ----------------
  form: {
    group: 'form',
    doc: 'Form with stacked fields.',
    tag: 'form',
    keys: { to: k({ t: 'url' }, 'where the data is sent'), method: k(en('get', 'post'), 'HTTP method (default post)'), ...GAP, ...SURFACE, ...MAXW, ...GLOBAL },
    flags: {},
    text: 'none',
    children: 'any',
    example: 'form to:/kontakt\n  field "E-Mail" type:email required\n  button "Senden" submit',
  },
  field: {
    group: 'form',
    doc: 'Labeled input. The string is the label. name defaults to a slug of the label.',
    tag: 'label',
    keys: {
      type: k(
        en('text', 'email', 'tel', 'url', 'number', 'password', 'date', 'time', 'search', 'textarea', 'select', 'file'),
        'input type (default text)',
      ),
      name: k({ t: 'string' }, 'form field name'),
      placeholder: k({ t: 'string' }, 'example value'),
      hint: k({ t: 'string' }, 'help text below the input'),
      value: k({ t: 'string' }, 'initial value'),
      autocomplete: k({ t: 'string' }, 'autocomplete token, e.g. email'),
      min: k({ t: 'string' }, 'minimum value'),
      max: k({ t: 'string' }, 'maximum value'),
      ...GLOBAL,
    },
    flags: { required: 'must be filled in', multiple: 'several values (select, file)', disabled: 'not editable' },
    text: 'required',
    children: ['option', 'comment'],
    example: 'field "E-Mail" type:email required',
  },
  option: {
    group: 'form',
    doc: 'Choice inside field type:select.',
    tag: 'option',
    keys: { value: k({ t: 'string' }, 'submitted value (default: the text)') },
    flags: { selected: 'preselected' },
    text: 'required',
    children: 'none',
    example: 'option "Basic"',
  },
  check: {
    group: 'form',
    doc: 'Checkbox, radio or switch with its label.',
    tag: 'label',
    keys: {
      type: k(en('checkbox', 'radio', 'switch'), 'kind (default checkbox)'),
      name: k({ t: 'string' }, 'form field name'),
      value: k({ t: 'string' }, 'submitted value'),
      ...GLOBAL,
    },
    flags: { required: 'must be checked', checked: 'checked initially', disabled: 'not changeable' },
    text: 'required',
    children: 'none',
    example: 'check "Ich stimme den AGB zu" required',
  },

  // ---------------- escape hatches ----------------
  el: {
    group: 'escape',
    doc: 'Any HTML element: the first bare word is the tag, every key becomes an attribute.',
    tag: '*',
    keys: { ...GLOBAL },
    flags: {},
    text: 'optional',
    children: 'any',
    inline: true,
    example: 'el abbr "WHO" title:"World Health Organization"',
  },
  html: {
    group: 'escape',
    doc: 'Raw HTML; the indented lines below are inserted as they are.',
    tag: '',
    keys: {},
    flags: {},
    text: 'none',
    children: 'none',
    verbatim: 'raw',
    inline: true,
    example: 'html\n  <svg viewBox="0 0 10 10">…</svg>',
  },
  css: {
    group: 'escape',
    doc: 'Raw stylesheet in the lowest cascade layer.',
    tag: '',
    keys: {},
    flags: {},
    text: 'none',
    children: 'none',
    verbatim: 'raw',
    topOnly: true,
    example: 'css\n  .legacy { color: red }',
  },
  script: {
    group: 'escape',
    doc: 'JavaScript; inline code from the indented lines, or src.',
    tag: 'script',
    keys: { src: k({ t: 'url' }, 'script file'), type: k({ t: 'string' }, 'script type') },
    flags: { defer: 'run after parsing', async: 'run when loaded', module: 'ES module' },
    text: 'none',
    children: 'none',
    verbatim: 'raw',
    example: 'script src:/app.js module',
  },
};

/** Keys that are passed through as HTML attributes on every role. */
export function isPassthroughKey(key: string): boolean {
  return /^(data|aria)-[a-z0-9-]+$/.test(key) || ['class', 'title', 'lang', 'dir', 'role', 'tabindex', 'translate'].includes(key);
}

export const BLOCK_CONDS = ['narrow', 'wide'];
