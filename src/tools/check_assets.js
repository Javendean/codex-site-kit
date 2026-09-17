/**
 * check_assets — does everything the pages point at actually exist?
 *
 * Three families of dangling reference, and the second and third are the ones
 * that survive a look-at-it-in-the-browser test:
 *
 *   1. A file that is simply not there.
 *
 *   2. A file that IS there under a different capitalisation. macOS ships a
 *      case-insensitive filesystem, so `<img src="Logo.png">` finds `logo.png`
 *      on the machine the site was built on and 404s on every Linux host it is
 *      published to. The site is perfect until the moment it is live.
 *
 *   3. A CSS custom property with no value in the state the page starts in —
 *      the three-state theme bug. `var(--accent)` is a reference too, and if
 *      `--accent` is only defined inside `@media (prefers-color-scheme: dark)`
 *      then it is dangling for every visitor on a light-mode machine.
 */

import path from 'node:path';
import { z } from 'zod';

import {
  DEFAULT_IGNORE,
  PathError,
  readText,
  rel,
  requireDirectory,
  resolveReference,
  walk
} from '../lib/files.js';
import { ids, references } from '../lib/html.js';
import { findReferences, themeContract } from '../lib/css.js';
import { lineIndex } from '../lib/files.js';
import { STATUS, count, failure, guard, table, toolResult } from '../lib/report.js';
import { commonOutput, directoryInput, ignoreInput } from './common.js';

const TOOL = 'check_assets';

export const config = {
  title: 'Check that every file the site points at exists',
  description: [
    'Follows every image, stylesheet, script, icon and internal link in the site and confirms the',
    'file is really there. Reports file:line for anything that is not.',
    '',
    'Catches the case-sensitivity trap specifically: a file that resolves on a Mac because macOS',
    'ignores capitalisation, and 404s the moment the site is published to a Linux host. That one',
    'cannot be found by looking at the site in a browser on the machine that built it.',
    '',
    'Also audits the stylesheet theme contract, because var(--token) is a reference too. A custom',
    'property defined only inside @media (prefers-color-scheme: dark) has no value in the state',
    'most visitors are in.'
  ].join('\n'),
  inputSchema: {
    directory: directoryInput,
    ignore: ignoreInput,
    check_links: z
      .boolean()
      .optional()
      .describe('Also follow internal <a href> links to other pages. Default true.'),
    check_theme: z
      .boolean()
      .optional()
      .describe('Also audit the CSS theme contract. Default true.')
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    files_scanned: z.number().int().optional(),
    references_checked: z.number().int().optional(),
    counts: z
      .object({
        missing: z.number().int(),
        case_mismatch: z.number().int(),
        empty: z.number().int(),
        broken_anchor: z.number().int(),
        theme: z.number().int()
      })
      .optional(),
    problems: z
      .array(
        z.object({
          kind: z.string(),
          file: z.string(),
          line: z.number().int(),
          reference: z.string(),
          via: z.string().optional(),
          found_instead: z.string().optional(),
          why: z.string(),
          fix: z.string()
        })
      )
      .optional(),
    theme: z
      .object({
        stylesheets: z.array(z.string()),
        tokens: z.number().int(),
        has_dark_media: z.boolean(),
        has_dark_attribute: z.boolean(),
        dark_media_guarded: z.boolean(),
        conditional_only: z.array(z.string()),
        undefined_tokens: z.array(z.string()),
        state_gaps: z.array(z.object({ property: z.string(), missing_from: z.string(), consequence: z.string() }))
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

  const checkLinks = args.check_links !== false;
  const checkTheme = args.check_theme !== false;
  const ignore = args.ignore?.length ? [...DEFAULT_IGNORE, ...args.ignore] : DEFAULT_IGNORE;

  const htmlFiles = await walk(dir, { extensions: ['.html', '.htm'], ignore });
  const cssFiles = await walk(dir, { extensions: ['.css'], ignore });

  if (htmlFiles.length === 0 && cssFiles.length === 0) {
    return toolResult({
      tool: TOOL,
      status: STATUS.SKIPPED,
      headline: 'Nothing was checked, because no .html or .css files were found.',
      sections: [{ title: 'Where I looked:', body: `  ${dir}` }],
      nextSteps: ['Check that this is the folder that holds index.html.'],
      data: {
        directory: dir,
        files_scanned: 0,
        references_checked: 0,
        counts: { missing: 0, case_mismatch: 0, empty: 0, broken_anchor: 0, theme: 0 },
        problems: []
      }
    });
  }

  const problems = [];
  let checked = 0;

  /* -- HTML ------------------------------------------------------------- */
  for (const file of htmlFiles) {
    const text = await readText(file);
    if (text === null) continue;
    const index = lineIndex(text);
    const relFile = rel(dir, file);
    const pageIds = ids(text);

    for (const ref of references(text)) {
      const isPage = /\.(?:html?|php)$/i.test(ref.value.split('#')[0].split('?')[0]);

      // A bare "#name" points inside this very page. There is no file to
      // resolve; the question is whether anything here carries that id.
      if (ref.fragmentOnly) {
        if (!checkLinks) continue;
        if (ref.value === '#') continue; // "#" alone means the top of the page
        checked++;
        const hash = ref.value.slice(1);
        if (!pageIds.has(hash)) {
          problems.push({
            kind: 'broken_anchor',
            file: relFile,
            line: index.lineAt(ref.offset),
            reference: ref.value,
            via: `<${ref.tag} ${ref.attribute}>`,
            why: `Nothing on this page has id="${hash}", so this link scrolls nowhere.`,
            fix: `Add id="${hash}" to the element it should jump to, or correct the link.`
          });
        }
        continue;
      }

      if (ref.tag === 'a' || ref.tag === 'area') {
        if (!checkLinks) continue;
        if (!isPage && !/\.[a-z0-9]{1,6}$/i.test(ref.value)) continue; // a route, not a file
      }

      checked++;
      const outcome = await resolveReference(file, ref.value, { root: dir });
      const line = index.lineAt(ref.offset);
      const via = `<${ref.tag} ${ref.attribute}>`;

      if (outcome.kind === 'missing') {
        problems.push({
          kind: 'missing',
          file: relFile,
          line,
          reference: ref.value,
          via,
          why: 'There is no file at that path.',
          fix: `Put the file at ${rel(dir, outcome.target)}, or correct the path in ${relFile}:${line}.`
        });
      } else if (outcome.kind === 'case_mismatch') {
        problems.push({
          kind: 'case_mismatch',
          file: relFile,
          line,
          reference: ref.value,
          via,
          found_instead: rel(dir, outcome.actual),
          why: 'The file on disk is spelled with different capitalisation. Your Mac ignores that. A web server will not — this will 404 the day the site is published.',
          fix: `Change the path to "${path.basename(outcome.actual)}", or rename the file to "${path.basename(outcome.target)}". Make the two match exactly.`
        });
      } else if (outcome.kind === 'empty') {
        problems.push({
          kind: 'empty',
          file: relFile,
          line,
          reference: ref.value,
          via,
          why: 'The file exists but is zero bytes, so it will load as nothing.',
          fix: 'The file did not copy or export properly. Replace it.'
        });
      } else if (outcome.kind === 'directory') {
        problems.push({
          kind: 'missing',
          file: relFile,
          line,
          reference: ref.value,
          via,
          why: 'That path is a folder, not a file.',
          fix: 'Point it at a file inside that folder.'
        });
      }

      // "other.html#section" resolved to a real file: check the fragment too,
      // but only when it lands back on this same page, since ids elsewhere
      // belong to that page's own run.
      const hash = ref.value.includes('#') ? ref.value.split('#')[1] : '';
      if (checkLinks && hash && outcome.kind === 'found') {
        const samePage = path.resolve(outcome.target) === path.resolve(file);
        if (samePage && !pageIds.has(hash)) {
          problems.push({
            kind: 'broken_anchor',
            file: relFile,
            line,
            reference: `#${hash}`,
            via,
            why: `Nothing on this page has id="${hash}", so this link scrolls nowhere.`,
            fix: `Add id="${hash}" to the element it should jump to, or correct the link.`
          });
        }
      }
    }
  }

  /* -- CSS -------------------------------------------------------------- */
  for (const file of cssFiles) {
    const text = await readText(file);
    if (text === null) continue;
    const index = lineIndex(text);
    const relFile = rel(dir, file);

    for (const ref of findReferences(text)) {
      checked++;
      const outcome = await resolveReference(file, ref.value, { root: dir });
      const line = index.lineAt(ref.offset);
      if (outcome.kind === 'missing') {
        problems.push({
          kind: 'missing',
          file: relFile,
          line,
          reference: ref.value,
          via: ref.via,
          why: 'There is no file at that path.',
          fix: `Put the file at ${rel(dir, outcome.target)}, or correct the path in ${relFile}:${line}.`
        });
      } else if (outcome.kind === 'case_mismatch') {
        problems.push({
          kind: 'case_mismatch',
          file: relFile,
          line,
          reference: ref.value,
          via: ref.via,
          found_instead: rel(dir, outcome.actual),
          why: 'The file on disk is spelled with different capitalisation. Your Mac ignores that. A web server will not.',
          fix: `Make the path and the filename match exactly: "${path.basename(outcome.actual)}".`
        });
      } else if (outcome.kind === 'empty') {
        problems.push({
          kind: 'empty',
          file: relFile,
          line,
          reference: ref.value,
          via: ref.via,
          why: 'The file exists but is zero bytes.',
          fix: 'Replace it.'
        });
      }
    }
  }

  /* -- theme contract --------------------------------------------------- */
  let theme = null;
  if (checkTheme && cssFiles.length > 0) {
    const combined = [];
    for (const file of cssFiles) {
      const text = await readText(file);
      if (text !== null) combined.push({ file, text });
    }
    // One sheet at a time: tokens are usually not split across files, and a
    // per-file answer names the file to open.
    const merged = combined.map((c) => c.text).join('\n');
    const contract = themeContract(merged);

    theme = {
      stylesheets: combined.map((c) => rel(dir, c.file)),
      tokens: contract.tokens.length,
      has_dark_media: contract.has_dark_media,
      has_dark_attribute: contract.has_dark_attribute,
      dark_media_guarded: contract.dark_media_guarded,
      conditional_only: contract.conditional_only.map((t) => t.property),
      undefined_tokens: contract.undefined_tokens.map((t) => t.property),
      state_gaps: contract.state_gaps
    };

    for (const t of contract.conditional_only) {
      const owner = combined[0];
      problems.push({
        kind: 'theme_conditional_only',
        file: rel(dir, owner.file),
        line: lineIndex(owner.text).lineAt(Math.min(t.offset, owner.text.length - 1)),
        reference: t.property,
        via: t.conditions[0] || t.selector,
        why: `${t.property} is only given a value inside ${t.conditions[0] || t.selector}. In the state the page starts in, it has no value at all — so every var(${t.property}) falls back to nothing. This is invisible on a dark-mode Mac.`,
        fix: `Add ${t.property} to the bare :root block with its light value. Keep the conditional block; it should override, not define.`
      });
    }

    for (const t of contract.undefined_tokens) {
      const owner = combined[0];
      problems.push({
        kind: 'theme_undefined_token',
        file: rel(dir, owner.file),
        line: lineIndex(owner.text).lineAt(Math.min(t.offset, owner.text.length - 1)),
        reference: t.property,
        via: 'var()',
        why: `var(${t.property}) is used but ${t.property} is never defined${t.hasFallback ? '. It has a fallback, so it renders — but the fallback is a second place the colour is written down' : ', so it renders as nothing'}.`,
        fix: `Define ${t.property} in the bare :root block.`
      });
    }

    if (contract.has_dark_media && !contract.dark_media_guarded) {
      problems.push({
        kind: 'theme_unguarded_dark',
        file: theme.stylesheets[0],
        line: 1,
        reference: '@media (prefers-color-scheme: dark)',
        via: '@media',
        why: 'The system-dark block is not guarded with :root:not([data-theme="light"]). A visitor who explicitly chooses light will still get dark colours on a dark-mode machine.',
        fix: 'Change the selector inside the media query to :root:not([data-theme="light"]).'
      });
    }

    for (const gap of contract.state_gaps) {
      problems.push({
        kind: 'theme_state_gap',
        file: theme.stylesheets[0],
        line: 1,
        reference: gap.property,
        via: 'theme states',
        why: `${gap.property} is missing from ${gap.missing_from}, so ${gap.consequence}.`,
        fix: `Define ${gap.property} in both the media query and the [data-theme="dark"] block. The two dark states must agree.`
      });
    }
  }

  /* -- report ----------------------------------------------------------- */
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const counts = {
    missing: problems.filter((p) => p.kind === 'missing').length,
    case_mismatch: problems.filter((p) => p.kind === 'case_mismatch').length,
    empty: problems.filter((p) => p.kind === 'empty').length,
    broken_anchor: problems.filter((p) => p.kind === 'broken_anchor').length,
    theme: problems.filter((p) => p.kind.startsWith('theme_')).length
  };

  const sections = [];

  if (problems.length > 0) {
    sections.push({
      title: 'What is broken:',
      body: table(
        [
          { key: 'where', label: 'FILE:LINE', max: 34 },
          { key: 'kind', label: 'PROBLEM', max: 22 },
          { key: 'reference', label: 'POINTS AT', max: 40 }
        ],
        problems.map((p) => ({
          where: `${p.file}:${p.line}`,
          kind: p.kind.replace(/_/g, ' '),
          reference: p.reference
        }))
      )
    });

    sections.push({
      title: 'Each one, in full:',
      body: problems
        .map(
          (p, i) =>
            `  ${i + 1}. ${p.file}:${p.line}  ${p.via ?? ''}\n` +
            `     points at: ${p.reference}\n` +
            (p.found_instead ? `     on disk:   ${p.found_instead}\n` : '') +
            `     why:       ${p.why}\n` +
            `     fix:       ${p.fix}`
        )
        .join('\n\n')
    });
  }

  if (theme) {
    sections.push({
      title: 'Theme contract:',
      body: [
        `  Stylesheets:                    ${theme.stylesheets.join(', ')}`,
        `  Custom properties:              ${theme.tokens}`,
        `  Defined only under a condition: ${theme.conditional_only.length ? theme.conditional_only.join(', ') : 'none'}`,
        `  Used but never defined:         ${theme.undefined_tokens.length ? theme.undefined_tokens.join(', ') : 'none'}`,
        `  System dark block:              ${theme.has_dark_media ? (theme.dark_media_guarded ? 'present, guarded' : 'present, NOT guarded') : 'absent'}`,
        `  Chosen dark block:              ${theme.has_dark_attribute ? 'present' : 'absent'}`,
        `  States that disagree:           ${theme.state_gaps.length ? theme.state_gaps.map((g) => g.property).join(', ') : 'none'}`
      ].join('\n')
    });
  }

  const nextSteps = [];
  if (counts.case_mismatch > 0) {
    nextSteps.push(
      'Fix the capitalisation problems first. They work on your Mac and break when the site goes live, so nothing you see in the browser will warn you.'
    );
  }
  if (counts.missing > 0) nextSteps.push('Add the missing files, or correct the paths listed above.');
  if (counts.broken_anchor > 0) nextSteps.push('Fix the links that jump to an id nothing has.');
  if (counts.theme > 0) {
    nextSteps.push(
      'Move every custom property into the bare :root block and let the dark blocks override it. That is the only arrangement that works in all three theme states.'
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push('Nothing to do. Run this again whenever you add an image or rename a file.');
  }

  const headline =
    problems.length === 0
      ? `All ${count(checked, 'reference')} resolve.`
      : `${count(problems.length, 'broken reference')} out of ${checked} checked.`;

  return toolResult({
    tool: TOOL,
    status: problems.length === 0 ? STATUS.PASS : STATUS.FAIL,
    headline,
    sections,
    nextSteps,
    data: {
      directory: dir,
      files_scanned: htmlFiles.length + cssFiles.length,
      references_checked: checked,
      counts,
      problems,
      ...(theme ? { theme } : {})
    }
  });
});

export const name = TOOL;
