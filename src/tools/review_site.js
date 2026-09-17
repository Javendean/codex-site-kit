/**
 * review_site — run the whole rulebook over a folder and return an annotated
 * critique.
 *
 * This is the flagship, and the OUTPUT is the product. A list of rule ids would
 * be a faster tool and a worse one: the point is not to find the faults, it is
 * that reading the findings teaches the craft. So every finding carries what
 * was found with the evidence, why it matters, what the rulebook is teaching
 * through it, who says so with a confidence tag and that source's own caveat,
 * where exactly the line is drawn, and the better move. The renderer in
 * ../lib/critique.js treats that as a contract rather than a style.
 *
 * The other half of the contract is the part most tools get wrong. Some rules
 * cannot run from files alone: a handful need a live browser, a dozen need a
 * person to look at something. Those come back as `not_run`, and this tool
 * prints them as prominently as the failures. A clean report that silently
 * omits sixteen unrun checks is a lie by omission, and it is the exact failure
 * this kit exists to avoid.
 */

import path from 'node:path';
import { z } from 'zod';

import { DEFAULT_IGNORE, PathError, readText, rel, requireDirectory, walk } from '../lib/files.js';
import { STATUS, failure, guard, toolResult } from '../lib/report.js';
import { renderCritique } from '../lib/critique.js';
import { rulebook, buildPage, review, capPerRule } from '../lib/rulebook.js';
import { commonOutput, directoryInput, ignoreInput } from './common.js';

const TOOL = 'review_site';

export const name = TOOL;

export const config = {
  title: 'Review a site against the whole rulebook',
  description: [
    'Read every page and stylesheet in a folder and return an annotated critique.',
    '',
    "Each finding carries: WHAT was found with the evidence, WHY it matters, what it is",
    "teaching, WHO says so with a confidence tag and that source's caveat, WHERE the line is",
    'drawn, and the better MOVE. Findings are ordered by how fast a visitor would notice them',
    'and annotated the way a chess game is: ?? clocked in five seconds, ? felt but not named,',
    '?! a habit worth dropping.',
    '',
    'Rules that could not run are listed as prominently as the ones that failed, with the',
    'reason each one could not run. They are never counted as passes.',
    '',
    'Use explain_rule with any rule id from the output to read the full teaching note, every',
    'source, every caveat, and what that rule measured across the corpus it was built from.'
  ].join('\n'),
  inputSchema: {
    directory: directoryInput,
    focus: z.array(z.string()).optional().describe('Only run these rule ids. Leave empty to run the whole rulebook.'),
    skip: z.array(z.string()).optional().describe('Rule ids to leave out of this run.'),
    tier: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Only one tier: 1, 2, 3, "floor", "honesty", "structure", "craft", "trap" or "ledger".'),
    max_per_rule: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('How many times one rule may report before the rest are summarised. Default 4.'),
    concept_site: z
      .boolean()
      .optional()
      .describe(
        'Declare this an unsolicited concept page rather than a live site. A few rules are right on a real site and wrong on a concept one; they suppress themselves rather than firing wrongly.'
      ),
    ignore: ignoreInput
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    files_read: z.number().int().optional(),
    pages: z.number().int().optional(),
    stylesheets: z.number().int().optional(),
    rules_available: z.number().int().optional(),
    rules_run: z.number().int().optional(),
    counts: z.object({ fail: z.number().int(), warn: z.number().int(), info: z.number().int() }).optional(),
    findings: z
      .array(
        z.object({
          id: z.string(),
          tier: z.union([z.number(), z.string()]),
          category: z.string().optional(),
          title: z.string(),
          severity: z.string(),
          page: z.string().optional(),
          count: z.number().int(),
          evidence: z.array(z.string()),
          what_it_is: z.string(),
          why_it_matters: z.string(),
          teach: z.string().nullable().optional(),
          chess: z.string().nullable().optional(),
          threshold: z.string(),
          fix: z.string(),
          confidence: z.string().optional(),
          source: z.string().optional(),
          confidence_note: z.string().nullable().optional()
        })
      )
      .optional(),
    not_checked: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          tier: z.union([z.number(), z.string()]),
          kind: z.string(),
          reason: z.string()
        })
      )
      .optional(),
    clean: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
    missing_stylesheets: z.array(z.string()).optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

const KIND_BY_EXT = { '.html': 'html', '.htm': 'html', '.css': 'css' };

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

  const htmlFiles = [];
  const stylesheets = [];
  for (const abs of paths) {
    const text = await readText(abs);
    if (text == null) continue;
    const entry = { rel: rel(root, abs), text };
    if (KIND_BY_EXT[path.extname(abs).toLowerCase()] === 'html') htmlFiles.push(entry);
    else stylesheets.push(entry);
  }

  if (htmlFiles.length === 0) {
    return failure({
      tool: TOOL,
      code: 'NO_PAGES',
      problem: `There is no HTML in ${root}.`,
      why: 'The rulebook reads pages. Without one there is nothing to review.',
      fix: [
        'Check you passed the folder that holds index.html, not the folder above it.',
        'If the site has not been created yet, run init_site first.'
      ]
    });
  }

  const book = rulebook();

  const unknown = [...(args.focus ?? []), ...(args.skip ?? [])].filter((id) => !book.byId.has(id));
  if (unknown.length > 0) {
    return failure({
      tool: TOOL,
      code: 'UNKNOWN_RULE',
      problem: `No rule is called ${unknown.map((u) => `"${u}"`).join(', ')}.`,
      why: 'focus and skip take rule ids exactly as they appear in square brackets in a critique.',
      fix: [
        'Run review_site with no focus or skip to see the ids this site triggers.',
        'Or call explain_rule with no arguments to list the whole rulebook.'
      ]
    });
  }

  let active = book.rules;
  if (args.tier !== undefined) active = active.filter((r) => String(r.tier) === String(args.tier));
  if (args.focus) active = active.filter((r) => args.focus.includes(r.id));
  if (args.skip) active = active.filter((r) => !args.skip.includes(r.id));

  if (active.length === 0) {
    return failure({
      tool: TOOL,
      code: 'NO_RULES_SELECTED',
      problem: 'That combination of tier, focus and skip leaves no rules to run.',
      why: 'Running zero rules would report a clean page without having checked anything.',
      fix: ['Widen the filter, or drop it and run the whole rulebook.']
    });
  }

  const pages = htmlFiles.map((f) => buildPage({ rel: f.rel, html: f.text, stylesheets }));
  const missing = [...new Set(pages.flatMap((p) => p.missingStylesheets ?? []))];

  const result = review({
    pages,
    rules: active,
    project: args.concept_site ? { concept_site: true } : {},
    now: new Date(),
    selfId: path.basename(root)
  });

  const { kept, hidden } = capPerRule(result.findings, args.max_per_rule ?? 4);

  const critique = renderCritique({
    findings: kept,
    counts: result.counts,
    notRun: result.notRun,
    passed: result.passed,
    suppressed: result.suppressed,
    hidden,
    summary: {
      title: `${path.basename(root)} — an annotated review`,
      scanned:
        `Read ${htmlFiles.length + stylesheets.length} files: ${htmlFiles.length} ${htmlFiles.length === 1 ? 'page' : 'pages'}, ` +
        `${stylesheets.length} ${stylesheets.length === 1 ? 'stylesheet' : 'stylesheets'}. ` +
        `${active.length} of ${book.rules.length} rules run — ${result.findings.length} fired, ` +
        `${result.passed.length} clean, ${result.notRun.length} could not run.` +
        (missing.length
          ? ` A stylesheet this page links to was not found and therefore NOT checked: ${missing.join(', ')}.`
          : '')
    }
  });

  const total = result.counts.fail + result.counts.warn + result.counts.info;

  return toolResult({
    tool: TOOL,
    status: total === 0 ? STATUS.PASS : STATUS.FAIL,
    headline:
      total === 0
        ? `Nothing fired across ${htmlFiles.length} ${htmlFiles.length === 1 ? 'page' : 'pages'}. ${result.notRun.length} rules could not run here — they are listed, and they are not passes.`
        : `${total} findings: ${result.counts.fail} seen in five seconds, ${result.counts.warn} felt but not named, ${result.counts.info} habits worth dropping. ${result.notRun.length} rules could not run.`,
    sections: [{ body: critique }],
    data: {
      directory: root,
      files_read: htmlFiles.length + stylesheets.length,
      pages: htmlFiles.length,
      stylesheets: stylesheets.length,
      rules_available: book.rules.length,
      rules_run: active.length,
      counts: result.counts,
      findings: result.findings.map((f) => ({
        id: f.id,
        tier: f.tier,
        category: f.category,
        title: f.title,
        severity: f.severity,
        page: f.page,
        count: f.count,
        evidence: (f.hits ?? []).slice(0, 6).map((h) => String(h.evidence ?? '')),
        what_it_is: f.what_it_is,
        why_it_matters: f.why_it_matters,
        teach: f.teach ?? null,
        chess: f.chess ?? null,
        threshold: f.threshold,
        fix: f.fix,
        confidence: f.source?.confidence,
        source: f.source?.name,
        confidence_note: f.confidence_note ?? null
      })),
      not_checked: result.notRun,
      clean: result.passed.map((p) => ({ id: p.id, title: p.title })),
      missing_stylesheets: missing
    }
  });
});
