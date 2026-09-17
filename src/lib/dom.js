/**
 * A small element tree over the token stream in `html.js`.
 *
 * Most of the rules in this kit are statements about RELATIONSHIPS, not about
 * lines. "The element immediately before the H1" is a sibling relationship.
 * "Three identical cards" is a statement about a parent's children. "A colored
 * left border on a card" needs to know the element carries a card-ish class.
 * None of those can be written honestly as a regular expression over markup,
 * which is exactly why generators keep shipping them.
 *
 * This is not a spec-compliant parser and does not try to be. It is a forgiving
 * tree with the implicit-close rules that matter in hand-written HTML, and it
 * keeps byte offsets so every finding can name a line.
 */

import { tokenize, decodeEntities, VOID_ELEMENTS } from './html.js';

/** Elements that close a previous sibling of the same kind automatically. */
const IMPLICIT_CLOSE = {
  p: new Set([
    'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset',
    'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
    'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'
  ]),
  li: new Set(['li']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  option: new Set(['option', 'optgroup']),
  tr: new Set(['tr']),
  td: new Set(['td', 'th', 'tr']),
  th: new Set(['td', 'th', 'tr']),
  thead: new Set(['tbody', 'tfoot']),
  tbody: new Set(['tbody', 'tfoot'])
};

/** Elements that never hold visible copy. */
export const INVISIBLE = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template']);

/** Elements a visitor can press. */
export const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'label']);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
export { HEADINGS };

function splitClasses(value) {
  if (!value) return [];
  return String(value).split(/\s+/).filter(Boolean);
}

/**
 * Parse HTML into a tree.
 *
 * @param {string} html
 * @returns {{root: object, all: object[], text: string}}
 */
export function parse(html) {
  const tokens = tokenize(html);
  const root = makeNode('#root', {}, 0, html.length);
  root.depth = -1;
  const all = [];
  const stack = [root];
  let order = 0;

  const top = () => stack[stack.length - 1];

  function makeNode(tag, attrs, start, end) {
    return {
      tag,
      attrs: attrs || {},
      classes: splitClasses((attrs || {}).class),
      id: (attrs || {}).id || null,
      children: [],
      parent: null,
      start,
      end,
      contentStart: end,
      contentEnd: end,
      depth: 0,
      order: 0,
      raw: null
    };
  }

  /**
   * Close back to the nearest matching open tag.
   *
   * Everything above it on the stack was left unclosed by the author, so it is
   * closed implicitly at the same point. The stack is truncated to k, which
   * removes that element and everything inside it; the element itself is
   * returned so the caller can record where its content ended.
   */
  function closeTo(name) {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].tag !== name) continue;
      const node = stack[k];
      for (let j = stack.length - 1; j > k; j--) {
        stack[j].contentEnd = stack[j].contentEnd || node.contentEnd;
      }
      stack.length = k;
      return node;
    }
    return null;
  }

  for (const token of tokens) {
    if (token.type === 'text') {
      top().children.push({ tag: '#text', text: token.text, start: token.start, end: token.end, parent: top() });
      continue;
    }
    if (token.type === 'comment') {
      top().children.push({ tag: '#comment', text: token.text, start: token.start, end: token.end, parent: top() });
      continue;
    }
    if (token.type === 'raw') {
      const holder = top();
      holder.raw = token.text;
      holder.contentStart = token.start;
      holder.contentEnd = token.end;
      continue;
    }
    if (token.type === 'doctype') continue;

    if (token.type === 'open' || token.type === 'selfclose') {
      const name = token.name;
      const implicit = IMPLICIT_CLOSE[top().tag];
      if (implicit && implicit.has(name)) stack.pop();

      const node = makeNode(name, token.attrs, token.start, token.end);
      node.parent = top();
      node.depth = stack.length - 1;
      node.order = order++;
      top().children.push(node);
      all.push(node);

      if (token.type === 'open' && !VOID_ELEMENTS.has(name)) {
        node.contentStart = token.end;
        node.contentEnd = token.end;
        stack.push(node);
      }
      continue;
    }

    if (token.type === 'close') {
      const closed = closeTo(token.name);
      if (closed) {
        closed.contentEnd = token.start;
        closed.end = token.end;
      }
      continue;
    }
  }

  // Anything left open runs to the end of the document.
  while (stack.length > 1) {
    const node = stack.pop();
    node.contentEnd = html.length;
    node.end = html.length;
  }

  return { root, all, text: html };
}

/** Every element in document order, root excluded. */
export function elements(tree) {
  return tree.all;
}

/** The element children of a node, text and comments dropped. */
export function childElements(node) {
  return node.children.filter((c) => c.tag !== '#text' && c.tag !== '#comment');
}

/** Visible text of a subtree: script, style and comments excluded, whitespace collapsed. */
export function textOf(node) {
  const parts = [];
  (function walk(n) {
    for (const child of n.children || []) {
      if (child.tag === '#text') {
        parts.push(child.text);
        continue;
      }
      if (child.tag === '#comment') continue;
      if (INVISIBLE.has(child.tag)) continue;
      parts.push(' ');
      walk(child);
      parts.push(' ');
    }
  })(node);
  return decodeEntities(parts.join('')).replace(/\s+/g, ' ').trim();
}

/** The element immediately before this one among its parent's element children. */
export function previousElement(node) {
  if (!node.parent) return null;
  const sibs = childElements(node.parent);
  const i = sibs.indexOf(node);
  return i > 0 ? sibs[i - 1] : null;
}

/** Walk up, collecting ancestors nearest-first. */
export function ancestors(node) {
  const out = [];
  let cur = node.parent;
  while (cur && cur.tag !== '#root') {
    out.push(cur);
    cur = cur.parent;
  }
  return out;
}

/** True when any ancestor (or the node) matches. */
export function withinTag(node, names) {
  const set = names instanceof Set ? names : new Set(names);
  if (set.has(node.tag)) return true;
  return ancestors(node).some((a) => set.has(a.tag));
}

/** Find the first element matching a predicate, in document order. */
export function find(tree, predicate) {
  return tree.all.find(predicate) || null;
}

/** Find every element matching a predicate, in document order. */
export function findAll(tree, predicate) {
  return tree.all.filter(predicate);
}

/** Does this element carry any of these class names (substring match on each class)? */
export function classMatches(node, patterns) {
  const haystack = [...node.classes, node.id || ''].join(' ').toLowerCase();
  return patterns.some((p) => haystack.includes(p));
}

/**
 * A structural signature for an element: what it is made of, ignoring its words.
 *
 * Two cards with the same signature are the same card with different copy —
 * which is the actual tell. Uniformity, not the number three.
 */
export function signature(node, depth = 3) {
  if (depth <= 0) return node.tag;
  const kids = childElements(node)
    .map((c) => signature(c, depth - 1))
    .join(',');
  const shape = classShape(node);
  return kids ? `${node.tag}${shape}(${kids})` : `${node.tag}${shape}`;
}

/** Class list, normalised: order-independent, numbers stripped so `card-1`/`card-2` match. */
export function classShape(node) {
  if (!node.classes.length) return '';
  const norm = node.classes
    .map((c) => c.toLowerCase().replace(/[-_]?\d+$/, ''))
    .sort();
  return '.' + [...new Set(norm)].join('.');
}

/** The primary H1: the first one in the document. */
export function primaryHeading(tree) {
  return find(tree, (n) => n.tag === 'h1');
}

/** Serialise an element's opening tag, for quoting in a finding. */
export function openTag(node, source) {
  const raw = source.slice(node.start, Math.min(node.contentStart || node.end, node.end));
  return raw.length > 160 ? raw.slice(0, 157) + '…' : raw;
}
