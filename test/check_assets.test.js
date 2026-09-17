/**
 * check_assets — dangling references of all three kinds.
 *
 * The case-mismatch test is skipped on a case-SENSITIVE filesystem, where the
 * situation it describes cannot arise: there, the file simply does not exist,
 * and the "missing" branch covers it.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { cleanup, connect, tempDir, write, writePng } from './helpers.js';

after(cleanup);

const problemsOf = (data, kind) => (data.problems ?? []).filter((p) => p.kind === kind);

/** Does this filesystem fold case the way macOS does? */
async function caseInsensitiveFs() {
  const dir = await tempDir('case-probe');
  await write(dir, 'Probe.txt', 'x');
  return existsSync(path.join(dir, 'probe.txt'));
}

const GOOD_CSS = `:root {
  --ground: #FFFFFF;
  --ink: #111111;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --ground: #111111; --ink: #EEEEEE; }
}
:root[data-theme="dark"] { --ground: #111111; --ink: #EEEEEE; }
body { background: var(--ground); color: var(--ink); }
`;

/* ------------------------------------------------------------------ *
 * Happy path
 * ------------------------------------------------------------------ */

test('happy path: a site whose references all resolve passes and counts them', async () => {
  const dir = await tempDir('assets-ok');
  await writePng(dir, 'photo.png', [{ hex: '#332211', weight: 1 }]);
  await write(dir, 'styles.css', GOOD_CSS);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>x</title>
<link rel="stylesheet" href="styles.css"></head>
<body>
  <a href="#main">Skip</a>
  <img src="photo.png" alt="A board">
  <main id="main"><p>Hello.</p></main>
  <a href="about.html">About</a>
</body></html>`
  );
  await write(dir, 'about.html', '<!doctype html><html lang="en"><head><title>About</title></head><body><p>Hi.</p></body></html>');

  const kit = await connect();
  const { data, isError } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(isError, false);
  assert.equal(data.status, 'pass');
  assert.equal(data.problems.length, 0);
  assert.ok(data.references_checked >= 4, `expected several references, got ${data.references_checked}`);
});

/* ------------------------------------------------------------------ *
 * Missing, empty, and the case trap
 * ------------------------------------------------------------------ */

test('a missing image is reported with its file, its line and where to put the file', async () => {
  const dir = await tempDir('assets-missing');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <img src="img/board.png" alt="A board">
</body></html>`
  );

  const kit = await connect();
  const { data, text } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'fail');
  const missing = problemsOf(data, 'missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].file, 'index.html');
  assert.equal(missing[0].line, 2);
  assert.equal(missing[0].reference, 'img/board.png');
  assert.match(missing[0].fix, /img[\\/]board\.png/);
  assert.match(text, /\[FAIL\] check_assets/);
});

test('the case trap: a file that resolves only because macOS folds case is its own category', async (t) => {
  if (!(await caseInsensitiveFs())) {
    t.skip('this filesystem is case-sensitive, so the trap cannot be reproduced here');
    return;
  }

  const dir = await tempDir('assets-case');
  await writePng(dir, 'Board.png', [{ hex: '#445566', weight: 1 }]);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <img src="board.png" alt="A board">
</body></html>`
  );

  const kit = await connect();
  const { data, text } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  const mismatch = problemsOf(data, 'case_mismatch');
  assert.equal(mismatch.length, 1, 'this must not be reported as "found"');
  assert.equal(mismatch[0].reference, 'board.png');
  assert.equal(mismatch[0].found_instead, 'Board.png');
  assert.match(mismatch[0].why, /Your Mac ignores that/);
  assert.match(text, /work on your Mac and break when the site goes live/);
  assert.equal(data.status, 'fail');
});

test('a zero-byte file is reported as empty rather than as present', async () => {
  const dir = await tempDir('assets-empty-file');
  await write(dir, 'styles.css', '');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title>
<link rel="stylesheet" href="styles.css"></head><body><p>Hi.</p></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(problemsOf(data, 'empty').length, 1);
});

test('a link to an id nothing has is reported as a link that scrolls nowhere', async () => {
  const dir = await tempDir('assets-anchor');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <a href="#lessons">Lessons</a>
  <main id="main"><p>Hi.</p></main>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  const broken = problemsOf(data, 'broken_anchor');
  assert.equal(broken.length, 1);
  assert.equal(broken[0].reference, '#lessons');
  assert.match(broken[0].fix, /id="lessons"/);
});

test('url() inside a stylesheet is followed too', async () => {
  const dir = await tempDir('assets-css-url');
  await write(dir, 'styles.css', `${GOOD_CSS}\n.hero { background-image: url("img/hero.jpg"); }\n`);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><p>Hi.</p></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  const missing = problemsOf(data, 'missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].file, 'styles.css');
  assert.equal(missing[0].reference, 'img/hero.jpg');
});

test('absolute URLs, data: URIs and mailto: links are left alone', async () => {
  const dir = await tempDir('assets-external');
  await write(dir, 'styles.css', GOOD_CSS);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
  <a href="https://example.org/elsewhere">Away</a>
  <a href="mailto:someone@somewhere.test">Write</a>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'pass', 'nothing outside the folder is this tool\'s business');
});

/* ------------------------------------------------------------------ *
 * The theme contract
 * ------------------------------------------------------------------ */

test('theme: a correct three-state sheet is reported as guarded, with no gaps', async () => {
  const dir = await tempDir('theme-ok');
  await write(dir, 'styles.css', GOOD_CSS);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><p>Hi.</p></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'pass');
  assert.equal(data.theme.has_dark_media, true);
  assert.equal(data.theme.has_dark_attribute, true);
  assert.equal(data.theme.dark_media_guarded, true);
  assert.deepEqual(data.theme.conditional_only, []);
  assert.deepEqual(data.theme.state_gaps, []);
});

test('theme: a colour defined ONLY inside the dark media query is the bug this catches', async () => {
  const dir = await tempDir('theme-conditional');
  await write(
    dir,
    'styles.css',
    `:root { --ground: #FFFFFF; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --ground: #111111; --accent: #8FB4D4; }
}
a { color: var(--accent); }
`
  );
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><a href="index.html">Hi</a></body></html>`
  );

  const kit = await connect();
  const { data, text } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'fail');
  assert.deepEqual(data.theme.conditional_only, ['--accent']);
  const problem = problemsOf(data, 'theme_conditional_only')[0];
  assert.match(problem.why, /no value at all/);
  assert.match(problem.why, /invisible on a dark-mode Mac/);
  assert.match(problem.fix, /bare :root block/);
  assert.match(text, /Defined only under a condition: --accent/);
});

test('theme: var() with no declaration anywhere is a dangling reference', async () => {
  const dir = await tempDir('theme-undefined');
  await write(dir, 'styles.css', `:root { --ground: #FFF; }\nbody { color: var(--ink); }\n`);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><p>Hi.</p></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.deepEqual(data.theme.undefined_tokens, ['--ink']);
  assert.equal(problemsOf(data, 'theme_undefined_token').length, 1);
});

test('theme: an unguarded dark block is caught — the light choice would be overridden', async () => {
  const dir = await tempDir('theme-unguarded');
  await write(
    dir,
    'styles.css',
    `:root { --ground: #FFF; --ink: #111; }
@media (prefers-color-scheme: dark) { :root { --ground: #111; --ink: #EEE; } }
:root[data-theme="dark"] { --ground: #111; --ink: #EEE; }
body { background: var(--ground); color: var(--ink); }
`
  );
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><p>Hi.</p></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.theme.dark_media_guarded, false);
  const problem = problemsOf(data, 'theme_unguarded_dark')[0];
  assert.ok(problem);
  assert.match(problem.fix, /:root:not\(\[data-theme="light"\]\)/);
});

test('theme: the two dark states disagreeing is reported per token', async () => {
  const dir = await tempDir('theme-gap');
  await write(
    dir,
    'styles.css',
    `:root { --ground: #FFF; --ink: #111; --accent: #06C; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --ground: #111; --ink: #EEE; --accent: #9CF; }
}
:root[data-theme="dark"] { --ground: #111; --ink: #EEE; }
body { background: var(--ground); color: var(--ink); }
a { color: var(--accent); }
`
  );
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><a href="index.html">Hi</a></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.theme.state_gaps.length, 1);
  assert.equal(data.theme.state_gaps[0].property, '--accent');
  assert.equal(data.theme.state_gaps[0].missing_from, ':root[data-theme="dark"]');
  assert.match(data.theme.state_gaps[0].consequence, /presses the dark button/);
});

test('theme: check_theme false turns the audit off entirely', async () => {
  const dir = await tempDir('theme-off');
  await write(dir, 'styles.css', `@media (prefers-color-scheme: dark) { :root { --x: #111; } }\nbody { color: var(--x); }\n`);
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="styles.css"></head><body><p>Hi.</p></body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir, check_theme: false });
  await kit.close();

  assert.equal(data.status, 'pass');
  assert.equal(data.theme, undefined);
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

test('failure: a folder that does not exist is a named error, not a crash', async () => {
  const kit = await connect();
  const { data, text, isError } = await kit.call('check_assets', { directory: '/nope/nothing/here' });
  await kit.close();

  assert.equal(isError, true);
  assert.equal(data.error_code, 'PATH_NOT_FOUND');
  assert.doesNotMatch(text, /node_modules|\bat Object\./);
});

test('failure: a folder with no pages is "skipped", which is not a pass', async () => {
  const dir = await tempDir('assets-nothing');
  await write(dir, 'notes.txt', 'nothing to see');

  const kit = await connect();
  const { data } = await kit.call('check_assets', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'skipped');
  assert.equal(data.references_checked, 0);
});
