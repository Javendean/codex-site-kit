/**
 * The parsed page every detector reads from.
 *
 * Built once per file, reused by every rule. Three views:
 *
 *   - `cssRules`   every style rule as { selector, atRules, decls, origin }. Rules
 *                  from a <style> block and rules synthesised from `style` attributes
 *                  are tagged differently, because an inline `--i: 3` is content and
 *                  must not reach the variety fingerprint.
 *   - `elements`   a flat element list with parent/child links. Enough for "what
 *                  immediately precedes the H1" and "are these siblings structurally
 *                  identical", which is all any rule here asks of the DOM.
 *   - `textBlocks` visible text, in document order, with the element it came from.
 */

import { tokenize, decodeEntities, VOID_ELEMENTS } from './html-scan.js';

const RAW = new Set(['script', 'style', 'textarea', 'title']);

/** Strip comments without eating a `/ *` inside a string or a data: URI. */
export function stripCssComments(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += ch; i++;
      while (i < css.length && css[i] !== q) {
        if (css[i] === '\\') { out += css[i]; i++; }
        out += css[i]; i++;
      }
      out += css[i] ?? ''; i++;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      out += ' ';
      continue;
    }
    out += ch; i++;
  }
  return out;
}

function splitTop(text, sep) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const q = ch; cur += ch; i++;
      while (i < text.length && text[i] !== q) { cur += text[i]; i++; }
      cur += text[i] ?? '';
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseDeclarations(text) {
  const out = [];
  for (const part of splitTop(text, ';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    if (!property || /[{}]/.test(property)) continue;
    const value = part.slice(colon + 1).trim();
    if (!value) continue;
    out.push({ property, value });
  }
  return out;
}

/**
 * Walk a stylesheet into flat rules.
 *
 * Nested at-rules are carried as a list on each rule, so a detector can ask
 * "is this inside prefers-color-scheme: dark" without re-parsing.
 */
export function parseCss(source, origin = 'sheet') {
  const css = stripCssComments(source);
  const rules = [];
  const stack = [];
  let i = 0, preludeStart = 0, blockStart = 0;

  const atRules = () => stack.filter((s) => s.type === 'at').map((s) => s.prelude);
  const selectorOf = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].type === 'rule') return stack[k].prelude;
    return '';
  };

  const flush = (text, offset) => {
    if (!stack.length) return;
    const decls = parseDeclarations(text);
    if (!decls.length) return;
    rules.push({ selector: selectorOf(), atRules: atRules(), decls, offset, origin });
  };

  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < css.length && css[i] !== q) { if (css[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (ch === '{') {
      const prelude = css.slice(preludeStart, i).trim();
      flush(css.slice(blockStart, preludeStart), blockStart);
      stack.push({ type: prelude.startsWith('@') ? 'at' : 'rule', prelude });
      i++; preludeStart = i; blockStart = i;
      continue;
    }
    if (ch === '}') {
      flush(css.slice(blockStart, i), blockStart);
      stack.pop();
      i++; preludeStart = i; blockStart = i;
      continue;
    }
    if (ch === ';' && stack.length === 0) { i++; preludeStart = i; blockStart = i; continue; }
    i++;
  }
  return rules;
}

/** Every `@keyframes` block, name -> raw body. */
export function parseKeyframes(source) {
  const css = stripCssComments(source);
  const out = {};
  const re = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    let depth = 1, i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out[m[1]] = css.slice(re.lastIndex, i - 1);
  }
  return out;
}

/** Build the element tree from the token stream. */
function buildElements(html) {
  const tokens = tokenize(html);
  const elements = [];
  const stack = [];
  let raw = '';

  for (const t of tokens) {
    if (t.type === 'open' || t.type === 'selfclose') {
      const el = {
        index: elements.length,
        tag: t.name,
        attrs: t.attrs || {},
        parent: stack.length ? stack[stack.length - 1] : null,
        children: [],
        text: '',
        own: '',
        start: t.start,
        raw: ''
      };
      if (el.parent) el.parent.children.push(el);
      elements.push(el);
      if (t.type === 'open' && !VOID_ELEMENTS.has(t.name)) stack.push(el);
    } else if (t.type === 'close') {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].tag === t.name) { stack.length = k; break; }
      }
    } else if (t.type === 'text') {
      const txt = decodeEntities(t.text);
      for (const el of stack) el.text += txt;
      if (stack.length) stack[stack.length - 1].own += txt;
    } else if (t.type === 'raw') {
      if (t.name === 'style') raw += '\n' + t.text;
      const owner = stack[stack.length - 1];
      if (owner && RAW.has(t.name)) owner.raw = t.text;
    }
  }
  return { elements, inlineStyleSource: raw };
}

const VISIBLE_SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link']);

export function analysePage(html, meta = {}) {
  const { elements, inlineStyleSource } = buildElements(html);

  // style attributes count as CSS for value-level detectors
  const styleAttrs = elements
    .filter((el) => el.attrs.style)
    .map((el) => `${el.tag}[style]{${el.attrs.style}}`)
    .join('\n');

  const cssSource = inlineStyleSource + '\n' + styleAttrs;
  const cssRules = [
    ...parseCss(inlineStyleSource, 'sheet'),
    ...parseCss(styleAttrs, 'inline')
  ];
  const keyframes = parseKeyframes(cssSource);

  const scripts = elements.filter((el) => el.tag === 'script').map((el) => el.raw).join('\n');

  const textBlocks = elements
    .filter((el) => !VISIBLE_SKIP.has(el.tag))
    .map((el) => ({
      tag: el.tag,
      attrs: el.attrs,
      element: el,
      // own text only: the direct text of this element, not its descendants'
      text: el.own.replace(/\s+/g, ' ').trim(),
      subtree: el.text.replace(/\s+/g, ' ').trim()
    }))
    .filter((b) => b.text.length > 0);

  const visibleText = textBlocks.map((b) => b.text).join('\n');

  return {
    path: meta.path || '(inline)',
    id: meta.id || meta.path || '(inline)',
    html,
    cssSource,
    cssRules,
    keyframes,
    scripts,
    elements,
    textBlocks,
    visibleText,
    declared: meta.declared || {}
  };
}

/** All declarations flattened, with their rule context. */
export function* declarations(page) {
  for (const rule of page.cssRules) {
    for (const d of rule.decls) {
      yield { ...d, selector: rule.selector, atRules: rule.atRules, rule };
    }
  }
}

/** Parse a length, returning px where the unit is convertible. */
export function lengthPx(value, rootPx = 16) {
  const m = /(-?\d*\.?\d+)\s*(px|rem|em|pt)?/.exec(String(value));
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'rem': case 'em': return n * rootPx;
    case 'pt': return (n * 96) / 72;
    case 'px': case undefined: case '': return n;
    default: return null;
  }
}

/** The upper bound of a clamp(), or the value itself if it is not a clamp. */
export function clampMax(value) {
  const m = /clamp\(([^)]*)\)/i.exec(value);
  if (!m) return lengthPx(value);
  const parts = splitTop(m[1], ',');
  return lengthPx(parts[parts.length - 1]);
}

export function clampMin(value) {
  const m = /clamp\(([^)]*)\)/i.exec(value);
  if (!m) return lengthPx(value);
  return lengthPx(splitTop(m[1], ',')[0]);
}

/** Split a comma-separated value list, respecting nested parens. */
export function splitList(value) {
  return splitTop(value, ',').map((s) => s.trim()).filter(Boolean);
}
