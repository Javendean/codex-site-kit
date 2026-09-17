/**
 * The variety fingerprint.
 *
 * Six facets, designed against one measured failure: research/08-craft.md §4
 * hashed the <style> block of thirteen generated pages and got TWO distinct
 * values, and concluded there were two stylesheets. There is one. The only
 * difference between the two groups was three hex values; a diff of two pages
 * from different verticals showed zero structural CSS differences and 115
 * differing lines, all of them copy.
 *
 * So a raw hash is the wrong instrument: it reports variation that is not
 * variation. The primary facet here strips every declaration VALUE out of the
 * CSS and hashes only selectors and property names. Under that hash all thirteen
 * pages collapse to one value, which is the true statement of the problem.
 *
 * The rulebook's design notes live in rules/11-variety-ledger.json; this file is
 * the implementation of what they describe.
 */

import { createHash } from 'node:crypto';
import { declarations, lengthPx, clampMax, splitList } from './page.js';
import { hexLiterals, toOklch, groupPerceptually, isNeutral } from './color-space.js';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const LANDMARKS = new Set(['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form']);

/**
 * FACET 1 — skeleton.
 *
 * Which sections exist, in what order, holding what kinds of thing. Blind to all
 * text, all colour, all size, and (via repeat collapsing) to the number of
 * service cards, which is genuinely per-business data and must not register as
 * variation on its own.
 */
export function skeletonFacet(page) {
  const root = page.elements.find((el) => el.tag === 'body') || null;
  const top = root ? root.children : page.elements.filter((el) => !el.parent);

  const shapeOf = (el, depth) => {
    if (depth <= 0) return '';
    const counts = [];
    for (const c of el.children) {
      const key = c.tag + (classKey(c) ? '.' + classKey(c) : '');
      const last = counts[counts.length - 1];
      if (last && last.key === key) last.n += 1;
      else counts.push({ key, n: 1 });
    }
    // collapse repeat counts into bands: 1, 2, 3-5, 6-9, 10+
    return counts
      .map(({ key, n }) => key + '*' + band(n))
      .join(',');
  };

  const parts = [];
  const walk = (list, depth) => {
    for (const el of list) {
      if (!LANDMARKS.has(el.tag) && depth > 0) { walk(el.children, depth - 1); continue; }
      if (LANDMARKS.has(el.tag)) {
        parts.push(`${el.tag}${classKey(el) ? '.' + classKey(el) : ''}{${shapeOf(el, 2)}}`);
        walk(el.children, 1);
      }
    }
  };
  walk(top, 3);

  return { value: sha(parts.join('|')), detail: parts };
}

function classKey(el) {
  const cls = (el.attrs.class || '').trim().split(/\s+/).filter(Boolean);
  // first class only, and drop state classes that a script toggles
  const first = cls.find((c) => !/^(?:is-|has-|in$|js-)/.test(c));
  return first || (el.attrs.id ? '#' + el.attrs.id : '');
}

const band = (n) => (n <= 2 ? String(n) : n <= 5 ? '3-5' : n <= 9 ? '6-9' : '10+');

/**
 * FACET 2 — style_skeleton, the primary one.
 *
 * The stylesheet with every value deleted. Selectors normalised, property names
 * sorted. At-rule preludes kept, because a media query is structure.
 */
export function styleSkeletonFacet(page) {
  // Inline `style` attributes are excluded on purpose. A per-card `--i: 3` is
  // content (there are more cards on one page than another), and letting it into
  // the fingerprint reports variation that is not variation -- the exact error a
  // raw stylesheet hash makes.
  const lines = page.cssRules.filter((r) => r.origin !== 'inline').map((r) => {
    const sel = normaliseSelector(r.selector);
    const at = r.atRules.map(normaliseAtRule).sort().join('&');
    const props = [...new Set(r.decls.map((d) => d.property))].sort().join(',');
    return `${at}|${sel}|${props}`;
  });
  lines.sort();
  return { value: sha(lines.join('\n')), detail: { rules: lines.length } };
}

const normaliseSelector = (s) =>
  s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim().toLowerCase();

const normaliseAtRule = (s) => s.replace(/\s+/g, '').toLowerCase();

/**
 * FACET 3 — palette, as a vector.
 *
 * Ground, ink and accent are read from custom properties where the page declares
 * them, and inferred from frequency where it does not.
 */
export function paletteFacet(page) {
  const hexes = hexLiterals(page.cssSource).map((h) => h.hex);
  const groups = groupPerceptually(hexes, 0.04);

  const byToken = {};
  for (const d of declarations(page)) {
    if (!d.property.startsWith('--')) continue;
    const hit = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(d.value);
    if (!hit) continue;
    // first definition wins: the bare :root light palette, not a dark override
    if (byToken[d.property] === undefined && !d.atRules.some((a) => /prefers-color-scheme/.test(a))) {
      byToken[d.property] = normaliseHex(hit[0]);
    }
  }

  const pick = (re) => {
    const key = Object.keys(byToken).find((k) => re.test(k));
    return key ? byToken[key] : null;
  };

  const lights = groups.map((g) => ({ g, o: toOklch(g.representative) }));
  const ground = pick(/^--(?:bg|paper|ground|surface|background)$/) ||
    (lights.filter((x) => x.o.L > 0.85).sort((a, b) => b.g.count - a.g.count)[0]?.g.representative ?? null);
  const ink = pick(/^--(?:fg|ink|text|foreground)$/) ||
    (lights.filter((x) => x.o.L < 0.4).sort((a, b) => b.g.count - a.g.count)[0]?.g.representative ?? null);
  const accent = pick(/^--(?:accent|brand|primary)$/) ||
    (lights.filter((x) => x.o.C > 0.08).sort((a, b) => b.g.count - a.g.count)[0]?.g.representative ?? null);
  const neutral = Object.entries(byToken)
    .filter(([k, v]) => /^--(?:fg-?2|muted|grey|gray|line|border|subtle)/.test(k) && isNeutral(v, 0.06))
    .map(([, v]) => v)[0] || null;

  const o = (hex) => (hex ? toOklch(hex) : { L: 0, C: 0, h: 0 });

  return {
    value: {
      groundL: round(o(ground).L), groundH: round(o(ground).h, 1), groundC: round(o(ground).C),
      inkL: round(o(ink).L), inkH: round(o(ink).h, 1),
      accentH: round(o(accent).h, 1), accentC: round(o(accent).C), accentL: round(o(accent).L),
      neutralH: round(o(neutral).h, 1), neutralC: round(o(neutral).C),
      groups: groups.filter((g) => g.count >= 3).length
    },
    detail: { ground, ink, accent, neutral, distinctHexes: new Set(hexes).size, groupCount: groups.length, groups }
  };
}

const normaliseHex = (h) => {
  let x = h.toLowerCase().replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return '#' + x;
};
const round = (n, p = 4) => Number.isFinite(n) ? Number(n.toFixed(p)) : 0;

/** FACET 4 — type, as a vector. */
export function typeFacet(page) {
  const families = new Set();
  let displayWeight = 0, displaySizeRem = 0, displayTrack = 0, bodySize = 0;

  for (const d of declarations(page)) {
    if (d.property === 'font-family') {
      const first = splitList(d.value)[0];
      if (first) families.add(first.replace(/["']/g, '').trim().toLowerCase());
    }
    if (d.property === 'font-weight' && isDisplaySelector(d.selector)) {
      const n = parseFloat(d.value);
      if (Number.isFinite(n)) displayWeight = Math.max(displayWeight, n);
    }
    if (d.property === 'font-size') {
      const px = clampMax(d.value);
      if (isDisplaySelector(d.selector) && px) displaySizeRem = Math.max(displaySizeRem, px / 16);
      if (/^(?:body|html)\b/.test(d.selector.trim()) && px) bodySize = px;
    }
    if (d.property === 'letter-spacing' && isDisplaySelector(d.selector)) {
      const m = /(-?\d*\.?\d+)\s*em/.exec(d.value);
      if (m) displayTrack = Math.min(displayTrack, parseFloat(m[1]));
    }
  }

  const primary = [...families][0] || '';
  return {
    value: {
      primary: sha(primary).slice(0, 8),
      familyCount: families.size,
      displayWeight,
      displaySizeRem: round(displaySizeRem, 2),
      displayTrack: round(displayTrack, 4),
      bodySize: round(bodySize, 1)
    },
    detail: { families: [...families] }
  };
}

const isDisplaySelector = (s) => /(^|[\s,>])(h1|h2)\b|\.hero|\.display|\.title/i.test(s);

/**
 * FACET 5 — geometry.
 *
 * research/08a §3 axis G: radius, shadow and border weight AS A TRIPLE is what
 * makes two pages read as different studios. Individually each carries almost
 * nothing, which is why this is one facet and not three.
 */
export function geometryFacet(page) {
  const radii = [];
  let shadowLayers = 0, shadowPeakAlpha = 0, borderWidth = 0, maxColumns = 0;

  for (const d of declarations(page)) {
    if (d.property === 'border-radius') {
      const px = lengthPx(d.value.split(/\s+/)[0]);
      if (px) radii.push(px);
    }
    if (d.property === 'box-shadow' && d.value !== 'none') {
      const layers = parseShadow(d.value).filter((l) => !l.inset);
      shadowLayers = Math.max(shadowLayers, layers.length);
      for (const l of layers) shadowPeakAlpha = Math.max(shadowPeakAlpha, l.alpha ?? 0);
    }
    if (/^border(?:-(?:top|right|bottom|left))?$/.test(d.property)) {
      const px = lengthPx(d.value.split(/\s+/)[0]);
      if (px) borderWidth = Math.max(borderWidth, px);
    }
    if (d.property === 'grid-template-columns') {
      const rep = /repeat\(\s*(\d+)/.exec(d.value);
      const n = rep ? parseInt(rep[1], 10) : splitList(d.value.replace(/\s+/g, ',')).length;
      if (Number.isFinite(n)) maxColumns = Math.max(maxColumns, n);
    }
  }

  radii.sort((a, b) => a - b);
  const dominantRadius = radii.length ? radii[Math.floor(radii.length / 2)] : 0;

  return {
    value: {
      radius: round(dominantRadius, 1),
      shadowLayers,
      shadowPeakAlpha: round(shadowPeakAlpha, 3),
      borderWidth: round(borderWidth, 1),
      maxColumns
    },
    detail: { radii }
  };
}

/** Remove every `name(...)` call, respecting nested parentheses. */
export function stripFunctions(value) {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') {
      let depth = 1;
      i++;
      while (i < value.length && depth > 0) {
        if (value[i] === '(') depth++;
        else if (value[i] === ')') depth--;
        i++;
      }
      i--;
      // drop the identifier that preceded the parenthesis too
      out = out.replace(/[\w-]+$/, ' ');
      out += ' ';
      continue;
    }
    out += value[i];
  }
  return out;
}

/** Split a box-shadow value into layers with offsets, blur and alpha. */
export function parseShadow(value) {
  return splitList(value).map((layer) => {
    const inset = /\binset\b/.test(layer);
    // Strip colour functions and hex first: `rgba(0,0,0,.05)` is full of numbers that
    // are not lengths, and a bare leading `0` IS a length. Getting this wrong makes a
    // normal `0 1px 2px rgba(...)` parse as an offset shadow with no blur.
    const bare = stripFunctions(layer).replace(/#[0-9a-f]{3,8}/gi, ' ');
    const lengths = (bare.match(/-?\d*\.?\d+(?:px|rem|em)?/g) || [])
      .map((v) => lengthPx(v))
      .filter((n) => n !== null);
    const [ox = 0, oy = 0, blur = 0, spread = 0] = lengths;
    let alpha = 1;
    const rgba = /rgba?\(([^)]*)\)/i.exec(layer);
    const hsla = /hsla?\(([^)]*)\)/i.exec(layer);
    const hex8 = /#([0-9a-f]{8})\b/i.exec(layer);
    if (rgba) {
      const parts = rgba[1].split(/[,/]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 4) alpha = parseFloat(parts[3]);
    } else if (hsla) {
      const parts = hsla[1].split(/[,/]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 4) alpha = parseFloat(parts[3]);
    } else if (hex8) {
      alpha = parseInt(hex8[1].slice(6), 16) / 255;
    }
    const color = (rgba || hsla || /var\([^)]*\)/.exec(layer) || /#[0-9a-f]{3,8}\b/i.exec(layer) || [null])[0];
    return { raw: layer, inset, ox, oy, blur, spread, alpha, color };
  });
}

/** FACET 6 — boilerplate, with proper nouns masked. */
export function boilerplateFacet(page) {
  const blocks = page.textBlocks
    .filter((b) => /concept|disclaim|not affiliated|copyright|all rights|takedown|privacy|terms/i.test(b.subtree))
    .map((b) => maskProperNouns(b.subtree));
  return { value: sha(blocks.sort().join('\n')), detail: { blocks: blocks.length } };
}

const maskProperNouns = (s) =>
  s
    .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z.']+)*\b/g, 'X')
    .replace(/\b\d[\d\s().+-]{6,}\b/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** All six, plus whatever the project declared about itself. */
export function fingerprint(page) {
  return {
    id: page.id,
    facets: {
      skeleton: skeletonFacet(page).value,
      style_skeleton: styleSkeletonFacet(page).value,
      boilerplate: boilerplateFacet(page).value
    },
    vectors: {
      palette: paletteFacet(page).value,
      type: typeFacet(page).value,
      geometry: geometryFacet(page).value
    },
    declared: page.declared || {}
  };
}

const VECTOR_SCALES = {
  palette: { groundL: 1, groundH: 180, groundC: 0.1, inkL: 1, inkH: 180, accentH: 180, accentC: 0.3, accentL: 1, neutralH: 180, neutralC: 0.1, groups: 8 },
  type: { primary: null, familyCount: 4, displayWeight: 500, displaySizeRem: 4, displayTrack: 0.05, bodySize: 10 },
  geometry: { radius: 32, shadowLayers: 4, shadowPeakAlpha: 1, borderWidth: 6, maxColumns: 12 }
};

/** Normalised distance between two vector facets, 0..1. */
export function vectorDistance(name, a, b) {
  const scales = VECTOR_SCALES[name];
  if (!scales || !a || !b) return 1;
  let sum = 0, n = 0;
  for (const [key, scale] of Object.entries(scales)) {
    if (scale === null) { // hashed field: equality only
      sum += a[key] === b[key] ? 0 : 1;
      n += 1;
      continue;
    }
    const da = Number(a[key] ?? 0), db = Number(b[key] ?? 0);
    let diff = Math.abs(da - db);
    if (/H$/.test(key)) diff = Math.min(diff, 360 - diff); // hue is circular
    sum += Math.min(1, diff / scale) ** 2;
    n += 1;
  }
  return n ? Math.sqrt(sum / n) : 1;
}

export const DEFAULT_WEIGHTS = { skeleton: 0.35, style_skeleton: 0.35, palette: 0.1, type: 0.1, geometry: 0.1 };

/** Weighted distance between two fingerprints, 0..1. Lower means more alike. */
export function fingerprintDistance(a, b, weights = DEFAULT_WEIGHTS) {
  const parts = {
    skeleton: a.facets.skeleton === b.facets.skeleton ? 0 : 1,
    style_skeleton: a.facets.style_skeleton === b.facets.style_skeleton ? 0 : 1,
    palette: vectorDistance('palette', a.vectors.palette, b.vectors.palette),
    type: vectorDistance('type', a.vectors.type, b.vectors.type),
    geometry: vectorDistance('geometry', a.vectors.geometry, b.vectors.geometry)
  };
  let total = 0, w = 0;
  for (const [k, weight] of Object.entries(weights)) {
    total += (parts[k] ?? 1) * weight;
    w += weight;
  }
  return { distance: w ? total / w : 1, parts };
}
