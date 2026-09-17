/**
 * A small, forgiving HTML scanner, and the two colour functions the rulebook
 * needs from outside OKLCH.
 *
 * This is deliberately self-contained. `rules/` is the asset the rest of the tool
 * reads; it should be liftable into whatever engine the server ends up using, and
 * it should not break because a sibling module was refactored. Equivalent helpers
 * exist in `src/lib/`; if the two ever drift, this directory is the one that has
 * tests asserting its behaviour against a real thirteen-page corpus.
 *
 * Not a parser and not a DOM. It produces a token stream with byte offsets, which
 * is enough for every question the rulebook asks of markup: what immediately
 * precedes the H1, are these siblings structurally identical, is this emoji in an
 * icon position.
 */

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const RAW_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

export { VOID_ELEMENTS, RAW_ELEMENTS };

const ATTR_RE = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(source) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(source)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  darr: '↓', uarr: '↑', larr: '←', rarr: '→',
  copy: '©', reg: '®', trade: '™', deg: '°'
};

/** Decode the entities that actually turn up in prose. */
export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Tokenize. Raw elements (script, style, title) keep their body as a single
 * `raw` token rather than being scanned for tags, so a `<` inside a script does
 * not open an element and an em dash inside a CSS comment is never mistaken for
 * visible copy.
 */
export function tokenize(html) {
  const tokens = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);

    if (lt === -1) {
      if (i < html.length) tokens.push({ type: 'text', text: html.slice(i), start: i, end: html.length });
      break;
    }
    if (lt > i) tokens.push({ type: 'text', text: html.slice(i, lt), start: i, end: lt });

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      const end = close === -1 ? html.length : close + 3;
      tokens.push({ type: 'comment', text: html.slice(lt + 4, close === -1 ? html.length : close), start: lt, end });
      i = end;
      continue;
    }

    if (html.startsWith('<!', lt)) {
      const close = html.indexOf('>', lt);
      const end = close === -1 ? html.length : close + 1;
      tokens.push({ type: 'doctype', text: html.slice(lt, end), start: lt, end });
      i = end;
      continue;
    }

    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(html.slice(lt));
    if (!tagMatch) {
      // A stray "<" in prose. Treat it as text and move on.
      tokens.push({ type: 'text', text: '<', start: lt, end: lt + 1 });
      i = lt + 1;
      continue;
    }

    const [whole, closing, rawName, rawAttrs] = tagMatch;
    const name = rawName.toLowerCase();
    const end = lt + whole.length;

    if (closing) {
      tokens.push({ type: 'close', name, start: lt, end });
      i = end;
      continue;
    }

    const selfClosing = /\/\s*$/.test(rawAttrs) || VOID_ELEMENTS.has(name);
    tokens.push({
      type: selfClosing ? 'selfclose' : 'open',
      name,
      attrs: parseAttrs(rawAttrs),
      start: lt,
      end
    });
    i = end;

    if (!selfClosing && RAW_ELEMENTS.has(name)) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'i');
      const rest = html.slice(i);
      const found = closeRe.exec(rest);
      const rawEnd = found ? i + found.index : html.length;
      if (rawEnd > i) tokens.push({ type: 'raw', name, text: html.slice(i, rawEnd), start: i, end: rawEnd });
      i = rawEnd;
    }
  }

  return tokens;
}

// ---------------------------------------------------------------- colour

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Parse "#RGB", "#RGBA", "#RRGGBB" or "#RRGGBBAA". Throws on anything else. */
export function parseHex(value) {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected a hex colour string, received ${typeof value}`);
  }
  const m = HEX_RE.exec(value.trim());
  if (!m) throw new TypeError(`Not a hex colour: ${JSON.stringify(value)}`);
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  };
}

/** WCAG 2.1 relative luminance. https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
export function relativeLuminance({ r, g, b }) {
  const lin = (c8) => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export const roundRatio = (n) => Math.round(n * 100) / 100;
