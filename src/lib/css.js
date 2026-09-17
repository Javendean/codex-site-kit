/**
 * A light CSS scanner: enough structure to answer two questions honestly.
 *
 *   1. Which files does this stylesheet reference?
 *   2. Is every custom property actually defined in the state the page starts in?
 *
 * Question 2 is the three-state theme bug. A colour whose only definition lives
 * inside `@media (prefers-color-scheme: dark)` does not exist for a visitor
 * whose machine is set to light, which is most of them. The page renders with
 * the property's fallback, or with nothing. It is invisible to anyone
 * developing on a dark-mode Mac, which is why it ships.
 */

/** Replace comments with spaces so every offset stays true to the source. */
export function stripComments(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      for (let k = i; k < stop; k++) out += css[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const quote = css[i];
      out += css[i++];
      while (i < css.length && css[i] !== quote) {
        if (css[i] === '\\') out += css[i++] ?? '';
        out += css[i++] ?? '';
      }
      if (i < css.length) out += css[i++];
      continue;
    }
    out += css[i++];
  }
  return out;
}

/**
 * Walk the stylesheet, reporting each declaration with the selector and the
 * at-rules that enclose it.
 *
 * @returns {{declarations: Array, atRules: Array}}
 */
export function analyse(cssSource) {
  const css = stripComments(cssSource);
  const declarations = [];
  const all = [];
  const blocks = [];
  const stack = [];

  let i = 0;
  let preludeStart = 0;

  const conditions = () =>
    stack.filter((s) => s.type === 'at' && /^@(?:media|supports|container)\b/i.test(s.prelude)).map((s) => s.prelude);

  const selector = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].type === 'rule') return stack[k].prelude;
    }
    return '';
  };

  function readDeclarations(text, base) {
    // `base` is the offset of `text` within the source.
    const parts = splitTop(text, ';');
    let cursor = 0;
    for (const part of parts) {
      const at = base + cursor;
      cursor += part.length + 1;
      const colon = part.indexOf(':');
      if (colon === -1) continue;
      const property = part.slice(0, colon).trim();
      if (!/^[-a-zA-Z]/.test(property)) continue;
      const value = part.slice(colon + 1).trim();
      const record = {
        property: property.startsWith('--') ? property : property.toLowerCase(),
        value,
        offset: at + part.indexOf(property.trim()),
        selector: selector(),
        conditions: conditions(),
        custom: property.startsWith('--')
      };
      all.push(record);
      if (record.custom) declarations.push(record);
    }
  }

  let blockStart = 0;
  while (i < css.length) {
    const ch = css[i];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < css.length && css[i] !== quote) {
        if (css[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }

    if (ch === '{') {
      const prelude = css.slice(preludeStart, i).trim();
      // Whatever sat between the last brace and this one is a declaration run.
      if (stack.length > 0) readDeclarations(css.slice(blockStart, preludeStart), blockStart);
      const frame = {
        type: prelude.startsWith('@') ? 'at' : 'rule',
        prelude,
        start: i,
        preludeStart
      };
      stack.push(frame);
      blocks.push({
        type: frame.type,
        prelude,
        offset: preludeStart,
        enclosing: stack
          .slice(0, -1)
          .filter((s) => s.type === 'at' && /^@(?:media|supports|container)\b/i.test(s.prelude))
          .map((s) => s.prelude)
      });
      i++;
      preludeStart = i;
      blockStart = i;
      continue;
    }

    if (ch === '}') {
      if (stack.length > 0) readDeclarations(css.slice(blockStart, i), blockStart);
      stack.pop();
      i++;
      preludeStart = i;
      blockStart = i;
      continue;
    }

    if (ch === ';' && stack.length === 0) {
      // A top-level at-statement such as @import or @charset.
      i++;
      preludeStart = i;
      blockStart = i;
      continue;
    }

    i++;
  }

  return { declarations, all, blocks, source: css };
}

/**
 * Every declaration in the stylesheet, custom properties and ordinary ones
 * alike, each carrying the selector and the @media/@supports conditions it
 * sits inside. This is the surface most of the rulebook reads.
 */
export function declarations(cssSource) {
  return analyse(cssSource).all;
}

/** Every rule and at-rule prelude, in source order. */
export function blocksOf(cssSource) {
  return analyse(cssSource).blocks;
}

/**
 * The `<style>` blocks inside an HTML document, with their offsets, so a
 * finding in inline CSS still names the right line of the HTML file.
 */
export function inlineStyles(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ css: m[1], offset: m.index + m[0].indexOf(m[1]) });
  }
  return out;
}

/** Every `style="…"` attribute value, with its offset. */
export function inlineStyleAttributes(html) {
  const out = [];
  const re = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const value = m[1] ?? m[2] ?? '';
    out.push({ css: value, offset: m.index + m[0].indexOf(value) });
  }
  return out;
}

/** Split on a separator, ignoring separators inside brackets or strings. */
function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      current += ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        current += text[i];
        i++;
      }
      current += text[i] ?? '';
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Every `var(--name)` use, with its offset and whether it supplied a fallback. */
export function findVarUses(cssSource) {
  const css = stripComments(cssSource);
  const uses = [];
  const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    uses.push({ property: m[1], offset: m.index, hasFallback: Boolean(m[2]) });
  }
  return uses;
}

/** Every file this stylesheet references: url(...) and @import. */
export function findReferences(cssSource) {
  const css = stripComments(cssSource);
  const refs = [];

  const urlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;
  let m;
  while ((m = urlRe.exec(css)) !== null) {
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (value) refs.push({ value, offset: m.index, via: 'url()' });
  }

  const importRe = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')/g;
  while ((m = importRe.exec(css)) !== null) {
    const value = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim();
    if (value) refs.push({ value, offset: m.index, via: '@import' });
  }

  return refs;
}

const ROOT_SELECTOR = /(^|,)\s*(?::root|html|:where\(\s*:root\s*\))\s*(,|$)/;

/** Does this selector set values for the whole document, unconditionally? */
export function isBareRoot(selector) {
  if (!selector) return false;
  return selector
    .split(',')
    .map((s) => s.trim())
    .some((s) => s === ':root' || s === 'html' || s === ':where(:root)' || s === ':root, html');
}

/** Does this selector target the document root at all, conditions aside? */
export function targetsRoot(selector) {
  if (!selector) return false;
  return selector
    .split(',')
    .some((s) => /^\s*(?::root|html)\b/.test(s.trim())) || ROOT_SELECTOR.test(selector);
}

/**
 * The theme contract.
 *
 * @returns {{
 *   tokens: Array<{property, defined_in_bare_root, states: string[], offset:number}>,
 *   conditional_only: Array<object>,
 *   undefined_tokens: Array<object>,
 *   state_gaps: Array<object>,
 *   has_dark_media: boolean,
 *   has_dark_attribute: boolean,
 *   dark_media_guarded: boolean
 * }}
 */
export function themeContract(cssSource) {
  const { declarations } = analyse(cssSource);
  const uses = findVarUses(cssSource);

  const byToken = new Map();
  for (const d of declarations) {
    if (!byToken.has(d.property)) byToken.set(d.property, []);
    byToken.get(d.property).push(d);
  }

  const isDarkMedia = (conds) => conds.some((c) => /prefers-color-scheme\s*:\s*dark/i.test(c));
  const isDarkAttr = (sel) => /\[data-theme\s*[~|^$*]?=\s*["']?dark["']?\]/i.test(sel);
  const isLightGuard = (sel) => /:not\(\s*\[data-theme\s*=\s*["']?light["']?\]\s*\)/i.test(sel);

  const darkMediaDecls = declarations.filter((d) => isDarkMedia(d.conditions) && targetsRoot(d.selector));
  const darkAttrDecls = declarations.filter((d) => isDarkAttr(d.selector));

  const hasDarkMedia = darkMediaDecls.length > 0;
  const hasDarkAttribute = darkAttrDecls.length > 0;
  const darkMediaGuarded = hasDarkMedia && darkMediaDecls.every((d) => isLightGuard(d.selector));

  const tokens = [];
  const conditionalOnly = [];

  for (const [property, decls] of byToken) {
    const rootDecls = decls.filter((d) => targetsRoot(d.selector));
    const bare = decls.filter((d) => isBareRoot(d.selector) && d.conditions.length === 0);
    const states = [];
    if (bare.length) states.push('default');
    if (decls.some((d) => isDarkMedia(d.conditions))) states.push('system-dark');
    if (decls.some((d) => isDarkAttr(d.selector))) states.push('chosen-dark');

    tokens.push({
      property,
      defined_in_bare_root: bare.length > 0,
      states,
      offset: decls[0].offset
    });

    if (rootDecls.length > 0 && bare.length === 0) {
      const first = rootDecls[0];
      conditionalOnly.push({
        property,
        offset: first.offset,
        selector: first.selector,
        conditions: first.conditions,
        states
      });
    }
  }

  const declared = new Set(byToken.keys());
  const seenUse = new Set();
  const undefinedTokens = [];
  for (const use of uses) {
    if (declared.has(use.property)) continue;
    if (seenUse.has(use.property)) continue;
    seenUse.add(use.property);
    undefinedTokens.push(use);
  }

  // If the site offers a manual dark choice, the two dark states must agree.
  const stateGaps = [];
  if (hasDarkMedia && hasDarkAttribute) {
    const inMedia = new Set(darkMediaDecls.map((d) => d.property));
    const inAttr = new Set(darkAttrDecls.map((d) => d.property));
    for (const property of inMedia) {
      if (!inAttr.has(property)) {
        stateGaps.push({
          property,
          missing_from: ':root[data-theme="dark"]',
          consequence: 'a visitor who presses the dark button gets the light value for this one'
        });
      }
    }
    for (const property of inAttr) {
      if (!inMedia.has(property)) {
        stateGaps.push({
          property,
          missing_from: '@media (prefers-color-scheme: dark)',
          consequence: 'a visitor whose machine is set to dark gets the light value for this one'
        });
      }
    }
  }

  return {
    tokens: tokens.sort((a, b) => a.property.localeCompare(b.property)),
    conditional_only: conditionalOnly.sort((a, b) => a.property.localeCompare(b.property)),
    undefined_tokens: undefinedTokens,
    state_gaps: stateGaps.sort((a, b) => a.property.localeCompare(b.property)),
    has_dark_media: hasDarkMedia,
    has_dark_attribute: hasDarkAttribute,
    dark_media_guarded: darkMediaGuarded
  };
}
