/**
 * check_copy — the words, on their own.
 *
 * review_site runs these rules too. This exists because the words get edited on
 * a different rhythm from the design: you rewrite a paragraph, you want to know
 * whether it still carries the habits, and you should not have to read a
 * stylesheet critique to find out.
 *
 * It also takes text directly, so a sentence can be checked before it is
 * anywhere near a file.
 *
 * The organising idea underneath every rule here is one sentence that
 * research/08-craft.md calls the most useful thing found in its whole sweep:
 *
 *   "'Search your meeting notes' beats 'Unlock your knowledge' because it can
 *    be true."
 *
 * That is the test. Can this sentence be true or false? "Quality service you
 * can trust" cannot be. "I open the board at seven so you can play before
 * school" can.
 */

import path from 'node:path';
import { z } from 'zod';

import { DEFAULT_IGNORE, PathError, readText, rel, requireDirectory, walk } from '../lib/files.js';
import { STATUS, failure, guard, toolResult } from '../lib/report.js';
import { renderCritique } from '../lib/critique.js';
import { rulebook, buildPage, review, capPerRule } from '../lib/rulebook.js';
import { commonOutput, ignoreInput } from './common.js';

const TOOL = 'check_copy';

/** The tiers and categories whose subject is the words rather than the paint. */
const COPY_TIERS = new Set([3, 'honesty']);
const COPY_CATEGORIES = new Set(['copy', 'honesty', 'language', 'content', 'trust']);

function copyRules(book) {
  return book.rules.filter((r) => COPY_TIERS.has(r.tier) || COPY_CATEGORIES.has(r.category));
}

export const name = TOOL;

export const config = {
  title: 'Check the words',
  description: [
    'Run the copy and honesty rules over a folder, or over a block of text pasted straight in.',
    '',
    "Benefit-speak, the \"not just X, it's Y\" cadence, em dashes in short interface copy,",
    'fabricated precision, invented proof, unverified attributions, and claims that cannot be',
    'true or false.',
    '',
    'Pass either `directory` or `text`. Everything it finds carries the same four answers as a',
    'full review: what, why, who says so, and the better move.'
  ].join('\n'),
  inputSchema: {
    directory: z.string().optional().describe('Folder to read. Every .html file in it is checked.'),
    text: z.string().optional().describe('A block of copy to check directly, without saving it anywhere first.'),
    ignore: ignoreInput
  },
  outputSchema: {
    ...commonOutput,
    source: z.string().optional(),
    files_read: z.number().int().optional(),
    rules_run: z.number().int().optional(),
    counts: z.object({ fail: z.number().int(), warn: z.number().int(), info: z.number().int() }).optional(),
    findings: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          severity: z.string(),
          page: z.string().optional(),
          count: z.number().int(),
          evidence: z.array(z.string()),
          what_it_is: z.string(),
          why_it_matters: z.string(),
          fix: z.string(),
          confidence: z.string().optional()
        })
      )
      .optional(),
    not_checked: z.array(z.object({ id: z.string(), title: z.string(), reason: z.string() })).optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async (args) => {
  const hasText = typeof args.text === 'string' && args.text.trim() !== '';
  const hasDir = typeof args.directory === 'string' && args.directory.trim() !== '';

  if (!hasText && !hasDir) {
    return failure({
      tool: TOOL,
      code: 'NOTHING_TO_CHECK',
      problem: 'No copy was given.',
      why: 'This tool needs either a folder to read or a block of text to check.',
      fix: ['Pass directory: the full path to the site folder.', 'Or pass text: the paragraph you want checked.']
    });
  }

  const book = rulebook();
  const rules = copyRules(book);
  const pages = [];
  let source;

  if (hasText) {
    // Wrapped as a minimal document so the same detectors run over it. The
    // wrapper is inert: no colour, no layout, nothing for a design rule to see.
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>pasted text</title></head><body><main>${escapeHtml(
      args.text
    )
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, ' ')}</p>`)
      .join('\n')}</main></body></html>`;
    pages.push(buildPage({ rel: 'pasted text', html, stylesheets: [] }));
    source = 'pasted text';
  } else {
    let root;
    try {
      root = await requireDirectory(args.directory, 'folder');
    } catch (err) {
      if (err instanceof PathError) {
        return failure({ tool: TOOL, code: err.code, problem: err.message, fix: err.fix });
      }
      throw err;
    }
    const ignore = [...DEFAULT_IGNORE, ...(args.ignore ?? [])];
    const paths = await walk(root, { extensions: ['.html', '.htm'], ignore });
    for (const abs of paths) {
      const text = await readText(abs);
      if (text == null) continue;
      pages.push(buildPage({ rel: rel(root, abs), html: text, stylesheets: [] }));
    }
    source = root;
    if (pages.length === 0) {
      return failure({
        tool: TOOL,
        code: 'NO_FILES',
        problem: `There are no pages in ${root}.`,
        why: 'Nothing with a .html extension was found.',
        fix: ['Check the folder path, or pass the words directly with the text argument.']
      });
    }
  }

  // The ledger rules are about shape across sites, not about words.
  const result = review({ pages, rules, ledger: null, now: new Date() });
  const { kept, hidden } = capPerRule(result.findings, 6);

  const critique = renderCritique({
    findings: kept,
    counts: result.counts,
    notRun: result.notRun,
    passed: result.passed,
    hidden,
    summary: {
      title: `${hasText ? 'Pasted copy' : path.basename(source)} — the words`,
      scanned: `Read ${pages.length} ${pages.length === 1 ? 'source' : 'sources'} against ${rules.length} copy and honesty rules.`
    }
  });

  const total = result.counts.fail + result.counts.warn + result.counts.info;

  return toolResult({
    tool: TOOL,
    status: total === 0 ? STATUS.PASS : STATUS.FAIL,
    headline:
      total === 0
        ? 'None of the copy rules fired. Whether the claims are TRUE is still yours to check — this can see that a number has no source beside it, not whether the number is right.'
        : `${total} ${total === 1 ? 'finding' : 'findings'} in the copy.`,
    sections: [{ body: critique }],
    nextSteps: [
      'Read each sentence back and ask the one question the corpus asks: could this be false? If nothing could make it false, it is telling the reader nothing.',
      'Run explain_rule on any id above to read where the rule came from.'
    ],
    data: {
      source,
      files_read: pages.length,
      rules_run: rules.length,
      counts: result.counts,
      findings: result.findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        page: f.page,
        count: f.count,
        evidence: (f.hits ?? []).slice(0, 6).map((h) => String(h.evidence ?? '')),
        what_it_is: f.what_it_is,
        why_it_matters: f.why_it_matters,
        fix: f.fix,
        confidence: f.source?.confidence
      })),
      not_checked: result.notRun.map((n) => ({ id: n.id, title: n.title, reason: n.reason }))
    }
  });
});

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
