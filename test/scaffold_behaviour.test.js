/**
 * The scaffold, driven in a real browser.
 *
 * Reading the generated CSS proves what the file says. Loading it proves what
 * the browser does, and those differ. The [hidden] regression below is the
 * case in point: the markup said hidden, the stylesheet said inline-flex, and
 * the browser sided with the stylesheet — so a dead control was on screen for
 * every visitor with JavaScript off.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { handler as initSite } from '../src/tools/init_site.js';
import { loadPlaywright } from '../src/lib/browser.js';
import { cleanup, playwrightAvailable, tempDir } from './helpers.js';

after(cleanup);

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

let SITE = null;
let chromium = null;

before(async () => {
  if (!HAVE_BROWSER) return;
  ({ chromium } = (await loadPlaywright({})).module);

  SITE = await tempDir('behaviour');
  const built = await initSite({
    directory: SITE,
    subject: 'chess lessons for children in Brooklyn',
    site_name: 'Brian Karen Chess',
    pages: ['Lessons', 'About', 'Contact'],
    // Pinned. Left to itself init_site picks a shape from the variety ledger,
    // and one of the five moves navigation to the foot — so an unpinned test
    // of the header navigation would pass or fail depending on what the
    // machine scaffolded last. The foot-nav shape gets its own test below.
    shape: 'counter'
  });
  assert.equal(built.structuredContent.status, 'pass');
});

const homeUrl = () => pathToFileURL(path.join(SITE, 'index.html')).href;

async function withPage(options, fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(homeUrl(), { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ *
 * Without JavaScript
 * ------------------------------------------------------------------ */

test('with JavaScript off, no dead control is shown and the navigation still works', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const state = await withPage(
    { viewport: { width: 375, height: 800 }, javaScriptEnabled: false },
    (page) =>
      page.evaluate(() => {
        const seen = (el) => Boolean(el) && el.getBoundingClientRect().width > 0;
        return {
          themeButtonVisible: seen(document.querySelector('[data-theme-toggle]')),
          navButtonVisible: seen(document.querySelector('[data-nav-toggle]')),
          navLinks: document.querySelectorAll('[data-nav-list] a').length,
          navListVisible: document.querySelector('[data-nav-list]').getBoundingClientRect().height > 0,
          headingText: document.querySelector('h1')?.textContent ?? '',
          bodyColour: getComputedStyle(document.body).backgroundColor
        };
      })
  );

  // The regression: [hidden] in the markup must actually hide, even though the
  // author stylesheet sets display on the same element.
  assert.equal(state.themeButtonVisible, false, 'a control JavaScript has not wired must not be on screen');
  assert.equal(state.navButtonVisible, false);

  // And the page must still be usable without any of it.
  assert.equal(state.navLinks, 4, 'every page must be reachable with JavaScript off');
  assert.equal(state.navListVisible, true, 'the menu must not be collapsed behind a button that does nothing');
  assert.equal(state.headingText, 'Brian Karen Chess');
  assert.notEqual(state.bodyColour, 'rgba(0, 0, 0, 0)', 'the tokens must resolve with no script at all');
});

/* ------------------------------------------------------------------ *
 * The three theme states
 * ------------------------------------------------------------------ */

test('theme: the system setting is followed when the visitor has chosen nothing', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const read = (scheme) =>
    withPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme }, (page) =>
      page.evaluate(() => ({
        attribute: document.documentElement.getAttribute('data-theme'),
        background: getComputedStyle(document.body).backgroundColor,
        colour: getComputedStyle(document.body).color
      }))
    );

  const light = await read('light');
  const dark = await read('dark');

  assert.equal(light.attribute, null, 'following the system means no attribute is stamped');
  assert.equal(dark.attribute, null);
  assert.notEqual(
    light.background,
    dark.background,
    'the guarded prefers-color-scheme block must actually change the ground'
  );
  assert.notEqual(light.colour, dark.colour);
});

test('theme: the button cycles system, light, dark — and light wins on a dark-mode machine', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const result = await withPage(
    { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
    async (page) => {
      const snapshot = () =>
        page.evaluate(() => ({
          attribute: document.documentElement.getAttribute('data-theme'),
          label: document.querySelector('[data-theme-toggle]').textContent,
          background: getComputedStyle(document.body).backgroundColor
        }));

      const states = [await snapshot()];
      for (let i = 0; i < 3; i++) {
        await page.click('[data-theme-toggle]');
        states.push(await snapshot());
      }
      return states;
    }
  );

  const [system, light, dark, backToSystem] = result;

  assert.equal(system.attribute, null);
  assert.equal(system.label, 'Theme: system');

  assert.equal(light.attribute, 'light');
  assert.equal(light.label, 'Theme: light');
  assert.notEqual(
    light.background,
    system.background,
    'choosing light on a dark-mode machine must override the system — this is what the :not() guard is for'
  );

  assert.equal(dark.attribute, 'dark');
  assert.equal(dark.label, 'Theme: dark');

  assert.equal(backToSystem.attribute, null, 'the third press returns to following the system');
  assert.equal(backToSystem.background, system.background);
});

test('theme: an explicit choice survives a reload', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const after = await withPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' }, async (page) => {
    await page.click('[data-theme-toggle]'); // -> light
    await page.click('[data-theme-toggle]'); // -> dark
    await page.reload({ waitUntil: 'load' });
    return page.evaluate(() => ({
      attribute: document.documentElement.getAttribute('data-theme'),
      label: document.querySelector('[data-theme-toggle]').textContent
    }));
  });

  assert.equal(after.attribute, 'dark');
  assert.equal(after.label, 'Theme: dark');
});

/* ------------------------------------------------------------------ *
 * The navigation disclosure
 * ------------------------------------------------------------------ */

test('navigation: on a phone the menu is a disclosure, and Escape closes it', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const result = await withPage({ viewport: { width: 375, height: 800 } }, async (page) => {
    const state = () =>
      page.evaluate(() => ({
        listVisible: document.querySelector('[data-nav-list]').getBoundingClientRect().height > 0,
        expanded: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),
        buttonVisible: document.querySelector('[data-nav-toggle]').getBoundingClientRect().width > 0
      }));

    const closed = await state();
    await page.click('[data-nav-toggle]');
    const open = await state();
    await page.keyboard.press('Escape');
    const reclosed = await state();
    return { closed, open, reclosed };
  });

  assert.equal(result.closed.buttonVisible, true, 'JavaScript ran, so the button is now real');
  assert.equal(result.closed.listVisible, false);
  assert.equal(result.closed.expanded, 'false');

  assert.equal(result.open.listVisible, true);
  assert.equal(result.open.expanded, 'true');

  assert.equal(result.reclosed.listVisible, false, 'Escape must close it');
  assert.equal(result.reclosed.expanded, 'false');
});

test('navigation: on a wide screen the links are always shown and the button is gone', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const state = await withPage({ viewport: { width: 1280, height: 900 } }, (page) =>
    page.evaluate(() => ({
      listVisible: document.querySelector('[data-nav-list]').getBoundingClientRect().height > 0,
      buttonVisible: document.querySelector('[data-nav-toggle]').getBoundingClientRect().width > 0
    }))
  );

  assert.equal(state.listVisible, true);
  assert.equal(state.buttonVisible, false);
});

/* ------------------------------------------------------------------ *
 * Reachable and operable
 * ------------------------------------------------------------------ */

/**
 * Two standards, because there really are two.
 *
 *   Chrome controls — buttons, the navigation, the wordmark — are standalone
 *   targets and are held to 44px, the figure Apple and Google both publish and
 *   the one the reference design system holds itself to.
 *
 *   A link inside a heading or a sentence is covered by the explicit exception
 *   in WCAG 2.2 SC 2.5.8, and is held to the 24px minimum instead. Forcing a
 *   heading's own link to 44px would mean padding the heading out of its own
 *   type rhythm, which fixes a number and worsens the page.
 */
test('tap targets: chrome controls clear 44px, in-text links clear the WCAG 2.2 minimum', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const measured = await withPage({ viewport: { width: 375, height: 800 } }, async (page) => {
    await page.click('[data-nav-toggle]'); // open the menu so its links are measurable
    return page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href], button'))
        .filter((el) => {
          const style = getComputedStyle(el);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            el.getBoundingClientRect().width > 0
          );
        })
        .map((el) => ({
          what: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
          text: (el.textContent || '').trim().slice(0, 30),
          height: Math.round(el.getBoundingClientRect().height),
          inText: Boolean(el.closest('h1, h2, h3, h4, h5, h6, p, li:not([class]) > *')) &&
            !el.closest('[data-nav-list], .head-bar')
        }))
    );
  });

  assert.ok(measured.length >= 6, 'the page must actually have controls to measure');

  const chrome = measured.filter((m) => !m.inText);
  const inText = measured.filter((m) => m.inText);

  assert.deepEqual(
    chrome.filter((m) => m.height < 44),
    [],
    'every standalone control must be at least 44px tall'
  );
  assert.deepEqual(
    inText.filter((m) => m.height < 24),
    [],
    'every in-text link must clear the 24px WCAG 2.2 minimum'
  );

  // The wordmark is a control, not prose, and must be in the strict group.
  const wordmark = measured.find((m) => m.what === 'a.wordmark');
  assert.ok(wordmark, 'the wordmark must be present');
  assert.equal(wordmark.inText, false);
  assert.ok(wordmark.height >= 44, `the wordmark was ${wordmark.height}px tall`);
});

test('the skip link is the first thing a keyboard reaches, and it goes to the content', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const state = await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    await page.keyboard.press('Tab');
    return page.evaluate(() => {
      const el = document.activeElement;
      return {
        className: el?.className ?? '',
        href: el?.getAttribute('href') ?? '',
        onScreen: el ? el.getBoundingClientRect().left >= 0 : false,
        targetExists: Boolean(document.querySelector('#main'))
      };
    });
  });

  assert.equal(state.className, 'skip');
  assert.equal(state.href, '#main');
  assert.equal(state.onScreen, true, 'it must become visible when it has focus');
  assert.equal(state.targetExists, true);
});

test('every page in the scaffold loads with nothing missing and nothing logged', async (t) => {
  if (!HAVE_BROWSER) return t.skip('Chromium is not available on this machine');

  const browser = await chromium.launch({ headless: true });
  const problems = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('requestfailed', (r) => problems.push(`failed request: ${r.url()}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));

    for (const file of ['index.html', 'lessons.html', 'about.html', 'contact.html']) {
      await page.goto(pathToFileURL(path.join(SITE, file)).href, { waitUntil: 'load' });
    }
  } finally {
    await browser.close();
  }

  assert.deepEqual(problems, []);
});
