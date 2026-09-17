/**
 * init_site — scaffold a site that passes the rulebook, and that is not the
 * same shape as the last one.
 *
 * The second half is the hard part and is the reason this tool exists in this
 * form. research/08-craft.md's deepest finding is not about any page:
 *
 *   "The deepest tell is not on any single page. It is that every site you ship
 *    shares a skeleton… Variety must be enforced by a LEDGER that records what
 *    was emitted last, not merely enabled by having options."
 *
 * The same file records the authors of an anti-slop tool measuring their own
 * tool emitting one macrostructure with twenty-one themes available. So this
 * does not choose freely. It reads a local ledger and is forbidden from
 * repeating the structural axes — inventory, hero, type, surface — and it
 * writes back what it chose. Two consecutive scaffolds differ structurally,
 * not merely in their words. The test suite asserts exactly that.
 *
 * And it writes a NOTES.md next to the page saying which axis each choice came
 * from and why, because a scaffold nobody understands is a template.
 */

import path from 'node:path';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { z } from 'zod';

import { STATUS, failure, guard, table, toolResult } from '../lib/report.js';
import { buildPalette } from '../lib/palette_rules.js';
import { composeSite, AXES, INVENTORIES, TYPE_PAIRINGS, SURFACES } from '../lib/compose.js';
import { readLedger, appendLedger, usedOn, chooseDistinct, seedFrom, fingerprint } from '../lib/ledger.js';
import { commonOutput } from './common.js';

const TOOL = 'init_site';

export const name = TOOL;

export const config = {
  title: 'Scaffold a site that passes the rulebook',
  description: [
    'Write index.html, styles.css and NOTES.md into a folder.',
    '',
    'The page is built to come back clean from review_site: three theme states, neutrals that',
    'carry a trace of the anchor hue, press feedback with a hover guard, 48px touch targets,',
    '16px inputs, minmax(0, 1fr) grid tracks, overflow-x: clip, no animation above the fold,',
    'no eyebrow, no emoji icons, no side stripes, no backdrop blur.',
    '',
    'The structure is chosen from a local ledger of what was scaffolded last, so two',
    'consecutive sites differ in their SECTIONS, not only in their colours. That is the axis',
    'the research ranks highest and recolouring the axis it ranks lowest.',
    '',
    'Every unwritten field is a visible, labelled hole rather than filler. Nothing is invented:',
    'no testimonials, no ratings, no counts, no press.'
  ].join('\n'),
  inputSchema: {
    directory: z.string().min(1).describe('Folder to write into. It is created if it does not exist, and must be empty or contain only files this tool wrote.'),
    subject: z.string().min(2).describe('What the site is about, in a few words. For example: "chess lessons for club players, Brooklyn".'),
    name: z.string().optional().describe('The name to put in the header. Defaults to a title-cased version of the subject.'),
    hue: z.number().min(0).max(360).optional().describe('Force an anchor hue in OKLCH degrees, if you already know the colour.'),
    force: z.boolean().optional().describe('Overwrite files that are already there. Default false.'),
    record: z.boolean().optional().describe('Record the choices in the local variety ledger. Default true. Turning it off means the next scaffold may repeat this shape.')
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    files_written: z.array(z.string()).optional(),
    choices: z.record(z.string(), z.string()).optional(),
    previous_choices: z.record(z.string(), z.string()).optional(),
    differs_from_previous: z.array(z.string()).optional(),
    anchor_hue: z.number().optional(),
    palette: z.object({ light: z.record(z.string(), z.string()), dark: z.record(z.string(), z.string()) }).optional(),
    ledger: z.object({ path: z.string(), written: z.boolean(), entries: z.number().int() }).optional(),
    next: z.array(z.string()).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false }
};

export const handler = guard(TOOL, async (args) => {
  const subject = String(args.subject ?? '').trim();
  if (subject.length < 2) {
    return failure({
      tool: TOOL,
      code: 'NO_SUBJECT',
      problem: 'No subject was given.',
      why: 'The section inventory, the hue and the copy prompts are all derived from what the site is about.',
      fix: ['Pass subject: a few words, for example "chess lessons for club players, Brooklyn".']
    });
  }

  const dir = path.resolve(args.directory);
  const siteName = (args.name ?? titleCase(subject)).trim();

  /* ---- do not clobber somebody's work ------------------------------- */
  let existing = [];
  try {
    existing = await readdir(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return failure({
        tool: TOOL,
        code: 'DIR_UNREADABLE',
        problem: `Could not open ${dir}.`,
        why: String(err.message).split('\n')[0],
        fix: ['Check the path, and that you have permission to write there.']
      });
    }
  }

  const ours = new Set(['index.html', 'styles.css', 'NOTES.md']);
  const collisions = existing.filter((f) => ours.has(f));
  const strangers = existing.filter((f) => !ours.has(f) && !f.startsWith('.'));

  if ((collisions.length > 0 || strangers.length > 0) && !args.force) {
    return failure({
      tool: TOOL,
      code: 'DIRECTORY_NOT_EMPTY',
      problem: `${dir} already has files in it.`,
      why:
        collisions.length > 0
          ? `It already contains ${collisions.join(', ')}, and writing would replace ${collisions.length === 1 ? 'it' : 'them'}.`
          : `It contains ${strangers.slice(0, 4).join(', ')}${strangers.length > 4 ? ` and ${strangers.length - 4} more` : ''}, so this may be a folder you are already using.`,
      fix: [
        'Pass a path to a new, empty folder.',
        'Or pass force: true if you are certain you want to overwrite what is there.'
      ]
    });
  }

  /* ---- the ledger decides the shape --------------------------------- */
  const ledger = await readLedger();
  const seed = seedFrom(subject.toLowerCase());
  const previous = ledger.emitted?.[0]?.choices ?? null;

  const choices = {
    inventory: chooseDistinct(AXES.inventory, usedOn(ledger, 'inventory'), seed),
    hero: chooseDistinct(AXES.hero, usedOn(ledger, 'hero'), seed >> 3),
    type: chooseDistinct(AXES.type, usedOn(ledger, 'type'), seed >> 6),
    surface: chooseDistinct(AXES.surface, usedOn(ledger, 'surface'), seed >> 9),
    density: chooseDistinct(AXES.density, usedOn(ledger, 'density'), seed >> 12)
  };

  /* ---- the colour --------------------------------------------------- */
  const usedHues = usedOn(ledger, 'hue').map(Number).filter(Number.isFinite);
  const hue =
    typeof args.hue === 'number'
      ? args.hue
      : spreadFrom(seedFrom(`${subject}#hue`) % 360, usedHues);

  const palette = buildPalette({
    hue,
    provenance:
      typeof args.hue === 'number'
        ? `you supplied ${Math.round(hue)}°`
        : `a hash of "${subject}", pushed away from the hues used recently — which is stable and is NOT the same as deriving the colour from something real`
  });

  /* ---- compose and write -------------------------------------------- */
  const composed = composeSite({ subject, siteName, palette, choices, now: new Date() });

  try {
    await mkdir(dir, { recursive: true });
    for (const [file, content] of Object.entries(composed.files)) {
      await writeFile(path.join(dir, file), content, 'utf8');
    }
  } catch (err) {
    return failure({
      tool: TOOL,
      code: 'WRITE_FAILED',
      problem: `Could not write into ${dir}.`,
      why: String(err.message).split('\n')[0],
      fix: [
        'Check that the folder is somewhere you can write — your home folder or Desktop rather than a system folder.',
        'If the path has a typo, fix it and run this again.'
      ]
    });
  }

  /* ---- record what was chosen --------------------------------------- */
  const bones = fingerprint(
    [choices.inventory, choices.hero, INVENTORIES[choices.inventory].join(',')].join('|')
  );

  let ledgerResult = { written: false, file: ledger.file, entries: ledger.emitted?.length ?? 0 };
  if (args.record !== false) {
    ledgerResult = await appendLedger({
      subject,
      skeleton: choices.inventory,
      bones,
      choices: { ...choices, hue: String(Math.round(palette.anchor_hue)) }
    });
  }

  const differs = previous
    ? Object.keys(choices).filter((k) => choices[k] !== previous[k])
    : Object.keys(choices);

  /* ---- report ------------------------------------------------------- */
  const sections = [
    {
      title: 'Written:',
      body: Object.keys(composed.files)
        .map((f) => `  ${path.join(dir, f)}`)
        .join('\n')
    },
    {
      title: 'The shape of this one, and where each choice came from:',
      body: table(
        [
          { key: 'axis', label: 'AXIS', max: 12 },
          { key: 'value', label: 'CHOSEN', max: 24 },
          { key: 'last', label: 'LAST TIME', max: 24 },
          { key: 'why', label: 'CARRIES', max: 14 }
        ],
        [
          { axis: 'inventory', value: choices.inventory, last: previous?.inventory ?? '(first)', why: 'most' },
          { axis: 'hero', value: choices.hero, last: previous?.hero ?? '(first)', why: 'a lot' },
          { axis: 'type', value: choices.type, last: previous?.type ?? '(first)', why: 'some' },
          { axis: 'surface', value: choices.surface, last: previous?.surface ?? '(first)', why: 'a little' },
          { axis: 'density', value: choices.density, last: previous?.density ?? '(first)', why: 'a little' },
          { axis: 'hue', value: `${Math.round(palette.anchor_hue)}°`, last: previous?.hue ? `${previous.hue}°` : '(first)', why: 'least' }
        ]
      )
    },
    {
      title: 'The sections this one has, in order:',
      body: '  ' + INVENTORIES[choices.inventory].join('  →  ')
    },
    {
      title: 'The palette:',
      body:
        '  light:  ' +
        Object.entries(palette.light).map(([k, v]) => `${k}=${v}`).join('  ') +
        '\n  dark:   ' +
        Object.entries(palette.dark).map(([k, v]) => `${k}=${v}`).join('  ')
    },
    {
      title: 'Type:',
      body: `  ${TYPE_PAIRINGS[choices.type].label}\n  display: ${TYPE_PAIRINGS[choices.type].display}\n  body:    ${TYPE_PAIRINGS[choices.type].body}\n\n  These are system stacks, so nothing is downloaded and the page works with no\n  network. The cost, stated plainly: on Android the generic sans at the end of\n  the chain resolves to Roboto, which is on every overused-face list. The escape\n  is inlining one subsetted display face — about 43 KB — and that is a decision\n  worth making on purpose rather than having a scaffolder make for you.`
    },
    {
      title: 'Surface:',
      body: `  ${SURFACES[choices.surface].label}.\n\n  Nothing derives this from your subject. It was chosen from the ledger so it\n  would not be the same as last time, and saying so is the honest version —\n  the research marks this axis as one where nothing derives the answer.`
    },
    {
      title: 'What is deliberately unfinished:',
      body:
        '  Every dashed box is a labelled hole. That is the design, not an oversight:\n' +
        '  an unfilled field drawn as an unfilled field. There are no testimonials,\n' +
        '  no ratings, no counts and no press mentions, because none of them are true\n' +
        '  yet — and the first real one will land with the weight of being the only\n' +
        '  one on the page.\n\n' +
        '  There is no photograph, and that is the highest-value thing left to add.'
    }
  ];

  if (palette.notes.length > 0) {
    sections.push({ title: 'Notes on the colour:', body: palette.notes.map((n) => `  · ${n}`).join('\n\n') });
  }

  if (!ledgerResult.written && args.record !== false) {
    sections.push({
      title: 'The ledger could not be written:',
      body: `  ${ledgerResult.error ?? 'unknown reason'}\n\n  The site is fine. What is lost is the memory: the next scaffold may repeat\n  this shape, which is the one failure this tool exists to prevent. The ledger\n  lives at ${ledgerResult.file}.`
    });
  }

  const next = [
    `Run review_site on ${dir}. It should come back with no faults and one note — the empty photograph slot.`,
    'Open index.html and fill in the dashed boxes. Each one says what belongs there.',
    'Take one photograph and put it in the slot. It is the single highest-value thing you can add.',
    'Run check_responsive when you have content in, to measure the page in a real browser.'
  ];

  return toolResult({
    tool: TOOL,
    status: STATUS.PASS,
    headline: previous
      ? `Scaffolded "${siteName}" — a different shape from the last one on ${differs.length} of ${Object.keys(choices).length} axes.`
      : `Scaffolded "${siteName}". This is the first entry in the variety ledger, so the next one will differ from it.`,
    sections,
    nextSteps: next,
    data: {
      directory: dir,
      files_written: Object.keys(composed.files).map((f) => path.join(dir, f)),
      choices: { ...choices, hue: String(Math.round(palette.anchor_hue)) },
      previous_choices: previous ?? undefined,
      differs_from_previous: differs,
      anchor_hue: palette.anchor_hue,
      palette: { light: palette.light, dark: palette.dark },
      ledger: { path: ledgerResult.file, written: Boolean(ledgerResult.written), entries: ledgerResult.entries ?? 0 },
      next
    }
  });
});

/**
 * A stand-in header name, when the caller gave none.
 *
 * Two traps, both hit on real input before this was written. Splitting on a
 * bare hyphen breaks INSIDE words, so "a one-room bakery in Astoria" came out
 * as "a One". And a blind five-word cut leaves the phrase hanging on a
 * preposition, so "chess lessons for children in Queens" came out as "Chess
 * Lessons For Children in" — which would then sit in the page header as if it
 * were a brand somebody chose. Under this kit's own honesty rules that is
 * `placeholder-identity`: a stand-in dressed as a decision.
 *
 * So: split only on punctuation that is really a clause break, and trim back
 * to the last word that can end a phrase.
 */
const TRAILING_FUNCTION_WORDS = new Set([
  'in', 'on', 'at', 'for', 'of', 'to', 'and', 'or', 'with', 'from', 'by', 'a', 'an', 'the', 'that', 'who'
]);

function titleCase(text) {
  const words = String(text)
    .split(/[,;:]|\s[–—-]\s/)[0]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

  while (words.length > 1 && TRAILING_FUNCTION_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }

  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      // Small words keep their case in the middle of a name, not at the start.
      if (i > 0 && TRAILING_FUNCTION_WORDS.has(lower) && w.length <= 3) return lower;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/** Push a hue away from ones used recently, so consecutive sites do not collide. */
function spreadFrom(base, used, minimumGap = 40) {
  let hue = base % 360;
  for (let attempt = 0; attempt < 9; attempt++) {
    const clash = used.find((u) => {
      const gap = Math.abs(((hue - u + 540) % 360) - 180);
      return 180 - gap < minimumGap;
    });
    if (clash === undefined) return hue;
    hue = (hue + 47) % 360;
  }
  return hue;
}
