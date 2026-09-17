/**
 * check_honesty — a static scan for content nobody earned.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { PathError, requireDirectory, walk, readText, rel, DEFAULT_IGNORE } from '../lib/files.js';
import { scanDocument, applyLedger } from '../lib/honesty.js';
import { STATUS, failure, guard, table, toolResult, count } from '../lib/report.js';
import { commonOutput, directoryInput, findingShape, ignoreInput } from './common.js';

const TOOL = 'check_honesty';

const SCAN_EXTENSIONS = ['.html', '.htm', '.md', '.markdown', '.txt', '.jsx', '.tsx', '.vue', '.svelte', '.astro'];

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.txt') return 'markdown';
  return 'html'; // html, htm, jsx, tsx, vue, svelte, astro all carry markup
}

async function loadLedger(dir, explicit) {
  const target = explicit ? path.resolve(explicit) : path.join(dir, '.honesty.json');
  try {
    const raw = await readFile(target, 'utf8');
    return { ledger: JSON.parse(raw), path: target, error: null };
  } catch (err) {
    if (err.code === 'ENOENT') return { ledger: null, path: target, error: null };
    return {
      ledger: null,
      path: target,
      error: err instanceof SyntaxError ? 'it is not valid JSON' : err.code || err.message
    };
  }
}

export const config = {
  title: 'Check the site for invented content',
  description: [
    'Scans a site for content that claims something nobody earned: testimonials, star ratings,',
    '"as seen in", customer counts, lorem ipsum, placeholder brand names and contact details, and',
    'quotations that carry an attribution.',
    '',
    'The attribution check is the one a generic linter misses. A name set on its own line under a',
    'quotation is an attribution even with no "said" and no dash, and a misattributed quote is a',
    'false statement about a real person. Report it, find a source, and record the source in',
    '.honesty.json to silence it. An entry with no source silences nothing.',
    '',
    'Reports file:line for everything. status is "fail" only when there are errors; warnings are',
    'things to verify, not things that are definitely wrong.'
  ].join('\n'),
  inputSchema: {
    directory: directoryInput,
    ignore: ignoreInput,
    extensions: z
      .array(z.string())
      .optional()
      .describe(`File extensions to scan. Default: ${SCAN_EXTENSIONS.join(' ')}`),
    ledger: z
      .string()
      .optional()
      .describe('Path to the verified-quotations ledger. Default: <directory>/.honesty.json'),
    strict: z
      .boolean()
      .optional()
      .describe('Treat warnings as failures too. Default false.')
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    files_scanned: z.number().int().optional(),
    counts: z
      .object({ error: z.number().int(), warn: z.number().int(), info: z.number().int() })
      .optional(),
    findings: z.array(findingShape).optional(),
    ledger: z
      .object({
        path: z.string(),
        found: z.boolean(),
        suppressed: z.number().int(),
        unusable_entries: z.number().int(),
        error: z.string().nullable()
      })
      .optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async (args) => {
  let dir;
  try {
    dir = await requireDirectory(args.directory, 'site folder');
  } catch (err) {
    if (err instanceof PathError) {
      return failure({ tool: TOOL, code: err.code, problem: err.message, fix: err.fix });
    }
    throw err;
  }

  const extensions = args.extensions?.length ? args.extensions : SCAN_EXTENSIONS;
  const ignore = args.ignore?.length ? [...DEFAULT_IGNORE, ...args.ignore] : DEFAULT_IGNORE;

  const files = await walk(dir, { extensions, ignore });

  if (files.length === 0) {
    return toolResult({
      tool: TOOL,
      status: STATUS.SKIPPED,
      headline: 'Nothing was scanned, because no readable pages were found.',
      sections: [
        {
          title: 'What I looked for:',
          body: `  Folder:     ${dir}\n  Extensions: ${extensions.join(' ')}`
        }
      ],
      nextSteps: [
        'Check that this is the folder that holds index.html.',
        'If your pages use a different extension, pass it in "extensions".'
      ],
      data: {
        directory: dir,
        files_scanned: 0,
        counts: { error: 0, warn: 0, info: 0 },
        findings: [],
        ledger: { path: '', found: false, suppressed: 0, unusable_entries: 0, error: null }
      }
    });
  }

  const { ledger, path: ledgerPath, error: ledgerError } = await loadLedger(dir, args.ledger);

  let findings = [];
  let scanned = 0;
  for (const file of files) {
    const text = await readText(file);
    if (text === null) continue;
    scanned++;
    findings.push(...scanDocument({ path: rel(dir, file), text, kind: kindOf(file) }));
  }

  const applied = applyLedger(findings, ledger);
  findings = applied.findings;

  const counts = {
    error: findings.filter((f) => f.severity === 'error').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    info: findings.filter((f) => f.severity === 'info').length
  };

  const failed = counts.error > 0 || (args.strict === true && counts.warn > 0);

  const sections = [];

  const group = (severity, title, blurb) => {
    const rows = findings
      .filter((f) => f.severity === severity)
      .map((f) => ({
        where: `${f.file}:${f.line}`,
        what: f.label ?? f.rule,
        text: f.excerpt ?? f.matched ?? ''
      }));
    if (rows.length === 0) return;
    sections.push({ title: `${title}\n${blurb}`, body: table(
      [
        { key: 'where', label: 'FILE:LINE', max: 40 },
        { key: 'what', label: 'WHAT', max: 30 },
        { key: 'text', label: 'THE TEXT', max: 62 }
      ],
      rows
    ) });
  };

  group(
    'error',
    `${count(counts.error, 'thing')} that claims something nobody earned:`,
    'Each of these states something a visitor could check and find untrue.'
  );
  group(
    'warn',
    `${count(counts.warn, 'thing')} to verify:`,
    'These may be true. Nothing here shows that they are.'
  );
  group(
    'info',
    `${count(counts.info, 'unfilled field')}:`,
    'These declare themselves as gaps, which is honest. They are listed so none is forgotten.'
  );

  // The attributions get their own block, because the fix is specific.
  const attributions = findings.filter((f) => f.rule === 'unverified_attribution');
  if (attributions.length > 0) {
    sections.push({
      title: 'Quotations with an attribution:',
      body: attributions
        .map(
          (f) =>
            `  ${f.file}:${f.line}\n` +
            `    quotation:  "${f.quotation}"\n` +
            `    attributed: ${f.attributed_to}\n` +
            `    detected:   ${f.confidence} confidence — ${f.why}`
        )
        .join('\n\n')
    });
  }

  if (ledgerError) {
    sections.push({
      title: 'The verified-quotations ledger could not be read:',
      body: `  ${rel(dir, ledgerPath)} — ${ledgerError}`
    });
  } else if (applied.suppressed > 0 || applied.unusable > 0) {
    const lines = [`  ${rel(dir, ledgerPath)}`];
    if (applied.suppressed > 0) {
      lines.push(`  ${count(applied.suppressed, 'finding')} silenced by a recorded source.`);
    }
    if (applied.unusable > 0) {
      lines.push(
        `  ${count(applied.unusable, 'entry', 'entries')} in the ledger has no "source" field, so it silences nothing. A promise is not a citation.`
      );
    }
    sections.push({ title: 'Verified-quotations ledger:', body: lines.join('\n') });
  }

  const nextSteps = [];
  if (counts.error > 0) {
    nextSteps.push(
      'Delete the invented content listed above. It is faster than trying to make it true.'
    );
  }
  if (attributions.length > 0) {
    nextSteps.push(
      'For each quotation, find a primary source. If you find one, add {"text": "...", "source": "https://..."} to the "verified" list in .honesty.json.'
    );
    nextSteps.push(
      'If you cannot find a source, print the quotation with no name under it. An unattributed quote is honest; a wrong attribution is not.'
    );
  }
  if (counts.info > 0 && counts.error === 0) {
    nextSteps.push(`Fill in the ${count(counts.info, 'unfilled field')} listed above before publishing.`);
  }
  if (nextSteps.length === 0) {
    nextSteps.push('Nothing to do. Run this again after you change any page text.');
  }

  const headline = failed
    ? `${count(counts.error, 'problem')} found across ${count(scanned, 'file')}.`
    : counts.warn > 0
      ? `No invented content. ${count(counts.warn, 'thing')} to verify across ${count(scanned, 'file')}.`
      : `Nothing invented across ${count(scanned, 'file')}.`;

  return toolResult({
    tool: TOOL,
    status: failed ? STATUS.FAIL : STATUS.PASS,
    headline,
    sections,
    nextSteps,
    data: {
      directory: dir,
      files_scanned: scanned,
      counts,
      findings,
      ledger: {
        path: rel(dir, ledgerPath),
        found: ledger !== null,
        suppressed: applied.suppressed,
        unusable_entries: applied.unusable,
        error: ledgerError
      }
    }
  });
});

export const name = TOOL;
