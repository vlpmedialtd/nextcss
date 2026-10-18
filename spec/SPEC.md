# nextcss specification — v0.1

nextcss replaces HTML and CSS with one language designed for AI models to write and read. A `.ncss` file (or its JSON form) compiles to static HTML and minimal CSS. There is no runtime and no JavaScript is generated.

The complete vocabulary (every role, key, flag and value) is in [`llms.txt`](../llms.txt). It is generated from [`src/schema.ts`](../src/schema.ts), which is the single source of truth for the parser, the compiler, the docs and the JSON Schema.

---

## 1. Why a new language

HTML and CSS were designed for people who look at the screen while they type. An AI model writes in a single pass from top to bottom, cannot see the result, thinks in intent and pays per token. The table below lists what that changes.

| Problem for an AI | nextcss answer |
|---|---|
| **Action at a distance.** How an element looks depends on selectors in other files, on specificity and on the cascade. This requires global reasoning. | An element looks the way its own line says, plus the theme. There are no selectors and no classes. |
| **No eyes.** Pixel values, z-index and breakpoints are guesses. | Semantic scales (`s m l xl`) and color *pairs* (`tone:primary`) with guaranteed contrast. Layouts adapt on their own (intrinsic layout). |
| **Mechanism instead of intent.** You have to write `display:flex; justify-content:space-between`. | Intent words: `bar`, `split`, `grid min:16rem`, `cover`. |
| **Easy to forget.** `alt` text, labels, heading order, focus styles. | These are part of the type system. Heading levels follow from nesting, and an image without `alt` is a compile error. |
| **Boilerplate.** Closing tags, class names, JavaScript for an accordion, tabs or a menu. | One line per element. `fold`, `tabs`, `menu` and `dialog` compile to platform features (`details`, exclusive `details name`, `popover`, `dialog` with invoker commands). `each` repeats lines for JSON data at compile time. |
| **Many ways to do one thing.** | One canonical form (`nextcss fmt`) and a closed vocabulary. |
| **Invalid output.** | Every error names the fix. A JSON Schema constrains generation, so invalid documents cannot be produced at all. |
| **No feedback loop.** | `nextcss inspect` renders the page and reports, as text, what came out: outline, columns per width, contrast, overflow and tap targets. |

---

## 2. Lines

```
line   = indent ( comment | text | node ) EOL
indent = { "  " }                      two spaces per level; tabs are errors
node   = head { item }
head   = role [ "#" id ] | Component
item   = flag | string | key ":" value | name "=" value | ("wide"|"narrow") "{" { flag | key ":" value } "}"
text   = string | "|" rest-of-line
comment= "//" rest-of-line             whole lines only
```

- **Nesting.** One line is one element. A child line is indented two spaces more than its parent. There are no closing tags.
- **Canonical order.** `fmt` writes the parts in this order: `role#id "text" flags key:value name=value wide{…} narrow{…}`.
- **`key:value`** is a typed key from the schema. It is validated, and an unknown key or value is an error with a suggestion.
- **`name=value`** is a raw HTML attribute, passed through unchanged. It is the escape hatch.
- **Values** are bare or `"quoted"`. Quotes are needed when the value contains spaces, `"`, `{` or `}`. Quoting never changes the meaning. An inline JSON array is bare as well: `items:["a b","c"]`.
- **Strings** are single-line. Escapes are `\"` `\\` `\{` `\}` `\*` `` \` `` `\[`. A text string may contain `{role …}` inline elements with nested strings.
- **Comments** start with `//` at the beginning of a line.

### Text

| Form | Meaning |
|---|---|
| `text "Hello"` | paragraph with inline Markdown |
| `"Hello "` on its own line | text node (mixed content) |
| `\| long text` | long text; consecutive lines are joined with a newline |

- **Inline Markdown:** `**bold**`, `*italic*`, `` `code` ``, `[label](url)`, `![alt](src)`.
- **Inline roles:** `{link "here" to:/x}`, `{badge "new"}`, `{el abbr "WHO" title:"World Health Organization"}`.
- A `*` with spaces around it is literal, so `5 * 3` stays as written.
- **Whitespace.** Sibling lines are joined without whitespace, so put the space inside the string: `"Read "` followed by `link "more" to:/x`. `check` warns when words would be glued together.
- **Escaping.** `<` and `&` are escaped in text. Entities such as `&nbsp;` and `&#169;` are kept.

---

## 3. Layout model

Containers declare **what** they do. The compiler decides how, using intrinsic CSS that adapts to the available space without media queries.

| Role | Behavior | Responsive by |
|---|---|---|
| `stack` | children stacked, even gap | — |
| `row` | side by side, vertically centered | wrapping |
| `bar` | row, first and last child at the edges | wrapping |
| `split` | parts side by side | stacks below `at` (container width, default 40rem; "switcher") |
| `grid` | equal tiles | `repeat(auto-fit, minmax(min(var(--min),100%),1fr))`, capped at `cols` |
| `sidebar` | fixed side column + fluid main | wraps when the main column would go below 55% |
| `center` | max width, centered | — |
| `cover` | min height, content vertically centered | — |
| `layer` | children on top of each other | — |
| `section`, `hero`, `header`, `footer` | full-width band, content column centered at `width` | padding trick, no wrapper element |

Alignment uses words, not axes:

- `align` is the horizontal position of the content (start, center, end).
- `valign` is the vertical position.

The compiler maps them to `justify-content`, `align-items` or `text-align` depending on the role.

`wide{…}` (≥ 48rem) and `narrow{…}` (< 48rem) exist for the rare cases where intent differs by screen size. `hide:narrow|wide` hides an element on one of them.

---

## 4. Design system

```
theme brand:#0a66c2 accent:#f59e0b font:Inter heading:Fraunces radius:m density:normal dark:auto
```

### Color

From `brand` (and the optional `accent`), the compiler derives everything else in OKLCH:

- a tinted neutral palette,
- eight **tones**: `default subtle primary accent inverse danger success warning`.

Each tone is a complete set of colors:

| Variable | Meaning |
|---|---|
| `--n-bg` | background |
| `--n-fg` | text |
| `--n-muted` | secondary text |
| `--n-line` | borders |
| `--n-surface` | cards |
| `--n-accent` | links and buttons |
| `--n-on-accent` | text on accent |

- **Contrast.** Every text pair is adjusted to at least 4.5:1 (WCAG AA) at compile time. The tests check this for many brand colors.
- **Tones nest.** A button in an `inverse` section uses the inverse accent automatically.
- **Tones on accent roles.** On `button`, `badge`, `alert` and `link`, `tone:` selects the accent color family instead of a background.
- **Dark mode.** `dark:auto` adds dark variants of `default` and `subtle` under `prefers-color-scheme: dark`.

### Scales

- **Space:** `2xs xs s m l xl 2xl 3xl`, fluid between 375 px and 1280 px viewports (`clamp()`), multiplied by `density`.
- **Text:** `xs … 4xl` on a modular scale (ratio 1.2 on phones, 1.25 on desktops), fluid.
- **Content widths:** `narrow` 40rem, `text` 70ch, `wide` 72rem (theme `width`).
- **Radius:** derived from `radius`.

### Defaults that follow from context

- Heading level: 1 + the number of enclosing sectioning roles (`section`, `aside`, `card`, `dialog`). `hero` and the top level are h1. `level:` overrides.
- Title size follows the level (h1 = 3xl, 4xl in a hero; h2 = 2xl; titles in cards = l). Text in a hero is `l`.
- Links in `header`, `nav`, `footer` and `menu` are navigation links: no underline until hover, and at least 24 px tall.
- A `hero` with `image` gets a darkening overlay and the `inverse` tone.
- A button as the last child of a card sits at the bottom, so buttons line up across a grid.

---

## 5. Cascade

Generated CSS uses two cascade layers:

```css
@layer n-raw, n;
```

| Layer | Contains |
|---|---|
| `n-raw` | `css` blocks and imported stylesheets, verbatim. Remote stylesheets become `@import … layer(n-raw)`. |
| `n` | tokens, base styles, role classes, modifiers, `wide`/`narrow` variants, then `css:"…"` escapes |

Every generated selector is a single class (`.n-card`, `.n-gap-l`, `.n-tone-subtle`). Precedence is therefore just bucket order: role, tone, modifiers, wide, narrow, escapes. Raw CSS can never override what a line says, whatever its specificity.

Only what is used is emitted: role classes, modifier classes and the design tokens they reference.

---

## 6. Components and data loops

```
define Feature(title, text="")
  card
    title "{$title}"
    text "{$text}"
    slot

Feature "Schnell" tone:subtle
  badge "neu"
```

- A string on the instance line fills the first parameter.
- Parameters are consumed. Every other key, flag, attribute and block lands on the single root element.
- `slot` receives the instance's child lines.
- Optional parameters that stay empty remove the lines and keys that use them.
- `use "./parts.ncss"` loads components and the theme from another file.

### Data loops

```
each items:./team.json
  Member "{$name}" role:"{$role}"
    row
      each items:"{$skills}"
        badge "{$item}"
```

- `each` repeats its child lines once per item of a JSON array and then disappears. It is expanded at compile time, after `use` and together with components, so the output stays static HTML.
- `items` is a `.json` file or an inline array: `items:["Schnell","Sicher"]`. Files are read through the same loader as `use` and resolve relative to the file the `each` line is written in (also inside a component from a `use` file).
- `{$field}` is a field of the item, `{$a.b}` a nested field, `{$item}` the whole item and `{$index}` its position from 1. Arrays and objects become JSON, so an inner loop can take them: `each items:"{$skills}"`.
- Inner loops see the fields of outer loops; on equal names the inner field wins.
- A field that only some items have is empty in the others, and lines and keys that become empty disappear, as with optional component parameters. An inner loop whose `items` is empty repeats nothing. A field that no item has is an error that lists the fields.
- Values from data are text: inline Markdown works, quotes and `{…}` are literal.
- The lines a loop produces are validated, not the loop, so `each` also fills roles that only take certain children: `item` in a `list`, `cells` in a `table`, `option` in a `field`, `tab` in `tabs`.
- Ids are not interpolated, so an element with an `#id` inside a loop with several items is a duplicate-id error.

---

## 7. Documents

`page "Title" lang:de description:"…" icon:/favicon.svg image:/og.jpg` makes a full document:

- doctype, charset and viewport,
- title, description, `og:title` and `og:image`,
- a font stylesheet link (with preconnect), if the theme sets `fonts`,
- the CSS.

A file without a `page` line compiles to a fragment.

- **`page plain`** turns the design system off. Roles render as bare HTML elements without classes, and nothing implicit is added to the head. The importer uses it.
- **`head`** adds raw HTML to the head.
- **`body`** sets attributes on the body.

---

## 8. Compiler output

| Concern | Behavior |
|---|---|
| CSS | only used rules and tokens; one `<style>` if HTML + CSS stay under 14 KB gzipped, otherwise a hashed external file; one shared hashed file for multi-page builds |
| Images | local files get `width`/`height`; `loading=lazy decoding=async` except in the header, the hero and the first block; `lcp` sets `fetchpriority=high` |
| Interactivity | `details`/`summary` (exclusive `details name` for `accordion` and `tabs`), the Popover API with anchor positioning, `<dialog>` with `commandfor`/`command` — no JavaScript |
| Accessibility | labels wrap inputs, hints use `aria-describedby`, `alert tone:danger` uses `role=alert`, focus rings come from the accent color, reduced motion is respected |
| HTML | minimal quoting, no optional whitespace |

### Tabs

```
tabs
  tab "Monatlich"
    text "29 €"
  tab "Jährlich" open
    text "290 €"
```

- Each `tab` becomes a `<details>` with its label as `<summary>`. All of them share one `name`, so the browser keeps exactly one open. The first tab is open unless another one has `open`.
- Where `::details-content` is supported, the CSS sets the `details` to `display: contents`, lines the summaries up as a tab row and shows the open panel below it. Elsewhere the same markup is an accordion, so nothing breaks.
- Keyboard and screen reader support come from the native disclosure: every label is a button that is reached with Tab and opened with Enter or Space. The open tab cannot be closed with the mouse.
- A tab label is not a heading, so titles inside a tab keep the level of the surrounding section.

---

## 9. JSON form

The same tree, one object per line, for tool calls and structured output:

```json
{ "nextcss": "0.1", "nodes": [
  { "role": "section", "tone": "subtle", "children": [
    { "role": "title", "text": "Preise" },
    { "role": "grid", "cols": "3", "children": [ { "role": "card", "children": [ { "role": "text", "text": "ab 2.900 €" } ] } ] }
  ] }
] }
```

- **Shape.** Flags are `true`. Keys are strings. Raw attributes go in `attrs`. Verbatim content goes in `content`. `el` puts its tag in `tag`. Inline data of `each` is a real array: `{ "role": "each", "items": ["a", "b"], "children": [ … ] }`.
- **Schema.** `nextcss schema` prints a JSON Schema (draft 2020-12) with one definition per role and enums for every typed key. Used for constrained decoding, it lets a model emit only valid documents.
- **Conversion.** `nextcss convert` switches between the line format and JSON.

---

## 10. Migration

| Direction | How |
|---|---|
| nextcss → HTML/CSS | `nextcss build`. The output is ordinary HTML and CSS with readable class names. |
| HTML/CSS → nextcss | `nextcss import page.html` writes a `page plain` file with the same DOM and the same computed styles. |

How the importer works:

- Elements map to roles where the plain rendering is identical (`section`, `p` → `text`, `h2` → `title`, `a` → `link`, `img` → `image`, …), and to `el <tag>` otherwise.
- Inline styles become `css:"…"`. Local stylesheets go verbatim into `css`.
- Simple `<strong>`, `<em>`, `<code>` and `<a>` become inline Markdown.
- Anything that cannot be expressed exactly (`pre`, `svg`, `template`, odd attribute names) becomes a raw `html` block.

The test suite verifies the round trip in Chrome: DOM, every computed style including pseudo-elements, and pixels. It does this at every breakpoint ±1 px, in light, dark and print mode, and with forced hover. After the import, a person or an AI can lift the page to roles and tones step by step.

---

## 11. inspect

`nextcss inspect page.ncss` renders the page in headless Chrome at 375 and 1280 px (configurable) and prints:

- the heading outline with source lines,
- per width: page height, elements wider than the screen, the column and row count of every layout container,
- the lowest text contrast and every text below 4.5:1 (3:1 for large text),
- tap targets smaller than 24×24 px,
- broken images.

`--json` returns the same data. The exit code is 1 when problems were found, so an AI agent can loop until it is 0.
