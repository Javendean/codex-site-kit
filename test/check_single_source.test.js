/**
 * check_single_source — the second copy of a number.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup, connect, tempDir, write } from './helpers.js';

after(cleanup);

test('happy path: a price stated on exactly one page passes', async () => {
  const dir = await tempDir('sst-ok');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <p>Lessons are one hour. See <a href="lessons.html">Lessons</a> for the rate.</p>
</body></html>`
  );
  await write(
    dir,
    'lessons.html',
    `<!doctype html><html lang="en"><head><title>Lessons</title></head><body>
  <p>One hour, $45.00, at your table.</p>
</body></html>`
  );

  const kit = await connect();
  const { data, isError } = await kit.call('check_single_source', { directory: dir });
  await kit.close();

  assert.equal(isError, false);
  assert.equal(data.status, 'pass');
  assert.deepEqual(data.duplicates, []);

  const prices = data.inventory.find((i) => i.pattern === 'price');
  assert.equal(prices.distinct_values, 1);
  assert.deepEqual(prices.values[0].files, ['lessons.html']);
});

test('the same price in two files is reported with every file and line it is written on', async () => {
  const dir = await tempDir('sst-dup');
  await write(dir, 'index.html', '<!doctype html><title>x</title>\n<p>Lessons are $45.00 an hour.</p>\n');
  await write(dir, 'lessons.html', '<!doctype html><title>x</title>\n<p>An hour costs $45.00.</p>\n');
  await write(dir, 'cart.js', 'const PRICE = "$45.00";\n');

  const kit = await connect();
  const { data, text } = await kit.call('check_single_source', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'fail');
  assert.equal(data.duplicates.length, 1);

  const dup = data.duplicates[0];
  assert.equal(dup.value, '$45.00');
  assert.equal(dup.pattern, 'price');
  assert.equal(dup.file_count, 3);
  assert.deepEqual(
    dup.occurrences.map((o) => `${o.file}:${o.line}`).sort(),
    ['cart.js:1', 'index.html:2', 'lessons.html:2']
  );
  assert.match(dup.why, /is two prices/);
  assert.match(text, /written down in more than one file/);
});

test('the divergence is visible in the inventory: two prices, one per file', async () => {
  const dir = await tempDir('sst-diverge');
  await write(dir, 'index.html', '<!doctype html><title>x</title>\n<p>Lessons are $45.00 an hour.</p>\n');
  await write(dir, 'cart.js', 'const PRICE = "$40.00";\n');

  const kit = await connect();
  const { data, text } = await kit.call('check_single_source', { directory: dir });
  await kit.close();

  const prices = data.inventory.find((i) => i.pattern === 'price');
  assert.equal(prices.distinct_values, 2, 'the site advertises one number and charges another');
  assert.deepEqual(prices.values.map((v) => v.value).sort(), ['$40.00', '$45.00']);
  assert.match(text, /whether two of them disagree/);
});

test('source_of_truth: everything outside the owning file becomes a copy', async () => {
  const dir = await tempDir('sst-source');
  await write(dir, 'data.json', JSON.stringify({ hourly: '$45.00' }));
  await write(dir, 'index.html', '<!doctype html><title>x</title>\n<p>Lessons are $45.00 an hour.</p>\n');

  const kit = await connect();
  const { data, text } = await kit.call('check_single_source', {
    directory: dir,
    patterns: ['price'],
    source_of_truth: 'data.json'
  });
  await kit.close();

  assert.equal(data.status, 'fail');
  assert.equal(data.copies_outside_source.length, 1);
  assert.deepEqual(data.copies_outside_source[0], {
    pattern: 'price',
    value: '$45.00',
    file: 'index.html',
    line: 2
  });
  assert.match(text, /Single source of truth: data\.json/);
});

test('source_of_truth: a value written only in the owning file passes', async () => {
  const dir = await tempDir('sst-source-ok');
  await write(dir, 'data.json', JSON.stringify({ hourly: '$45.00' }));
  await write(dir, 'index.html', '<!doctype html><title>x</title>\n<p>See the rate card.</p>\n');

  const kit = await connect();
  const { data } = await kit.call('check_single_source', {
    directory: dir,
    patterns: ['price'],
    source_of_truth: 'data.json'
  });
  await kit.close();

  assert.equal(data.status, 'pass');
  assert.equal(data.copies_outside_source.length, 0);
});

test('a custom regular expression works alongside the presets', async () => {
  const dir = await tempDir('sst-regex');
  await write(dir, 'a.html', '<!doctype html><title>x</title>\n<p>Room B12 on Tuesdays.</p>\n');
  await write(dir, 'b.html', '<!doctype html><title>x</title>\n<p>We meet in Room B12.</p>\n');

  const kit = await connect();
  const { data } = await kit.call('check_single_source', {
    directory: dir,
    patterns: ['Room [A-Z]\\d+']
  });
  await kit.close();

  assert.equal(data.status, 'fail');
  assert.equal(data.duplicates[0].value, 'Room B12');
  assert.equal(data.duplicates[0].file_count, 2);
});

test('min_files raises the bar before something is called a duplicate', async () => {
  const dir = await tempDir('sst-min');
  await write(dir, 'a.html', '<!doctype html><title>x</title>\n<p>$45.00</p>\n');
  await write(dir, 'b.html', '<!doctype html><title>x</title>\n<p>$45.00</p>\n');

  const kit = await connect();
  const two = await kit.call('check_single_source', { directory: dir, patterns: ['price'] });
  const three = await kit.call('check_single_source', {
    directory: dir,
    patterns: ['price'],
    min_files: 3
  });
  await kit.close();

  assert.equal(two.data.duplicates.length, 1);
  assert.equal(three.data.duplicates.length, 0);
  assert.equal(three.data.status, 'pass');
});

test('email and phone are tracked by default, because they are what actually drifts', async () => {
  const dir = await tempDir('sst-contact');
  await write(dir, 'a.html', '<!doctype html><title>x</title>\n<p>brian@chess.test / (718) 555-8899</p>\n');
  await write(dir, 'b.html', '<!doctype html><title>x</title>\n<p>brian@chess.test / (718) 555-8899</p>\n');

  const kit = await connect();
  const { data } = await kit.call('check_single_source', { directory: dir });
  await kit.close();

  const kinds = data.duplicates.map((d) => d.pattern).sort();
  assert.deepEqual(kinds, ['email', 'phone']);
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

test('failure: an invalid regular expression is refused by name, not thrown', async () => {
  const dir = await tempDir('sst-bad-regex');
  await write(dir, 'a.html', '<!doctype html><title>x</title>');

  const kit = await connect();
  const { data, text, isError } = await kit.call('check_single_source', {
    directory: dir,
    patterns: ['price', '(unclosed']
  });
  await kit.close();

  assert.equal(isError, true);
  assert.equal(data.error_code, 'BAD_PATTERN');
  assert.match(data.problem, /"\(unclosed" is not a pattern I can use/);
  assert.ok(data.fix.some((f) => /Use one of the presets/.test(f)));
  assert.doesNotMatch(text, /node_modules|\bat Object\./, 'no stack trace may reach the user');
});

test('failure: a folder that does not exist is a named error', async () => {
  const kit = await connect();
  const { data, isError } = await kit.call('check_single_source', { directory: '/absent/folder' });
  await kit.close();

  assert.equal(isError, true);
  assert.equal(data.error_code, 'PATH_NOT_FOUND');
});

test('failure: a folder with nothing readable is "skipped", which is not a pass', async () => {
  const dir = await tempDir('sst-empty');

  const kit = await connect();
  const { data } = await kit.call('check_single_source', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'skipped');
  assert.equal(data.files_scanned, 0);
});
