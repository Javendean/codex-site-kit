/**
 * review_site — run the whole rulebook over a folder and return an annotated
 * critique.
 *
 * This is the flagship, and the output is the product. A list of rule ids would
 * be a faster tool and a worse one: the point is not to find the faults, it is
 * that reading the findings teaches the craft. So every finding carries what
 * was found and measured, why it matters, who says so with a confidence tag,
 * and the better move — and the renderer in ../lib/critique.js treats that as
 * a contract rather than a style.
 *
 * What this tool CANNOT do is measure a rendered page. Sideways scroll, a
 * button label wrapping to two lines, real contrast on a real screen: those
 * need a browser, and they belong to check_responsive. This tool says so in
 * its own output rather than letting a clean report imply they passed.
 */

import path from 'node:path';
import { z } from 'zod';

import { DEFAULT_IGNORE, PathError, readText, rel, requireDirectory, walk } from '../lib/files.js';
import { STATUS, failure, guard, toolResult } from '../lib/report.js';
import { renderCritique } from '../lib/critique.js';
import { RULEBOOK, BY_ID } from '../rules/index.js';
import { buildContext, run, capPerRule } from '../rules/engine.js';
import { readLedger } from '../lib/ledger.js';
import { commonOutput, directoryInput, ignoreInput } from './common.js';

const TOOL = 'review_site';

const KIND_BY_EXT = {
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.js': 'js',
  '.mjs': 'js',
  '.md': 'md',
  '.markdown': 'md'
};

export const name = TOOL;

export const config = {
  title: 'Review a site against the whole rulebook',
  description: [
    'Read every page and stylesheet in a folder and return an annotated critique.',
    '',
    'Each finding carries four things: WHAT was found with the measurement, WHY it matters,',
    'WHO says so with a confidence tag (DEMONSTRATED / ASSERTED / MEASURED / INFERENCE), and',
    'the better MOVE. Findings are ordered by how fast a visitor would notice them, and',
    'annotated the way a chess game is: ?? seen in five seconds, ? felt but not named,',
    '?! a habit worth dropping, !? a move whose time is passing, ! worth keeping.',
    '',
    'Use explain_rule with any rule id from the output to read the full teaching note.',
    '',
    'This reads files. It does not render pages, so it cannot see sideways scroll or a',
    'wrapping button label — check_responsive measures those in a real browser, and this',
    'tool lists what it could not measure rather than implying those checks passed.'
  ].join('\n'),
  inputSchema: {
    directory: directoryInput,
    focus: z
      .array(z.string())
      .optional()
      .describe('Only run these rule ids. Leave empty to run the whole rulebook.'),
    skip: z.array(z.string()).optional().describe('Rule ids to leave out of this run.'),
    max_per_rule: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('How many times one rule may report before the rest are summarised. Default 6.'),
    ignore: ignoreInput
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    files_read: z.number().int().optional(),
    pages: z.number().int().optional(),
    stylesheets: z.number().int().optional(),
    rules_run: z.number().int().optional(),
    counts: z
      .object({
        blunder: z.number().int(),
        mistake: z.number().int(),
        dubious: z.number().int(),
        trap: z.number().int(),
        note: z.number().int()
      })
      .optional(),
    findings: z
      .array(
        z.object({
          rule: z.string(),
          tier: z.union([z.number(), z.string()]),
          title: z.string(),
          severity: z.string(),
          confidence: z.string(),
          who: z.array(z.string()),
          file: z.string().nullable(),
          line: z.number().int().nullable(),
          column: z.number().int().nullable(),
          what: z.string(),
          measured: z.string().nullable(),
          why: z.string(),
          fix: z.string(),
          excerpt: z.string().nullable()
        })
      )
      .optional(),
    not_measured: z.array(z.object({ what: z.string(), how: z.string() })).optional(),
    rule_errors: z.array(z.object({ rule: z.string(), message: z.string() })).optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

/** What a static read cannot settle, said out loud so a clean report is not mistaken for a pass. */
const NOT_MEASURED = [
  {
    what: 'Whether the page scrolls sideways at any width, which research/08-craft.md ranks at the top of its five-second list because it reads as broken rather than cheap.',
    how: 'check_responsive loads every page in a real browser at 320, 390, 768, 1024, 1280 and 1440 CSS pixels and compares document.scrollWidth against window.innerWidth.'
  },
  {
    what: 'Whether any button label wraps to two lines, which is the other half of that same Tier 1 tell.',
    how: 'check_responsive measures the rendered line count of every interactive element at every width.'
  },
  {
    what: 'Whether the photographs are of the actual subject, and whether the people in them are real. research/08-craft.md catalogues about 25 generated-imagery tells and records that even human raters now score near chance on faces.',
    how: 'Nothing automates this. Look at the pictures and ask whether you took them.'
  },
  {
    what: 'Aesthetic age — whether the page reads as 2011, 2019 or 2026. research/04-design-language.md separates this from technical age deliberately: "You cannot parse ugliness."',
    how: 'It needs a screenshot and a pair of eyes, or a vision model. The technical-age signals are checked here; this half is not.'
  }
];

export const handler = guard(TOOL, async (args) => {
  let root;
  try {
    root = await requireDirectory(args.directory, 'site folder');
  } catch (err) {
    if (err instanceof PathError) {
      return failure({ tool: TOOL, code: err.code, problem: err.message, fix: err.fix });
    }
    throw err;
  }

  const ignore = [...DEFAULT_IGNORE, ...(args.ignore ?? [])];
  const paths = await walk(root, { extensions: Object.keys(KIND_BY_EXT), ignore });

  if (paths.length === 0) {
    return failure({
      tool: TOOL,
      code: 'NO_FILES',
      problem: `There are no web files in ${root}.`,
      why: 'Nothing with a .html, .css, .md or .js extension was found, so there is nothing to review.',
      fix: [
        'Check you passed the folder that holds index.html, not the folder above it.',
        'If the site has not been created yet, run init_site first.'
      ]
    });
  }

  const files = [];
  for (const abs of paths) {
    const text = await readText(abs);
    if (text == null) continue;
    files.push({ rel: rel(root, abs), abs, kind: KIND_BY_EXT[path.extname(abs).toLowerCase()], text });
  }

  const honestyLedger = await readHonestyLedger(root);
  const varietyLedger = await readLedger();

  const ctx = buildContext({
    root,
    files,
    ledger: { honesty: honestyLedger, variety: varietyLedger },
    now: new Date()
  });

  if (ctx.pages.length === 0) {
    return failure({
      tool: TOOL,
      code: 'NO_PAGES',
      problem: `There is no HTML in ${root}.`,
      why: 'Most of the rulebook reads markup. Without a page there is very little to say.',
      fix: ['Point this at the folder that holds index.html.']
    });
  }

  const unknown = [...(args.focus ?? []), ...(args.skip ?? [])].filter((id) => !BY_ID[id]);
  if (unknown.length > 0) {
    return failure({
      tool: TOOL,
      code: 'UNKNOWN_RULE',
      problem: `No rule is called ${unknown.map((u) => `"${u}"`).join(', ')}.`,
      why: 'focus and skip take rule ids exactly as they appear in square brackets in a critique.',
      fix: [
        'Run review_site with no focus or skip to see every rule id this site triggers.',
        'Call explain_rule with a rule id to read its full note.'
      ],
      data: { known_rules: Object.keys(BY_ID) }
    });
  }

  const { findings: all, passed, errors } = run(RULEBOOK, ctx, {
    only: args.focus ?? null,
    skip: args.skip ?? []
  });

  const { kept, suppressed } = capPerRule(all, args.max_per_rule ?? 6);

  const counts = { blunder: 0, mistake: 0, dubious: 0, trap: 0, note: 0 };
  for (const f of all) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  const critique = renderCritique({
    findings: kept,
    passed,
    errors,
    suppressed,
    notMeasured: NOT_MEASURED,
    summary: {
      title: `${path.basename(root)} — an annotated review`,
      scanned: `Read ${files.length} ${files.length === 1 ? 'file' : 'files'}: ${ctx.pages.length} ${ctx.pages.length === 1 ? 'page' : 'pages'}, ${ctx.stylesheets.length} ${ctx.stylesheets.length === 1 ? 'stylesheet' : 'stylesheets'}, against ${RULEBOOK.length} rules`
    }
  });

  // A note is not a fault. `!` marks something worth knowing — a declared,
  // labelled hole, an empty photo slot — and a page whose only findings are
  // notes has nothing wrong with it that this tool can see.
  const faults = counts.blunder + counts.mistake + counts.dubious + counts.trap;
  // The body prints the capped list; the headline counts every finding. Saying
  // one number and printing a different one reads as a contradiction to
  // somebody who cannot tell which to trust, so the headline says both.
  const shownFaults = kept.filter((f) => f.severity !== 'note').length;
  const status = faults === 0 ? STATUS.PASS : STATUS.FAIL;
  const headline =
    faults === 0
      ? counts.note === 0
        ? `Nothing in the rulebook fired across ${files.length} files. Four things still need a browser — they are listed, and they are not passes.`
        : `No faults across ${files.length} files. ${counts.note} ${counts.note === 1 ? 'note' : 'notes'} worth reading, and four things that still need a browser.`
      : `${faults} ${faults === 1 ? 'finding' : 'findings'}${
          shownFaults < faults ? ` (${shownFaults} printed below; the rest are repeats of a rule already shown)` : ''
        }: ${counts.blunder} seen in five seconds, ${counts.mistake} felt but not named, ${
          counts.dubious + counts.trap
        } ${counts.dubious + counts.trap === 1 ? 'habit' : 'habits'} worth dropping.`;

  return toolResult({
    tool: TOOL,
    status,
    headline,
    sections: [{ body: critique }],
    data: {
      directory: root,
      files_read: files.length,
      pages: ctx.pages.length,
      stylesheets: ctx.stylesheets.length,
      rules_run: args.focus ? args.focus.length : RULEBOOK.length - (args.skip?.length ?? 0),
      counts,
      findings: all.map((f) => ({
        rule: f.rule,
        tier: f.tier,
        title: f.title,
        severity: f.severity,
        confidence: f.confidence,
        who: f.who,
        file: f.file,
        line: f.line,
        column: f.column,
        what: f.what,
        measured: f.measured,
        why: f.why,
        fix: f.fix,
        excerpt: f.excerpt
      })),
      not_measured: NOT_MEASURED,
      rule_errors: errors
    }
  });
});

/** `.honesty.json` at the site root records quotations whose attribution has been checked. */
async function readHonestyLedger(root) {
  for (const candidate of ['.honesty.json', 'honesty.json']) {
    const text = await readText(path.join(root, candidate));
    if (text == null) continue;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}
