/**
 * check_responsive.
 *
 * Two branches, and both must be tested, because the dangerous one is the
 * branch where nothing was measured. "No overflow found" and "no measurement
 * taken" look the same in a summary and mean opposite things.
 *
 * The measuring tests run only where Chromium is available. The degradation
 * tests run everywhere, by asking the tool to find a browser that is not there.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { BROWSER_ONLY_COMMAND, INSTALL_COMMAND, loadPlaywright } from '../src/lib/browser.js';
import { browserUnavailableResult } from '../src/tools/check_responsive.js';
import { cleanup, connect, playwrightAvailable, tempDir, write } from './helpers.js';

after(cleanup);

const HAVE_BROWSER = await (async () => {
  if (!(await playwrightAvailable())) return false;
  // Playwright being importable is not the same as Chromium being downloaded.
  const { module: pw } = await loadPlaywright({});
  try {
    const browser = await pw.chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
})();

const CSS = `:root { --ground: #FFFFFF; --ink: #111111; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --ground: #111111; --ink: #EEEEEE; }
}
:root[data-theme="dark"] { --ground: #111111; --ink: #EEEEEE; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); overflow-wrap: break-word; }
.wrap { max-width: 1120px; margin-inline: auto; padding-inline: 16px; }
img { max-width: 100%; height: auto; display: block; }
`;

const page = (body, extraCss = '') =>
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test page</title>
<link rel="stylesheet" href="styles.css">
${extraCss ? `<style>${extraCss}</style>` : ''}
</head><body><div class="wrap">${body}</div></body></html>`;

/* ------------------------------------------------------------------ *
 * Degradation — runs everywhere
 * ------------------------------------------------------------------ */

/**
 * The skip path is rendered by an exported pure function so it can be checked
 * on any machine, including this one, where Chromium IS installed. Hiding a
 * real Playwright install by juggling cwd and PATH is unreliable, and an
 * unreliable test of the most dangerous branch is worse than none.
 */
const SKIP_CASES = [
  {
    label: 'Playwright is not installed at all',
    launch: {
      browser: null,
      reason: 'playwright_not_installed',
      detail: 'Playwright is not installed on this machine.',
      command: INSTALL_COMMAND,
      from: null
    },
    expectNote: false
  },
  {
    label: 'Playwright is installed but Chromium was never downloaded',
    launch: {
      browser: null,
      reason: 'browser_not_downloaded',
      detail: 'Playwright is installed, but the Chromium browser it drives has not been downloaded.',
      command: BROWSER_ONLY_COMMAND,
      from: '/usr/local/lib/node_modules/playwright'
    },
    expectNote: true
  },
  {
    label: 'the browser refused to launch',
    launch: {
      browser: null,
      reason: 'launch_failed',
      detail: 'browserType.launch: Target page, context or browser has been closed',
      command: BROWSER_ONLY_COMMAND,
      from: '/usr/local/lib/node_modules/playwright'
    },
    expectNote: false
  }
];

for (const { label, launch, expectNote } of SKIP_CASES) {
  test(`degradation: ${label} — reported as skipped, never as a pass`, () => {
    const result = browserUnavailableResult({
      dir: '/Users/brian/Sites/chess',
      launch,
      pages: ['/Users/brian/Sites/chess/index.html', '/Users/brian/Sites/chess/about.html'],
      widths: [320, 768, 1440]
    });

    const data = result.structuredContent;
    const text = result.content[0].text;

    assert.equal(data.status, 'skipped');
    assert.notEqual(data.status, 'pass', 'a skip must never be reported as a pass');
    assert.equal(data.browser_available, false);
    assert.equal(data.measurements_taken, 0);
    assert.equal(data.pages_tested, 0);
    assert.equal(data.overflow_count, 0);
    assert.deepEqual(data.measurements, []);
    assert.equal(data.install_command, launch.command);
    assert.equal(data.page_errors[0].kind, launch.reason);

    assert.match(text, /NOT CHECKED/);
    assert.match(text, /This is NOT a pass/);
    assert.match(text, /nobody has measured these pages/);
    assert.ok(text.includes(launch.command), 'the exact command must be in the text');
    assert.match(text, /6 measurements/, 'it must say what it would have measured');
    assert.doesNotMatch(text, /node_modules\/\S+\.js|\bat Object\./, 'no stack trace may reach the user');

    assert.equal(
      /Playwright itself is already installed/.test(text),
      expectNote,
      'the short command is only offered when Playwright really is present'
    );
  });
}

test('degradation: the live loader reports one of the known reasons, never an exception', async () => {
  const { launchChromium } = await import('../src/lib/browser.js');
  const launch = await launchChromium({ near: await tempDir('resp-probe') });

  if (launch.browser) {
    await launch.browser.close();
    assert.equal(launch.reason, null);
    assert.ok(typeof launch.from === 'string');
    return;
  }

  assert.ok(
    ['playwright_not_installed', 'playwright_unusable', 'browser_not_downloaded', 'launch_failed'].includes(
      launch.reason
    ),
    `unexpected reason: ${launch.reason}`
  );
  assert.ok(launch.command, 'a failure must always carry the command that fixes it');
});

test('degradation: the install command is one line a beginner can paste', () => {
  assert.equal(INSTALL_COMMAND, 'npm install -g playwright && npx playwright install chromium');
  assert.equal(BROWSER_ONLY_COMMAND, 'npx playwright install chromium');
  for (const command of [INSTALL_COMMAND, BROWSER_ONLY_COMMAND]) {
    assert.doesNotMatch(command, /\n/, 'it must be one line');
    assert.doesNotMatch(command, /sudo/, 'never ask a beginner for sudo');
  }
});

test('failure: a folder that does not exist is an error, not a skip', async () => {
  const kit = await connect();
  const { data, isError } = await kit.call('check_responsive', { directory: '/nowhere/at/all' });
  await kit.close();

  assert.equal(isError, true);
  assert.equal(data.status, 'error');
  assert.equal(data.error_code, 'PATH_NOT_FOUND');
});

test('failure: a folder with no pages is a skip that reports nothing measured', async () => {
  const dir = await tempDir('resp-nopages');
  await write(dir, 'notes.txt', 'nothing here');

  const kit = await connect();
  const { data } = await kit.call('check_responsive', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'skipped');
  assert.equal(data.pages_tested, 0);
  assert.equal(data.measurements_taken, 0);
});

/* ------------------------------------------------------------------ *
 * Measuring — needs Chromium
 * ------------------------------------------------------------------ */

test('happy path: a page with no overflow passes, with a number at every width', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-ok');
  await write(dir, 'styles.css', CSS);
  await write(dir, 'index.html', page('<h1>Lessons</h1><p>One hour, at your table.</p>'));
  await write(dir, 'about.html', page('<h1>About</h1><p>I have taught since 2009.</p>'));

  const kit = await connect();
  const { data, text, isError } = await kit.call('check_responsive', {
    directory: dir,
    widths: [320, 390, 768, 1024, 1280, 1440]
  });
  await kit.close();

  assert.equal(isError, false);
  assert.equal(data.status, 'pass');
  assert.equal(data.browser_available, true);
  assert.equal(data.pages_tested, 2);
  assert.equal(data.measurements_taken, 12, '2 pages x 6 widths');
  assert.equal(data.overflow_count, 0);

  for (const m of data.measurements) {
    assert.equal(m.inner_width, m.width, 'the viewport must be the width that was asked for');
    assert.ok(
      m.scroll_width <= m.inner_width,
      `${m.page} at ${m.width}: scrollWidth ${m.scroll_width} > innerWidth ${m.inner_width}`
    );
    assert.equal(m.overflow_px, 0);
    assert.equal(m.passes, true);
  }

  assert.match(text, /SCROLLWIDTH/, 'the actual numbers must be shown, pass or fail');
  assert.match(text, /320/);
});

test('a page that scrolls sideways fails, and the offending element is named', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-overflow');
  await write(dir, 'styles.css', CSS);
  await write(
    dir,
    'index.html',
    page(
      '<h1>Lessons</h1><div class="too-wide" id="culprit">A fixed-width block.</div>',
      '.too-wide { width: 900px; background: #eee; }'
    )
  );

  const kit = await connect();
  const { data, text } = await kit.call('check_responsive', { directory: dir, widths: [320, 1440] });
  await kit.close();

  assert.equal(data.status, 'fail');
  assert.equal(data.measurements_taken, 2);

  const narrow = data.measurements.find((m) => m.width === 320);
  const wide = data.measurements.find((m) => m.width === 1440);

  assert.equal(narrow.passes, false);
  assert.ok(narrow.overflow_px > 500, `expected a large overflow, got ${narrow.overflow_px}`);
  assert.equal(wide.passes, true, 'this is exactly the bug that is invisible on a desktop');

  assert.ok(narrow.offenders.length > 0, 'the element at fault must be named');
  assert.equal(narrow.offenders[0].selector, 'div#culprit');
  assert.equal(narrow.offenders[0].side, 'right');
  assert.ok(narrow.offenders[0].right > narrow.inner_width);
  assert.match(narrow.offenders[0].text, /A fixed-width block/);

  assert.match(text, /What is pushing the page sideways/);
  assert.match(text, /div#culprit/);
});

test('an unbroken string is caught too — the commonest cause on a phone', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-longword');
  await write(dir, 'styles.css', CSS);
  await write(
    dir,
    'index.html',
    page(`<h1>Contact</h1><pre>${'https://example.org/a-very-long-path-that-never-breaks'.repeat(3)}</pre>`,
      'pre { white-space: pre; }')
  );

  const kit = await connect();
  const { data } = await kit.call('check_responsive', { directory: dir, widths: [320] });
  await kit.close();

  assert.equal(data.status, 'fail');
  assert.ok(data.measurements[0].offenders.some((o) => o.selector.startsWith('pre')));
});

test('only the outermost offender is reported, not every element it drags with it', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-nested');
  await write(dir, 'styles.css', CSS);
  await write(
    dir,
    'index.html',
    page(
      '<div class="outer" id="outer"><div class="inner"><p>Deeply nested text.</p></div></div>',
      '.outer { width: 1200px; } .inner { width: 100%; }'
    )
  );

  const kit = await connect();
  const { data } = await kit.call('check_responsive', { directory: dir, widths: [320] });
  await kit.close();

  const offenders = data.measurements[0].offenders;
  assert.equal(offenders.length, 1, 'naming the container is actionable; naming its children is noise');
  assert.equal(offenders[0].selector, 'div#outer');
});

test('a specific list of pages can be measured instead of the whole folder', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-subset');
  await write(dir, 'styles.css', CSS);
  await write(dir, 'index.html', page('<h1>Home</h1>'));
  await write(dir, 'about.html', page('<h1>About</h1>'));

  const kit = await connect();
  const { data } = await kit.call('check_responsive', {
    directory: dir,
    pages: ['about.html'],
    widths: [768]
  });
  await kit.close();

  assert.equal(data.measurements_taken, 1);
  assert.equal(data.measurements[0].page, 'about.html');
});

test('a failed request is reported rather than silently ignored', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-failedreq');
  await write(dir, 'styles.css', CSS);
  await write(dir, 'index.html', page('<h1>Home</h1><img src="missing.png" alt="">'));

  const kit = await connect();
  const { data, text } = await kit.call('check_responsive', { directory: dir, widths: [768] });
  await kit.close();

  assert.ok(data.page_errors.length > 0, 'a 404 during the load must surface');
  assert.equal(data.page_errors[0].kind, 'failed_request');
  assert.match(text, /Problems loading the pages/);
});

test('the scaffold that init_site writes passes this check at every width', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const dir = await tempDir('resp-scaffold');
  const kit = await connect();

  const built = await kit.call('init_site', {
    directory: dir,
    subject: 'chess lessons for children in Brooklyn',
    site_name: 'Brian Karen Chess',
    pages: ['Lessons', 'About', 'Contact']
  });
  assert.equal(built.data.status, 'pass');

  const { data } = await kit.call('check_responsive', {
    directory: dir,
    widths: [320, 375, 414, 768, 1024, 1280, 1440, 1920]
  });
  await kit.close();

  assert.equal(data.status, 'pass', 'the scaffold must pass the measurement, not only the static checks');
  assert.equal(data.measurements_taken, 32, '4 pages x 8 widths');
  assert.equal(data.overflow_count, 0);
  assert.deepEqual(data.page_errors, [], 'the scaffold must load with nothing missing');
});
