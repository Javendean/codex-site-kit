/**
 * Turn a handful of swatches into a token set that is guaranteed readable.
 *
 * The rule the reference storefront encodes: the page's ground and ink are the
 * subject's own colours, measured, not a generic grey ramp. So this module
 * takes swatches that came out of a photograph and shapes them into tokens —
 * and where a swatch cannot carry text at AA, it says so and says by how much
 * it was moved, rather than quietly substituting black.
 */

import {
  contrastRatio,
  ensureContrast,
  lightness,
  mix,
  parseHex,
  relativeLuminance,
  roundRatio,
  saturation,
  toHex
} from './color.js';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

/** Targets. Body text clears AA comfortably; the primary pair is held far above it. */
export const TARGETS = {
  body: 4.5,
  primary: 10,
  accent: 4.5,
  large: 3
};

/**
 * The palette used when no source image was supplied.
 *
 * It is deliberately plain and it is deliberately labelled provisional
 * everywhere it surfaces. Inventing a colour scheme from the letters of a
 * subject line would be exactly the generic ramp this tool exists to avoid.
 */
export const PROVISIONAL = {
  provisional: true,
  light: { ground: '#F7F6F3', ink: '#1A1A18', accent: '#3A5A78' },
  dark: { ground: '#141414', ink: '#EDEBE6', accent: '#8FB4D4' }
};

function pickGround(swatches) {
  const light = swatches.filter((s) => lightness(s) > 78).sort((a, b) => b.population - a.population);
  if (light.length) return light[0];
  const lightest = [...swatches].sort((a, b) => lightness(b) - lightness(a))[0];
  // Lift the lightest colour the subject actually contains, rather than using white.
  return mix(lightest, WHITE, 0.82);
}

function pickInk(swatches, ground) {
  const dark = swatches
    .filter((s) => lightness(s) < 45)
    .sort((a, b) => b.population - a.population);
  const base = dark.length ? dark[0] : [...swatches].sort((a, b) => lightness(a) - lightness(b))[0];
  return ensureContrast(base, ground, TARGETS.primary);
}

function pickAccent(swatches, ground, ink) {
  const candidates = swatches
    .filter((s) => saturation(s) > 0.22)
    .filter((s) => contrastRatio(s, ground) > 1.6)
    .sort((a, b) => saturation(b) * b.population - saturation(a) * a.population);
  const base = candidates[0] ?? mix(ink, ground, 0.35);
  return ensureContrast(base, ground, TARGETS.accent);
}

/**
 * The colour of text sitting ON the accent.
 *
 * Do not assume white. A pale accent takes dark text, and getting this wrong
 * produces the one pair on a page that is genuinely unreadable — a button
 * label. Try both ends, take whichever is further from the accent, then push
 * it the rest of the way if it still falls short.
 */
function pickOnAccent(accent, ink, ground) {
  const candidates = [WHITE, BLACK, ink, ground];
  let best = candidates[0];
  let bestRatio = 0;
  for (const c of candidates) {
    const ratio = contrastRatio(c, accent);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  return ensureContrast(best, accent, TARGETS.body);
}

function tokensFor(ground, ink, accent, { dark }) {
  const inkMuted = ensureContrast(mix(ink, ground, 0.42), ground, TARGETS.body);
  const onAccent = pickOnAccent(accent, ink, ground);

  // Sunk recedes and raised advances, in both states. In a dark theme that
  // means sunk goes further toward black and raised lifts toward white, which
  // is the opposite direction from the light theme.
  const sunk = dark ? mix(ground, BLACK, 0.45) : mix(ground, ink, 0.05);
  const raised = dark ? mix(ground, WHITE, 0.08) : mix(ground, WHITE, 0.55);

  return {
    ground: toHex(ground),
    ground_sunk: toHex(sunk),
    ground_raised: toHex(raised),
    ink: toHex(ink),
    ink_muted: toHex(inkMuted),
    hairline: toHex(mix(ink, ground, dark ? 0.76 : 0.82)),
    accent: toHex(accent),
    on_accent: toHex(onAccent),
    focus: toHex(accent)
  };
}

/**
 * Build both theme states from a list of swatches.
 *
 * @param {Array<{r,g,b,population?:number}>} swatches
 * @param {{source?: string|null}} opts
 * @returns {{light: object, dark: object, contrast: object[], adjustments: object[], provisional: boolean, source: string|null}}
 */
export function derivePalette(swatches, { source = null } = {}) {
  if (!Array.isArray(swatches) || swatches.length === 0) {
    return fromExplicit(PROVISIONAL.light, PROVISIONAL.dark, { source: null, provisional: true });
  }

  const pool = swatches.map((s) => ({ ...s, population: s.population ?? 1 }));

  const lightGround = pickGround(pool);
  const lightInk = pickInk(pool, lightGround);
  const lightAccent = pickAccent(pool, lightGround, lightInk);

  // Dark state: take the subject's own darkest colour down to a working ground,
  // then lift the subject's lightest colour to sit on it.
  const darkestSwatch = [...pool].sort((a, b) => lightness(a) - lightness(b))[0];
  const darkGround = lightness(darkestSwatch) < 22 ? darkestSwatch : mix(darkestSwatch, BLACK, 0.72);
  const lightestSwatch = [...pool].sort((a, b) => lightness(b) - lightness(a))[0];
  const darkInk = ensureContrast(mix(lightestSwatch, WHITE, 0.25), darkGround, TARGETS.primary);
  const darkAccent = ensureContrast(lightAccent, darkGround, TARGETS.accent);

  const light = tokensFor(lightGround, lightInk, lightAccent, { dark: false });
  const dark = tokensFor(darkGround, darkInk, darkAccent, { dark: true });

  const adjustments = [];
  if (lightInk.adjusted) {
    adjustments.push({
      token: '--ink',
      state: 'light',
      from: toHex(pool.find((p) => lightness(p) < 45) ?? darkestSwatch),
      to: light.ink,
      reason: `moved to reach ${TARGETS.primary}:1 against the page ground`
    });
  }
  if (lightAccent.adjusted) {
    adjustments.push({
      token: '--accent',
      state: 'light',
      to: light.accent,
      reason: `moved to reach ${TARGETS.accent}:1 against the page ground`
    });
  }
  if (darkAccent.adjusted) {
    adjustments.push({
      token: '--accent',
      state: 'dark',
      to: dark.accent,
      reason: `moved to reach ${TARGETS.accent}:1 against the dark ground`
    });
  }

  return {
    light,
    dark,
    contrast: contrastReport(light, dark),
    adjustments,
    provisional: false,
    source
  };
}

/** Build the same structure from colours a caller chose by hand. */
export function fromExplicit(lightSeed, darkSeed, { source = null, provisional = false } = {}) {
  const lg = parseHex(lightSeed.ground);
  const li = ensureContrast(parseHex(lightSeed.ink), lg, TARGETS.primary);
  const la = ensureContrast(parseHex(lightSeed.accent), lg, TARGETS.accent);

  const dg = parseHex(darkSeed.ground);
  const di = ensureContrast(parseHex(darkSeed.ink), dg, TARGETS.primary);
  const da = ensureContrast(parseHex(darkSeed.accent), dg, TARGETS.accent);

  const light = tokensFor(lg, li, la, { dark: false });
  const dark = tokensFor(dg, di, da, { dark: true });

  return {
    light,
    dark,
    contrast: contrastReport(light, dark),
    adjustments: [],
    provisional,
    source
  };
}

/** The pairs that actually carry text, measured. */
export function contrastReport(light, dark) {
  const pairs = [
    ['--ink on --ground', 'light', light.ink, light.ground, TARGETS.primary],
    ['--ink-muted on --ground', 'light', light.ink_muted, light.ground, TARGETS.body],
    ['--ink on --ground-sunk', 'light', light.ink, light.ground_sunk, TARGETS.body],
    ['--accent on --ground', 'light', light.accent, light.ground, TARGETS.accent],
    ['--on-accent on --accent', 'light', light.on_accent, light.accent, TARGETS.body],
    ['--ink on --ground', 'dark', dark.ink, dark.ground, TARGETS.primary],
    ['--ink-muted on --ground', 'dark', dark.ink_muted, dark.ground, TARGETS.body],
    ['--ink on --ground-sunk', 'dark', dark.ink, dark.ground_sunk, TARGETS.body],
    ['--accent on --ground', 'dark', dark.accent, dark.ground, TARGETS.accent],
    ['--on-accent on --accent', 'dark', dark.on_accent, dark.accent, TARGETS.body]
  ];

  return pairs.map(([pair, state, fg, bg, target]) => {
    const ratio = contrastRatio(fg, bg);
    return {
      pair,
      state,
      foreground: fg,
      background: bg,
      ratio: roundRatio(ratio),
      target,
      passes: ratio >= target,
      aa_normal: ratio >= 4.5,
      aa_large: ratio >= 3
    };
  });
}

/**
 * Full NxN WCAG matrix for a list of swatches. Returned by palette_from_image
 * so the caller physically cannot pick an unreadable pair without seeing the
 * number that says so.
 */
export function contrastMatrix(hexes) {
  return hexes.map((a) => ({
    colour: a,
    luminance: Math.round(relativeLuminance(parseHex(a)) * 10000) / 10000,
    against: hexes.map((b) => {
      const ratio = contrastRatio(a, b);
      return {
        colour: b,
        ratio: roundRatio(ratio),
        aa_normal: ratio >= 4.5,
        aa_large: ratio >= 3,
        aaa_normal: ratio >= 7
      };
    })
  }));
}
