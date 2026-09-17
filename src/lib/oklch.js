/**
 * OKLCH, and a forgiving reader for CSS colour tokens.
 *
 * research/08-craft.md §6.4 states every colour rule in OKLCH — "every neutral
 * carrying 0.005-0.015 chroma of the anchor hue", "accent chroma 0.12-0.22",
 * "paper oklch(96-98% 0.005-0.015 H)" — and then says, in red:
 *
 *   "Author in OKLCH, emit hex. Do not ship oklch() literals to an unknown
 *    phone — an unparseable colour drops the declaration, and on a bad in-app
 *    WebView that can mean invisible text."
 *
 * So the conversion has to live in the tool. Without it the chroma rules are
 * unenforceable and the palette builder cannot honour them.
 *
 * Transform from Björn Ottosson's published OKLab matrices,
 * https://bottosson.github.io/posts/oklab/
 */

import { parseHex, toHex } from './color.js';

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));

const srgbToLinear = (c8) => {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (c) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  return v * 255;
};

/** {r,g,b} 0-255 -> {L, a, b} OKLab. */
export function rgbToOklab({ r, g, b }) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  };
}

/** {L,a,b} OKLab -> {r,g,b} floats, possibly outside 0-255 when out of gamut. */
export function oklabToRgbRaw({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  };
}

/** A colour (hex string or {r,g,b}) -> {L, C, H}: lightness 0-1, chroma, hue 0-360. */
export function toOklch(colour) {
  const rgb = typeof colour === 'string' ? parseHex(colour) : colour;
  const { L, a, b } = rgbToOklab(rgb);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

const inGamut = ({ r, g, b }) =>
  r >= -0.5 && r <= 255.5 && g >= -0.5 && g <= 255.5 && b >= -0.5 && b <= 255.5;

/**
 * {L,C,H} -> the nearest in-gamut sRGB colour, found by walking chroma down.
 *
 * Clipping channels shifts the hue; reducing chroma does not. The returned
 * `chroma` is what was actually reached, so a palette can report that it could
 * not have what was asked for rather than silently substituting something else.
 */
export function fromOklch({ L, C, H }) {
  const rad = (H * Math.PI) / 180;
  const at = (c) => oklabToRgbRaw({ L, a: Math.cos(rad) * c, b: Math.sin(rad) * c });

  const exact = at(C);
  if (inGamut(exact)) {
    return { r: clampByte(exact.r), g: clampByte(exact.g), b: clampByte(exact.b), chroma: C, clipped: false };
  }

  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(at(mid))) lo = mid;
    else hi = mid;
  }
  const out = at(lo);
  return { r: clampByte(out.r), g: clampByte(out.g), b: clampByte(out.b), chroma: lo, clipped: true };
}

/** {L,C,H} straight to "#RRGGBB". */
export function oklchHex(lch) {
  return toHex(fromOklch(lch));
}

/** Round to 4dp — the precision the chroma rules are quoted at. */
export const roundChroma = (n) => Math.round(n * 10000) / 10000;

/** Round a hue to 1dp. */
export const roundHue = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ *
 * Reading colours out of a stylesheet
 *
 * A rule has to recognise a colour wherever it appears, not only when it was
 * written as a six-digit hex. `rgb(99 102 241)` is the same banned indigo as
 * `#6366f1`, and a detector that misses it teaches the wrong lesson.
 * ------------------------------------------------------------------ */

const NAMED = {
  black: '#000000', white: '#ffffff', red: '#ff0000', lime: '#00ff00',
  blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff',
  magenta: '#ff00ff', fuchsia: '#ff00ff', silver: '#c0c0c0', gray: '#808080',
  grey: '#808080', maroon: '#800000', olive: '#808000', green: '#008000',
  purple: '#800080', teal: '#008080', navy: '#000080', indigo: '#4b0082',
  rebeccapurple: '#663399'
};

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return { r: clampByte((r + m) * 255), g: clampByte((g + m) * 255), b: clampByte((b + m) * 255) };
}

/**
 * Read one CSS colour token.
 * @returns {{r,g,b,a,form,text}|null}
 */
export function parseColor(text) {
  if (typeof text !== 'string') return null;
  const value = text.trim();

  if (/^#[0-9a-f]{3,8}$/i.test(value)) {
    try {
      return { ...parseHex(value), form: 'hex', text: value };
    } catch {
      return null;
    }
  }

  const named = NAMED[value.toLowerCase()];
  if (named) return { ...parseHex(named), form: 'named', text: value };

  let m = /^rgba?\(([^)]*)\)$/i.exec(value);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const num = (p, scale = 255) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
    const r = num(parts[0]);
    const g = num(parts[1]);
    const b = num(parts[2]);
    if (![r, g, b].every(Number.isFinite)) return null;
    const a = parts[3] === undefined ? 1 : num(parts[3], 1);
    return {
      r: clampByte(r), g: clampByte(g), b: clampByte(b),
      a: Number.isFinite(a) ? a : 1, form: 'rgb', text: value
    };
  }

  m = /^hsla?\(([^)]*)\)$/i.exec(value);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if (![h, s, l].every(Number.isFinite)) return null;
    const rawA = parts[3];
    const a = rawA === undefined ? 1 : rawA.endsWith('%') ? parseFloat(rawA) / 100 : parseFloat(rawA);
    return { ...hslToRgb(h, s, l), a: Number.isFinite(a) ? a : 1, form: 'hsl', text: value };
  }

  m = /^oklch\(([^)]*)\)$/i.exec(value);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const L = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    const C = parseFloat(parts[1]);
    const H = parseFloat(parts[2]);
    if (![L, C, H].every(Number.isFinite)) return null;
    const rgb = fromOklch({ L, C, H });
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1, form: 'oklch', text: value };
  }

  return null;
}

const COLOR_TOKEN_RE = new RegExp(
  [
    '#[0-9a-fA-F]{3,8}\\b',
    '(?:rgba?|hsla?|oklch|oklab)\\([^)]*\\)',
    '\\b(?:black|white|silver|gray|grey|maroon|olive|navy|teal|aqua|fuchsia|purple|rebeccapurple|indigo)\\b'
  ].join('|'),
  'g'
);

/** Every colour token in a string, with its offset inside that string. */
export function findColors(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  COLOR_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = COLOR_TOKEN_RE.exec(text)) !== null) {
    const colour = parseColor(m[0]);
    if (colour) out.push({ ...colour, offset: m.index, raw: m[0] });
  }
  return out;
}

/** True when a colour is a pure neutral — r === g === b — which OKLCH reads as chroma 0. */
export function isZeroChroma(rgb) {
  return rgb.r === rgb.g && rgb.g === rgb.b;
}
