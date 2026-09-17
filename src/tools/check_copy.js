/**
 * check_copy — the words, on their own.
 *
 * review_site runs these rules too. This tool exists because the words are
 * edited on a different rhythm from the design: you rewrite a paragraph, you
 * want to know whether it still carries the habits, and you do not want to read
 * a stylesheet critique to find out.
 *
 * It also accepts text directly, so a sentence can be checked before it is
 * anywhere near a file.
 */

import path from 'node:path';
import { z } from 'zod';

import { DEFAULT_IGNORE, PathError, readText, rel, requireDirectory, walk } from '../lib/files.js';
import { STATUS, failure, guard, toolResult } from '../lib/report.js';
import { renderCritique } from '../lib/critique.js';
import { COPY_RULES } from '../rules/index.js';
import { buildContext, run, capPerRule } from '../rules/engine.js';
import { commonOutput, ignoreInput } from './common.js';

const TOOL = 'check_copy';

const KIND_BY_EXT = { '.html': 'html', '.htm': 'html', '.md': 'md', '.markdown': 'md', '.txt': 'md' };

export const name = TOOL;

export const config = {
  title: 'Check the words',
  description: [
    'Run the copy rules over a folder, or over a block of text you paste in.',
    '',
    'Benefit-speak, the "not just X, it\'s Y" cadence, em dashes in short interface copy,',
    'fabricated precision, invented proof, unverified attributions, and claims that cannot',
    'be true or false. The organising test behind all of them is one sentence:',
    'can this be true? "Search your meeting notes" beats "Unlock your knowledge" because',
    'it can be.',
    '',
    'Pass either `directory` or `text`.'
  ].join('\n'),
  inputSchema: {
    directory: z.string().optional().describe('Folder to read. Every .html, .md and .txt file in it is checked.'),
    text: z.string().optional().describe('A block of copy to check directly, without saving it anywhere first.'),
    ignore: ignoreInput
  },
  outputSchema: {
    ...commonOutput,
    source: z.string().optional(),
    files_read: z.number().int().optional(),
    findings: z
      .array(
        z.object({
          rule: z.string(),
          title: z.string(),
          severity: z.string(),
          confidence: z.string(),
          who: z.array(z.string()),
          file: z.string().nullable(),
          line: z.number().int().nullable(),
          what: z.string(),
          measured: z.string().nullable(),
          why: z.string(),
          fix: z.string()
        })
      )
      .optional()
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
      fix: [
        'Pass directory: the full path to the site folder.',
        'Or pass text: the paragraph you want checked.'
      ]
    });
  }

  let files = [];
  let root = process.cwd();
  let source;

  if (hasText) {
    // A pasted block is wrapped as Markdown so the same block walker runs over it.
    files = [{ rel: 'pasted text', kind: 'md', text: args.text }];
    source = 'pasted text';
  } else {
    try {
      root = await requireDirectory(args.directory, 'folder');
    } catch (err) {
      if (err instanceof PathError) {
        return failure({ tool: TOOL, code: err.code, problem: err.message, fix: err.fix });
      }
      throw err;
    }
    const ignore = [...DEFAULT_IGNORE, ...(args.ignore ?? [])];
    const paths = await walk(root, { extensions: Object.keys(KIND_BY_EXT), ignore });
    for (const abs of paths) {
      const text = await readText(abs);
      if (text == null) continue;
      files.push({ rel: rel(root, abs), kind: KIND_BY_EXT[path.extname(abs).toLowerCase()], text });
    }
    source = root;
    if (files.length === 0) {
      return failure({
        tool: TOOL,
        code: 'NO_FILES',
        problem: `There is no readable copy in ${root}.`,
        why: 'Nothing with a .html, .md or .txt extension was found.',
        fix: ['Check the folder path, or pass the text directly with the text argument.']
      });
    }
  }

  const ctx = buildContext({ root, files, now: new Date() });
  const { findings: all, errors } = run(COPY_RULES, ctx);
  const { kept, suppressed } = capPerRule(all, 8);

  const critique = renderCritique({
    findings: kept,
    errors,
    suppressed,
    notMeasured: [
      {
        what: 'Whether the facts are true. This tool can tell that a number has no source next to it; it cannot tell whether the number is right.',
        how: 'Check each figure against your own records, and say where it came from on the page.'
      },
      {
        what: 'Whether a list\'s items belong in the same category — the sharpest copy tell in the corpus, and the one no detector catches.',
        how: 'Read the list aloud. If one item is a different kind of thing from the others, a reader notices even when they cannot say why.'
      }
    ],
    summary: {
      title: `${hasText ? 'Pasted copy' : path.basename(root)} — the words`,
      scanned: `Read ${files.length} ${files.length === 1 ? 'source' : 'sources'} against ${COPY_RULES.length} copy rules`
    }
  });

  return toolResult({
    tool: TOOL,
    status: all.length === 0 ? STATUS.PASS : STATUS.FAIL,
    headline:
      all.length === 0
        ? 'None of the copy rules fired. Whether the claims are TRUE is still yours to check.'
        : `${all.length} ${all.length === 1 ? 'finding' : 'findings'} in the copy.`,
    sections: [{ body: critique }],
    data: {
      source,
      files_read: files.length,
      findings: all.map((f) => ({
        rule: f.rule,
        title: f.title,
        severity: f.severity,
        confidence: f.confidence,
        who: f.who,
        file: f.file,
        line: f.line,
        what: f.what,
        measured: f.measured,
        why: f.why,
        fix: f.fix
      }))
    }
  });
});
