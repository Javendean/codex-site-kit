/**
 * palette_from_subject — a considered palette when there is no photograph yet.
 *
 * This tool exists under protest, and says so in its own output.
 *
 * research/08-craft.md §4's constructive inverse is unambiguous about where a
 * colour should come from:
 *
 *   "Instead of picking an accent from a palette — DERIVE IT FROM SOMETHING
 *    REAL: the awning, the van, the sign, the tile. It is simultaneously the
 *    anti-slop fix and the most persuasive thing on the page, because it proves
 *    you looked at his actual business."
 *
 * A hue computed from the letters of a subject line is not that. It is a
 * better-behaved version of picking from a palette file, and the honest move is
 * to label it as one. So this tool does two things a generator usually does not:
 *
 *   1. Where the subject names a real object with a real colour, it says which
 *      object the hue came from, so the choice is checkable rather than
 *      arbitrary. "Boxwood" is a claim; a hash is not.
 *   2. Where it cannot, it says the hue came from a hash, in those words, and
 *      names palette_from_image as the stronger move.
 *
 * Everything it returns is built by ../lib/palette_rules.js, which cannot emit
 * a banned indigo, cannot emit a zero-chroma neutral, cannot emit pure black or
 * white, and will not return a pair that fails WCAG without saying so.
 */

import { z } from 'zod';

import { STATUS, failure, guard, table, toolResult } from '../lib/report.js';
import { buildPalette, paletteCss, BANNED_HEXES } from '../lib/palette_rules.js';
import { readLedger } from '../../rules/ledger.js';
import { seedFrom, spreadHue } from '../lib/variety.js';
import { commonOutput } from './common.js';

const TOOL = 'palette_from_subject';

/**
 * Subjects whose hue can be traced to a physical object.
 *
 * Deliberately short. A long lexicon would be the palette file this tool exists
 * to avoid — the value here is not coverage, it is that each entry names a
 * thing you could go and look at.
 */
const ANCHORS = [
  { match: /\bchess|board|endgame|opening|gambit|rook|pawn\b/i, hue: 38, object: 'boxwood — the light squares of a tournament board, and the lighter of the two woods every set is made from' },
  { match: /\bpiano|violin|cello|orchestra|conservator|music\b/i, hue: 28, object: 'rosewood and French polish — the finish on a piano lid' },
  { match: /\bbakery|bread|patisserie|cafe|coffee|roast\b/i, hue: 55, object: 'crust — the colour bread goes at the edge of the loaf' },
  { match: /\bgarden|land ?scap|florist|nursery|plant|tree\b/i, hue: 135, object: 'leaf in shade, not leaf in sun — the darker green that reads as green without glowing' },
  { match: /\bplumb|heating|boiler|hvac|pipe\b/i, hue: 225, object: 'galvanised steel under a work light' },
  { match: /\belectric|wiring|solar\b/i, hue: 75, object: 'the yellow of a trade jacket, which is a safety colour rather than a brand one' },
  { match: /\blaw|attorney|solicitor|barrister|legal|advocate\b/i, hue: 250, object: 'ink on a deed — the blue-black of a fountain pen rather than the blue of a logo' },
  { match: /\btax|account|bookkeep|payroll|audit\b/i, hue: 200, object: 'ledger blue — the ruling on an accounts book' },
  { match: /\bbarber|salon|hair|nail|beauty\b/i, hue: 15, object: 'the red of a barber pole, taken down to something a wall could be painted' },
  { match: /\bauto|mechanic|garage|tyre|tire|body ?shop\b/i, hue: 20, object: 'oxide primer — the colour a panel is before it is painted' },
  { match: /\bphoto|film|studio|gallery|art\b/i, hue: 45, object: 'darkroom safelight on paper' },
  { match: /\bschool|tutor|teach|academy|class|lesson|student\b/i, hue: 30, object: 'kraft paper and a pencil line — the surface work actually gets done on' },
  { match: /\bdentist|dental|clinic|medical|doctor|physio\b/i, hue: 190, object: 'clean linen under daylight, which is cool rather than white' },
  { match: /\bbuild|construct|carpent|joiner|roof\b/i, hue: 50, object: 'sawn pine, end grain' }
];

export const name = TOOL;

export const config = {
  title: 'Derive a palette from a subject, when there is no photograph yet',
  description: [
    'Builds a complete two-state palette from one anchor hue, in OKLCH, and emits hex.',
    '',
    'It cannot return one of the ten banned Tailwind indigos or the emerald that replaced them,',
    'cannot return pure black or pure white, holds every neutral at 0.005-0.015 chroma of the',
    'anchor hue so the greys belong to the same page as the accent, never shifts the hue between',
    'light and dark, and returns a WCAG contrast matrix for every pair a page actually puts',
    'together — so an unreadable pair cannot be chosen by accident.',
    '',
    'It also tells you where the hue came from. If the subject names something real, it names',
    'the object. If it does not, it says the hue came from a hash of the words — which is not',
    'the same thing, and palette_from_image on a photograph is the stronger move.'
  ].join('\n'),
  inputSchema: {
    subject: z.string().min(2).describe('What the site is about, in a few words. For example: "chess lessons, Brooklyn".'),
    hue: z.number().min(0).max(360).optional().describe('Force an anchor hue in OKLCH degrees, 0-360, if you already know the colour you want.'),
    accent_chroma: z.number().min(0.05).max(0.25).optional().describe('How loud the accent is. The corpus band is 0.12-0.22; the default is 0.16.')
  },
  outputSchema: {
    ...commonOutput,
    subject: z.string().optional(),
    anchor_hue: z.number().optional(),
    accent_hue: z.number().optional(),
    hue_source: z.string().optional(),
    derived_from_something_real: z.boolean().optional(),
    light: z.record(z.string(), z.string()).optional(),
    dark: z.record(z.string(), z.string()).optional(),
    css: z.string().optional(),
    contrast: z
      .array(
        z.object({
          mode: z.string(),
          pair: z.string(),
          use: z.string(),
          note: z.string().nullable(),
          foreground: z.string(),
          background: z.string(),
          ratio: z.number(),
          needs: z.number(),
          passes: z.boolean()
        })
      )
      .optional(),
    audit: z.array(z.object({ token: z.string(), hex: z.string(), problem: z.string(), measured: z.string() })).optional(),
    notes: z.array(z.string()).optional()
  },
  // Reads the variety ledger, writes nothing. The ledger is written by
  // init_site, which is the tool that actually emits a site.
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async (args) => {
  const subject = String(args.subject ?? '').trim();
  if (subject.length < 2) {
    return failure({
      tool: TOOL,
      code: 'NO_SUBJECT',
      problem: 'No subject was given.',
      why: 'The hue is derived from what the site is about, so it needs to know.',
      fix: ['Pass subject: a few words, for example "chess lessons, Brooklyn".']
    });
  }

  // The rulebook's own ledger: what hues the last builds actually used.
  const ledger = readLedger();
  const usedHues = [...ledger.entries]
    .reverse()
    .map((e) => Number(e?.declared?.hue))
    .filter(Number.isFinite);

  let hue;
  let hueSource;
  let real;

  if (typeof args.hue === 'number') {
    hue = args.hue;
    hueSource = `you supplied ${Math.round(hue)}°`;
    real = true;
  } else {
    const anchor = ANCHORS.find((a) => a.match.test(subject));
    if (anchor) {
      hue = anchor.hue;
      hueSource = anchor.object;
      real = true;
    } else {
      // No physical referent. Spread the hash across the circle, then push it
      // away from anything used recently so two subjects do not collide.
      const base = seedFrom(subject.toLowerCase()) % 360;
      hue = spreadHue(base, usedHues);
      hueSource = `a hash of the words "${subject}" — which is NOT deriving the colour from anything real`;
      real = false;
    }
  }

  const palette = buildPalette({
    hue,
    accentChroma: args.accent_chroma ?? 0.16,
    provenance: hueSource
  });


  const failing = palette.contrast.filter((c) => !c.passes);

  const sections = [
    {
      title: 'Where the hue came from:',
      body: real
        ? `  ${Math.round(palette.anchor_hue)}° in OKLCH — ${hueSource}.\n\n  That is a claim you can check by looking at the thing. It is also the only\n  part of a palette that makes it belong to this subject rather than to any\n  subject, which is why the corpus insists on it.`
        : `  ${Math.round(palette.anchor_hue)}° in OKLCH — ${hueSource}.\n\n  Said plainly so it is not mistaken for something better: this hue is stable\n  and it is not arbitrary in the sense of changing between runs, but it does\n  not come from your subject. It comes from its spelling. The stronger move,\n  and it takes about two minutes, is to photograph one real thing — a board,\n  a room, a door — and run palette_from_image on it. research/08-craft.md:\n  deriving the colour from something real "is simultaneously the anti-slop fix\n  and the most persuasive thing on the page, because it proves you looked".`
    },
    {
      title: 'The palette, light:',
      body: Object.entries(palette.light)
        .map(([k, v]) => `    ${k.padEnd(14)} ${v}`)
        .join('\n')
    },
    {
      title: 'The palette, dark — same hue, never a different one:',
      body: Object.entries(palette.dark)
        .map(([k, v]) => `    ${k.padEnd(14)} ${v}`)
        .join('\n')
    },
    {
      title: 'Every pair a page actually puts together, measured:',
      body: table(
        [
          { key: 'mode', label: 'MODE', max: 6 },
          { key: 'pair', label: 'PAIR', max: 24 },
          { key: 'use', label: 'WHERE IT LANDS', max: 32 },
          { key: 'ratio', label: 'RATIO', align: 'right', max: 7 },
          { key: 'verdict', label: 'VERDICT', max: 18 }
        ],
        palette.contrast.map((c) => ({
          mode: c.mode,
          pair: c.pair,
          use: c.use,
          ratio: `${c.ratio}:1`,
          verdict: c.passes ? `pass (needs ${c.needs})` : `FAILS ${c.needs}:1`
        }))
      )
    },
    {
      title: 'The CSS, in the three-state theme pattern:',
      body: paletteCss(palette)
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')
    }
  ];

  const notes = [
    ...palette.notes,
    `Checked against ${BANNED_HEXES.length} banned hexes — the ten Tailwind indigos and the five emeralds that replaced them. None is in this palette.`,
    'The accent should occupy no more than 3-5% of a viewport. It is the loudest thing on the page and it stops working the moment there is a lot of it.',
    'Emitted as hex rather than oklch() on purpose: an oklch() literal an old in-app WebView cannot parse drops the declaration, and on a text colour that means invisible text.'
  ];

  if (palette.audit.length > 0) {
    sections.push({
      title: 'Where this palette sits outside its own rules:',
      body: palette.audit.map((a) => `  ${a.token.padEnd(18)} ${a.hex}  ${a.problem}\n      ${a.measured}`).join('\n')
    });
  }

  sections.push({ title: 'Notes:', body: notes.map((nte) => `  · ${nte}`).join('\n\n') });

  return toolResult({
    tool: TOOL,
    status: failing.length === 0 && palette.audit.length === 0 ? STATUS.PASS : STATUS.FAIL,
    headline:
      failing.length === 0 && palette.audit.length === 0
        ? `A palette anchored at ${Math.round(palette.anchor_hue)}°${real ? ` (${hueSource.split('—')[0].trim()})` : ' from a hash, which is weaker than a photograph'}. Every pair clears WCAG AA.`
        : `A palette anchored at ${Math.round(palette.anchor_hue)}°, with ${failing.length} unreadable ${failing.length === 1 ? 'pair' : 'pairs'} and ${palette.audit.length} token${palette.audit.length === 1 ? '' : 's'} outside the colour bands.`,
    sections,
    nextSteps: real
      ? [
          'Paste the CSS above into your stylesheet. It is already in the three-state pattern, so a visitor who chooses light on a dark machine gets light.',
          'Pass these colours to init_site, or run review_site afterwards to check what the page does with them.'
        ]
      : [
          'Photograph one real thing connected to the subject and run palette_from_image on it. That is the version of this that proves you looked.',
          'Until then the CSS above is usable and honest: it is a considered palette that is not derived from your subject, and nothing in it is a Tailwind default.'
        ],
    data: {
      subject,
      anchor_hue: palette.anchor_hue,
      accent_hue: palette.accent_hue,
      hue_source: hueSource,
      derived_from_something_real: real,
      light: palette.light,
      dark: palette.dark,
      css: paletteCss(palette),
      contrast: palette.contrast,
      audit: palette.audit,
      notes
    }
  });
});

