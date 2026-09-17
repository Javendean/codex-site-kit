/**
 * Shared machinery for the rulebook.
 *
 * Nothing in here decides anything. It answers questions the rules ask:
 * "how many colour stops does this gradient have", "is this element a card",
 * "what is the visible copy on this page, with the offsets kept".
 */

import { childElements, textOf, INVISIBLE, HEADINGS } from '../lib/dom.js';
import { parseColor } from '../lib/oklch.js';

/** Declarations matching a property name (string or regex). */
export function decls(ctx, property) {
  const test = property instanceof RegExp ? (p) => property.test(p) : (p) => p === property;
  return ctx.decls.filter((d) => test(d.property));
}

/** Declarations whose value matches a pattern, whatever the property. */
export function declsWithValue(ctx, pattern) {
  return ctx.decls.filter((d) => pattern.test(d.value));
}

/** Split a comma-separated CSS value list, respecting nested parentheses. */
export function splitList(value) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Every gradient function call in a value, with its own argument list. */
export function gradients(value) {
  const out = [];
  const re = /(repeating-)?(linear|radial|conic)-gradient\s*\(/gi;
  let m;
  while ((m = re.exec(value)) !== null) {
    const open = re.lastIndex - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const args = value.slice(open + 1, end);
    out.push({ kind: `${m[1] ?? ''}${m[2]}-gradient`, args, offset: m.index, stops: colorStops(args) });
  }
  return out;
}

/**
 * The colour stops of a gradient argument list.
 *
 * The first argument may be an angle or a shape keyword rather than a stop, so
 * a stop is counted only when it actually contains a colour.
 */
export function colorStops(args) {
  return splitList(args)
    .map((part) => {
      const token = part.trim().split(/\s+/)[0];
      const colour = parseColor(token) || parseColor(part.trim());
      return colour ? { text: part.trim(), colour } : null;
    })
    .filter(Boolean);
}

/** Class-name substrings that mean "this is a content card". */
export const CARDY = ['card', 'tile', 'feature', 'panel', 'box', 'item', 'callout', 'alert', 'note', 'benefit', 'service'];

/** Class-name substrings that mean "this is the hero". */
export const HEROISH = ['hero', 'masthead', 'jumbotron', 'banner', 'splash', 'intro'];

/** True when a selector looks like it targets a card-ish thing. */
export function selectorLooksCardy(selector) {
  const s = (selector || '').toLowerCase();
  return CARDY.some((c) => s.includes(c));
}

/** Parse a CSS length into pixels where that is unambiguous; null otherwise. */
export function px(value) {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(String(value).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || 'px';
  if (unit === 'px') return n;
  return n * 16; // the browser default, and the only honest assumption available statically
}

/** Milliseconds from a CSS time token; null when it is not a time. */
export function ms(value) {
  const m = /^(-?[\d.]+)(ms|s)$/.exec(String(value).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] === 's' ? n * 1000 : n;
}

/**
 * Every shadow layer in a box-shadow value.
 * @returns {Array<{text, inset, blur, alpha, colour}>}
 */
export function shadowLayers(value) {
  if (/^\s*none\s*$/i.test(value)) return [];
  return splitList(value).map((layer) => {
    const inset = /\binset\b/i.test(layer);
    const colour = (layer.match(/(?:rgba?|hsla?|oklch)\([^)]*\)|#[0-9a-fA-F]{3,8}\b/) || [])[0] || null;
    const parsed = colour ? parseColor(colour) : null;
    const withoutColour = colour ? layer.replace(colour, ' ') : layer;
    const lengths = (withoutColour.match(/-?[\d.]+(?:px|rem|em)/g) || []).map(px);
    // offset-x, offset-y, blur, spread
    const blur = lengths.length >= 3 ? lengths[2] : 0;
    return {
      text: layer.trim(),
      inset,
      blur: blur ?? 0,
      alpha: parsed ? (parsed.a ?? 1) : 1,
      colour: parsed
    };
  });
}

/** Visible copy of a page, as blocks with offsets, script/style excluded. */
export function copyBlocks(page) {
  if (!page.tree) return markdownCopyBlocks(page);
  const out = [];
  const seen = new Set();

  for (const node of page.tree.all) {
    if (INVISIBLE.has(node.tag)) continue;
    const kids = childElements(node);
    // Only take a node's text when it is the innermost holder of that text.
    const hasBlockChild = kids.some((k) => !INLINE.has(k.tag));
    if (hasBlockChild) continue;
    const text = textOf(node);
    if (!text) continue;
    const key = `${node.start}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      offset: node.contentStart ?? node.start,
      tag: node.tag,
      node,
      isHeading: HEADINGS.has(node.tag)
    });
  }
  return out;
}

const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em',
  'i', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'img', 'svg', 'picture', 'source'
]);
export { INLINE };

/**
 * Markdown fallback: paragraphs, with fenced code skipped.
 *
 * Consecutive non-blank lines are ONE block. Treating each wrapped line as its
 * own block turns a hard-wrapped document into a hundred short strings, and
 * every rule that deliberately spares long prose — the em-dash one above all —
 * then fires on each line of it. That is not a tuning detail; it is the
 * difference between a rule that means what it says and one that punishes
 * text wrapping.
 */
export function markdownCopyBlocks(doc) {
  const out = [];
  const text = doc.text;
  let offset = 0;
  let inFence = false;
  let buffer = null;

  const clean = (s) => s.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '').replace(/[*_`]/g, '').trim();

  const flush = () => {
    if (!buffer) return;
    const joined = clean(buffer.lines.join(' '));
    if (joined) {
      out.push({
        text: joined,
        offset: buffer.offset,
        tag: buffer.heading ? 'h' : 'p',
        node: null,
        isHeading: buffer.heading
      });
    }
    buffer = null;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (/^(```|~~~)/.test(trimmed)) {
      flush();
      inFence = !inFence;
      offset += line.length + 1;
      continue;
    }
    if (inFence || !trimmed) {
      flush();
      offset += line.length + 1;
      continue;
    }

    const heading = /^#{1,6}\s/.test(trimmed);
    // A heading, a table row, a quote or a list item stands on its own.
    const standalone = heading || /^[|>]/.test(trimmed) || /^([-*+]\s|\d+\.\s)/.test(trimmed);
    if (standalone) {
      flush();
      buffer = { lines: [trimmed], offset, heading };
      flush();
      offset += line.length + 1;
      continue;
    }

    if (!buffer) buffer = { lines: [], offset, heading: false };
    buffer.lines.push(trimmed);
    offset += line.length + 1;
  }

  flush();
  return out;
}

/** Offset of `needle` inside a page's raw text, starting from `from`; -1 when absent. */
export function offsetOf(page, needle, from = 0) {
  return page.text.indexOf(needle, from);
}

/** A one-line quotation of a value, truncated so a report stays readable. */
export function quote(value, max = 80) {
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** True when a CSS condition list contains a prefers-reduced-motion guard. */
export function hasReducedMotionGuard(conditions) {
  return (conditions || []).some((c) => /prefers-reduced-motion/i.test(c));
}

/** True when a CSS condition list contains a hover-capability guard. */
export function hasHoverGuard(conditions) {
  return (conditions || []).some((c) => /hover\s*:\s*hover/i.test(c));
}

/** All `<img>` elements across every page. */
export function images(ctx) {
  const out = [];
  for (const page of ctx.pages) {
    for (const node of page.tree.all) {
      if (node.tag === 'img' || node.tag === 'source') out.push({ page, node });
    }
  }
  return out;
}

/** Deduplicate findings by file+line+what, keeping the first. */
export function dedupe(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.rel}|${f.offset}|${f.what}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
