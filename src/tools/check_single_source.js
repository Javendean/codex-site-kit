/**
 * check_single_source — find the same fact written down twice.
 *
 * The bug this exists for, from the storefront that shipped it: the price was
 * written into the product grid, into the basket script, and into the payment
 * worker. A customer walked from a card to the basket and watched the price
 * change. Nobody typed a wrong number. Three people typed the right number at
 * three different times, and then one of them was updated.
 *
 * A second copy of a value is a second value. It has not disagreed yet.
 */

import { z } from 'zod';

import { DEFAULT_IGNORE, PathError, readText, rel, requireDirectory, walk, lineIndex } from '../lib/files.js';
import { STATUS, count, failure, guard, table, toolResult } from '../lib/report.js';
import { commonOutput, directoryInput, ignoreInput } from './common.js';

const TOOL = 'check_single_source';

/**
 * Named patterns for the values that actually drift. Each one is a thing a
 * visitor can act on, which is what makes a disagreement expensive.
 */
export const PRESETS = {
  price: {
    label: 'price',
    source: String.raw`(?:[$£€]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})*\.\d{2}\s?(?:USD|GBP|EUR)\b|\b\d{1,4}\s?(?:dollars|pounds|euros)\b)`,
    flags: 'g',
    why: 'A price in two files is two prices. One of them will be updated and the other will not.'
  },
  email: {
    label: 'email address',
    source: String.raw`\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b`,
    flags: 'g',
    why: 'An address in two files is an address you will change in one of them.'
  },
  phone: {
    label: 'phone number',
    source: String.raw`(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b`,
    flags: 'g',
    why: 'A phone number in two files is a phone number you will change in one of them.'
  },
  sku: {
    label: 'SKU or product code',
    source: String.raw`\b[A-Z][A-Z0-9]+(?:[-_][A-Z0-9]{2,}){1,}\b`,
    flags: 'g',
    why: 'A product code written twice is a code that will stop matching the thing it names.'
  },
  time: {
    label: 'time of day',
    source: String.raw`\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[ap]\.?m\.?)?\b`,
    flags: 'gi',
    why: 'A class time on two pages is a time one of them will be wrong about.'
  },
  percentage: {
    label: 'percentage',
    source: String.raw`\b\d{1,3}(?:\.\d+)?\s?%`,
    flags: 'g',
    why: 'A rate written twice is a rate that will disagree with itself.'
  },
  dimension: {
    label: 'measurement',
    source: String.raw`\b\d+(?:\.\d+)?\s?(?:in|cm|mm|ft|")\s?(?:x|×|by)\s?\d+(?:\.\d+)?\s?(?:in|cm|mm|ft|")?`,
    flags: 'gi',
    why: 'A size written twice is a size that will be corrected in one place only.'
  }
};

const DEFAULT_PATTERNS = ['price', 'email', 'phone'];

const SCAN_EXTENSIONS = [
  '.html', '.htm', '.md', '.markdown', '.txt', '.css',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.vue', '.svelte', '.astro'
];

function compile(entry) {
  const preset = PRESETS[entry];
  if (preset) {
    return { id: entry, label: preset.label, regex: new RegExp(preset.source, preset.flags), why: preset.why, preset: true };
  }
  const regex = new RegExp(entry, 'g'); // may throw; the caller converts it
  return {
    id: entry,
    label: `pattern /${entry}/`,
    regex,
    why: 'This value appears in more than one file, so there is more than one place to change it.',
    preset: false
  };
}

const normalise = (s) => s.replace(/\s+/g, ' ').trim();

export const config = {
  title: 'Find values that are written down in more than one place',
  description: [
    'Scans for values that look like a fact a visitor can act on — prices, email addresses, phone',
    'numbers, times, product codes — and reports every one that appears in more than one file.',
    '',
    'A second copy of a value is a second value. It has not disagreed yet. The storefront this kit',
    'was built from advertised one price and charged another, because the number was typed into',
    'three files and only one of them was updated.',
    '',
    'Pass source_of_truth to enforce the strict form: the value may appear in that one file, and',
    'anywhere else is a copy.',
    '',
    `Preset patterns: ${Object.keys(PRESETS).join(', ')}. Anything else is treated as a regular expression.`
  ].join('\n'),
  inputSchema: {
    directory: directoryInput,
    patterns: z
      .array(z.string())
      .optional()
      .describe(
        `Preset names (${Object.keys(PRESETS).join(', ')}) or regular expressions. Default: ${DEFAULT_PATTERNS.join(', ')}`
      ),
    source_of_truth: z
      .string()
      .optional()
      .describe(
        'Path, relative to the site folder, of the one file allowed to hold these values. Every match elsewhere becomes a problem.'
      ),
    extensions: z.array(z.string()).optional().describe('File extensions to scan.'),
    ignore: ignoreInput,
    min_files: z
      .number()
      .int()
      .min(2)
      .optional()
      .describe('How many distinct files a value must appear in before it is reported. Default 2.')
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    files_scanned: z.number().int().optional(),
    patterns: z.array(z.string()).optional(),
    source_of_truth: z.string().nullable().optional(),
    duplicates: z
      .array(
        z.object({
          pattern: z.string(),
          value: z.string(),
          file_count: z.number().int(),
          occurrences: z.array(z.object({ file: z.string(), line: z.number().int() })),
          why: z.string(),
          fix: z.string()
        })
      )
      .optional(),
    copies_outside_source: z
      .array(z.object({ pattern: z.string(), value: z.string(), file: z.string(), line: z.number().int() }))
      .optional(),
    inventory: z
      .array(
        z.object({
          pattern: z.string(),
          distinct_values: z.number().int(),
          values: z.array(z.object({ value: z.string(), files: z.array(z.string()) }))
        })
      )
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

  const requested = args.patterns?.length ? args.patterns : DEFAULT_PATTERNS;
  const compiled = [];
  for (const entry of requested) {
    try {
      compiled.push(compile(entry));
    } catch (err) {
      return failure({
        tool: TOOL,
        code: 'BAD_PATTERN',
        problem: `"${entry}" is not a pattern I can use.`,
        why: `It is not one of the preset names, and as a regular expression it is invalid: ${err.message}`,
        fix: [
          `Use one of the presets: ${Object.keys(PRESETS).join(', ')}.`,
          'Or pass a valid regular expression, without the surrounding slashes.'
        ],
        data: { directory: dir, patterns: requested }
      });
    }
  }

  const extensions = args.extensions?.length ? args.extensions : SCAN_EXTENSIONS;
  const ignore = args.ignore?.length ? [...DEFAULT_IGNORE, ...args.ignore] : DEFAULT_IGNORE;
  const minFiles = args.min_files ?? 2;
  const sourceOfTruth = args.source_of_truth ? args.source_of_truth.replace(/^\.?\//, '') : null;

  const files = await walk(dir, { extensions, ignore });
  if (files.length === 0) {
    return toolResult({
      tool: TOOL,
      status: STATUS.SKIPPED,
      headline: 'Nothing was scanned, because no readable files were found.',
      sections: [{ title: 'Where I looked:', body: `  ${dir}\n  Extensions: ${extensions.join(' ')}` }],
      nextSteps: ['Check that this is the folder that holds the site.'],
      data: {
        directory: dir,
        files_scanned: 0,
        patterns: requested,
        source_of_truth: sourceOfTruth,
        duplicates: [],
        copies_outside_source: [],
        inventory: []
      }
    });
  }

  // pattern id -> value -> [{file, line}]
  const hits = new Map(compiled.map((c) => [c.id, new Map()]));
  let scanned = 0;

  for (const file of files) {
    const text = await readText(file);
    if (text === null) continue;
    scanned++;
    const relFile = rel(dir, file);
    const index = lineIndex(text);

    for (const pattern of compiled) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const value = normalise(m[0]);
        const bucket = hits.get(pattern.id);
        if (!bucket.has(value)) bucket.set(value, []);
        bucket.get(value).push({ file: relFile, line: index.lineAt(m.index) });
      }
    }
  }

  /* -- duplicates ------------------------------------------------------- */
  const duplicates = [];
  const inventory = [];

  for (const pattern of compiled) {
    const bucket = hits.get(pattern.id);
    const values = [];

    for (const [value, occurrences] of bucket) {
      const distinctFiles = [...new Set(occurrences.map((o) => o.file))];
      values.push({ value, files: distinctFiles });

      if (distinctFiles.length >= minFiles) {
        duplicates.push({
          pattern: pattern.id,
          value,
          file_count: distinctFiles.length,
          occurrences,
          why: pattern.why,
          fix: `Keep "${value}" in one file and have the others refer to it. On a plain HTML site the simplest form is to state it on one page and link to that page from the rest.`
        });
      }
    }

    values.sort((a, b) => b.files.length - a.files.length || a.value.localeCompare(b.value));
    if (values.length > 0) {
      inventory.push({ pattern: pattern.id, distinct_values: values.length, values });
    }
  }

  /* -- strict form ------------------------------------------------------ */
  const copiesOutsideSource = [];
  if (sourceOfTruth) {
    for (const pattern of compiled) {
      for (const [value, occurrences] of hits.get(pattern.id)) {
        for (const o of occurrences) {
          if (o.file === sourceOfTruth) continue;
          copiesOutsideSource.push({ pattern: pattern.id, value, file: o.file, line: o.line });
        }
      }
    }
    copiesOutsideSource.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }

  duplicates.sort((a, b) => b.file_count - a.file_count || a.pattern.localeCompare(b.pattern));

  /* -- report ----------------------------------------------------------- */
  const sections = [];

  if (duplicates.length > 0) {
    sections.push({
      title: `${count(duplicates.length, 'value')} written down in more than one file:`,
      body: table(
        [
          { key: 'value', label: 'VALUE', max: 24 },
          { key: 'pattern', label: 'KIND', max: 12 },
          { key: 'files', label: 'WHERE IT IS WRITTEN', max: 70 }
        ],
        duplicates.map((d) => ({
          value: d.value,
          pattern: d.pattern,
          files: d.occurrences.map((o) => `${o.file}:${o.line}`).join('  ')
        }))
      )
    });
  }

  if (sourceOfTruth) {
    const heldInSource = duplicates.length + copiesOutsideSource.length;
    sections.push({
      title: `Single source of truth: ${sourceOfTruth}`,
      body:
        copiesOutsideSource.length === 0
          ? `  No copies found outside it${heldInSource === 0 ? ' (and no matching values found anywhere).' : '.'}`
          : table(
              [
                { key: 'where', label: 'FILE:LINE', max: 34 },
                { key: 'value', label: 'COPY OF', max: 24 },
                { key: 'pattern', label: 'KIND', max: 14 }
              ],
              copiesOutsideSource.map((c) => ({
                where: `${c.file}:${c.line}`,
                value: c.value,
                pattern: c.pattern
              }))
            )
    });
  }

  if (inventory.length > 0) {
    sections.push({
      title: 'Everything found, so you can see at a glance whether two of them disagree:',
      body: inventory
        .map((inv) => {
          const lines = inv.values
            .slice(0, 25)
            .map((v) => `      ${v.value.padEnd(22)} ${v.files.join(', ')}`)
            .join('\n');
          const more = inv.values.length > 25 ? `\n      … and ${inv.values.length - 25} more` : '';
          return `  ${inv.pattern} — ${count(inv.distinct_values, 'distinct value')}\n${lines}${more}`;
        })
        .join('\n\n')
    });
  }

  const failed = duplicates.length > 0 || copiesOutsideSource.length > 0;

  const nextSteps = [];
  if (duplicates.length > 0) {
    nextSteps.push(
      'For each value above, decide which file owns it. Delete the other copies and link to the owner instead.'
    );
  }
  if (copiesOutsideSource.length > 0) {
    nextSteps.push(`Remove the copies listed above so ${sourceOfTruth} is the only place they are written.`);
  }
  if (inventory.length > 0 && !failed) {
    nextSteps.push(
      'Read the inventory above. Every value there is written in exactly one file, which is what you want.'
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push('Nothing to do. Run this again whenever you add a price, an address or a time to a page.');
  }

  const headline = failed
    ? `${count(duplicates.length + copiesOutsideSource.length, 'second source of truth')} found across ${count(scanned, 'file')}.`
    : `Every tracked value is written down in exactly one file (${count(scanned, 'file')} scanned).`;

  return toolResult({
    tool: TOOL,
    status: failed ? STATUS.FAIL : STATUS.PASS,
    headline,
    sections,
    nextSteps,
    data: {
      directory: dir,
      files_scanned: scanned,
      patterns: requested,
      source_of_truth: sourceOfTruth,
      duplicates,
      copies_outside_source: copiesOutsideSource,
      inventory
    }
  });
});

export const name = TOOL;
