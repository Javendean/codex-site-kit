/**
 * Building a palette that cannot break the corpus rules, and checking one that
 * came from somewhere else.
 *
 * The rules, all from research/08-craft.md §6.4 unless noted:
 *
 *   paper     oklch(96-98% 0.005-0.015 H) light · oklch(12-16% 0.008-0.015 H) dark
 *   ink       oklch(16-22% …) light · oklch(92-96% …) dark
 *   neutrals  5-9 steps, EVERY one carrying 0.005-0.015 chroma of the anchor
 *             hue. "Minimum 0.005, never 0."
 *   accent    chroma 0.12-0.22, occupying no more than 3-5% of a viewport
 *   dark mode reduce accent chroma 0.02-0.04, raise accent lightness 5-10%,
 *             elevate with lightness not shadow, and NEVER shift the hue
 *             between modes
 *   gradients two stops maximum
 *   output    "Author in OKLCH, emit hex." An oklch() literal that an old
 *             in-app WebView cannot parse drops the declaration, and on a text
 *             colour that means invisible text.
 *
 * And the contrast floor is WCAG, not the practitioner advice: 4.5:1 for body
 * text. research/08-craft.md §5.6 corrects CodeStitch's 3:1 explicitly, and
 * §6.4 adds the reason to bias higher than a desktop design would — the page is
 * read on a phone, outdoors, in daylight.
 */

import { contrastRatio, roundRatio, toHex, parseHex } from './color.js';
import { toOklch, fromOklch, oklchHex, parseColor, roundChroma } from './oklch.js';

export const BANNED_HEXES = [
  // The ten Tailwind indigos, named in research/08-craft.md §4 Tier 1.
  '#6366F1', '#818CF8', '#4F46E5', '#4338CA', '#3730A3',
  '#8B5CF6', '#7C3AED', '#6D28D9', '#A78BFA', '#5B21B6',
  // The "not purple" escape that is already burned — the trap tier.
  '#10B981', '#34D399', '#059669', '#6EE7B7', '#047857'
];

const BANNED_SET = new Set(BANNED_HEXES.map((h) => h.toUpperCase()));

/** The hue band the banned indigos occupy in OKLCH, plus a margin. */
export const BANNED_ACCENT_HUES = [[258, 300]];

export const BANDS = {
  paperL: [0.96, 0.98],
  inkL: [0.16, 0.22],
  darkPaperL: [0.12, 0.16],
  darkInkL: [0.92, 0.96],
  neutralChroma: [0.005, 0.015],
  accentChroma: [0.12, 0.22]
};

const inBand = (v, [lo, hi]) => v >= lo && v <= hi;

/** Is this hue inside a band the corpus rules out for an accent? */
export function hueIsBanned(hue) {
  return BANNED_ACCENT_HUES.some(([lo, hi]) => hue >= lo && hue <= hi);
}

/** Move a hue out of the banned band by the shortest hop. */
export function nudgeHue(hue) {
  if (!hueIsBanned(hue)) return { hue, moved: false, from: hue };
  for (const [lo, hi] of BANNED_ACCENT_HUES) {
    if (hue < lo || hue > hi) continue;
    const below = lo - 6;
    const above = (hi + 6) % 360;
    const moved = hue - lo < hi - hue ? below : above;
    return { hue: (moved + 360) % 360, moved: true, from: hue };
  }
  return { hue, moved: false, from: hue };
}

/**
 * Walk lightness until a colour clears a contrast target against a ground.
 * Hue and chroma are held: the corpus rule is that lightness is the axis that
 * moves, because moving hue changes what colour the page is.
 */
export function liftToContrast(lch, ground, target, { maxSteps = 120 } = {}) {
  const groundL = toOklch(ground).L;
  const direction = groundL > 0.5 ? -1 : 1;
  let current = { ...lch };
  for (let i = 0; i <= maxSteps; i++) {
    const rgb = fromOklch(current);
    if (contrastRatio(rgb, ground) >= target) {
      return { lch: current, rgb, hex: toHex(rgb), steps: i, reached: true };
    }
    const next = current.L + direction * 0.006;
    if (next <= 0 || next >= 1) break;
    current = { ...current, L: next };
  }
  const rgb = fromOklch(current);
  return { lch: current, rgb, hex: toHex(rgb), steps: maxSteps, reached: false };
}

/**
 * Build a full two-state palette from one anchor hue.
 *
 * @param {object} o
 * @param {number} o.hue          anchor hue, 0-360, in OKLCH
 * @param {number} [o.accentHue]  accent hue; defaults to the anchor
 * @param {number} [o.accentChroma]
 * @param {string} [o.provenance] where the hue came from, carried into the output
 */
export function buildPalette({ hue, accentHue = null, accentChroma = 0.16, provenance = null }) {
  const anchor = ((hue % 360) + 360) % 360;
  const requested = accentHue == null ? anchor : ((accentHue % 360) + 360) % 360;
  const { hue: safeAccentHue, moved, from } = nudgeHue(requested);
  const chroma = Math.min(Math.max(accentChroma, BANDS.accentChroma[0]), BANDS.accentChroma[1]);

  const light = {
    paper: { L: 0.972, C: 0.009, H: anchor },
    paper_sunk: { L: 0.945, C: 0.012, H: anchor },
    // 0.985 rather than 0.99: above that the gamut cannot hold 0.005 chroma at
    // any hue, and the neutral goes colourless — which is the rule this is
    // meant to satisfy.
    paper_raised: { L: 0.985, C: 0.007, H: anchor },
    ink: { L: 0.2, C: 0.013, H: anchor },
    ink_muted: { L: 0.46, C: 0.014, H: anchor },
    hairline: { L: 0.85, C: 0.011, H: anchor },
    accent: { L: 0.52, C: chroma, H: safeAccentHue }
  };

  // Dark mode: hue never shifts, accent chroma comes down and lightness goes up.
  // Elevation in dark mode is lightness, not shadow: +3% per level, which is
  // what 0.125 / 0.155 / 0.185 is. A coloured glow on a dark card is the thing
  // this replaces.
  const dark = {
    paper: { L: 0.16, C: 0.011, H: anchor },
    paper_sunk: { L: 0.13, C: 0.011, H: anchor },
    paper_raised: { L: 0.19, C: 0.011, H: anchor },
    ink: { L: 0.94, C: 0.009, H: anchor },
    ink_muted: { L: 0.72, C: 0.012, H: anchor },
    hairline: { L: 0.33, C: 0.012, H: anchor },
    accent: { L: Math.min(0.62, 0.52 + 0.08), C: Math.max(BANDS.accentChroma[0], chroma - 0.03), H: safeAccentHue }
  };

  const notes = [];
  const gamutLimited = [];
  if (moved) {
    notes.push(
      `The requested accent hue (${Math.round(from)}°) sits in the indigo band that research/08-craft.md bans outright, so it was moved to ${Math.round(safeAccentHue)}°. Ten exact Tailwind hexes in that band are the most-counted AI signature there is.`
    );
  }

  const resolve = (set, groundKey, mode) => {
    const ground = fromOklch(set[groundKey]);
    const out = {};
    for (const [key, lch] of Object.entries(set)) {
      if (key === groundKey) {
        out[key] = { hex: oklchHex(lch), lch, adjusted: false };
        continue;
      }
      // Body-text tokens must clear AA against the ground; surfaces need not.
      const target = key === 'ink' ? 10 : key === 'ink_muted' || key === 'accent' ? 4.5 : null;
      if (target == null) {
        out[key] = { hex: oklchHex(lch), lch, adjusted: false };
        continue;
      }
      const lifted = liftToContrast(lch, ground, target);
      const adjusted = Math.abs(lifted.lch.L - lch.L) > 0.001;
      if (adjusted) {
        notes.push(
          `\`${key}\` was moved from lightness ${lch.L.toFixed(3)} to ${lifted.lch.L.toFixed(3)} so it clears ${target}:1 against the ground. Hue and chroma were held — lightness is the axis that moves.`
        );
      }
      if (!lifted.reached) {
        notes.push(`\`${key}\` could not reach ${target}:1 against this ground even at the end of its range. Reported as-is rather than substituted.`);
      }
      // sRGB cannot hold every chroma at every lightness. When the lift costs
      // the accent its colour, that is a gamut fact, not a mistake — so it is
      // reported as a note and the audit is told not to call it a failure.
      if (key === 'accent') {
        const reached = toOklch(fromOklch(lifted.lch)).C;
        if (reached < BANDS.accentChroma[0]) {
          gamutLimited.push(`${mode}.accent`);
          notes.push(
            `At hue ${Math.round(safeAccentHue)}°, sRGB cannot give an accent both ${BANDS.accentChroma[0]} chroma and 4.5:1 against this ground: the most it holds is ${roundChroma(reached)}. The colour is reported as it is. Contrast was kept and saturation was given up, which is the right trade — but if you want a louder accent, this hue is not the one, and moving it toward red or blue will buy you chroma.`
          );
        }
      }
      out[key] = { hex: lifted.hex, lch: lifted.lch, adjusted };
    }
    // Text sitting ON the accent: try both ends, take whichever is further away.
    const accentRgb = parseHex(out.accent.hex);
    const onLight = { L: 0.985, C: 0.006, H: set.accent.H };
    const onDark = { L: 0.16, C: 0.012, H: set.accent.H };
    const contenders = [onLight, onDark].map((lch) => ({ lch, rgb: fromOklch(lch) }));
    const best = contenders.sort((a, b) => contrastRatio(b.rgb, accentRgb) - contrastRatio(a.rgb, accentRgb))[0];
    const lifted = liftToContrast(best.lch, accentRgb, 4.5);
    out.on_accent = { hex: lifted.hex, lch: lifted.lch, adjusted: lifted.steps > 0 };
    if (!lifted.reached) {
      notes.push(
        'No text colour clears 4.5:1 against this accent, so the accent is not usable as a button fill. Use it as a hairline, an underline or a small mark instead, and give the button the ink colour.'
      );
    }
    return out;
  };

  const lightTokens = resolve(light, 'paper', 'light');
  const darkTokens = resolve(dark, 'paper', 'dark');

  const palette = {
    anchor_hue: Math.round(anchor * 10) / 10,
    accent_hue: Math.round(safeAccentHue * 10) / 10,
    provenance,
    light: Object.fromEntries(Object.entries(lightTokens).map(([k, v]) => [k, v.hex])),
    dark: Object.fromEntries(Object.entries(darkTokens).map(([k, v]) => [k, v.hex])),
    gamut_limited: gamutLimited,
    notes
  };

  palette.audit = auditPalette(palette);
  palette.contrast = contrastPairs(palette);
  return palette;
}

/**
 * Check a palette against the corpus colour rules.
 * Returns a list of problems, each with the measurement that produced it.
 */
export function auditPalette(palette) {
  const problems = [];
  const gamutLimited = new Set(palette.gamut_limited ?? []);
  for (const mode of ['light', 'dark']) {
    const tokens = palette[mode];
    if (!tokens) continue;
    for (const [name, hex] of Object.entries(tokens)) {
      const upper = String(hex).toUpperCase();
      if (BANNED_SET.has(upper)) {
        problems.push({
          token: `${mode}.${name}`,
          hex: upper,
          problem: 'is one of the banned hexes',
          measured: `${upper} appears on the Tailwind default list that Gesso, Krebs and Hallmark all flag`
        });
        continue;
      }
      const rgb = parseColor(hex);
      if (!rgb) continue;
      if ((rgb.r === 0 && rgb.g === 0 && rgb.b === 0) || (rgb.r === 255 && rgb.g === 255 && rgb.b === 255)) {
        problems.push({
          token: `${mode}.${name}`,
          hex: upper,
          problem: 'is pure black or pure white',
          measured: 'no real surface is either; every neutral should carry a trace of the anchor hue'
        });
        continue;
      }
      const lch = toOklch(rgb);
      const isNeutral = !/accent/.test(name);
      if (isNeutral && lch.C < BANDS.neutralChroma[0]) {
        problems.push({
          token: `${mode}.${name}`,
          hex: upper,
          problem: 'is a neutral with no colour in it',
          measured: `chroma ${roundChroma(lch.C)} — the floor is ${BANDS.neutralChroma[0]}, the band is ${BANDS.neutralChroma[0]}-${BANDS.neutralChroma[1]}`
        });
      }
      if (isNeutral && lch.C > BANDS.neutralChroma[1] * 1.6) {
        problems.push({
          token: `${mode}.${name}`,
          hex: upper,
          problem: 'is a neutral carrying too much colour',
          measured: `chroma ${roundChroma(lch.C)} — the band is ${BANDS.neutralChroma[0]}-${BANDS.neutralChroma[1]}; above it the neutral stops reading as neutral`
        });
      }
      if (name === 'accent' && gamutLimited.has(`${mode}.${name}`)) continue;
      if (name === 'accent' && !inBand(lch.C, BANDS.accentChroma)) {
        problems.push({
          token: `${mode}.${name}`,
          hex: upper,
          problem: lch.C < BANDS.accentChroma[0] ? 'is an accent with too little colour to read as one' : 'is an accent loud enough to fight the content',
          measured: `chroma ${roundChroma(lch.C)} — the band is ${BANDS.accentChroma[0]}-${BANDS.accentChroma[1]}`
        });
      }
    }
  }

  // The hue must not move between modes.
  if (palette.light?.accent && palette.dark?.accent) {
    const l = toOklch(palette.light.accent).H;
    const d = toOklch(palette.dark.accent).H;
    const gap = Math.min(Math.abs(l - d), 360 - Math.abs(l - d));
    if (gap > 8) {
      problems.push({
        token: 'accent',
        hex: `${palette.light.accent} / ${palette.dark.accent}`,
        problem: 'shifts hue between light and dark',
        measured: `${Math.round(l)}° light against ${Math.round(d)}° dark — a ${Math.round(gap)}° move; the rule is never shift the hue between modes`
      });
    }
  }

  return problems;
}

/** The pairs a page actually puts together, each with its ratio and verdict. */
export function contrastPairs(palette) {
  const rows = [];
  for (const mode of ['light', 'dark']) {
    const t = palette[mode];
    if (!t) continue;
    const pairs = [
      ['ink', 'paper', 4.5, 'body text on the page', null],
      ['ink_muted', 'paper', 4.5, 'secondary text on the page', null],
      ['ink', 'paper_sunk', 4.5, 'body text on an inset panel', null],
      ['ink', 'paper_raised', 4.5, 'body text on a raised card', null],
      ['accent', 'paper', 4.5, 'a link or accent text on the page', null],
      ['on_accent', 'accent', 4.5, 'a button label on the accent', null],
      [
        'hairline',
        'paper',
        1.4,
        'a rule or border against the page',
        'A decorative hairline has no WCAG minimum. If a border is the ONLY thing that marks a control — an input with no fill and no label box — then it is a user-interface component and needs 3:1.'
      ]
    ];
    for (const [fg, bg, target, use, note] of pairs) {
      if (!t[fg] || !t[bg]) continue;
      const ratio = contrastRatio(t[fg], t[bg]);
      rows.push({
        mode,
        pair: `${fg} on ${bg}`,
        use,
        note: note ?? null,
        foreground: t[fg],
        background: t[bg],
        ratio: roundRatio(ratio),
        needs: target,
        passes: ratio >= target
      });
    }
  }
  return rows;
}

/** Emit the CSS for a palette in the three-state pattern the storefront uses. */
export function paletteCss(palette, { indent = '  ' } = {}) {
  const line = (k, v) => `${indent}--${k.replace(/_/g, '-')}: ${v};`;
  const light = Object.entries(palette.light).map(([k, v]) => line(k, v)).join('\n');
  const dark = Object.entries(palette.dark).map(([k, v]) => line(k, v)).join('\n');
  return [
    '/* The complete light palette lives on bare :root, so it exists in the',
    '   default state — which is the state most visitors are in. */',
    ':root {',
    light,
    '}',
    '',
    '/* Dark, for a machine set to dark — unless the visitor chose light here. */',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    dark.split('\n').map((l) => '  ' + l).join('\n'),
    '  }',
    '}',
    '',
    '/* Dark, chosen explicitly. Both blocks, so the toggle wins in both directions. */',
    ':root[data-theme="dark"] {',
    dark,
    '}'
  ].join('\n');
}
