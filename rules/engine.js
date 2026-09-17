/**
 * The reference detector engine.
 *
 * The rulebook is data: rules/*.json. This file is the evaluator that makes the
 * data executable, so that "detector" on a rule is a claim that can be run rather
 * than a description of a claim.
 *
 * Two kinds never run automatically and say so rather than guessing:
 *   `browser` needs a live render (page width, painted pixels, Core Web Vitals);
 *   `manual`  needs a human or a vision model (is this your photograph? is this
 *             sentence true?).
 * Both return `not_run` with a reason. A checker that quietly passes what it
 * cannot test is worse than one that admits the gap.
 *
 * Expiry is enforced here, not documented and ignored: a trap-tier rule past its
 * review_by is downgraded to `info` and carries a note; one past review_by plus
 * 180 days is suspended and not evaluated at all.
 */

import { declarations, lengthPx, clampMax, splitList } from './page.js';
import { hexLiterals, toOklch, hueDistance, groupPerceptually, isNeutral, oklabDistance } from './color-space.js';
import { parseShadow, fingerprint, fingerprintDistance, DEFAULT_WEIGHTS } from './fingerprint.js';
import { readLedger, comparisonSet, paletteDistribution, DEFAULT_WINDOW } from './ledger.js';
import { parseHex, contrastRatio, roundRatio } from './html-scan.js';

const DAY = 86400000;
export const DOUBLE_EXPIRY_DAYS = 180;

/** fail > warn > info, for ordering a report. */
export const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2 };

/**
 * Apply the expiry policy. Returns the severity to actually use plus any note.
 * A rulebook that says it will rot has to act like it.
 */
export function applyExpiry(rule, now = new Date()) {
  if (!rule.review_by) return { severity: rule.severity, suspended: false, note: null };
  const due = new Date(rule.review_by + 'T00:00:00Z');
  if (now <= due) return { severity: rule.severity, suspended: false, note: null };

  const overdueDays = Math.floor((now - due) / DAY);
  if (overdueDays > DOUBLE_EXPIRY_DAYS) {
    return {
      severity: 'info',
      suspended: true,
      note: `SUSPENDED. This rule was due for review on ${rule.review_by}, ${overdueDays} days ago, and nobody has re-checked it. A taste rule two review cycles stale is worse than no rule, so it is not being evaluated. Re-validate it against fresh evidence or retire it.`
    };
  }
  return {
    severity: 'info',
    suspended: false,
    note: `PAST REVIEW. This rule was due for review on ${rule.review_by}, ${overdueDays} days ago. It was true when it was written; nobody has checked whether it still is. Weigh it accordingly.`
  };
}

const hit = (evidence, where) => ({ evidence, where: where ?? null });
const fired = (hits) => ({ status: hits.length ? 'fire' : 'pass', hits });
const notRun = (reason) => ({ status: 'not_run', hits: [], reason });

const rx = (pattern, flags = '') => {
  try { return new RegExp(pattern, flags); } catch { return null; }
};

// ---------------------------------------------------------------- CSS kinds

function cssDecl(det, page) {
  const propRe = det.property ? rx(det.property, 'i') : null;
  const valRe = det.value ? rx(det.value, 'i') : null;
  const selRe = det.selector ? rx(det.selector, 'i') : null;
  const selHintRe = det.selector_hint ? rx(det.selector_hint, 'i') : null;
  const exSelRe = det.excludeSelector || det.exclude_selector ? rx(det.excludeSelector || det.exclude_selector, 'i') : null;
  const notAtRe = det.notInAtRule ? rx(det.notInAtRule, 'i') : null;
  const inAtRe = det.inAtRule ? rx(det.inAtRule, 'i') : null;
  const exValRe = det.exclude_value ? rx(det.exclude_value, 'i') : null;

  const hits = [];
  for (const d of declarations(page)) {
    if (propRe && !propRe.test(d.property)) continue;
    if (valRe && !valRe.test(d.value)) continue;
    if (exValRe && exValRe.test(d.value)) continue;
    if (selRe && !selRe.test(d.selector)) continue;
    if (selHintRe && !selHintRe.test(d.selector)) continue;
    if (exSelRe && exSelRe.test(d.selector)) continue;
    if (notAtRe && d.atRules.some((a) => notAtRe.test(a))) continue;
    if (inAtRe && !d.atRules.some((a) => inAtRe.test(a))) continue;
    if (det.exclude_values && det.exclude_values.some((v) => d.value.trim() === v)) continue;
    // A `transform: none` inside a reduced-motion block is the fix, not the defect.
    if (det.ignore_resets && /^(?:none|initial|unset|revert)$/i.test(d.value.trim())) continue;
    if (det.ignore_reduced_motion && d.atRules.some((a) => /prefers-reduced-motion/i.test(a))) continue;

    if (det.value_numeric) {
      const n = numericOf(d.value, det.value_numeric);
      if (n === null) continue;
      const { min, max } = det.value_numeric;
      if (min !== undefined && !(n >= min)) continue;
      if (max !== undefined && !(n <= max)) continue;
    }
    if (det.require_colored && !isColoredBorder(d.value, page)) continue;

    hits.push(hit(`${d.selector} { ${d.property}: ${d.value} }`));
  }
  return fired(dedupe(hits));
}

function numericOf(value, spec) {
  if (spec.function) {
    const fn = rx(`${spec.function}\\(\\s*(-?\\d*\\.?\\d+)\\s*(px|rem|em|%)?`, 'i');
    const m = fn && fn.exec(value);
    return m ? lengthPx(m[1] + (m[2] || 'px')) : null;
  }
  if (spec.unit === 'ms') {
    const m = /(-?\d*\.?\d+)\s*(ms|s)\b/.exec(value);
    if (!m) return null;
    return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  }
  if (spec.unit === 'em') {
    const m = /(-?\d*\.?\d+)\s*em\b/.exec(value);
    return m ? parseFloat(m[1]) : null;
  }
  if (spec.unit === 'rem') {
    const px = spec.clamp_bound === 'max' ? clampMax(value) : lengthPx(value);
    return px === null ? null : px / 16;
  }
  if (spec.unit === 'px') {
    const px = spec.clamp_bound === 'max' ? clampMax(value) : lengthPx(value);
    return px;
  }
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function isColoredBorder(value, page) {
  const hexes = hexLiterals(value);
  if (hexes.length) return !isNeutral(hexes[0].hex, 0.03);
  const v = /var\(\s*(--[\w-]+)/.exec(value);
  if (v) {
    const token = resolveToken(page, v[1]);
    return token ? !isNeutral(token, 0.03) : true;
  }
  return /rgb|hsl|currentcolor/i.test(value) ? true : false;
}

function resolveToken(page, name) {
  for (const d of declarations(page)) {
    if (d.property !== name) continue;
    if (d.atRules.some((a) => /prefers-color-scheme/.test(a))) continue;
    const m = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(d.value);
    if (m) {
      let h = m[1].toLowerCase();
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return '#' + h;
    }
  }
  return null;
}

function cssRegex(det, page) {
  const re = rx(det.pattern, det.flags?.includes('g') ? det.flags : (det.flags || '') + 'g');
  if (!re) return notRun('bad pattern');
  const hits = [];
  let m;
  while ((m = re.exec(page.cssSource)) !== null) {
    hits.push(hit(m[0].slice(0, 120)));
    if (!re.global) break;
  }
  if (det.min_count && hits.length < det.min_count) return fired([]);
  return fired(hits);
}

function cssAbsent(det, page) {
  const propRe = det.property ? rx(det.property, 'i') : null;
  const valRe = det.value ? rx(det.value, 'i') : null;
  const selRe = det.selector ? rx(det.selector, 'i') : null;
  const selHintRe = det.selector_hint ? rx(det.selector_hint, 'i') : null;
  const atRe = det.at_rule ? rx(det.at_rule, 'i') : null;
  const reqAtRe = det.require_at_rule ? rx(det.require_at_rule, 'i') : null;

  // "the whole stylesheet has no rule with this selector"
  if (det.selector && !det.property) {
    const found = page.cssRules.some((r) => selRe.test(r.selector));
    return fired(found ? [] : [hit(`no rule matching /${det.selector}/`)]);
  }
  // "no at-rule of this shape exists"
  if (atRe && !det.property) {
    const found = page.cssRules.some((r) => r.atRules.some((a) => atRe.test(a)));
    return fired(found ? [] : [hit(`no @rule matching /${det.at_rule}/`)]);
  }
  // theme contract is its own shape
  if (det.mode === 'theme_contract') return themeContract(page);

  // per-selector requirement: overflow-x on BOTH html and body
  if (det.require_all_selectors) {
    const missing = [];
    const wrongRe = det.wrong_value_pattern ? rx(det.wrong_value_pattern, 'i') : null;
    for (const want of det.require_all_selectors) {
      const ok = page.cssRules.some((r) =>
        r.selector.split(',').some((s) => s.trim() === want) &&
        r.decls.some((d) => propRe.test(d.property) && (!valRe || valRe.test(d.value))));
      if (!ok) {
        const wrong = wrongRe && page.cssRules.some((r) =>
          r.selector.split(',').some((s) => s.trim() === want) &&
          r.decls.some((d) => propRe.test(d.property) && wrongRe.test(d.value)));
        missing.push(hit(wrong
          ? `${want} uses the wrong value (matches /${det.wrong_value_pattern}/), not ${det.value}`
          : `${want} has no ${det.property} matching ${det.value ?? '(any)'}`));
      }
    }
    return fired(missing);
  }

  // Gate first: a rule about images must not fire on a page with no images.
  if (det.when_html_contains) {
    const gate = rx(det.when_html_contains, 'i');
    if (gate && !gate.test(page.html)) return fired([]);
  }
  if (det.when_css_contains) {
    const gate = rx(det.when_css_contains, 'i');
    if (gate && !gate.test(page.cssSource)) return fired([]);
  }

  const found = [...declarations(page)].some((d) => {
    if (propRe && !propRe.test(d.property)) return false;
    if (valRe && !valRe.test(d.value)) return false;
    if (det.value_numeric) {
      const n = numericOf(d.value, det.value_numeric);
      if (n === null) return false;
      if (det.value_numeric.min !== undefined && !(n >= det.value_numeric.min)) return false;
      if (det.value_numeric.max !== undefined && !(n <= det.value_numeric.max)) return false;
    }
    if (selRe && !selRe.test(d.selector)) return false;
    if (selHintRe && !selHintRe.test(d.selector)) return false;
    if (reqAtRe && !d.atRules.some((a) => reqAtRe.test(a))) return false;
    if (det.at_rule === '@font-face' && !d.selector.includes('font-face') && !d.atRules.some((a) => /@font-face/i.test(a))) return false;
    return true;
  });

  return fired(found ? [] : [hit(`no declaration matching ${det.property ?? ''} ${det.value ?? ''}`.trim())]);
}

function themeContract(page) {
  const problems = [];
  const bare = page.cssRules.filter((r) => r.selector.trim() === ':root' && !r.atRules.length);
  const media = page.cssRules.filter((r) => r.atRules.some((a) => /prefers-color-scheme\s*:\s*dark/i.test(a)));
  const attr = page.cssRules.filter((r) => /\[data-theme\s*=\s*["']?dark/i.test(r.selector));

  if (!bare.length) problems.push(hit('no complete palette on bare :root'));
  if (!media.length) problems.push(hit('no @media (prefers-color-scheme: dark) block'));
  else if (!media.some((r) => /:root:not\(\[data-theme\s*=\s*["']?light/i.test(r.selector))) {
    problems.push(hit('dark media block is not guarded as :root:not([data-theme="light"]) — an explicit light choice loses'));
  }
  if (!attr.length) problems.push(hit('no :root[data-theme="dark"] block — a toggle cannot win'));

  const bareTokens = new Set(bare.flatMap((r) => r.decls.map((d) => d.property)).filter((p) => p.startsWith('--')));
  for (const r of [...media, ...attr]) {
    for (const d of r.decls) {
      if (d.property.startsWith('--') && !bareTokens.has(d.property)) {
        problems.push(hit(`${d.property} is defined only inside a theme block — undefined for everyone else`));
      }
    }
  }
  return fired(dedupe(problems));
}

function cssCooccur(det, page) {
  if (det.mode === 'hero_padding_ratio') return heroPadding(page);
  if (det.mode === 'sticky_collision') return stickyCollision(page);
  if (det.mode === 'tracking_ladder') return trackingLadder(page);
  if (det.mode === 'bento') return bento(det, page);

  const hits = [];
  for (const r of page.cssRules) {
    const all = (det.requires || []).every((req) => {
      const pRe = rx(req.property, 'i');
      const vRe = req.value ? rx(req.value, 'i') : null;
      return r.decls.some((d) => {
        if (!pRe.test(d.property)) return false;
        if (vRe && !vRe.test(d.value)) return false;
        if (req.value_numeric) {
          const n = numericOf(d.value, req.value_numeric);
          if (n === null) return false;
          if (req.value_numeric.min !== undefined && !(n >= req.value_numeric.min)) return false;
          if (req.value_numeric.max !== undefined && !(n <= req.value_numeric.max)) return false;
        }
        return true;
      });
    });
    if (!all) continue;
    if (det.and_selector && !rx(det.and_selector, 'i').test(r.selector)) continue;
    if (det.and_property_present) {
      const need = rx(det.and_property_present, 'i');
      const d = r.decls.find((x) => need.test(x.property));
      if (!d) continue;
      // the co-occurring size must itself be display-scale
      const px = clampMax(d.value);
      if (px !== null && px < 32) continue;
    }
    hits.push(hit(`${r.selector} { ${r.decls.map((d) => d.property).join('; ')} }`));
  }
  return fired(hits);
}

function heroPadding(page) {
  const hits = [];
  for (const r of page.cssRules) {
    if (!/\.hero|\bheader\b|\.masthead|\.banner/i.test(r.selector)) continue;
    let top = null, bottom = null;
    for (const d of r.decls) {
      if (d.property === 'padding-block-start') top = clampMax(d.value);
      if (d.property === 'padding-block-end') bottom = clampMax(d.value);
      if (d.property === 'padding-block') {
        const p = splitList(d.value.replace(/\s+/g, ','));
        top = clampMax(p[0]); bottom = clampMax(p[1] ?? p[0]);
      }
      if (d.property === 'padding') {
        const parts = splitTopSpaces(d.value);
        if (parts.length >= 3) { top = clampMax(parts[0]); bottom = clampMax(parts[2]); }
        else if (parts.length === 2) { top = clampMax(parts[0]); bottom = clampMax(parts[0]); }
      }
    }
    if (top && bottom && top > 0) {
      const ratio = bottom / top;
      if (ratio < 1.3) hits.push(hit(`${r.selector}: bottom ${Math.round(bottom)}px / top ${Math.round(top)}px = ${ratio.toFixed(2)}x, below 1.3x`));
    }
  }
  return fired(hits);
}

function splitTopSpaces(value) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function stickyCollision(page) {
  const sticky = [];
  for (const r of page.cssRules) {
    const pos = r.decls.find((d) => d.property === 'position' && /sticky|fixed/.test(d.value));
    if (!pos) continue;
    const top = r.decls.find((d) => d.property === 'top');
    sticky.push({ selector: r.selector, top: top?.value ?? null });
  }
  const hits = [];
  const atZero = sticky.filter((s) => s.top !== null && lengthPx(s.top) === 0);
  if (atZero.length > 1) {
    hits.push(hit(`${atZero.length} elements at position:sticky; top:0 — ${atZero.map((s) => s.selector).join(', ')}`));
  }
  for (const s of sticky) {
    if (s.top && !/var\(/.test(s.top) && lengthPx(s.top) > 0) {
      hits.push(hit(`${s.selector} { top: ${s.top} } — a hardcoded offset guessed from another element's height`));
    }
  }
  return fired(hits);
}

function trackingLadder(page) {
  const hits = [];
  for (const r of page.cssRules) {
    const ls = r.decls.find((d) => d.property === 'letter-spacing');
    if (!ls) continue;
    const em = /(-?\d*\.?\d+)\s*em\b/.exec(ls.value);
    if (!em) continue;
    const track = parseFloat(em[1]);
    const fs = r.decls.find((d) => d.property === 'font-size');
    const px = fs ? clampMax(fs.value) : null;
    if (px === null) continue;
    if (px <= 15 && track < 0) hits.push(hit(`${r.selector}: ${track}em tracking at ${Math.round(px)}px — negative on small text`));
    else if (px >= 36 && track > -0.01) hits.push(hit(`${r.selector}: ${track}em at ${Math.round(px)}px — display type with no correction`));
    else if (px <= 15 && track > 0.09) hits.push(hit(`${r.selector}: +${track}em at ${Math.round(px)}px — above the +0.06em recommendation for small caps`));
  }
  return fired(hits);
}

function bento(det, page) {
  const hits = [];
  const wide = page.cssRules.filter((r) =>
    r.decls.some((d) => d.property === 'grid-template-columns' && columnCount(d.value) >= (det.min_columns || 4)));
  if (!wide.length) return fired([]);
  const spans = new Set();
  for (const d of declarations(page)) {
    if (d.property === 'grid-column') spans.add(d.value.trim());
  }
  for (const el of page.elements) {
    const m = /grid-column\s*:\s*([^;]+)/i.exec(el.attrs.style || '');
    if (m) spans.add(m[1].trim());
  }
  if (spans.size >= 2) {
    hits.push(hit(`${wide[0].selector}: ${columnCount(wide[0].decls.find((d) => d.property === 'grid-template-columns').value)} columns with ${spans.size} distinct span values (${[...spans].join(', ')})`));
  }
  return fired(hits);
}

function columnCount(value) {
  const rep = /repeat\(\s*(\d+)/.exec(value);
  if (rep) return parseInt(rep[1], 10);
  return splitTopSpaces(value).length;
}

// ---------------------------------------------------------------- colour kinds

function hexSet(det, page) {
  const want = new Set(det.hexes.map((h) => {
    let x = h.toLowerCase().replace('#', '');
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    return '#' + x;
  }));
  const hits = [];
  for (const { hex, raw } of hexLiterals(page.cssSource + '\n' + page.html)) {
    if (want.has(hex)) hits.push(hit(raw));
  }
  return fired(dedupeBy(hits, (h) => h.evidence.toLowerCase()));
}

function hexOklchBand(det, page) {
  if (det.report === 'outside_band') return neutralBand(det, page);

  const hits = [];
  const seen = new Set();
  const exact = new Set((det.exact_hexes || []).map((h) => h.toLowerCase()));

  const candidates = det.mode === 'ground'
    ? groundCandidates(page)
    : accentCandidates(page, det.role_hint);

  for (const { hex, why } of candidates) {
    if (seen.has(hex)) continue;
    seen.add(hex);
    const o = toOklch(hex);
    const inHue = det.hue ? o.h >= det.hue[0] && o.h <= det.hue[1] : true;
    const inChroma = (det.chroma_min === undefined || o.C >= det.chroma_min) &&
      (det.chroma_max === undefined || o.C <= det.chroma_max);
    const lo = det.lightness ? det.lightness[0] : (det.lightness_min ?? 0);
    const hi = det.lightness ? det.lightness[1] : 1;
    const inLight = o.L >= lo && o.L <= hi;
    if ((inHue && inChroma && inLight) || exact.has(hex)) {
      hits.push(hit(`${hex} (${why}) — OKLCH L ${o.L.toFixed(3)} C ${o.C.toFixed(3)} h ${o.h.toFixed(1)}`));
    }
  }
  return fired(hits);
}

function neutralBand(det, page) {
  const hits = [];
  for (const d of declarations(page)) {
    if (!d.property.startsWith('--')) continue;
    if (d.atRules.some((a) => /prefers-color-scheme/.test(a))) continue;
    if (/\[data-theme/i.test(d.selector)) continue;
    const m = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(d.value);
    if (!m) continue;
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const hex = '#' + h;
    const o = toOklch(hex);
    if (o.C >= 0.04) continue; // a colour, not a neutral
    if (o.C < (det.chroma_min ?? 0.005)) {
      hits.push(hit(`${d.property}: ${hex} — chroma ${o.C.toFixed(4)}, below the ${det.chroma_min} floor (a colourless grey)`));
    } else if (det.chroma_max !== undefined && o.C > det.chroma_max) {
      hits.push(hit(`${d.property}: ${hex} — chroma ${o.C.toFixed(4)}, above the ${det.chroma_max} ceiling (over-tinted)`));
    }
  }
  return fired(hits);
}

function groundCandidates(page) {
  const out = [];
  for (const d of declarations(page)) {
    if (!/^--(?:bg|paper|ground|surface|background)(?:-\d)?$/.test(d.property)) continue;
    if (d.atRules.some((a) => /prefers-color-scheme/.test(a))) continue;
    const hex = firstHex(d.value);
    if (hex) out.push({ hex, why: d.property });
  }
  if (!out.length) {
    for (const r of page.cssRules) {
      if (!/^(?:body|html)\b/.test(r.selector.trim())) continue;
      const bg = r.decls.find((d) => /^background(-color)?$/.test(d.property));
      const hex = bg && firstHex(bg.value);
      if (hex) out.push({ hex, why: 'body background' });
    }
  }
  return out;
}

function accentCandidates(page, roleHint) {
  const out = [];
  for (const d of declarations(page)) {
    if (d.property.startsWith('--')) {
      if (!/accent|brand|primary|pass|action/.test(d.property)) continue;
      if (d.atRules.some((a) => /prefers-color-scheme/.test(a))) continue;
      const hex = firstHex(d.value);
      if (hex) out.push({ hex, why: d.property });
      continue;
    }
    if (roleHint !== 'accent') continue;
    if (!/^(background|background-color|border-color|fill|color)$/.test(d.property)) continue;
    if (!/btn|button|cta|link|a:|\.accent/i.test(d.selector)) continue;
    const hex = firstHex(d.value);
    if (hex) out.push({ hex, why: `${d.selector} { ${d.property} }` });
  }
  return out;
}

function firstHex(value) {
  const m = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(value);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h;
}

function hexRelation(det, page) {
  if (det.compare === 'ground_vs_neutral_hue') {
    const ground = groundCandidates(page)[0];
    const neutrals = [];
    for (const d of declarations(page)) {
      if (!d.property.startsWith('--')) continue;
      if (d.atRules.some((a) => /prefers-color-scheme/.test(a))) continue;
      if (!/^--(?:fg|ink|text|muted|grey|gray|line|border)/.test(d.property)) continue;
      const hex = firstHex(d.value);
      if (hex && isNeutral(hex, 0.06)) neutrals.push({ prop: d.property, hex });
    }
    if (!ground || !neutrals.length) return fired([]);
    const g = toOklch(ground.hex);
    if (g.C < (det.chroma_floor ?? 0.004)) return fired([]);
    const hits = [];
    for (const n of neutrals) {
      const o = toOklch(n.hex);
      if (o.C < (det.chroma_floor ?? 0.004)) continue;
      const dist = hueDistance(g.h, o.h);
      if (dist > (det.max_delta_degrees ?? 45)) {
        hits.push(hit(`ground ${ground.hex} (hue ${g.h.toFixed(1)}) vs ${n.prop} ${n.hex} (hue ${o.h.toFixed(1)}) — ${dist.toFixed(0)} degrees apart`));
      }
    }
    return fired(hits);
  }

  if (det.compare === 'theme_hue_shift') {
    const tokenRe = rx(det.token_pattern, 'i');
    const light = new Map(), dark = new Map();
    for (const d of declarations(page)) {
      if (!d.property.startsWith('--')) continue;
      if (tokenRe && !tokenRe.test(d.property)) continue;
      const hex = firstHex(d.value);
      if (!hex) continue;
      const isDark = d.atRules.some((a) => /prefers-color-scheme\s*:\s*dark/i.test(a)) ||
        /\[data-theme\s*=\s*["']?dark/i.test(d.selector);
      (isDark ? dark : light).set(d.property, hex);
    }
    const hits = [];
    for (const [k, lh] of light) {
      const dh = dark.get(k);
      if (!dh) continue;
      const a = toOklch(lh), b = toOklch(dh);
      if (a.C < 0.03 || b.C < 0.03) continue; // neutrals are allowed to move
      const dist = hueDistance(a.h, b.h);
      if (dist > (det.max_delta_degrees ?? 12)) {
        hits.push(hit(`${k}: ${lh} (hue ${a.h.toFixed(0)}) becomes ${dh} (hue ${b.h.toFixed(0)}) in dark mode — ${dist.toFixed(0)} degrees`));
      }
    }
    return fired(hits);
  }

  if (det.compare === 'white_card_on_grey') {
    const ground = groundCandidates(page)[0];
    if (!ground) return fired([]);
    const gL = toOklch(ground.hex).L;
    if (gL > (det.ground_lightness_max ?? 0.97)) return fired([]);
    const whites = [];
    for (const d of declarations(page)) {
      const hex = firstHex(d.value);
      if (!hex) continue;
      if (hex !== '#ffffff') continue;
      if (d.property.startsWith('--') || /^background/.test(d.property)) whites.push(d);
    }
    if (!whites.length) return fired([]);
    return fired([hit(`pure white surface on a ${ground.hex} ground (L ${gL.toFixed(3)}) — via ${whites[0].property}`)]);
  }

  return notRun(`unknown hex_relation compare: ${det.compare}`);
}

function hexCensus(det, page) {
  const hexes = hexLiterals(page.cssSource).map((h) => h.hex);
  const groups = groupPerceptually(hexes, det.group_by_perceptual_distance ?? 0.04);
  const withPresence = groups.filter((g) => g.count >= (det.presence_min_uses ?? 3));
  if (withPresence.length > (det.max_with_presence ?? 5)) {
    return fired([hit(`${withPresence.length} perceptually distinct colour groups with presence: ${withPresence.slice(0, 8).map((g) => `${g.representative} x${g.count}`).join(', ')}`)]);
  }
  return fired([]);
}

function contrast(det, page) {
  const tokens = {};
  for (const d of declarations(page)) {
    if (!d.property.startsWith('--')) continue;
    const hex = firstHex(d.value);
    if (!hex) continue;
    const theme = d.atRules.some((a) => /prefers-color-scheme\s*:\s*dark/i.test(a)) || /\[data-theme.*dark/i.test(d.selector) ? 'dark' : 'light';
    tokens[theme] = tokens[theme] || {};
    if (tokens[theme][d.property] === undefined) tokens[theme][d.property] = hex;
  }
  const hits = [];
  for (const [theme, map] of Object.entries(tokens)) {
    const grounds = Object.entries(map).filter(([k]) => /^--(?:bg|paper|ground|surface|background)/.test(k));
    const inks = Object.entries(map).filter(([k]) => /^--(?:fg|ink|text|muted|foreground)/.test(k));
    if (!grounds.length || !inks.length) continue;
    const [gk, gv] = grounds[0];
    for (const [ik, iv] of inks) {
      const ratio = roundRatio(contrastRatio(parseHex(iv), parseHex(gv)));
      if (ratio < det.min_ratio) {
        hits.push(hit(`${theme}: ${ik} ${iv} on ${gk} ${gv} = ${ratio}:1, below ${det.min_ratio}:1`));
      }
    }
  }
  return fired(hits);
}

// ---------------------------------------------------------------- HTML kinds

function htmlRegex(det, page) {
  const flags = det.flags || 'g';
  const re = rx(det.pattern, flags.includes('g') ? flags : flags + 'g');
  if (!re) return notRun('bad pattern');
  const hits = [];
  let m, guard = 0;
  while ((m = re.exec(page.html)) !== null && guard++ < 500) {
    hits.push(hit(m[0].replace(/\s+/g, ' ').slice(0, 120)));
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (det.mode === 'required') return fired(hits.length ? [] : [hit(`nothing matching /${det.pattern}/`)]);
  if (det.min_count && hits.length < det.min_count) return fired([]);
  return fired(hits);
}

function htmlTag(det, page) {
  const tags = det.tag.split('|');
  let found = page.elements.filter((el) => tags.includes(el.tag));
  if (det.attr_match) {
    found = found.filter((el) =>
      Object.entries(det.attr_match).every(([k, v]) => {
        const re = rx(v, 'i');
        return el.attrs[k] !== undefined && (!re || re.test(el.attrs[k]));
      }));
  }
  if (det.mode === 'required') {
    return fired(found.length ? [] : [hit(`no <${det.tag}> matching ${JSON.stringify(det.attr_match || {})}`)]);
  }
  if (det.mode === 'forbidden') {
    return fired(found.map((el) => hit(`<${el.tag}>`)));
  }
  if (det.mode === 'min_count') {
    return fired(found.length >= (det.min ?? 1) ? [] : [hit(`${found.length} <${det.tag}>, expected at least ${det.min ?? 1}`)]);
  }
  if (det.mode === 'present') return fired(found.length ? [hit(`<${det.tag}> present`)] : []);
  return fired(found.map((el) => hit(`<${el.tag}>`)));
}

function htmlAttr(det, page) {
  let els = page.elements.filter((el) => el.tag === det.tag);
  if (det.only_when_attr) {
    els = els.filter((el) => Object.entries(det.only_when_attr).every(([k, v]) => {
      const re = rx(v, 'i');
      return el.attrs[k] !== undefined && (!re || re.test(el.attrs[k]));
    }));
  }
  if (det.position === 'first_in_document') els = els.slice(0, 1);

  if (det.mode === 'required') {
    if (det.value_pattern) {
      const re = rx(det.value_pattern, 'i');
      const any = els.some((el) => el.attrs[det.attr] && re.test(el.attrs[det.attr]));
      // "required" across the document: at least one matching element
      const all = page.elements.filter((el) => el.tag === det.tag);
      if (!all.length && det.tag === 'a') {
        return fired([hit(`no <a href> matching ${det.value_pattern} anywhere`)]);
      }
      return fired(any ? [] : [hit(`no <${det.tag} ${det.attr}> matching /${det.value_pattern}/`)]);
    }
    const missing = els.filter((el) => el.attrs[det.attr] === undefined);
    return fired(missing.map((el) => hit(`<${el.tag}> with no ${det.attr}`)));
  }
  if (det.mode === 'forbidden') {
    const re = det.value_pattern ? rx(det.value_pattern, 'i') : null;
    const bad = els.filter((el) => el.attrs[det.attr] !== undefined && (!re || re.test(el.attrs[det.attr])));
    return fired(bad.map((el) => hit(`<${el.tag} ${det.attr}="${el.attrs[det.attr]}">`)));
  }
  return notRun(`unknown html_attr mode: ${det.mode}`);
}

function headingOrder(det, page) {
  const headings = page.elements.filter((el) => /^h[1-6]$/.test(el.tag));
  const hits = [];
  const h1s = headings.filter((h) => h.tag === 'h1');
  if (det.require_single_h1) {
    if (h1s.length === 0) hits.push(hit('no <h1> on the page'));
    else if (h1s.length > 1) hits.push(hit(`${h1s.length} <h1> elements`));
  }
  if (det.forbid_skips) {
    let prev = 0;
    for (const h of headings) {
      const lvl = parseInt(h.tag[1], 10);
      if (prev && lvl > prev + 1) hits.push(hit(`<${h.tag}> follows <h${prev}> — a skipped level`));
      prev = lvl;
    }
  }
  if (det.flag_h1_in_nav) {
    for (const h of h1s) {
      let p = h.parent, inNav = false;
      while (p) { if (p.tag === 'nav' || p.tag === 'header') { inNav = true; break; } p = p.parent; }
      if (inNav) hits.push(hit(`<h1> is inside <${'nav/header'}> — "${h.text.trim().slice(0, 40)}" is the wordmark, not the subject of the page`));
    }
  }
  return fired(dedupe(hits));
}

// ---------------------------------------------------------------- DOM kinds

function domPrecedesHeading(det, page) {
  if (det.mode === 'attribution_under_quote') return attributionUnderQuote(det, page);

  const targets = det.heading === 'h1'
    ? page.elements.filter((el) => el.tag === 'h1').slice(0, 1)
    : page.elements.filter((el) => /^h[1-4]$/.test(el.tag));

  const hits = [];
  for (const h of targets) {
    const prev = previousSibling(h);
    if (!prev) continue;
    if ((det.exclude_tags || []).includes(prev.tag)) continue;
    if ((det.exclude_if_contains || []).some((t) => prev.children.some((c) => c.tag === t))) continue;
    const text = prev.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text.length > (det.max_chars ?? 60)) continue;
    if (text.split(/\s+/).length > (det.max_words ?? 9)) continue;
    if (!looksLikeKicker(prev, page, text)) continue;
    hits.push(hit(`<${prev.tag}${prev.attrs.class ? ' class="' + prev.attrs.class + '"' : ''}>${text}</${prev.tag}> immediately before <${h.tag}>`));
  }
  return fired(hits);
}

function previousSibling(el) {
  if (!el.parent) return null;
  const sibs = el.parent.children;
  const i = sibs.indexOf(el);
  return i > 0 ? sibs[i - 1] : null;
}

function looksLikeKicker(el, page, text) {
  if (text === text.toUpperCase() && /[A-Z]/.test(text)) return true;
  const classes = (el.attrs.class || '').split(/\s+/).filter(Boolean);
  for (const r of page.cssRules) {
    const matchesSelector = classes.some((c) => r.selector.includes('.' + c)) ||
      r.selector.split(',').some((s) => s.trim() === el.tag);
    if (!matchesSelector) continue;
    const up = r.decls.find((d) => d.property === 'text-transform' && /uppercase/i.test(d.value));
    if (up) return true;
    const ls = r.decls.find((d) => d.property === 'letter-spacing');
    if (ls) {
      const m = /(-?\d*\.?\d+)\s*em/.exec(ls.value);
      if (m && parseFloat(m[1]) >= 0.08) return true;
    }
  }
  return false;
}

function attributionUnderQuote(det, page) {
  const quoteTags = new Set(det.quote_tags || ['blockquote', 'q']);
  const hits = [];
  for (const el of page.elements) {
    const isQuote = quoteTags.has(el.tag) || /quote|testimonial|words|pull/i.test(el.attrs.class || '');
    if (!isQuote) continue;
    const next = nextSibling(el);
    if (!next) continue;
    const text = next.text.replace(/\s+/g, ' ').trim();
    if (!text || text.split(/\s+/).length > (det.attribution_max_words ?? 12)) continue;
    const looksLikeName = /^[—–-]\s*[A-Z]/.test(text) || /\b[A-Z][a-z]+\s+[A-Z][a-z.]/.test(text) ||
      /\b(?:CEO|founder|director|owner|manager|customer|client)\b/i.test(text);
    if (looksLikeName) hits.push(hit(`"${text}" set under a ${el.tag} — that IS an attribution`));
  }
  return fired(hits);
}

function nextSibling(el) {
  if (!el.parent) return null;
  const sibs = el.parent.children;
  const i = sibs.indexOf(el);
  return i >= 0 && i < sibs.length - 1 ? sibs[i + 1] : null;
}

function domRepeatedSiblings(det, page) {
  switch (det.mode) {
    case 'icon_register': return iconRegister(det, page);
    case 'icon_heading_text': return iconHeadingText(det, page);
    case 'reveal_saturation': return revealSaturation(det, page);
    case 'density': return densityMismatch(det, page);
    case 'empty_proof_section': return emptyProofSection(det, page);
    case 'pricing_columns': return pricingColumns(det, page);
    case 'emoji_icon': return emojiIcon(det, page);
    case 'hero_metric': return heroMetric(det, page);
    case 'empty_element': return emptyElement(det, page);
    default: return notRun(`unknown dom_repeated_siblings mode: ${det.mode}`);
  }
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/u;
const GEOMETRIC = /[\u{2000}-\u{25FF}\u{2700}-\u{27BF}]/u;

function iconSlots(page) {
  const slots = [];
  for (const el of page.elements) {
    const cls = el.attrs.class || '';
    const isSlot = /glyph|icon|emoji|symbol/i.test(cls) || el.attrs['aria-hidden'] === 'true';
    if (!isSlot) continue;
    const text = el.own.trim();
    if (el.tag === 'svg' || el.children.some((c) => c.tag === 'svg')) { slots.push({ el, register: 'svg', text: '<svg>' }); continue; }
    if (el.tag === 'img') { slots.push({ el, register: 'img', text: el.attrs.src || '' }); continue; }
    if (!text) continue;
    if (text.length > 4) continue;
    const register = EMOJI.test(text) ? 'emoji' : GEOMETRIC.test(text) ? 'unicode-geometry' : 'text';
    slots.push({ el, register, text });
  }
  return slots;
}

/**
 * Emoji in an ICON POSITION, which is the rule -- not emoji anywhere in prose.
 * Counted per slot, not per code point: a flag or a skin-tone emoji is several
 * code points and one icon, and counting code points inflates the number.
 */
function emojiIcon(det, page) {
  const slots = iconSlots(page).filter((s) => s.register === 'emoji');
  return fired(slots.map((s) => hit(`${s.text} used as the icon of <${s.el.parent?.tag ?? '?'} class="${s.el.parent?.attrs.class ?? ''}">`)));
}

/**
 * The big-number hero: a text block whose ENTIRE content is a figure, set at
 * display size, inside the hero. Matching loose digits anywhere in the hero
 * catches the phone number, which is the one number on a local page that should
 * be there.
 */
function heroMetric(det, page) {
  const hero = page.elements.find((el) => /\bhero\b/i.test(el.attrs.class || ''));
  if (!hero) return fired([]);
  const minRem = det.min_rem ?? 3;
  const hits = [];
  for (const el of collect(hero, () => true)) {
    const own = el.own.replace(/\s+/g, ' ').trim();
    if (!/^[+$£€]?\d[\d,.]*\s*[%x+]?$/.test(own)) continue;
    if (own.replace(/\D/g, '').length >= 7) continue; // a phone number, not a metric
    const px = displaySizeFor(el, page);
    if (px !== null && px >= minRem * 16) {
      hits.push(hit(`"${own}" set at ${Math.round(px)}px in the hero`));
    }
  }
  return fired(hits);
}

function displaySizeFor(el, page) {
  const inline = /font-size\s*:\s*([^;]+)/i.exec(el.attrs.style || '');
  if (inline) return clampMax(inline[1]);
  const classes = (el.attrs.class || '').split(/\s+/).filter(Boolean);
  let best = null;
  for (const r of page.cssRules) {
    const matches = classes.some((c) => r.selector.includes('.' + c)) ||
      r.selector.split(',').some((sel) => sel.trim() === el.tag);
    if (!matches) continue;
    const fs = r.decls.find((d) => d.property === 'font-size');
    if (fs) { const px = clampMax(fs.value); if (px !== null) best = Math.max(best ?? 0, px); }
  }
  return best;
}

/**
 * An element with no content, present to hold space open.
 *
 * A flex spacer (`margin-left: auto`, `flex: 1`) is a legitimate layout technique
 * and is excluded; the rule is about a reserved slot where CONTENT was supposed
 * to be -- research/11a found an empty badge on three of four pricing cards.
 */
function emptyElement(det, page) {
  const hits = [];
  for (const el of page.elements) {
    if (['img', 'br', 'hr', 'input', 'svg', 'path', 'source', 'meta', 'link', 'script', 'style'].includes(el.tag)) continue;
    if (el.children.length) continue;
    const content = el.text.replace(/[\s ]+/g, '');
    if (content.length) continue;
    if (el.attrs['aria-hidden'] === 'true' && /grain|noise|decor/i.test(el.attrs.class || '')) continue;
    if (isLayoutSpacer(el, page)) continue;
    hits.push(hit(`<${el.tag}${el.attrs.class ? ' class="' + el.attrs.class + '"' : ''}></${el.tag}> holds space with no content`));
  }
  return fired(hits);
}

function isLayoutSpacer(el, page) {
  const classes = (el.attrs.class || '').split(/\s+/).filter(Boolean);
  const style = el.attrs.style || '';
  if (/margin(?:-(?:left|right|inline[\w-]*))?\s*:\s*auto|flex\s*:\s*1|flex-grow/i.test(style)) return true;
  for (const r of page.cssRules) {
    if (!classes.some((c) => r.selector.includes('.' + c))) continue;
    if (r.decls.some((d) => /^margin(?:-left|-right|-inline|-inline-start)?$/.test(d.property) && /auto/.test(d.value))) return true;
    if (r.decls.some((d) => /^flex(?:-grow)?$/.test(d.property))) return true;
  }
  return false;
}

function iconRegister(det, page) {
  const slots = iconSlots(page);
  if (slots.length < (det.min_count ?? 3)) return fired([]);
  const registers = new Set(slots.map((s) => s.register));
  if (registers.size < 2) return fired([]);
  const summary = [...registers].map((r) => `${r} x${slots.filter((s) => s.register === r).length}`).join(', ');
  return fired([hit(`${slots.length} icon slots drawn from ${registers.size} registers: ${summary}`)]);
}

function iconHeadingText(det, page) {
  const hits = [];
  for (const parent of page.elements) {
    const groups = new Map();
    for (const c of parent.children) {
      const key = c.tag + '|' + (c.attrs.class || '').split(/\s+/).filter((x) => !/^(?:is-|has-)/.test(x)).sort().join(' ');
      groups.set(key, (groups.get(key) || []).concat(c));
    }
    for (const [key, sibs] of groups) {
      if (sibs.length < (det.min_count ?? 3)) continue;
      const shaped = sibs.filter((s) => {
        const hasIcon = s.children.some((c) => /glyph|icon/i.test(c.attrs.class || '') || c.tag === 'svg' || c.attrs['aria-hidden'] === 'true');
        const hasHeading = s.children.some((c) => /^h[1-6]$/.test(c.tag));
        const hasText = s.children.some((c) => c.tag === 'p');
        return hasIcon && hasHeading && hasText;
      });
      if (shaped.length >= (det.min_count ?? 3)) {
        hits.push(hit(`${shaped.length} structurally identical ${key.split('|')[0]}.${key.split('|')[1] || ''} siblings, each icon + heading + paragraph`));
      }
    }
  }
  return fired(hits);
}

function revealSaturation(det, page) {
  const revealRe = /\breveal\b|\banimate\b|\bfade-in\b|\baos\b|data-aos/i;
  const revealed = page.elements.filter((el) => revealRe.test(el.attrs.class || '') || el.attrs['data-aos'] !== undefined);
  if (!revealed.length) return fired([]);
  const blocks = page.elements.filter((el) => ['section', 'article', 'div', 'li', 'figure'].includes(el.tag) && (el.text || '').trim().length > 20);
  if (!blocks.length) return fired([]);
  const ratio = revealed.length / blocks.length;
  if (ratio > (det.max_ratio ?? 0.5)) {
    return fired([hit(`${revealed.length} of ${blocks.length} content blocks carry a reveal class (${Math.round(ratio * 100)}%)`)]);
  }
  // also fire when the reveal is the page's only motion, applied uniformly
  const uniform = revealed.length >= 5 && new Set(revealed.map((el) => el.tag + (el.attrs.class || ''))).size <= 2;
  if (uniform) {
    return fired([hit(`${revealed.length} elements carry one identical reveal treatment — the uniformity is the signature, not the count`)]);
  }
  return fired([]);
}

function densityMismatch(det, page) {
  const wide = page.cssRules.filter((r) =>
    r.decls.some((d) => d.property === 'grid-template-columns' && columnCount(d.value) >= (det.grid_columns_min ?? 3)));
  if (!wide.length) return fired([]);
  const selectors = wide.flatMap((r) => r.selector.split(',').map((s) => s.trim().replace(/^\./, '')));
  let items = 0;
  for (const el of page.elements) {
    const cls = (el.attrs.class || '').split(/\s+/);
    if (!el.parent) continue;
    const parentCls = (el.parent.attrs.class || '').split(/\s+/);
    if (parentCls.some((c) => selectors.includes(c))) items++;
  }
  if (items > 0 && items <= (det.content_items_max ?? 4)) {
    return fired([hit(`a ${columnCount(wide[0].decls.find((d) => d.property === 'grid-template-columns').value)}-column grid holding ${items} items`)]);
  }
  return fired([]);
}

function emptyProofSection(det, page) {
  const re = rx(det.section_pattern, 'i');
  const hits = [];
  for (const el of page.elements) {
    if (!['section', 'div', 'aside'].includes(el.tag)) continue;
    const label = (el.attrs.class || '') + ' ' + (el.attrs.id || '');
    if (!re.test(label)) continue;
    const body = el.text.replace(/\s+/g, ' ').trim();
    const headingText = el.children.filter((c) => /^h[1-6]$/.test(c.tag)).map((c) => c.text).join(' ').trim();
    if (body.replace(headingText, '').trim().length < 20) {
      hits.push(hit(`<${el.tag} class="${el.attrs.class || ''}"> names proof and contains none`));
    }
  }
  return fired(hits);
}

function pricingColumns(det, page) {
  const hits = [];
  for (const parent of page.elements) {
    const groups = new Map();
    for (const c of parent.children) {
      const key = c.tag + '|' + (c.attrs.class || '');
      groups.set(key, (groups.get(key) || []).concat(c));
    }
    for (const [key, sibs] of groups) {
      if (sibs.length < (det.min_count ?? 3)) continue;
      if (!sibs.every((s) => /\$|\bprice|\bper (?:month|year)\b/i.test(s.text))) continue;
      hits.push(hit(`${sibs.length} sibling pricing columns (${key.split('|')[0]})`));
    }
  }
  return fired(hits);
}

function domNested(det, page) {
  if (det.mode === 'lcp_in_reveal') {
    const hero = page.elements.find((el) => /\bhero\b/i.test(el.attrs.class || '')) || null;
    const heading = hero
      ? findFirst(hero, (el) => /^h[1-3]$/.test(el.tag))
      : page.elements.find((el) => /^h[1-2]$/.test(el.tag));
    if (!heading) return fired([]);
    const cls = (heading.attrs.class || '');
    if (/\breveal\b|\banimate\b|\bfade-in\b|\baos\b/i.test(cls)) {
      return fired([hit(`<${heading.tag} class="${cls}"> — the largest paint starts hidden`)]);
    }
    return fired([]);
  }

  const outerRe = rx(det.class_pattern || det.outer_class_pattern, 'i');
  const hits = [];
  for (const el of page.elements) {
    if (!outerRe.test(el.attrs.class || '')) continue;
    const inner = findFirst(el, (d) => d !== el && outerRe.test(d.attrs.class || ''));
    if (inner) hits.push(hit(`<${el.tag} class="${el.attrs.class}"> contains <${inner.tag} class="${inner.attrs.class}">`));
  }
  return fired(hits);
}

function findFirst(root, pred) {
  const stack = [...root.children];
  while (stack.length) {
    const el = stack.shift();
    if (pred(el)) return el;
    stack.push(...el.children);
  }
  return null;
}

// ---------------------------------------------------------------- text kinds

function textLexicon(det, page) {
  const scope = det.scope === 'footer_headings' ? footerHeadings(page) : page.visibleText;
  const spare = (det.spare_patterns || []).map((p) => rx(p, 'i')).filter(Boolean);
  const hits = [];
  for (const term of det.terms || []) {
    const re = rx(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let m;
    while (re && (m = re.exec(scope)) !== null) {
      const context = scope.slice(Math.max(0, m.index - 30), m.index + term.length + 30);
      if (spare.some((s) => s.test(context))) continue;
      hits.push(hit(`"${term}" in "...${context.trim()}..."`));
    }
  }
  for (const p of det.patterns || []) {
    const re = rx(p, 'gi');
    let m;
    while (re && (m = re.exec(scope)) !== null) {
      const context = scope.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30);
      if (spare.some((s) => s.test(context))) continue;
      hits.push(hit(`"${m[0]}" in "...${context.trim()}..."`));
    }
  }
  if (det.min_count && hits.length < det.min_count) return fired([]);
  return fired(hits);
}

function footerHeadings(page) {
  const footers = page.elements.filter((el) => el.tag === 'footer');
  return footers
    .flatMap((f) => collect(f, (el) => /^h[1-6]$/.test(el.tag) || /col-title|footer-heading/i.test(el.attrs.class || '')))
    .map((el) => el.text)
    .join('\n');
}

function collect(root, pred) {
  const out = [];
  const stack = [...root.children];
  while (stack.length) {
    const el = stack.shift();
    if (pred(el)) out.push(el);
    stack.push(...el.children);
  }
  return out;
}

function textRegex(det, page) {
  if (det.mode === 'cross_file_duplicate') return notRun('needs the whole project directory, not one page — run the project-level check');
  let scope = page.visibleText;
  if (det.scope === 'script') scope = page.scripts;
  if (det.scope === 'hero') {
    const hero = page.elements.find((el) => /\bhero\b/i.test(el.attrs.class || ''));
    scope = hero ? hero.text : '';
  }
  if (det.scope === 'pricing_region') {
    const region = page.elements.find((el) => /pric|tier|plan/i.test((el.attrs.class || '') + (el.attrs.id || '')));
    scope = region ? region.text : '';
  }
  if (det.scope === 'short_labels') {
    scope = page.textBlocks.filter((b) => b.text.length <= 40).map((b) => b.text).join('\n');
  }
  if (!scope) return fired([]);

  const spare = (det.spare_patterns || []).map((p) => rx(p, 'i')).filter(Boolean);
  const re = rx(det.pattern, (det.flags || '').includes('g') ? det.flags : (det.flags || '') + 'g');
  if (!re) return notRun('bad pattern');

  const hits = [];
  let m, guard = 0;
  while ((m = re.exec(scope)) !== null && guard++ < 300) {
    if (m.index === re.lastIndex) re.lastIndex++;
    const context = scope.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ');
    if (spare.some((s) => s.test(context))) continue;
    if (det.max_block_chars) {
      const block = page.textBlocks.find((b) => b.text.includes(m[0]));
      if (block && block.text.length > det.max_block_chars) continue;
    }
    if (det.compare === 'year_lt_current') {
      const year = parseInt(m[1], 10) + (m[0].includes('19') ? 1900 : 2000);
      if (year >= new Date().getFullYear()) continue;
    }
    if (det.require_nearby) {
      const near = scope.slice(Math.max(0, m.index - (det.nearby_chars ?? 400)), m.index + (det.nearby_chars ?? 400)).toLowerCase();
      if (det.require_nearby.some((n) => near.includes(n.toLowerCase()))) continue;
    }
    hits.push(hit(`"${m[0]}" in "...${context.trim()}..."`));
  }
  if (det.min_count && hits.length < det.min_count) return fired([]);
  return fired(hits);
}

function textMeasure(det, page) {
  const lists = page.elements.filter((el) => el.tag === 'ul' || el.tag === 'ol');
  if (det.what === 'list_item_counts') {
    const counts = lists.map((l) => l.children.filter((c) => c.tag === 'li').length).filter((n) => n > 0);
    if (counts.length < (det.min_lists ?? 3)) return fired([]);
    if (det.require_all_equal && counts.every((n) => n === det.require_all_equal)) {
      return fired([hit(`${counts.length} lists on the page, every one exactly ${det.require_all_equal} items`)]);
    }
    return fired([]);
  }
  if (det.what === 'list_item_prose') {
    const hits = [];
    for (const l of lists) {
      const items = l.children.filter((c) => c.tag === 'li').map((c) => c.text.trim());
      if (items.length < (det.min_items ?? 3)) continue;
      const avg = items.reduce((a, b) => a + b.length, 0) / items.length;
      const terminal = items.filter((t) => /[.!?]$/.test(t)).length / items.length;
      if (avg >= (det.min_avg_chars ?? 120) && (!det.require_terminal_punctuation || terminal > 0.6)) {
        hits.push(hit(`a ${items.length}-item list averaging ${Math.round(avg)} characters, ending in full stops`));
      }
    }
    return fired(hits);
  }
  return notRun(`unknown text_measure what: ${det.what}`);
}

// ---------------------------------------------------------------- type kinds

function fontStack(det, page) {
  const stacks = [];
  for (const d of declarations(page)) {
    if (d.property !== 'font-family') continue;
    stacks.push({ selector: d.selector, families: splitList(d.value).map((f) => f.replace(/["']/g, '').trim().toLowerCase()) });
  }
  if (!stacks.length) return fired([]);

  if (det.mode === 'banned') {
    const banned = new Set(det.banned_faces.map((f) => f.toLowerCase()));
    const hits = [];
    for (const s of stacks) {
      const first = s.families[0];
      if (banned.has(first)) hits.push(hit(`${s.selector} leads with "${first}"`));
    }
    return fired(hits);
  }
  if (det.mode === 'single_family') {
    const primaries = new Set(stacks.map((s) => s.families.find((f) => !isGeneric(f)) || s.families[0]).filter(Boolean));
    if (primaries.size < (det.min_families ?? 2)) {
      return fired([hit(`one family for the whole page: ${[...primaries].join(', ')}`)]);
    }
    return fired([]);
  }
  if (det.mode === 'serif_display') {
    const display = stacks.filter((s) => isDisplaySel(s.selector));
    const serif = display.some((s) => s.families.some((f) => /serif|georgia|times|garamond|fraunces|newsreader|playfair|instrument serif/.test(f) && !/sans/.test(f)));
    return fired(serif ? [hit('serif family on display headings')] : []);
  }
  if (det.mode === 'mono_scope') {
    const allowed = rx(det.allowed_selectors, 'i');
    const hits = [];
    for (const s of stacks) {
      const mono = s.families.some((f) => /mono|courier|consolas|menlo/.test(f));
      if (mono && allowed && !allowed.test(s.selector)) hits.push(hit(`${s.selector} uses a monospace family outside code/data/measurement`));
    }
    return fired(hits);
  }
  return notRun(`unknown font_stack mode: ${det.mode}`);
}

const isGeneric = (f) => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|-apple-system|blinkmacsystemfont)$/.test(f);
const isDisplaySel = (s) => /(^|[\s,>])(h1|h2)\b|\.hero|\.display|\.title/i.test(s);

function weightCensus(det, page) {
  const weights = [];
  for (const d of declarations(page)) {
    if (d.property !== 'font-weight') continue;
    const n = parseFloat(d.value);
    if (!Number.isFinite(n)) continue;
    weights.push({ n, selector: d.selector });
  }
  if (det.mode === 'display') {
    const hint = det.selector_hint ? rx(det.selector_hint, 'i') : null;
    const hits = weights
      .filter((w) => (!hint || hint.test(w.selector)) && w.n >= (det.max_weight ?? 620))
      .map((w) => hit(`${w.selector} { font-weight: ${w.n} }`));
    return fired(hits);
  }
  if (det.mode === 'synthetic_ladder') {
    const standard = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    const nonStandard = [...new Set(weights.map((w) => w.n).filter((n) => !standard.has(n)))];
    if (nonStandard.length < (det.min_distinct_nonstandard ?? 3)) return fired([]);
    if (det.requires_system_stack) {
      const hasWebfont = /@font-face/i.test(page.cssSource);
      const systemFirst = [...declarations(page)].some((d) =>
        d.property === 'font-family' && /^\s*(?:ui-sans-serif|system-ui|-apple-system)/i.test(d.value));
      if (hasWebfont || !systemFirst) return fired([]);
    }
    return fired([hit(`${nonStandard.length} synthetic weights (${nonStandard.sort((a, b) => b - a).join(', ')}) on a system font stack — Android collapses 550-949 to 700 and 500-549 to 500`)]);
  }
  return notRun(`unknown weight_census mode: ${det.mode}`);
}

// ---------------------------------------------------------------- material kinds

function boxShadow(det, page) {
  const hits = [];
  for (const d of declarations(page)) {
    if (d.property !== 'box-shadow' || d.value === 'none') continue;
    const layers = parseShadow(d.value);
    const blurred = layers.filter((l) => !l.inset && l.blur > 0);

    if (det.mode === 'puffy') {
      const reasons = [];
      if (blurred.length >= (det.max_blurred_layers ?? 2) + 1) reasons.push(`${blurred.length} blurred non-inset layers`);
      if (blurred.length >= 2 && blurred.some((l) => (l.alpha ?? 1) > (det.multi_layer_alpha_max ?? 0.12))) {
        reasons.push(`${blurred.length} layers with peak alpha ${Math.max(...blurred.map((l) => l.alpha ?? 1)).toFixed(2)} > ${det.multi_layer_alpha_max}`);
      }
      if (blurred.length === 1 && (blurred[0].alpha ?? 1) > (det.single_layer_alpha_max ?? 0.30)) {
        reasons.push(`single layer at alpha ${blurred[0].alpha.toFixed(2)} > ${det.single_layer_alpha_max}`);
      }
      if (reasons.length) hits.push(hit(`${d.selector} { box-shadow: ${d.value.slice(0, 80)} } — ${reasons.join('; ')}`));
      continue;
    }

    if (det.mode === 'colored_glow') {
      for (const l of layers) {
        if (l.inset) continue;
        const hex = l.color && firstHex(l.color);
        const viaVar = l.color && /var\(\s*(--[\w-]+)/.exec(l.color);
        const resolved = hex || (viaVar ? resolveToken(page, viaVar[1]) : null);
        if (!resolved) continue;
        const o = toOklch(resolved);
        if (o.C < (det.chroma_min ?? 0.05)) continue;
        const zeroOffset = l.ox === 0 && l.oy === 0;
        hits.push(hit(`${d.selector} { box-shadow: ${l.raw.trim()} } — accent-tinted (chroma ${o.C.toFixed(3)})${zeroOffset ? ', and zero offset: light from nowhere' : ''}`));
      }
      continue;
    }

    if (det.mode === 'zero_blur') {
      for (const l of layers) {
        if (l.inset || l.blur > 0) continue;
        if (Math.max(Math.abs(l.ox), Math.abs(l.oy)) >= (det.min_offset ?? 2)) {
          hits.push(hit(`${d.selector} { box-shadow: ${l.raw.trim()} } — offset with no blur`));
        }
      }
      continue;
    }
  }
  return fired(dedupe(hits));
}

function gradientStops(det, page) {
  const hits = [];
  const re = /(linear|radial|conic)-gradient\(([^;]*?)\)(?=[^)]*(?:;|$)|\s|,)/gi;
  const source = page.cssSource;
  let m;
  while ((m = re.exec(source)) !== null) {
    const args = balancedArgs(source, m.index + m[1].length + '-gradient('.length - 1);
    if (args === null) continue;
    const parts = splitList(args);
    const stops = parts.filter((p) => isColorStop(p));
    if (det.mode === 'pairs') {
      const first = colorOf(parts.find(isColorStop), page);
      const last = colorOf([...parts].reverse().find(isColorStop), page);
      if (!first || !last) continue;
      const a = toOklch(first), b = toOklch(last);
      if (a.C < (det.chroma_min ?? 0.07) || b.C < (det.chroma_min ?? 0.07)) continue;
      // A gradient between two shades of ONE hue is not a two-hue cliche, even when
      // both ends land inside two overlapping bands. Require a real separation, or
      // `--accent` to `--accent-soft` reads as purple-to-blue.
      const separation = hueDistance(a.h, b.h);
      if (separation < (det.min_hue_separation ?? 25)) continue;
      for (const pair of det.banned_pairs || []) {
        const inA = inHue(a.h, pair.from_hue) && inHue(b.h, pair.to_hue);
        const inB = inHue(b.h, pair.from_hue) && inHue(a.h, pair.to_hue);
        if (inA || inB) hits.push(hit(`${pair.name}: ${first} (h ${a.h.toFixed(0)}) to ${last} (h ${b.h.toFixed(0)}), ${separation.toFixed(0)} degrees apart`));
      }
      continue;
    }
    if (stops.length > (det.max_stops ?? 2)) {
      hits.push(hit(`${m[1]}-gradient with ${stops.length} colour stops: ${stops.slice(0, 4).join(', ')}`));
    }
  }
  return fired(dedupe(hits));
}

function balancedArgs(source, openParenIndex) {
  const start = source.indexOf('(', openParenIndex);
  if (start === -1) return null;
  let depth = 0, i = start;
  for (; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') { depth--; if (depth === 0) break; }
  }
  return i < source.length ? source.slice(start + 1, i) : null;
}

const isColorStop = (p) => /^#|\brgba?\(|\bhsla?\(|\bvar\(|\bcolor-mix\(|\boklch\(|\btransparent\b|\bcurrentcolor\b|^(?:red|blue|green|black|white|gray|grey)\b/i.test(p.trim());
const inHue = (h, [lo, hi]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);

function colorOf(part, page) {
  if (!part) return null;
  const hex = firstHex(part);
  if (hex) return hex;
  const v = /var\(\s*(--[\w-]+)/.exec(part);
  if (v) return resolveToken(page, v[1]);
  return null;
}

function easingCensus(det, page) {
  const curves = new Set();
  const re = /cubic-bezier\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(page.cssSource)) !== null) curves.add(m[1].replace(/\s+/g, ''));
  if (curves.size > (det.max_distinct ?? 3)) {
    return fired([hit(`${curves.size} distinct authored easing curves: ${[...curves].slice(0, 6).join(' | ')}`)]);
  }
  return fired([]);
}

// ---------------------------------------------------------------- composite + ledger

function composite(det, page, ctx, evalOne) {
  if (det.mode === 'cluster') {
    const firing = (det.members || []).filter((id) => ctx.firedIds?.has(id));
    if (firing.length >= (det.min_members_firing ?? 5)) {
      return fired([hit(`${firing.length} of ${det.members.length} cluster members firing: ${firing.join(', ')}`)]);
    }
    return fired([]);
  }
  if (det.all) {
    const results = det.all.map((d) => evalOne(d, page, ctx));
    if (results.some((r) => r.status === 'not_run')) return notRun('a member detector could not run');
    const allFired = results.every((r) => r.status === 'fire');
    if (!allFired) return fired([]);
    let hits = results.flatMap((r) => r.hits);
    if (det.and_link_count) {
      const navs = page.elements.filter((el) => el.tag === 'nav');
      const links = navs.reduce((n, nav) => n + collect(nav, (el) => el.tag === 'a').length, 0);
      const [lo, hi] = det.and_link_count;
      if (links < lo || links > hi) return fired([]);
      hits = hits.concat(hit(`${links} nav links`));
    }
    if (det.and_font_size_min_rem) {
      const big = [...declarations(page)].some((d) => d.property === 'font-size' && (clampMax(d.value) ?? 0) >= det.and_font_size_min_rem * 16);
      if (!big) return fired([]);
    }
    if (det.none) {
      const neg = det.none.map((d) => evalOne(d, page, ctx));
      if (neg.some((r) => r.status === 'fire')) return fired([]);
    }
    return fired(hits);
  }
  if (det.any) {
    const results = det.any.map((d) => evalOne(d, page, ctx));
    const hits = results.filter((r) => r.status === 'fire').flatMap((r) => r.hits);
    return fired(hits);
  }
  if (det.none) {
    // `none` alone: requires an `all` that was empty — treat as pass
    const neg = det.none.map((d) => evalOne(d, page, ctx));
    return fired(neg.some((r) => r.status === 'fire') ? [] : [hit('none-of condition satisfied')]);
  }
  return notRun('composite with no all/any/none');
}

function ledgerDetector(det, page, ctx) {
  const lg = ctx.ledger;
  if (!lg) return notRun('no ledger loaded — pass { ledger } to the checker');

  if (det.facet === 'existence') {
    if (!lg.exists) return fired([hit(`no ledger at ${lg.file}`)]);
    if (lg.entries.length < (det.min_builds ?? 3)) return fired([]);
    return fired([]);
  }

  const self = ctx.fingerprint;
  if (!self) return notRun('no fingerprint computed for this page');
  const others = comparisonSet(lg, self.id, det.window ?? DEFAULT_WINDOW);
  if (!others.length) return fired([]);

  if (det.mode === 'exact_collision' || (!det.mode && det.facet)) {
    const key = det.facet;
    const colliding = others.filter((e) => e.facets?.[key] === self.facets[key]);
    return fired(colliding.map((e) => hit(`identical ${key} hash (${self.facets[key]}) to ${e.label || e.id}`)));
  }

  if (det.mode === 'distance') {
    const scored = others
      .map((e) => ({ e, ...fingerprintDistance(self, e, det.weights || DEFAULT_WEIGHTS) }))
      .sort((a, b) => a.distance - b.distance);
    const nearest = scored[0];
    if (nearest && nearest.distance < (det.max_distance ?? 0.15)) {
      const flat = Object.entries(nearest.parts).filter(([, v]) => v === 0).map(([k]) => k);
      return fired([hit(
        `distance ${nearest.distance.toFixed(3)} to ${nearest.e.label || nearest.e.id} (threshold ${det.max_distance}). ` +
        `Identical facets: ${flat.length ? flat.join(', ') : 'none'}. ` +
        `Per-facet: ${Object.entries(nearest.parts).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`
      )]);
    }
    return fired([]);
  }

  if (det.mode === 'distribution') {
    const dist = paletteDistribution(others.concat([{ declared: self.declared }]), ctx.paletteOptions);
    if (!dist) return notRun('no palette family declared on the ledger entries — the project must declare its option set');
    const hits = [];
    if (dist.topShare > (det.max_share ?? 0.5)) {
      hits.push(hit(`"${dist.topName}" used in ${Math.round(dist.topShare * 100)}% of the last ${dist.total} builds`));
    }
    if (dist.usedRatio < (det.min_options_used_ratio ?? 0.6)) {
      hits.push(hit(`${dist.optionsUsed} of ${dist.optionCount} declared options ever used${dist.neverUsed.length ? `; never emitted: ${dist.neverUsed.join(', ')}` : ''}`));
    }
    return fired(hits);
  }

  return notRun(`unknown ledger mode: ${det.mode}`);
}

// ---------------------------------------------------------------- dispatch

const KINDS = {
  css_decl: cssDecl,
  css_regex: cssRegex,
  css_absent: cssAbsent,
  css_cooccur: cssCooccur,
  hex_set: hexSet,
  hex_oklch_band: hexOklchBand,
  hex_relation: hexRelation,
  hex_census: hexCensus,
  box_shadow: boxShadow,
  gradient_stops: gradientStops,
  easing_census: easingCensus,
  html_regex: htmlRegex,
  html_tag: htmlTag,
  html_attr: htmlAttr,
  heading_order: headingOrder,
  dom_precedes_heading: domPrecedesHeading,
  dom_repeated_siblings: domRepeatedSiblings,
  dom_nested: domNested,
  text_lexicon: textLexicon,
  text_regex: textRegex,
  text_measure: textMeasure,
  contrast,
  font_stack: fontStack,
  weight_census: weightCensus,
  ledger: ledgerDetector
};

function evalDetector(det, page, ctx) {
  if (!det || !det.kind) return notRun('no detector');
  if (det.kind === 'browser') {
    return notRun(`needs a live render: ${det.what}. Install playwright (an optional peer dependency) to enable it. Until then this reports not_run rather than passing — a check that quietly passes what it cannot test is worse than one that admits the gap.`);
  }
  if (det.kind === 'manual') {
    return notRun(`needs a person: ${det.what}. ${det.needs || ''}`.trim());
  }
  if (det.kind === 'composite') return composite(det, page, ctx, evalDetector);
  const fn = KINDS[det.kind];
  if (!fn) return notRun(`no evaluator for detector kind "${det.kind}"`);
  try {
    return fn(det, page, ctx);
  } catch (err) {
    return notRun(`evaluator threw: ${err.message}`);
  }
}

function dedupe(hits) {
  return dedupeBy(hits, (h) => h.evidence);
}
function dedupeBy(hits, key) {
  const seen = new Set();
  return hits.filter((h) => {
    const k = key(h);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Run one rule. Returns a finding shaped for a report: what, why, who says so
 * with what confidence, and what to do — never a bare boolean.
 */
export function check(rule, page, ctx = {}) {
  // Some rules are correct in general and wrong for a particular kind of build.
  // Publishing LocalBusiness structured data is the cheapest win on a real site
  // and exactly what the mitigation set forbids on an unsolicited concept page.
  // A rule that fires on the right thing in the wrong context is a wrong finding.
  if (rule.suppress_when && ctx.project?.[rule.suppress_when]) {
    return {
      id: rule.id, status: 'suppressed', severity: 'info', hits: [], count: 0,
      note: `Not applicable: this project is declared "${rule.suppress_when}", and this rule does not apply there.`,
      title: rule.title, teach: rule.teach
    };
  }
  const expiry = applyExpiry(rule, ctx.now);
  if (expiry.suspended) {
    return { id: rule.id, status: 'suspended', severity: 'info', note: expiry.note, hits: [] };
  }
  const result = evalDetector(rule.detector, page, ctx);
  return {
    id: rule.id,
    tier: rule.tier,
    category: rule.category,
    title: rule.title,
    status: result.status,
    severity: result.status === 'fire' ? expiry.severity : 'info',
    hits: result.hits,
    count: result.hits.length,
    reason: result.reason ?? null,
    note: expiry.note,
    // the four fields that make a finding teachable rather than a score
    what_it_is: rule.what_it_is,
    why_it_matters: rule.why_it_matters,
    source: rule.source,
    also_in: rule.also_in ?? [],
    confidence_note: rule.confidence_note ?? null,
    threshold: rule.threshold,
    threshold_provenance: rule.threshold_provenance ?? null,
    fix: rule.fix,
    fix_code: rule.fix_code ?? null,
    teach: rule.teach,
    chess: rule.chess ?? null
  };
}

/**
 * Run every rule over one page, in two passes so that cluster rules can see
 * which of their members fired.
 */
export function checkAll(rules, page, ctx = {}) {
  const firstPass = [];
  const firedIds = new Set();
  const clusters = [];

  for (const rule of rules) {
    if (rule.detector?.kind === 'composite' && rule.detector.mode === 'cluster') { clusters.push(rule); continue; }
    const r = check(rule, page, ctx);
    if (r.status === 'fire') firedIds.add(rule.id);
    firstPass.push(r);
  }
  for (const rule of clusters) {
    firstPass.push(check(rule, page, { ...ctx, firedIds }));
  }
  return firstPass;
}

export { fingerprint, readLedger, evalDetector };
