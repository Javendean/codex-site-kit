/**
 * check_honesty.
 *
 * The attribution cases are the ones that matter. A name set under a
 * quotation is an attribution even with no "said" and no dash, and that is the
 * exact bug the reference project shipped.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup, connect, tempDir, write } from './helpers.js';

after(cleanup);

const findingsFor = (data, rule) => (data.findings ?? []).filter((f) => f.rule === rule);
const has = (data, rule) => findingsFor(data, rule).length > 0;

/* ------------------------------------------------------------------ *
 * Happy path
 * ------------------------------------------------------------------ */

test('happy path: an honest page passes, and says how many files it read', async () => {
  const dir = await tempDir('honest');
  await write(
    dir,
    'index.html',
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Chess lessons</title></head>
<body>
  <h1>Chess lessons in Brooklyn</h1>
  <p>I have taught chess since 2009. Lessons are one hour, at your kitchen table.</p>
  <p>I am not taking new students this term.</p>
</body></html>`
  );

  const kit = await connect();
  const { data, text, isError } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(isError, false);
  assert.equal(data.status, 'pass');
  assert.equal(data.counts.error, 0);
  assert.equal(data.files_scanned, 1);
  assert.match(text, /\[PASS\] check_honesty/);
});

/* ------------------------------------------------------------------ *
 * The attribution cases
 * ------------------------------------------------------------------ */

test('attribution: a bare name under a quotation is caught — no "said", no dash', async () => {
  const dir = await tempDir('attrib-bare');
  await write(
    dir,
    'about.html',
    `<!doctype html><html lang="en"><head><title>About</title></head><body>
  <blockquote>
    <p>Chess is the gymnasium of the mind.</p>
  </blockquote>
  <p>Blaise Pascal</p>
</body></html>`
  );

  const kit = await connect();
  const { data, text } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  const found = findingsFor(data, 'unverified_attribution');
  assert.equal(found.length, 1, 'the bare name under the quote must be caught');
  assert.equal(found[0].file, 'about.html');
  // Line 1 is the doctype line, so the <p> holding the name is line 5.
  assert.equal(found[0].line, 5, 'it must name the line the name is on');
  assert.match(found[0].attributed_to, /Blaise Pascal/);
  assert.match(found[0].quotation, /gymnasium of the mind/);
  assert.match(found[0].why, /even with no "said" and no dash/);
  assert.match(text, /attributed: Blaise Pascal/);
});

test('attribution: a dash-prefixed name is caught, at high confidence', async () => {
  const dir = await tempDir('attrib-dash');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote>Chess is life.</blockquote>
  <p class="quiet">&mdash; Bobby Fischer</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  const found = findingsFor(data, 'unverified_attribution');
  assert.equal(found.length, 1);
  assert.equal(found[0].confidence, 'high');
  assert.match(found[0].attributed_to, /Bobby Fischer/);
});

test('attribution: a name with a role after a comma is caught', async () => {
  const dir = await tempDir('attrib-role');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <p>"My son looks forward to every lesson."</p>
  <p>Sarah M., parent</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.ok(has(data, 'unverified_attribution'), 'a quoted line plus "Name, role" is a testimonial');
  assert.match(findingsFor(data, 'unverified_attribution')[0].attributed_to, /Sarah M\., parent/);
});

test('attribution: a <cite> and a <figcaption> are both recognised', async () => {
  const dir = await tempDir('attrib-cite');
  await write(
    dir,
    'a.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote><p>Only the paranoid survive.</p></blockquote>
  <cite>Andrew Grove</cite>
</body></html>`
  );
  await write(
    dir,
    'b.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <figure>
    <blockquote><p>The pawns are the soul of chess.</p></blockquote>
    <figcaption>Philidor</figcaption>
  </figure>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  const files = findingsFor(data, 'unverified_attribution').map((f) => f.file).sort();
  assert.deepEqual(files, ['a.html', 'b.html']);
});

test('attribution: a Markdown quote with an em-dash attribution is caught', async () => {
  const dir = await tempDir('attrib-md');
  await write(
    dir,
    'notes.md',
    ['# Notes', '', '> Chess is the gymnasium of the mind.', '>', '> — Blaise Pascal', ''].join('\n')
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  const found = findingsFor(data, 'unverified_attribution');
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'notes.md');
  assert.equal(found[0].line, 5);
});

test('attribution: a quotation with NO name under it is left alone — that is the honest form', async () => {
  const dir = await tempDir('attrib-none');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote><p>Chess is the gymnasium of the mind.</p></blockquote>
  <p>This line is repeated everywhere and traced to no primary source, so no name is printed under it.</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(findingsFor(data, 'unverified_attribution').length, 0);
  assert.equal(data.counts.error, 0);
});

test('attribution: a heading after a quote is not mistaken for a name', async () => {
  const dir = await tempDir('attrib-heading');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote><p>Chess is the gymnasium of the mind.</p></blockquote>
  <h2>Lessons</h2>
  <p>One hour, at your table.</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(
    findingsFor(data, 'unverified_attribution').length,
    0,
    'a single capitalised word with no role is a heading, not an attribution'
  );
});

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

test('ledger: an entry WITH a source silences the finding and is counted', async () => {
  const dir = await tempDir('ledger-ok');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote><p>I have had my results for a long time, but I do not yet know how I am to arrive at them.</p></blockquote>
  <p>Carl Friedrich Gauss</p>
</body></html>`
  );
  await write(
    dir,
    '.honesty.json',
    JSON.stringify({
      verified: [
        {
          text: 'I have had my results for a long time',
          source: 'https://example.org/gauss-letters',
          checked: '2026-09-17'
        }
      ]
    })
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(findingsFor(data, 'unverified_attribution').length, 0);
  assert.equal(data.ledger.suppressed, 1);
  assert.equal(data.ledger.found, true);
});

test('ledger: an entry with NO source silences nothing, and says so', async () => {
  const dir = await tempDir('ledger-empty');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote><p>Chess is the gymnasium of the mind.</p></blockquote>
  <p>Blaise Pascal</p>
</body></html>`
  );
  await write(dir, '.honesty.json', JSON.stringify({ verified: [{ text: 'gymnasium of the mind', source: '' }] }));

  const kit = await connect();
  const { data, text } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(findingsFor(data, 'unverified_attribution').length, 1, 'a promise is not a citation');
  assert.equal(data.ledger.suppressed, 0);
  assert.equal(data.ledger.unusable_entries, 1);
  assert.match(text, /A promise is not a citation/);
});

test('ledger: failure path — a corrupt ledger is reported, and the scan still runs', async () => {
  const dir = await tempDir('ledger-bad');
  await write(dir, 'index.html', '<!doctype html><html lang="en"><head><title>x</title></head><body><p>Hello.</p></body></html>');
  await write(dir, '.honesty.json', '{ this is not json');

  const kit = await connect();
  const { data, text, isError } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(isError, false, 'a broken ledger must not abort the scan');
  assert.equal(data.ledger.error, 'it is not valid JSON');
  assert.equal(data.files_scanned, 1);
  assert.match(text, /could not be read/);
});

/* ------------------------------------------------------------------ *
 * Invented content
 * ------------------------------------------------------------------ */

test('invented content: every category is caught, each with its own file and line', async () => {
  const dir = await tempDir('invented');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <section class="testimonials"><h2>What our customers say</h2></section>
  <p>Rated 4.8 out of 5 by our students.</p>
  <p>As seen in the Brooklyn Paper.</p>
  <p>Join over 12,000 happy students.</p>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
  <p>Acme Chess Ltd, 123 Main Street. Write to hello@example.com or call (555) 0142.</p>
  <p>Our award-winning coaching is world-class.</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'fail');
  for (const rule of [
    'testimonial',
    'star_rating',
    'as_seen_in',
    'social_proof_count',
    'lorem_ipsum',
    'placeholder_identity',
    'unsupported_superlative'
  ]) {
    assert.ok(has(data, rule), `expected rule ${rule} to fire`);
  }

  for (const finding of data.findings) {
    assert.equal(finding.file, 'index.html');
    assert.ok(finding.line >= 1, 'every finding must carry a line number');
    assert.ok(finding.why.length > 0, 'every finding must say why');
    assert.ok(finding.fix.length > 0, 'every finding must say what to do');
  }
});

test('negation guard: "no testimonials" is a note, not an accusation', async () => {
  const dir = await tempDir('negation');
  await write(
    dir,
    'rules.md',
    'This site carries no testimonials, no star ratings and no "trusted by" counts.\n'
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(data.counts.error, 0, 'a sentence saying these do not exist is not an invention');
  assert.ok(data.counts.info > 0, 'it is still surfaced, as a note');
  assert.match(
    data.findings.find((f) => f.rule === 'testimonial').why,
    /statement that this does NOT appear/
  );
});

test('comment guard: a commented-out testimonial is a warning, not a clean bill', async () => {
  const dir = await tempDir('commented');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <!-- <p>Rated 5 stars by every parent.</p> -->
  <p>Lessons are one hour.</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  const rating = data.findings.find((f) => f.rule === 'star_rating');
  assert.ok(rating, 'a claim inside a comment is still found');
  assert.equal(rating.severity, 'warn', 'downgraded, because it is not visible yet');
  assert.equal(rating.in_comment, true);
  assert.match(rating.why, /waiting to be uncommented/);
});

test('declared placeholders are reported as gaps to fill, never as inventions', async () => {
  const dir = await tempDir('declared');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <a class="wordmark" href="index.html" data-placeholder="site name">Name not chosen yet</a>
  <p data-placeholder="opening line">Say in one sentence what this is.</p>
</body></html>`
  );

  const kit = await connect();
  const { data } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'pass');
  assert.equal(data.counts.error, 0);
  assert.equal(findingsFor(data, 'declared_placeholder').length, 2);
  assert.ok(data.findings.every((f) => f.severity === 'info'));
});

test('strict mode turns warnings into a failure', async () => {
  const dir = await tempDir('strict');
  await write(
    dir,
    'index.html',
    `<!doctype html><html lang="en"><head><title>x</title></head><body>
  <blockquote><p>Chess is the gymnasium of the mind.</p></blockquote>
  <p>Blaise Pascal</p>
</body></html>`
  );

  const kit = await connect();
  const lenient = await kit.call('check_honesty', { directory: dir });
  const strict = await kit.call('check_honesty', { directory: dir, strict: true });
  await kit.close();

  assert.equal(lenient.data.status, 'pass', 'an unverified attribution is not, by itself, a lie');
  assert.equal(strict.data.status, 'fail');
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

test('failure: a folder that does not exist gives a named error and a way to get the path', async () => {
  const kit = await connect();
  const { data, text, isError } = await kit.call('check_honesty', {
    directory: '/no/such/folder/anywhere'
  });
  await kit.close();

  assert.equal(isError, true);
  assert.equal(data.status, 'error');
  assert.equal(data.error_code, 'PATH_NOT_FOUND');
  assert.ok(data.fix.some((f) => /Copy … as Pathname/.test(f)), 'it must tell a Mac user how to get the path');
  assert.doesNotMatch(text, /at .*node_modules|\bat Object\./, 'no stack trace may reach the user');
});

test('failure: pointing at a file instead of a folder is refused by name', async () => {
  const dir = await tempDir('not-a-dir');
  const file = await write(dir, 'index.html', '<!doctype html><title>x</title>');

  const kit = await connect();
  const { data, isError } = await kit.call('check_honesty', { directory: file });
  await kit.close();

  assert.equal(isError, true);
  assert.equal(data.error_code, 'PATH_NOT_DIRECTORY');
});

test('failure: an empty folder is "skipped", which is not a pass', async () => {
  const dir = await tempDir('empty');

  const kit = await connect();
  const { data, text } = await kit.call('check_honesty', { directory: dir });
  await kit.close();

  assert.equal(data.status, 'skipped');
  assert.notEqual(data.status, 'pass');
  assert.equal(data.files_scanned, 0);
  assert.match(text, /NOT CHECKED/);
});
