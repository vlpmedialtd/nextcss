// Closed tag lists. A first word that is none of these (and has no "-") is an error.

export const HTML_TAGS = new Set(
  (
    'a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col ' +
    'colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form ' +
    'h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark ' +
    'menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s ' +
    'samp script search section select slot small source span strong style sub summary sup table tbody td ' +
    'template textarea tfoot th thead time title tr track u ul var video wbr'
  ).split(' '),
);

export const SVG_TAGS = new Set(
  (
    'svg a animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix ' +
    'feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight ' +
    'feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode ' +
    'feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter ' +
    'foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline ' +
    'radialGradient rect script set stop style switch symbol text textPath title tspan use view'
  ).split(' '),
);

export const MATHML_TAGS = new Set(
  'math mi mn mo ms mspace mtext mrow mfrac msqrt mroot msub msup msubsup munder mover munderover mtable mtr mtd semantics annotation'.split(
    ' ',
  ),
);

export const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

// Content is taken verbatim from the indented lines below the element.
export const VERBATIM_TEXT_TAGS = new Set(['pre', 'textarea']); // escaped text
export const VERBATIM_RAW_TAGS = new Set(['script', 'style']); // raw

export const BOOLEAN_ATTRS = new Set(
  (
    'allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden ' +
    'inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'
  ).split(' '),
);

// Elements that are inline-level by default (for whitespace warnings and import).
export const INLINE_TAGS = new Set(
  (
    'a abbr b bdi bdo br button cite code data dfn em i img input kbd label mark output q s samp select small ' +
    'span strong sub sup textarea time u var wbr del ins svg'
  ).split(' '),
);

export function isKnownTag(name: string, inSvg: boolean, inMath: boolean): boolean {
  if (inSvg) return SVG_TAGS.has(name);
  if (inMath) return MATHML_TAGS.has(name);
  return HTML_TAGS.has(name) || name === 'svg' || name === 'math';
}

export function isCustomElement(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name);
}
