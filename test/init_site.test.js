/**
 * The scaffolder, and the one claim it makes that is hard to keep.
 *
 * "Two consecutive scaffolds must differ structurally, not just in copy."
 *
 * That is the deepest finding in the research corpus — every site you ship
 * sharing a skeleton — and it is the claim most likely to quietly stop being
 * true, because nothing about a single site reveals it. So it is tested by
 * building several sites in a row and comparing their bones, and by feeding
 * the result back through the rulebook's own variety rules.
 *
 * The rest of the file holds the scaffolder to the same standard as anything
 * it will later criticise: it must come back from review_site with nothing
 * loud, it must invent nothing, and it must load in a real browser.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { handler as initSite } from '../src/tools/init_site.js';
import { handler as reviewSite } from '../src/tools/review_site.js';
import { loadPlaywright } from '../src/lib/browser.js';
import { AXES } from '../src/lib/compose.js';
import { cleanup, playwrightAvailable, tempDir } from './helpers.js';

after(cleanup);

const read = (dir, file) => readFile(path.join(dir, file), 'utf8');

async function build(subject, label = 'site') {
  const dir = await tempDir(label);
  const result = await initSite({ directory: dir, subject });
  assert.equal(result.structuredContent.status, 'pass', result.content[0].text.slice(0, 400));
  return { dir, data: result.structuredContent, text: result.content[0].text };
}

/* ------------------------------------------------------------------ *
 * The variety claim
 * ------------------------------------------------------------------ */

test('two consecutive scaffolds differ in their STRUCTURE, not only their words', async () => {
  const first = await build('chess lessons for club players, Brooklyn', 'variety-a');
  const second = await build('piano lessons for beginners, Queens', 'variety-b');

  assert.notEqual(second.data.choices.inventory, first.data.choices.inventory, 'the section inventory repeated');
  assert.notEqual(second.data.choices.hero, first.data.choices.hero, 'the hero repeated');

  // The inventory is the highest-carry axis, so the sections themselves must differ.
  const a = await read(first.dir, 'index.html');
  const b = await read(second.dir, 'index.html');
  const sectionsOf = (html) => [...html.matchAll(/<section id="([a-z-]+)"/g)].map((m) => m[1]);
  assert.notDeepEqual(sectionsOf(b), sectionsOf(a), 'both sites shipped the same sections in the same order');
});

test('four in a row do not collapse onto one shape', async () => {
  const subjects = ['a violin teacher in Leeds', 'a bakery in Cork', 'a bike repair shop', 'a tax preparer in Queens'];
  const built = [];
  for (const [i, subject] of subjects.entries()) built.push(await build(subject, `spread-${i}`));

  const inventories = new Set(built.map((b) => b.data.choices.inventory));
  const heroes = new Set(built.map((b) => b.data.choices.hero));

  assert.ok(inventories.size >= 3, `four builds used ${inventories.size} inventories: ${[...inventories]}`);
  assert.ok(heroes.size >= 3, `four builds used ${heroes.size} heroes: ${[...heroes]}`);
});

test('the ledger is written, and the choice is recorded against what was emitted', async () => {
  const { data } = await build('a bookbinder in Bath', 'ledger');
  assert.equal(data.ledger.written, true, 'nothing was recorded, so the next build cannot avoid this shape');
  assert.ok(data.ledger.entries >= 1);
  assert.ok(data.choices.inventory && data.choices.hero && data.choices.type && data.choices.surface);
});

test('the report says which axes differ from last time, rather than claiming variety', async () => {
  await build('a first subject for the ledger', 'prev');
  const { data, text } = await build('a second and quite different subject', 'next');

  assert.ok(Array.isArray(data.differs_from_previous));
  assert.ok(data.differs_from_previous.length >= 2, `only ${data.differs_from_previous.length} axes moved`);
  assert.match(text, /LAST TIME/, 'the report does not show what the previous build chose');
});

test('every axis the scaffolder offers is a real one, and none is empty', () => {
  for (const [axis, values] of Object.entries(AXES)) {
    assert.ok(values.length >= 2, `axis "${axis}" has fewer than two options, so it cannot vary`);
    assert.equal(new Set(values).size, values.length, `axis "${axis}" lists a duplicate`);
  }
});

/* ------------------------------------------------------------------ *
 * The scaffold holds to the rulebook it will later apply
 * ------------------------------------------------------------------ */

test('the scaffold comes back from the rulebook with nothing loud', async () => {
  const { dir } = await build('chess lessons for club players, Brooklyn', 'clean');
  const result = await reviewSite({ directory: dir });
  const { counts, findings } = result.structuredContent;

  assert.equal(counts.fail, 0, `blunders in a scaffold: ${findings.filter((f) => f.severity === 'fail').map((f) => f.id)}`);

  // What is left must be the holes: things that need a fact only the owner has.
  const remaining = findings.map((f) => f.id);
  const allowed = new Set([
    'T1-NO-IMAGES',
    'S-TEL-PRIMARY',
    'S-LOCALBUSINESS-SCHEMA',
    'S-SHARE-PREVIEW',
    'S-STICKY-CALL-BAR',
    'S-ABOVE-FOLD',
    'S-BOILERPLATE-IDENTICAL',
    'H-EMPTY-PROOF-SECTION'
  ]);
  for (const id of remaining) {
    assert.ok(allowed.has(id), `${id} is a scaffolder defect, not a hole waiting for a real fact`);
  }
});

test('the scaffold reviews its own output and reports the real number', async () => {
  const { text } = await build('a locksmith in Hull', 'selfcheck');
  assert.match(text, /Checked against the rulebook just now/);
});

test('the three theme states are all present, and the dark media query is guarded', async () => {
  const { dir } = await build('a piano tuner in Derby', 'theme');
  const css = await read(dir, 'styles.css');

  assert.match(css, /:root\s*\{/, 'no bare :root, so the light palette does not exist in the default state');
  assert.match(css, /@media \(prefers-color-scheme: dark\)/, 'no system-dark state');
  assert.match(css, /:root:not\(\[data-theme="light"\]\)/, 'the dark media query is unguarded');
  assert.match(css, /:root\[data-theme="dark"\]/, 'no chosen-dark state');
});

test('the scaffold invents nothing: no ratings, testimonials, counts or press', async () => {
  const { dir } = await build('a cabinetmaker in Oslo', 'honest');
  const html = await read(dir, 'index.html');

  for (const pattern of [/testimonial/i, /★|⭐/, /as seen (in|on)/i, /trusted by/i, /\b\d+\+ (happy|satisfied)/i]) {
    assert.doesNotMatch(html, pattern, `the scaffold invented something matching ${pattern}`);
  }
  assert.match(html, /data-placeholder=/, 'nothing is marked as an unfilled field');
});

test('the copyright year is this year, because a stale one is the cheapest tell there is', async () => {
  const { dir } = await build('a saddler in Galway', 'year');
  const html = await read(dir, 'index.html');
  assert.ok(html.includes(String(new Date().getFullYear())));
});

test('NOTES.md explains where each choice came from, including the one that derives from nothing', async () => {
  const { dir } = await build('a glazier in Dundee', 'notes');
  const notes = await read(dir, 'NOTES.md');

  assert.match(notes, /Section inventory/);
  assert.match(notes, /Nothing derives this from the subject/, 'the hash-seeded axis does not admit it is hash-seeded');
  assert.match(notes, /Roboto/, 'the honest font caveat is missing');
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

test('failure: a folder with files in it is refused, and names what is in there', async () => {
  const dir = await tempDir('occupied');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dir, 'index.html'), '<h1>mine</h1>', 'utf8');

  const result = await initSite({ directory: dir, subject: 'something' });
  assert.equal(result.structuredContent.error_code, 'DIRECTORY_NOT_EMPTY');
  assert.match(result.content[0].text, /index\.html/);
  assert.equal(await read(dir, 'index.html'), '<h1>mine</h1>', 'the existing file was overwritten anyway');
});

test('force: true overwrites, and only then', async () => {
  const dir = await tempDir('force');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dir, 'index.html'), '<h1>mine</h1>', 'utf8');
  await writeFile(path.join(dir, 'unrelated.txt'), 'keep me', 'utf8');

  const result = await initSite({ directory: dir, subject: 'a scaffold', force: true });
  assert.equal(result.structuredContent.status, 'pass');
  assert.notEqual(await read(dir, 'index.html'), '<h1>mine</h1>');
  assert.equal(await read(dir, 'unrelated.txt'), 'keep me', 'an unrelated file was destroyed');
});

test('failure: no subject is refused, because every axis is derived from it', async () => {
  const dir = await tempDir('nosubject');
  const result = await initSite({ directory: dir, subject: '' });
  assert.equal(result.structuredContent.error_code, 'NO_SUBJECT');
  assert.ok(result.structuredContent.fix.some((f) => /subject:/.test(f)));
});

/* ------------------------------------------------------------------ *
 * In a real browser
 * ------------------------------------------------------------------ */

const HAVE_BROWSER = await (async () => {
  if (!(await playwrightAvailable())) return false;
  const { module: pw } = await loadPlaywright({});
  try {
    const browser = await pw.chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
})();

let BROWSER_SITE = null;
before(async () => {
  if (!HAVE_BROWSER) return;
  ({ dir: BROWSER_SITE } = await build('a chess club in Brooklyn', 'browser'));
});

async function withPage(options, fn) {
  const { chromium } = (await loadPlaywright({})).module;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(BROWSER_SITE, 'index.html')).href, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test('with JavaScript off the page is complete, and shows no control that does nothing', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const result = await withPage({ javaScriptEnabled: false, viewport: { width: 390, height: 780 } }, async (page) => ({
    headings: await page.locator('h1').count(),
    buttons: await page.locator('button').count(),
    text: (await page.locator('main').innerText()).length
  }));

  assert.equal(result.headings, 1, 'a page needs exactly one h1');
  assert.equal(result.buttons, 0, 'a control was rendered that nothing is wired to');
  assert.ok(result.text > 200, 'the page is empty without JavaScript');
});

test('the theme button cycles system, light and dark, and an explicit light wins on a dark machine', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const states = await withPage({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } }, async (page) => {
    const button = page.locator('.theme__button');
    await button.waitFor();
    const seen = [await page.getAttribute('html', 'data-theme')];
    for (let i = 0; i < 3; i++) {
      await button.click();
      seen.push(await page.getAttribute('html', 'data-theme'));
    }
    return seen;
  });

  assert.deepEqual(states, [null, 'light', 'dark', null], `theme cycle was ${JSON.stringify(states)}`);
});

test('the page does not scroll sideways on the narrowest phone in common use', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const measured = await withPage({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }, (page) =>
    page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }))
  );

  assert.equal(measured.scrollWidth, measured.innerWidth, `the page is ${measured.scrollWidth - measured.innerWidth}px too wide at 320px`);
});

test('every control clears 48px on a touch device', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const short = await withPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }, (page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.btn, .theme__button'))
        .map((el) => ({ label: el.textContent.trim().slice(0, 30), height: el.getBoundingClientRect().height }))
        .filter((c) => c.height < 48)
    )
  );

  assert.deepEqual(short, [], `controls under 48px on a phone: ${JSON.stringify(short)}`);
});

test('nothing fails to load and nothing is logged as an error', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const { chromium } = (await loadPlaywright({})).module;
  const browser = await chromium.launch({ headless: true });
  const problems = [];
  try {
    const page = await browser.newPage();
    page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    await page.goto(pathToFileURL(path.join(BROWSER_SITE, 'index.html')).href, { waitUntil: 'load' });
  } finally {
    await browser.close();
  }

  assert.deepEqual(problems, []);
});
