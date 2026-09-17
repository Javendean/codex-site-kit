/**
 * A small, forgiving HTML scanner.
 *
 * Not a parser and not a DOM. It produces two things the checks need and that
 * regular expressions over raw markup cannot give honestly:
 *
 *   - tags with their attributes and their byte offsets, so a finding can name
 *     a line;
 *   - a stream of BLOCKS: the visible text of each block-level element, in
 *     document order, with the element it came from and its ancestors.
 *
 * The block stream is what makes the attribution check possible. "A name set
 * under a quotation" is a statement about two adjacent blocks. It cannot be
 * expressed as a match on a single line of markup, which is why that bug ships.
 */

const RAW_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'cite', 'dd', 'details',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1',
  'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'ul'
]);

export { BLOCK_ELEMENTS, VOID_ELEMENTS, RAW_ELEMENTS };

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
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’'
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
    const key = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : whole;
  });
}

/**
 * Tokenise HTML.
 * @returns {Array<{type:string, name?:string, attrs?:object, text?:string, start:number, end:number}>}
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

/**
 * Collapse the token stream into visible-text blocks.
 *
 * A block closes when a block-level element opens or closes, so
 * `<p>Quote.</p><p>— A Name</p>` yields two adjacent blocks and their
 * relationship becomes inspectable.
 *
 * @returns {Array<{text, start, end, tag, attrs, ancestors: string[], inBlockquote: boolean, inComment: boolean}>}
 */
export function blocks(html) {
  const tokens = tokenize(html);
  const out = [];
  const stack = [];

  let buffer = '';
  let bufferStart = -1;
  let bufferEnd = -1;

  const currentTag = () => (stack.length ? stack[stack.length - 1] : { name: 'body', attrs: {} });

  function flush() {
    const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim();
    if (text) {
      const tag = currentTag();
      out.push({
        text,
        start: bufferStart,
        end: bufferEnd,
        tag: tag.name,
        attrs: tag.attrs || {},
        ancestors: stack.map((s) => s.name),
        inBlockquote: stack.some((s) => s.name === 'blockquote' || s.name === 'q'),
        inComment: false
      });
    }
    buffer = '';
    bufferStart = -1;
    bufferEnd = -1;
  }

  for (const token of tokens) {
    if (token.type === 'text') {
      if (bufferStart === -1) bufferStart = token.start;
      bufferEnd = token.end;
      buffer += token.text;
      continue;
    }

    if (token.type === 'comment') {
      flush();
      const text = decodeEntities(token.text).replace(/\s+/g, ' ').trim();
      if (text) {
        out.push({
          text,
          start: token.start,
          end: token.end,
          tag: '#comment',
          attrs: {},
          ancestors: stack.map((s) => s.name),
          inBlockquote: false,
          inComment: true
        });
      }
      continue;
    }

    if (token.type === 'raw' || token.type === 'doctype') {
      flush();
      continue;
    }

    /**
     * A tag boundary separates words.
     *
     * `<span>None</span><span>Customers…` has no whitespace between the two
     * text nodes, so concatenating them yields "NoneCustomers" — and every
     * word-boundary pattern downstream then fails to see "None". That turned a
     * real page's honest statement that it has no testimonials into a report
     * that it had invented some. Inserting the separator costs nothing that
     * matters and closes the whole class of fusion bug.
     */
    const separate = () => {
      if (buffer !== '' && !/\s$/.test(buffer)) buffer += ' ';
    };

    if (token.type === 'open') {
      if (BLOCK_ELEMENTS.has(token.name) || token.name === 'body') flush();
      else separate();
      stack.push({ name: token.name, attrs: token.attrs });
      continue;
    }

    if (token.type === 'selfclose') {
      if (token.name === 'br') {
        // A <br> ends a visual line, which is exactly where an attribution sits.
        flush();
      } else {
        separate();
      }
      continue;
    }

    if (token.type === 'close') {
      if (BLOCK_ELEMENTS.has(token.name) || token.name === 'body') flush();
      else separate();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === token.name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
  }

  flush();
  return out;
}

/**
 * Blocks for a Markdown document, shaped like the HTML ones so the same
 * attribution logic runs over both. Fenced code is skipped.
 */
export function markdownBlocks(text) {
  const out = [];
  let offset = 0;
  let inFence = false;
  let fenceMarker = '';

  // Walked rather than split, so the offsets stay true on CRLF files.
  // `text.split(/\r?\n/)` drops the carriage return from every line, and
  // adding back a single character per line then drifts the offsets by one for
  // every line in the file. Three hundred lines in, a finding is reported
  // against the wrong paragraph.
  while (offset <= text.length) {
    let newline = text.indexOf('\n', offset);
    if (newline === -1) newline = text.length;
    const raw = text.slice(offset, newline);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const start = offset;
    offset = newline + 1;
    if (start >= text.length && line === '') break;

    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const quoted = /^\s{0,3}>\s?(.*)$/.exec(line);
    const body = quoted ? quoted[1] : line;
    const trimmed = body.replace(/^#{1,6}\s+/, '').trim();
    if (!trimmed) continue;

    out.push({
      text: trimmed,
      start,
      end: start + line.length,
      tag: quoted ? 'blockquote' : 'p',
      attrs: {},
      ancestors: [],
      inBlockquote: Boolean(quoted),
      inComment: false
    });
  }

  return out;
}

/**
 * Every file this document references.
 *
 * Skips anything that is not a file on disk: absolute URLs, data: URIs,
 * mailto:, tel:, and bare fragments. Those are either someone else's problem
 * or not a reference at all.
 */
const REFERENCE_ATTRS = {
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  script: ['src'],
  link: ['href'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  embed: ['src'],
  iframe: ['src'],
  input: ['src'],
  object: ['data'],
  use: ['href', 'xlink:href'],
  image: ['href', 'xlink:href'],
  a: ['href'],
  area: ['href']
};

/**
 * Anything with a scheme or a protocol-relative prefix belongs to someone
 * else. A bare "#fragment" is NOT skipped: it points inside this document, so
 * it is a reference this kit can and should resolve.
 */
const SKIP_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function splitSrcset(value) {
  return value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export function references(html) {
  const tokens = tokenize(html);
  const found = [];
  const push = (value, meta) => {
    const v = String(value).trim();
    if (!v || SKIP_SCHEME.test(v)) return;
    found.push({ value: v, fragmentOnly: v.startsWith('#'), ...meta });
  };

  for (const token of tokens) {
    if (token.type === 'open' || token.type === 'selfclose') {
      const attrs = token.attrs || {};
      const wanted = REFERENCE_ATTRS[token.name];

      if (wanted) {
        for (const attr of wanted) {
          const raw = attrs[attr];
          if (raw == null || raw === '') continue;

          // A <link> only points at a file for the rels that load one.
          if (token.name === 'link') {
            const rel = (attrs.rel || '').toLowerCase();
            if (!/\b(?:stylesheet|icon|shortcut|apple-touch-icon|manifest|preload|prefetch|modulepreload|mask-icon)\b/.test(rel)) {
              continue;
            }
          }

          const values = attr === 'srcset' ? splitSrcset(decodeEntities(raw)) : [decodeEntities(raw)];
          for (const value of values) {
            push(value, {
              tag: token.name,
              attribute: attr,
              offset: token.start,
              required: !(token.name === 'a' || token.name === 'area')
            });
          }
        }
      }

      // Inline background images.
      const style = attrs.style;
      if (style) {
        const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;
        let m;
        while ((m = re.exec(style)) !== null) {
          push(decodeEntities(m[1] ?? m[2] ?? m[3] ?? ''), {
            tag: token.name,
            attribute: 'style',
            offset: token.start,
            required: true
          });
        }
      }
    }

    // url() inside a <style> block.
    if (token.type === 'raw' && token.name === 'style') {
      const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;
      let m;
      while ((m = re.exec(token.text)) !== null) {
        push(m[1] ?? m[2] ?? m[3] ?? '', {
          tag: 'style',
          attribute: 'url()',
          offset: token.start + m.index,
          required: true
        });
      }
    }
  }

  return found;
}

/** Every id= in the document, so in-page links can be checked. */
export function ids(html) {
  const out = new Map();
  for (const token of tokenize(html)) {
    if ((token.type === 'open' || token.type === 'selfclose') && token.attrs?.id) {
      if (!out.has(token.attrs.id)) out.set(token.attrs.id, token.start);
    }
    if ((token.type === 'open' || token.type === 'selfclose') && token.name === 'a' && token.attrs?.name) {
      if (!out.has(token.attrs.name)) out.set(token.attrs.name, token.start);
    }
  }
  return out;
}

/** Character ranges covered by HTML comments, so findings can be marked. */
export function commentRanges(html) {
  return tokenize(html)
    .filter((t) => t.type === 'comment')
    .map((t) => [t.start, t.end]);
}

/** Character ranges covered by <script> and <style> bodies. */
export function rawRanges(html) {
  return tokenize(html)
    .filter((t) => t.type === 'raw')
    .map((t) => [t.start, t.end]);
}

/** Character ranges covered by fenced code blocks in Markdown. */
export function fenceRanges(markdown) {
  const ranges = [];
  const re = /^\s{0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\s{0,3}\1/gm;
  let m;
  while ((m = re.exec(markdown)) !== null) ranges.push([m.index, m.index + m[0].length]);
  // Inline code too: a single-backtick span is a quotation of code, not a claim.
  const inline = /`[^`\n]+`/g;
  while ((m = inline.exec(markdown)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

export function inRanges(offset, ranges) {
  return ranges.some(([a, b]) => offset >= a && offset < b);
}
