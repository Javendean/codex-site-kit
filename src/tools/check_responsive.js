/**
 * check_responsive — load every page at every width and measure it.
 *
 * The assertion is one line: document.documentElement.scrollWidth must not
 * exceed window.innerWidth. If it does, the page scrolls sideways, and on a
 * phone that means the visitor drags the whole layout back and forth to read
 * a sentence.
 *
 * This is the check that caught the bug the reference storefront shipped. It
 * was not found by looking at the site, because on a desktop at 1440px it was
 * not there. It was found by measuring 11 pages at 6 widths and reading the
 * numbers.
 *
 * Measuring, not asserting: this tool reports the actual scrollWidth and the
 * actual innerWidth at every width, pass or fail, and the specific elements
 * whose right edge crosses the line.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { DEFAULT_IGNORE, PathError, rel, requireDirectory, walk } from '../lib/files.js';
import { BROWSER_ONLY_COMMAND, INSTALL_COMMAND, launchChromium } from '../lib/browser.js';
import { STATUS, count, failure, guard, table, toolResult } from '../lib/report.js';
import { commonOutput, directoryInput, ignoreInput } from './common.js';

const TOOL = 'check_responsive';

const DEFAULT_WIDTHS = [320, 390, 768, 1024, 1280, 1440];

/**
 * Runs inside the page.
 *
 * Two different faults push a page sideways, and they need opposite answers:
 *
 *   box      the element's own box is wider than the viewport — a fixed pixel
 *            width, 100vw inside padding, a negative margin. The CONTAINER is
 *            at fault, so the outermost one in a chain is the useful name.
 *
 *   content  the element's box fits, but something inside it will not wrap: a
 *            long URL, a code block, a wide table. The box does not cross the
 *            edge; its scrollWidth does. Here the DEEPEST element is the
 *            useful name, because that is where the unbreakable thing lives.
 *
 * Only reporting the first kind misses the commonest cause of sideways scroll
 * on a phone.
 */
/* c8 ignore start -- executes in the browser, not in node */
function measureInPage() {
  const doc = document.documentElement;
  const innerWidth = window.innerWidth;
  const tolerance = 1;

  const offenders = [];
  const all = document.querySelectorAll('body *');

  for (const el of all) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.position === 'fixed') continue;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const overRight = rect.right - innerWidth;
    const overLeft = -rect.left;

    if (overRight > tolerance || overLeft > tolerance) {
      offenders.push({
        el,
        kind: 'box',
        overflow: Math.round(Math.max(overRight, overLeft) * 10) / 10,
        side: overRight > overLeft ? 'right' : 'left',
        right: Math.round(rect.right * 10) / 10,
        left: Math.round(rect.left * 10) / 10,
        width: Math.round(rect.width * 10) / 10
      });
      continue;
    }

    // The box fits. Does what is inside it stay inside?
    // An element that scrolls or clips its own overflow is already handled —
    // that is the fix, not the bug.
    if (style.overflowX !== 'visible') continue;
    const spill = el.scrollWidth - el.clientWidth;
    if (spill <= tolerance) continue;

    const effectiveRight = rect.left + el.scrollWidth;
    if (effectiveRight - innerWidth <= tolerance) continue;

    offenders.push({
      el,
      kind: 'content',
      overflow: Math.round((effectiveRight - innerWidth) * 10) / 10,
      side: 'right',
      right: Math.round(effectiveRight * 10) / 10,
      left: Math.round(rect.left * 10) / 10,
      width: Math.round(el.scrollWidth * 10) / 10
    });
  }

  const boxOffenders = offenders.filter((o) => o.kind === 'box');
  const contentOffenders = offenders.filter((o) => o.kind === 'content');

  // A too-wide box: blame the outermost, it is dragging its children along.
  const boxSet = new Set(boxOffenders.map((o) => o.el));
  const outermostBoxes = boxOffenders.filter((o) => {
    let parent = o.el.parentElement;
    while (parent && parent !== document.body) {
      if (boxSet.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });

  // Spilling content: blame the deepest, that is where the unbreakable thing is.
  const contentSet = new Set(contentOffenders.map((o) => o.el));
  const innermostContent = contentOffenders.filter((o) => {
    for (const other of contentSet) {
      if (other !== o.el && o.el.contains(other)) return false;
    }
    return true;
  });

  // A content spill that is really a too-wide box somewhere in the same chain
  // is that box's problem, reported once. This covers both directions: an
  // ancestor whose scrollWidth only grew because of a wide child, and a
  // descendant sitting inside a box that was already named.
  const outermost = outermostBoxes.concat(
    innermostContent.filter(
      (o) => !boxOffenders.some((b) => b.el === o.el || b.el.contains(o.el) || o.el.contains(b.el))
    )
  );

  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (siblings.length > 1) s += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
    }
    return s;
  };

  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  /**
   * The other half of the Tier 1 five-second tell.
   *
   * "Anything that scrolls sideways, or a button wrapping to two lines" —
   * research/08-craft.md ranks them together because both read as BROKEN
   * rather than as cheap, and broken is the worse of the two. A wrapped label
   * cannot be seen in the markup: it depends on the rendered width of the
   * actual glyphs at the actual viewport, which is exactly what a browser is
   * for. getClientRects() returns one rectangle per line box, so its length IS
   * the line count.
   */
  const controls = [];
  for (const el of document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], summary')) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const label = textOf(el);
    if (!label && el.tagName !== 'INPUT') continue;

    // Count line boxes on the text itself rather than on the padded box.
    let lines = 1;
    const node = Array.from(el.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(el);
      lines = Math.max(1, range.getClientRects().length);
    }

    const looksLikeButton =
      el.tagName === 'BUTTON' ||
      el.getAttribute('role') === 'button' ||
      el.tagName === 'INPUT' ||
      /\b(btn|button|cta)\b/i.test(el.getAttribute('class') || '');

    if (lines > 1 && looksLikeButton) {
      controls.push({ kind: 'wrapped_label', selector: describe(el), label, lines, height: Math.round(rect.height) });
    }
    if (rect.height > 0 && rect.height < 44 && looksLikeButton) {
      controls.push({ kind: 'small_target', selector: describe(el), label, lines, height: Math.round(rect.height * 10) / 10 });
    }
  }

  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    innerWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
    title: document.title || '',
    controls: controls.slice(0, 8),
    offenders: outermost
      .sort((a, b) => b.overflow - a.overflow)
      .slice(0, 8)
      .map((o) => ({
        selector: describe(o.el),
        kind: o.kind,
        overflow_px: o.overflow,
        side: o.side,
        left: o.left,
        right: o.right,
        width: o.width,
        text: textOf(o.el)
      }))
  };
}
/* c8 ignore stop */

/**
 * The result when no browser could be started.
 *
 * Extracted and exported because this is the dangerous path, and it must be
 * testable on a machine where Chromium IS installed. If this ever renders as
 * anything a reader could mistake for a pass, the whole tool is worse than
 * useless: it would certify pages nobody looked at.
 *
 * @param {{dir:string, launch:object, pages:string[], widths:number[]}} o
 */
export function browserUnavailableResult({ dir, launch, pages, widths }) {
  const isMissingBrowser = launch.reason === 'browser_not_downloaded';

  return toolResult({
    tool: TOOL,
    status: STATUS.SKIPPED,
    headline: 'Nothing was measured. This is NOT a pass — the browser it needs is not available.',
    sections: [
      { title: 'What happened:', body: `  ${launch.detail}` },
      {
        title: 'Run this one line in Terminal, then ask for this check again:',
        body: `\n      ${launch.command}\n`
      },
      {
        title: 'What this would have measured:',
        body:
          `  ${count(pages.length, 'page')} at ${count(widths.length, 'width')} — ` +
          `${pages.length * widths.length} measurements.\n` +
          `  Widths: ${widths.join(', ')}`
      },
      isMissingBrowser
        ? {
            title: 'Note:',
            body:
              '  Playwright itself is already installed. Only the browser it drives is missing,\n' +
              '  which is why the command above is the short one.'
          }
        : null
    ],
    nextSteps: [
      `Copy this line into Terminal and press Return: ${launch.command}`,
      'It downloads about 150 MB and takes a couple of minutes. It only has to be done once.',
      'Then ask for check_responsive again. Until you do, nobody has measured these pages.'
    ],
    data: {
      directory: dir,
      browser_available: false,
      browser_from: launch.from ?? null,
      install_command: launch.command,
      widths,
      pages_tested: 0,
      measurements_taken: 0,
      overflow_count: 0,
      measurements: [],
      page_errors: [
        {
          page: '(none)',
          width: 0,
          kind: launch.reason,
          detail: launch.detail ?? 'unavailable'
        }
      ]
    }
  });
}

export const config = {
  title: 'Measure every page for sideways scroll',
  description: [
    'Loads each page in a real headless Chromium at a set of widths and asserts that',
    'document.documentElement.scrollWidth does not exceed window.innerWidth. Reports the actual',
    'numbers at every width, pass or fail, and names the specific elements whose edge crosses the',
    'line.',
    '',
    'Requires Playwright, which is NOT installed with this kit. If it is missing this tool returns',
    'status "skipped" with the one command that installs it. It never reports a pass it did not',
    'measure.'
  ].join('\n'),
  inputSchema: {
    directory: directoryInput,
    pages: z
      .array(z.string())
      .optional()
      .describe('Specific .html files to test, relative to the site folder. Default: every .html file found.'),
    widths: z
      .array(z.number().int().min(200).max(4000))
      .optional()
      .describe(`Viewport widths in CSS pixels. Default: ${DEFAULT_WIDTHS.join(', ')}`),
    height: z.number().int().min(200).max(4000).optional().describe('Viewport height. Default 900.'),
    timeout_ms: z.number().int().min(1000).max(120000).optional().describe('Per-page load timeout. Default 20000.'),
    ignore: ignoreInput
  },
  outputSchema: {
    ...commonOutput,
    directory: z.string().optional(),
    browser_available: z.boolean().optional(),
    browser_from: z.string().nullable().optional(),
    install_command: z.string().nullable().optional(),
    widths: z.array(z.number()).optional(),
    pages_tested: z.number().int().optional(),
    measurements_taken: z.number().int().optional(),
    overflow_count: z.number().int().optional(),
    measurements: z
      .array(
        z.object({
          page: z.string(),
          width: z.number(),
          scroll_width: z.number(),
          inner_width: z.number(),
          client_width: z.number(),
          overflow_px: z.number(),
          passes: z.boolean(),
          offenders: z
            .array(
              z.object({
                selector: z.string(),
                kind: z.string().describe('"box" = the element itself is too wide. "content" = something inside it will not wrap.'),
                overflow_px: z.number(),
                side: z.string(),
                left: z.number(),
                right: z.number(),
                width: z.number(),
                text: z.string()
              })
            )
            .optional()
        })
      )
      .optional(),
    page_errors: z
      .array(z.object({ page: z.string(), width: z.number(), kind: z.string(), detail: z.string() }))
      .optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false }
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

  const widths = (args.widths?.length ? args.widths : DEFAULT_WIDTHS).slice().sort((a, b) => a - b);
  const height = args.height ?? 900;
  const timeout = args.timeout_ms ?? 20000;
  const ignore = args.ignore?.length ? [...DEFAULT_IGNORE, ...args.ignore] : DEFAULT_IGNORE;

  /* -- which pages ------------------------------------------------------ */
  let pages;
  if (args.pages?.length) {
    pages = args.pages.map((p) => path.resolve(dir, p));
  } else {
    pages = await walk(dir, { extensions: ['.html', '.htm'], ignore });
  }

  if (pages.length === 0) {
    return toolResult({
      tool: TOOL,
      status: STATUS.SKIPPED,
      headline: 'Nothing was measured, because no pages were found.',
      sections: [{ title: 'Where I looked:', body: `  ${dir}` }],
      nextSteps: ['Check that this is the folder that holds index.html.'],
      data: {
        directory: dir,
        browser_available: false,
        browser_from: null,
        install_command: null,
        widths,
        pages_tested: 0,
        measurements_taken: 0,
        overflow_count: 0,
        measurements: [],
        page_errors: []
      }
    });
  }

  /* -- the browser ------------------------------------------------------ */
  const launch = await launchChromium({ near: dir });

  if (!launch.browser) {
    return browserUnavailableResult({ dir, launch, pages, widths });
  }

  /* -- measure ---------------------------------------------------------- */
  const measurements = [];
  const pageErrors = [];
  const browser = launch.browser;

  try {
    const context = await browser.newContext({ viewport: { width: widths[0], height } });
    const page = await context.newPage();

    for (const file of pages) {
      const relFile = rel(dir, file);
      const url = pathToFileURL(file).href;

      for (const width of widths) {
        const failures = [];
        const onFailed = (request) =>
          failures.push(`${request.url().split('/').pop()} (${request.failure()?.errorText ?? 'failed'})`);
        const onConsole = (msg) => {
          if (msg.type() === 'error') failures.push(`console: ${msg.text().slice(0, 120)}`);
        };

        page.on('requestfailed', onFailed);
        page.on('console', onConsole);

        try {
          await page.setViewportSize({ width, height });
          await page.goto(url, { waitUntil: 'load', timeout });
          const m = await page.evaluate(measureInPage);

          const overflow = Math.max(0, m.scrollWidth - m.innerWidth);
          measurements.push({
            page: relFile,
            width,
            scroll_width: m.scrollWidth,
            inner_width: m.innerWidth,
            client_width: m.clientWidth,
            overflow_px: overflow,
            passes: overflow === 0 && (m.controls ?? []).length === 0,
            offenders: overflow > 0 ? m.offenders : [],
            controls: m.controls ?? []
          });

          for (const detail of failures) {
            pageErrors.push({ page: relFile, width, kind: 'failed_request', detail });
          }
        } catch (err) {
          pageErrors.push({
            page: relFile,
            width,
            kind: 'load_failed',
            detail: String(err?.message ?? err).split('\n')[0]
          });
        } finally {
          page.off('requestfailed', onFailed);
          page.off('console', onConsole);
        }
      }
    }

    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }

  /* -- report ----------------------------------------------------------- */
  const overflowing = measurements.filter((m) => m.overflow_px > 0);
  const withControlFaults = measurements.filter((m) => (m.controls ?? []).length > 0);
  const pagesTested = new Set(measurements.map((m) => m.page)).size;

  const sections = [
    {
      title: 'Measured — document.documentElement.scrollWidth against window.innerWidth:',
      body: table(
        [
          { key: 'page', label: 'PAGE', max: 28 },
          { key: 'width', label: 'VIEWPORT', align: 'right', max: 9 },
          { key: 'scroll', label: 'SCROLLWIDTH', align: 'right', max: 12 },
          { key: 'inner', label: 'INNERWIDTH', align: 'right', max: 11 },
          { key: 'over', label: 'OVER BY', align: 'right', max: 8 },
          { key: 'verdict', label: '', max: 6 }
        ],
        measurements.map((m) => ({
          page: m.page,
          width: m.width,
          scroll: m.scroll_width,
          inner: m.inner_width,
          over: m.overflow_px === 0 ? '—' : `${m.overflow_px}px`,
          verdict: m.passes ? 'ok' : 'SCROLL'
        }))
      )
    }
  ];

  if (overflowing.length > 0) {
    sections.push({
      title: 'What is pushing the page sideways:',
      body: overflowing
        .map((m) => {
          const head = `  ${m.page} at ${m.width}px — ${m.overflow_px}px too wide`;
          if (m.offenders.length === 0) {
            return `${head}\n      No single element crosses the edge. Look for a margin, a negative\n      inset, or 100vw on an element inside a padded container.`;
          }
          const body = m.offenders
            .map(
              (o) =>
                `      ${o.selector}\n` +
                `          right edge ${o.right}px, viewport ends at ${m.inner_width}px (${o.overflow_px}px over, ${o.side})\n` +
                (o.text ? `          contains: "${o.text}"\n` : '')
            )
            .join('');
          return `${head}\n${body}`.trimEnd();
        })
        .join('\n\n')
    });
  }

  if (withControlFaults.length > 0) {
    sections.push({
      title: 'Buttons measured at the rendered width — labels that wrap, and targets too small to tap:',
      body: withControlFaults
        .map((m) => {
          const rows = m.controls
            .map((c) =>
              c.kind === 'wrapped_label'
                ? `      ${c.selector} wraps to ${c.lines} lines: "${c.label}"\n          A button label on two lines reads as broken, not as cheap. Shorten the label first; white-space: nowrap second.`
                : `      ${c.selector} is ${c.height}px tall: "${c.label}"\n          Below 44px a tap lands on whatever is next to what you aimed at. Add @media (pointer: coarse) { min-height: 48px }.`
            )
            .join('\n');
          return `  ${m.page} at ${m.width}px\n${rows}`;
        })
        .join('\n\n')
    });
  }

  if (pageErrors.length > 0) {
    sections.push({
      title: 'Problems loading the pages:',
      body: table(
        [
          { key: 'page', label: 'PAGE', max: 28 },
          { key: 'width', label: 'WIDTH', align: 'right', max: 6 },
          { key: 'kind', label: 'KIND', max: 16 },
          { key: 'detail', label: 'DETAIL', max: 60 }
        ],
        pageErrors.map((e) => ({ page: e.page, width: e.width || '—', kind: e.kind, detail: e.detail }))
      )
    });
  }

  const nextSteps = [];
  if (overflowing.length > 0) {
    nextSteps.push(
      'Open the first element named above and find what makes it wider than its container: a fixed width in pixels, 100vw, a negative margin, or a long unbroken word or URL.'
    );
    nextSteps.push(
      'If it is a wide table or a code block, wrap it in a container with overflow-x: auto so it scrolls inside its own box instead of moving the page.'
    );
    nextSteps.push('Change one thing, then run this check again and compare the numbers.');
  } else {
    nextSteps.push('Nothing to do. Run this again after any change to the layout or the stylesheet.');
  }

  if (withControlFaults.length > 0) {
    nextSteps.push(
      'Shorten the wrapping button labels. A two-line button reads as broken rather than as cheap, which is the worse of the two.'
    );
  }

  const clean = overflowing.length === 0 && withControlFaults.length === 0;
  const headline = clean
    ? `No sideways scroll and no wrapping or undersized controls. ${count(measurements.length, 'measurement')} across ${count(pagesTested, 'page')} and ${count(widths.length, 'width')}.`
    : [
        overflowing.length > 0
          ? `${count(overflowing.length, 'page/width combination')} scrolls sideways`
          : 'No sideways scroll',
        withControlFaults.length > 0
          ? `${count(withControlFaults.length, 'page/width combination')} has a button that wraps or is under 44px`
          : null
      ]
        .filter(Boolean)
        .join('; ') + `, out of ${measurements.length} measured.`;

  return toolResult({
    tool: TOOL,
    status: clean ? STATUS.PASS : STATUS.FAIL,
    headline,
    sections,
    nextSteps,
    data: {
      directory: dir,
      browser_available: true,
      browser_from: launch.from,
      install_command: null,
      widths,
      pages_tested: pagesTested,
      measurements_taken: measurements.length,
      overflow_count: overflowing.length,
      measurements,
      page_errors: pageErrors
    }
  });
});

export const name = TOOL;
export { DEFAULT_WIDTHS, INSTALL_COMMAND, BROWSER_ONLY_COMMAND };
