/**
 * OKLCH, and the colour vocabulary the rulebook needs.
 *
 * Several rules cannot be written in hex. You cannot ask "is this the same purple,
 * spelled differently" without a perceptual space, and you cannot ask "does this
 * grey carry any hue at all" without a chroma axis. The corpus states those
 * thresholds in OKLCH, so the rulebook measures in OKLCH.
 *
 * Conversion is Bjorn Ottosson's Oklab (2020), used unchanged.
 */

import { parseHex } from './html-scan.js';

const toLinear = (c8) => {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** "#rrggbb" -> { L, C, h } with L in 0..1, C typically 0..0.4, h in degrees. */
export function toOklch(hex) {
  const { r, g, b } = parseHex(hex);
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);

  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;

  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;

  return { L, C, h, a, b: bb };
}

/** Shortest angular distance between two hues, 0..180. */
export function hueDistance(h1, h2) {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/** Perceptual distance in Oklab. ~0.02 is "the same colour, nudged". */
export function oklabDistance(hexA, hexB) {
  const A = toOklch(hexA), B = toOklch(hexB);
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
}

/** Is this value a neutral rather than a colour? The corpus's band is chroma < 0.04. */
export function isNeutral(hex, chromaMax = 0.04) {
  return toOklch(hex).C < chromaMax;
}

const HEX_IN_TEXT = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

/**
 * Every hex literal in a blob of CSS or HTML, with its offset and a normalised
 * 6-digit lowercase form. Duplicates are kept: the count is the point — the
 * reference-tier audit in research/11 §7 is a frequency census, not a set.
 */
export function hexLiterals(source) {
  const out = [];
  let m;
  HEX_IN_TEXT.lastIndex = 0;
  while ((m = HEX_IN_TEXT.exec(source)) !== null) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    out.push({ raw: m[0], hex: '#' + h, offset: m.index });
  }
  return out;
}

/**
 * Group hex values that are perceptually the same colour.
 *
 * Needed because a five-step off-white ramp is ONE decision, not five, and
 * C-HEX-CENSUS must not punish the layered-off-whites pattern that research/11
 * §7 explicitly recommends.
 */
export function groupPerceptually(hexes, threshold = 0.04) {
  const groups = [];
  for (const hex of hexes) {
    const hit = groups.find((g) => oklabDistance(g.representative, hex) < threshold);
    if (hit) {
      hit.members.add(hex);
      hit.count += 1;
    } else {
      groups.push({ representative: hex, members: new Set([hex]), count: 1 });
    }
  }
  return groups.sort((a, b) => b.count - a.count);
}
