/**
 * init_site.
 *
 * The load-bearing test in this file is the last group: the scaffold must pass
 * check_honesty, check_assets and check_single_source. A scaffolder that emits
 * work its own linter rejects teaches the person using it that the linter is
 * noise, and after that none of the checks are worth running.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { themeContract } from '../src/lib/css.js';
import { contrastRatio, roundRatio } from '../src/lib/color.js';
import { cleanup, connect, tempDir, write, writePng } from './helpers.js';

after(cleanup);

const read = (dir, file) => readFile(path.join(dir, file), 'utf8');

async function scaffold(args) {
  const dir = args.directory ?? (await tempDir('init'));
  const kit = await connect();
  const result = await kit.call('init_site', {
    directory: dir,
    subject: 'chess lessons for children in Brooklyn',
    ...args
  });
  await kit.close();
  return { dir, ...result };
}

/* ------------------------------------------------------------------ *
 * Happy path
 * ------------------------------------------------------------------ */

test('happy path: a complete, openable site is written, and every file is accounted for', async () => {
  const { dir, data, isError } = await scaffold({
    site_name: 'Brian Karen Chess',
    pages: ['Lessons', 'About', 'Contact']
  });

  assert.equal(isError, false);
  assert.equal(data.status, 'pass');

  const onDisk = (await readdir(dir)).sort();
  assert.deepEqual(onDisk, [
    '.honesty.json',
    'README.md',
    'THEME-NOTES.md',
    'about.html',
    'contact.html',
    'index.html',
    'lessons.html',
    'site.js',
    'styles.css'
  ]);

  assert.deepEqual(
    data.files_written.map((f) => f.file).sort(),
    onDisk,
    'the report must list exactly what was written'
  );
  assert.ok(data.files_written.every((f) => f.bytes > 0), 'nothing may be written empty');
  assert.equal(data.open_this, path.join(dir, 'index.html'));
});

test('no framework, no build step, no dependency: the page loads two local files and nothing else', async () => {
  const { dir } = await scaffold({ site_name: 'Chess', pages: ['Lessons'] });
  const html = await read(dir, 'index.html');

  assert.equal(html.match(/<link[^>]+href="styles\.css"/g).length, 1);
  assert.equal(html.match(/<script src="site\.js" defer><\/script>/g).length, 1);
  assert.doesNotMatch(html, /https?:\/\//, 'the page must not fetch anything from the network');
  assert.doesNotMatch(html, /react|vue|tailwind|bootstrap|jquery/i);

  const js = await read(dir, 'site.js');
  // The word appears once, in the comment promising it is not used.
  assert.doesNotMatch(js, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/,
    'nothing reaches the DOM as a string of markup');
  assert.doesNotMatch(js, /\bimport\b|\brequire\(/, 'no module system, so the file works over file://');
});

test('the page is a real document: language, charset, viewport, title, skip link, one h1', async () => {
  const { dir } = await scaffold({ site_name: 'Chess', pages: ['Lessons'] });
  const html = await read(dir, 'index.html');

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>Chess<\/title>/);
  assert.match(html, /<a class="skip" href="#main">/);
  assert.match(html, /<main id="main">/);
  assert.equal(html.match(/<h1>/g).length, 1, 'exactly one h1 per page');
});

/* ------------------------------------------------------------------ *
 * The three-state theme
 * ------------------------------------------------------------------ */

test('theme: all three states are present and the dark media query is guarded', async () => {
  const { dir } = await scaffold({ site_name: 'Chess' });
  const css = await read(dir, 'styles.css');

  assert.match(css, /:root\s*\{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);

  const contract = themeContract(css);
  assert.equal(contract.has_dark_media, true);
  assert.equal(contract.has_dark_attribute, true);
  assert.equal(contract.dark_media_guarded, true);
});

test('theme: the classic bug is absent — no colour is defined only inside the media query', async () => {
  const { dir } = await scaffold({ site_name: 'Chess' });
  const contract = themeContract(await read(dir, 'styles.css'));

  assert.deepEqual(
    contract.conditional_only,
    [],
    'every token must have a value in the bare :root, or it does not exist in the default state'
  );
  assert.deepEqual(contract.undefined_tokens, [], 'no var() may point at a token that was never defined');
  assert.deepEqual(contract.state_gaps, [], 'the two dark states must define the same tokens');
  assert.ok(contract.tokens.length > 20);
  assert.ok(contract.tokens.every((t) => t.defined_in_bare_root));
});

test('theme: the toggle cycles all three states and survives private browsing', async () => {
  const { dir } = await scaffold({ site_name: 'Chess' });
  const js = await read(dir, 'site.js');
  const html = await read(dir, 'index.html');

  assert.match(js, /\['system', 'light', 'dark'\]/);
  assert.match(js, /removeAttribute\('data-theme'\)/, 'system means no attribute at all');
  assert.match(js, /localStorage/);
  assert.equal(
    (js.match(/catch \(e\) \{ \/\* private browsing/g) || []).length,
    2,
    'both localStorage calls must survive a browser that refuses storage'
  );

  assert.match(html, /data-theme-toggle hidden/, 'a control JavaScript has not wired must not be shown');
  assert.match(html, /root\.setAttribute\("data-js", "on"\)/, 'the bootstrap must run before first paint');
});

/* ------------------------------------------------------------------ *
 * The palette
 * ------------------------------------------------------------------ */

test('palette: with a source image the colours come from the subject, and provenance is recorded', async () => {
  const dir = await tempDir('init-image');
  const holder = await tempDir('init-image-src');
  const image = await writePng(holder, 'board.png', [
    { hex: '#171615', weight: 6 },
    { hex: '#EDE6D6', weight: 3 },
    { hex: '#B4331F', weight: 1 }
  ]);

  const { data } = await scaffold({ directory: dir, site_name: 'Chess', source_image: image });

  assert.equal(data.palette.provisional, false);
  assert.equal(data.palette.source, path.resolve(image));
  assert.notEqual(data.palette.light.ground, '#FFFFFF', 'the ground is the subject\'s, not white');

  const css = await read(dir, 'styles.css');
  assert.match(css, /PALETTE PROVENANCE: quantised from/);
  assert.match(css, new RegExp(data.palette.light.ground));

  const notes = await read(dir, 'THEME-NOTES.md');
  assert.match(notes, /Quantised from/);
});

test('palette: with no source image the colours are labelled provisional, not passed off as a choice', async () => {
  const { dir, data, text } = await scaffold({ site_name: 'Chess' });

  assert.equal(data.palette.provisional, true);
  assert.equal(data.palette.source, null);

  const css = await read(dir, 'styles.css');
  assert.match(css, /PALETTE PROVENANCE: none/);
  assert.match(css, /not derived from anything/);
  assert.match(text, /PROVISIONAL/);
});

test('palette: every text pair clears its WCAG target, in both theme states', async () => {
  const dir = await tempDir('init-contrast');
  const holder = await tempDir('init-contrast-src');
  const image = await writePng(holder, 'p.png', [
    { hex: '#2B3A55', weight: 5 },
    { hex: '#F5EFE6', weight: 4 },
    { hex: '#CE7A2E', weight: 1 }
  ]);

  const { data } = await scaffold({ directory: dir, site_name: 'Chess', source_image: image });

  assert.equal(data.self_check.contrast.status, 'pass');
  for (const pair of data.palette.contrast) {
    assert.equal(pair.passes, true, `${pair.pair} (${pair.state}) was ${pair.ratio}:1, target ${pair.target}`);
    assert.equal(
      pair.ratio,
      roundRatio(contrastRatio(pair.foreground, pair.background)),
      'the reported ratio must be the real one'
    );
  }
});

test('palette: colours given by hand are used, and pushed into range if they cannot carry text', async () => {
  const { dir, data } = await scaffold({
    site_name: 'Chess',
    palette: {
      light: { ground: '#FFFFFF', ink: '#000000', accent: '#0B5FA5' },
      dark: { ground: '#101010', ink: '#F0F0F0', accent: '#7FB5E6' }
    }
  });

  assert.equal(data.palette.light.ground, '#FFFFFF');
  assert.equal(data.palette.light.ink, '#000000');
  assert.equal(data.palette.provisional, false);
  assert.ok(data.palette.contrast.every((c) => c.passes));

  const css = await read(dir, 'styles.css');
  assert.match(css, /--ground:\s+#FFFFFF;/);
});

/* ------------------------------------------------------------------ *
 * Honesty of the scaffold itself
 * ------------------------------------------------------------------ */

test('honesty: with no site_name the header carries a declared gap, not an invented brand', async () => {
  const { dir } = await scaffold({});
  const html = await read(dir, 'index.html');

  assert.match(html, /data-placeholder="site name">Name not chosen yet</);
  assert.doesNotMatch(html, /Acme|Your Company|Brand Name|Lorem/i);
});

test('honesty: the scaffold invents nothing — no reviews, ratings, counts or quotations', async () => {
  const { dir } = await scaffold({ site_name: 'Chess', pages: ['Lessons', 'About'] });

  for (const file of ['index.html', 'lessons.html', 'about.html']) {
    const html = await read(dir, file);
    assert.doesNotMatch(html, /testimonial|★|out of 5|as seen in|trusted by/i);
    assert.doesNotMatch(html, /<blockquote|<cite/i, 'no quotation means no attribution to get wrong');
  }
});

/* ------------------------------------------------------------------ *
 * It checks its own work
 * ------------------------------------------------------------------ */

test('the scaffold passes its own checks — reported, not asserted', async () => {
  const { data, text } = await scaffold({ site_name: 'Brian Karen Chess', pages: ['Lessons', 'About', 'Contact'] });

  assert.equal(data.self_check.all_passed, true);
  assert.equal(data.self_check.honesty.status, 'pass');
  assert.equal(data.self_check.assets.status, 'pass');
  assert.equal(data.self_check.single_source.status, 'pass');
  assert.equal(data.self_check.contrast.status, 'pass');

  assert.equal(data.self_check.honesty.counts.error, 0);
  assert.equal(data.self_check.assets.problems.length, 0);
  assert.deepEqual(data.self_check.single_source.duplicates, []);

  assert.match(text, /I then ran the checks against what I had just written/);
});

test('the scaffold passes the checks run independently afterwards, not only from inside init_site', async () => {
  const { dir } = await scaffold({ site_name: 'Chess', pages: ['Lessons', 'Contact'] });

  const kit = await connect();
  const honesty = await kit.call('check_honesty', { directory: dir });
  const assets = await kit.call('check_assets', { directory: dir });
  const single = await kit.call('check_single_source', { directory: dir });
  await kit.close();

  assert.equal(honesty.data.status, 'pass');
  assert.equal(assets.data.status, 'pass');
  assert.equal(single.data.status, 'pass');
  assert.equal(assets.data.theme.conditional_only.length, 0);
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

test('failure: a folder with files in it is refused, and says what is in there', async () => {
  const dir = await tempDir('init-occupied');
  await write(dir, 'my-important-notes.txt', 'do not delete me');

  const { data, text, isError } = await scaffold({ directory: dir, site_name: 'Chess' });

  assert.equal(isError, true);
  assert.equal(data.error_code, 'DIRECTORY_NOT_EMPTY');
  assert.ok(data.fix.some((f) => /my-important-notes\.txt/.test(f)), 'it must name what it refused to overwrite');
  assert.ok(data.fix.some((f) => /force: true/.test(f)), 'and how to proceed deliberately');
  assert.doesNotMatch(text, /node_modules|\bat Object\./);

  assert.equal(await read(dir, 'my-important-notes.txt'), 'do not delete me', 'nothing may be touched');
});

test('force: true writes into an occupied folder and leaves unrelated files alone', async () => {
  const dir = await tempDir('init-force');
  await write(dir, 'my-important-notes.txt', 'do not delete me');

  const { data } = await scaffold({ directory: dir, site_name: 'Chess', force: true });

  assert.equal(data.status, 'pass');
  assert.equal(await read(dir, 'my-important-notes.txt'), 'do not delete me');
  assert.match(await read(dir, 'index.html'), /<title>Chess<\/title>/);
});

test('failure: a source image that cannot be read stops the build rather than guessing colours', async () => {
  const dir = await tempDir('init-bad-image');

  const { data, isError } = await scaffold({
    directory: dir,
    site_name: 'Chess',
    source_image: '/Users/nobody/missing.png'
  });

  assert.equal(isError, true);
  assert.equal(data.error_code, 'IMAGE_NOT_FOUND');
  assert.ok(
    data.fix.some((f) => /leave source_image out/.test(f)),
    'it must offer the way forward, not just the refusal'
  );
  assert.deepEqual(await readdir(dir), [], 'nothing may be written when the build was refused');
});

test('failure: a colour that is not a colour is refused by name', async () => {
  const dir = await tempDir('init-bad-colour');

  const { data, isError } = await scaffold({
    directory: dir,
    site_name: 'Chess',
    palette: { light: { ground: '#FFFFFF', ink: 'dark blue', accent: '#0B5FA5' } }
  });

  assert.equal(isError, true);
  assert.equal(data.error_code, 'BAD_COLOUR');
  assert.match(data.why, /Not a hex colour: "dark blue"/);
  assert.deepEqual(await readdir(dir), []);
});

test('failure: page titles that collide do not overwrite each other', async () => {
  const { dir, data } = await scaffold({ site_name: 'Chess', pages: ['About', 'About'] });

  assert.equal(data.status, 'pass');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
  assert.deepEqual(files, ['about-2.html', 'about.html', 'index.html']);
});

test('failure: an empty page title is dropped rather than producing a file called ".html"', async () => {
  const { dir } = await scaffold({ site_name: 'Chess', pages: ['Lessons', '   ', ''] });

  const files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
  assert.deepEqual(files, ['index.html', 'lessons.html']);
});
