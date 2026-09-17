/**
 * The flagship, and the contract its output has to keep.
 *
 * The brief that commissioned this kit says the linter is the curriculum, and
 * that no finding may be a bare boolean. That is a testable claim, so it is
 * tested here rather than asserted in a README: every finding must carry what,
 * why, who says so, and what to do — and the rendered text must actually print
 * all four.
 *
 * The other half is the honesty contract. A rule that could not run is not a
 * rule that passed, and a clean report that hides sixteen unrun checks is the
 * failure this tool exists to avoid. So the tests below check the shape of
 * "not checked" as carefully as they check the findings.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { handler as reviewSite } from '../src/tools/review_site.js';
import { handler as explainRule } from '../src/tools/explain_rule.js';
import { handler as checkCopy } from '../src/tools/check_copy.js';
import { rulebook } from '../src/lib/rulebook.js';
import { cleanup, connect, tempDir, write } from './helpers.js';

after(cleanup);

/** A page built to trip a specific, named set of rules. */
const SLOP = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Chess Academy</title>
<style>
:root { --brand: #6366f1; }
body { background: #ffffff; color: #111111; font-family: Inter, sans-serif; }
.hero { min-height: 100vh; text-align: center; background: linear-gradient(135deg, #6366f1, #06b6d4, #ec4899); }
.eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; }
.card { border-left: 4px solid var(--brand); border-radius: 48px; }
.nav { position: sticky; top: 0; backdrop-filter: blur(14px); }
.reveal { opacity: 0; transform: translateY(40px); transition: all .45s ease; }
input { font-size: 13px; }
html, body { overflow-x: hidden; }
</style>
</head>
<body>
<nav class="nav">Chess Academy</nav>
<section class="hero reveal">
  <p class="eyebrow">WORLD-CLASS COACHING</p>
  <h1>Elevate your <em>game</em></h1>
  <p>Not just lessons, it's a transformation, and we are trusted by 500+ happy students.</p>
  <img src="https://images.unsplash.com/photo-123">
</section>
<blockquote>Chess is the gymnasium of the mind.</blockquote>
<p>Blaise Pascal</p>
<footer><p>&copy; 2019 Chess Academy</p></footer>
</body>
</html>`;

async function reviewOf(html, name = 'index.html') {
  const dir = await tempDir('review');
  await write(dir, name, html);
  const result = await reviewSite({ directory: dir });
  return { dir, data: result.structuredContent, text: result.content[0].text, result };
}

/* ------------------------------------------------------------------ *
 * The teaching contract
 * ------------------------------------------------------------------ */

test('every finding answers what, why, who says so, and what to do', async () => {
  const { data } = await reviewOf(SLOP);
  assert.ok(data.findings.length > 10, `expected a slop page to fire many rules, got ${data.findings.length}`);

  for (const f of data.findings) {
    assert.ok(f.what_it_is?.length > 30, `${f.id} has no WHAT`);
    assert.ok(f.why_it_matters?.length > 40, `${f.id} has no WHY`);
    assert.ok(f.source, `${f.id} names no source — a rule with no provenance is not shippable`);
    assert.ok(f.confidence, `${f.id} carries no confidence tag`);
    // A move can be a sentence or a snippet. Two rules answer in two words
    // plus one line of CSS, and that is a complete answer — so the contract is
    // that a move EXISTS and is actionable, not that it is wordy.
    const move = (f.fix ?? '').trim();
    const hasCode = Boolean(rulebook().byId.get(f.id)?.fix_code);
    assert.ok(move.length > 0 && (move.length > 20 || hasCode), `${f.id} has no MOVE`);
    assert.ok(f.threshold?.length > 10, `${f.id} does not say where the line is drawn`);
  }
});

test('the rendered critique prints all four, not a wall of rule ids', async () => {
  const { text } = await reviewOf(SLOP);

  for (const label of ['WHAT', 'WHY', 'WHO', 'MOVE', 'WHERE']) {
    assert.ok(text.includes(label), `the critique never prints ${label}`);
  }
  assert.match(text, /explain_rule\("/, 'the critique never offers a way to go deeper');
  assert.match(text, /confidence: (DEMONSTRATED|ASSERTED|MEASURED|INFERRED)/, 'no confidence tag reaches the reader');

  // The chess annotation is the ordering vocabulary, not decoration.
  assert.match(text, /\?\?/, 'no blunder glyph');
  assert.match(text, /The findings, in order:/, 'no scoresheet');
});

test('a finding names the evidence it actually found, not just the rule', async () => {
  const { data } = await reviewOf(SLOP);
  const indigo = data.findings.find((f) => f.id === 'T1-INDIGO-HEX');
  assert.ok(indigo, 'the banned indigo was not detected');
  assert.ok(indigo.evidence.some((e) => /6366f1/i.test(e)), `evidence did not name the hex: ${JSON.stringify(indigo.evidence)}`);
});

/* ------------------------------------------------------------------ *
 * The honesty contract
 * ------------------------------------------------------------------ */

test('rules that could not run are reported, and never counted as passes', async () => {
  const { data, text } = await reviewOf(SLOP);

  assert.ok(data.not_checked.length > 0, 'some rules need a browser or a person; none were reported');
  for (const item of data.not_checked) {
    assert.ok(item.reason?.length > 10, `${item.id} was not run and gives no reason`);
    assert.ok(!data.clean.some((c) => c.id === item.id), `${item.id} is listed as both unrun and clean`);
    assert.ok(!data.findings.some((f) => f.id === item.id), `${item.id} is listed as both unrun and fired`);
  }
  assert.match(text, /NOT CHECKED/, 'the unrun rules are not visible in the report');
  assert.match(text, /These are not passes/, 'the report does not say that unrun is not a pass');
});

test('a clean page still says what was not checked, rather than implying a pass', async () => {
  const clean = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>A page</title></head>
<body><main><h1>A heading</h1><p>A sentence that could be checked against the world.</p></main></body></html>`;
  const { data, text } = await reviewOf(clean);

  assert.ok(data.not_checked.length > 0);
  assert.match(text, /NOT CHECKED/);
});

test('a stylesheet that could not be found is named, not silently skipped', async () => {
  const dir = await tempDir('missing-css');
  await write(dir, 'index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><title>x</title></head><body><h1>x</h1></body></html>');
  const result = await reviewSite({ directory: dir });

  assert.deepEqual(result.structuredContent.missing_stylesheets, ['styles.css']);
  assert.match(result.content[0].text, /NOT checked: styles\.css/);
});

/* ------------------------------------------------------------------ *
 * Detection, against the corpus the rulebook was built from
 * ------------------------------------------------------------------ */

test('the named tells are actually detected on a page built to carry them', async () => {
  const { data } = await reviewOf(SLOP);
  const fired = new Set(data.findings.map((f) => f.id));

  for (const id of [
    'T1-INDIGO-HEX',
    'T1-GRADIENT-3STOP',
    'T2-EDGE-STRIPE',
    'T2-KICKER-H1',
    'T2-BACKDROP-BLUR',
    'T2-RADIUS-40',
    'T2-HERO-100VH',
    'F-VIEWPORT-META',
    'F-INPUT-16PX',
    'W-BENEFIT-SPEAK',
    'W-NOT-X-BUT-Y',
    'H-QUOTE-ATTRIBUTION',
    'W-STALE-COPYRIGHT'
  ]) {
    assert.ok(fired.has(id), `${id} did not fire on a page built to trip it`);
  }
});

/* ------------------------------------------------------------------ *
 * Failure paths
 * ------------------------------------------------------------------ */

test('failure: a folder with no HTML says so and says what to do', async () => {
  const dir = await tempDir('empty');
  await write(dir, 'notes.txt', 'nothing to see');
  const result = await reviewSite({ directory: dir });

  assert.equal(result.structuredContent.status, 'error');
  assert.equal(result.structuredContent.error_code, 'NO_PAGES');
  assert.ok(result.structuredContent.fix.length > 0);
  assert.doesNotMatch(result.content[0].text, /\bat async |node_modules/, 'a stack trace reached the user');
});

test('failure: a path that does not exist is named, with a way to get the real one', async () => {
  const result = await reviewSite({ directory: 'C:/definitely/not/a/folder/anywhere' });
  assert.equal(result.structuredContent.status, 'error');
  assert.match(result.structuredContent.headline, /no site folder/i);
  assert.ok(result.structuredContent.fix.some((f) => /pathname|spelling/i.test(f)));
});

test('failure: an unknown rule id in focus is refused by name, not ignored', async () => {
  const dir = await tempDir('focus');
  await write(dir, 'index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>x</title></head><body><h1>x</h1></body></html>');
  const result = await reviewSite({ directory: dir, focus: ['no-such-rule'] });

  assert.equal(result.structuredContent.error_code, 'UNKNOWN_RULE');
  assert.match(result.content[0].text, /no-such-rule/);
});

test('failure: a filter that selects no rules refuses rather than reporting a clean page', async () => {
  const dir = await tempDir('notier');
  await write(dir, 'index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>x</title></head><body><h1>x</h1></body></html>');
  const result = await reviewSite({ directory: dir, tier: 'nonexistent-tier' });

  assert.equal(result.structuredContent.error_code, 'NO_RULES_SELECTED');
  assert.match(result.content[0].text, /without having checked anything/);
});

/* ------------------------------------------------------------------ *
 * explain_rule
 * ------------------------------------------------------------------ */

test('explain_rule returns the whole note, the sources, and their caveats', async () => {
  const result = await explainRule({ rule: 'T2-EDGE-STRIPE' });
  const { rule } = result.structuredContent;

  assert.equal(rule.id, 'T2-EDGE-STRIPE');
  assert.ok(rule.why_it_matters.length > 80);
  assert.ok(rule.fix.length > 40);
  assert.ok(rule.sources.length >= 1);
  assert.ok(rule.sources.some((s) => s.caveat), 'no source carried its caveat — the caveats are half the value');
  assert.match(result.content[0].text, /WHO\s+says so/);
});

test('explain_rule prints what the rule measured over the corpus, including a negative result', async () => {
  const result = await explainRule({ rule: 'T1-INDIGO-HEX' });
  assert.ok(result.structuredContent.rule.measured, 'the rule carries no corpus measurement');
  assert.match(result.content[0].text, /MEASURED against the corpus/);
});

test('explain_rule on a trap-tier rule prints its expiry, because the claim is time-limited', async () => {
  const trap = rulebook().rules.find((r) => r.tier === 'trap');
  const result = await explainRule({ rule: trap.id });
  assert.match(result.content[0].text, /This rule has an expiry/);
});

test('failure: an unknown rule id suggests near misses rather than shrugging', async () => {
  const result = await explainRule({ rule: 'edge-stripe' });
  assert.equal(result.structuredContent.error_code, 'UNKNOWN_RULE');
  assert.match(result.content[0].text, /T2-EDGE-STRIPE/, 'the near-miss suggestion did not find the real id');
});

test('explain_rule with no argument lists the rulebook and dates it', async () => {
  const result = await explainRule({});
  assert.ok(result.structuredContent.rules.length > 100);
  assert.match(result.content[0].text, /re-read against fresh evidence by \d{4}-\d{2}-\d{2}/);
});

/* ------------------------------------------------------------------ *
 * check_copy
 * ------------------------------------------------------------------ */

test('check_copy takes text directly and finds the copy habits in it', async () => {
  const result = await checkCopy({
    text: "We don't just teach chess, we elevate your game. Trusted by 500+ happy students, with a 99.9% satisfaction rate."
  });
  const fired = new Set(result.structuredContent.findings.map((f) => f.id));

  assert.ok(fired.has('W-BENEFIT-SPEAK'), 'benefit-speak was not detected');
  assert.ok(fired.has('W-FABRICATED-PRECISION'), 'fabricated precision was not detected');
  assert.equal(result.structuredContent.status, 'fail');
});

test('check_copy on honest copy passes, and still says what it cannot judge', async () => {
  const result = await checkCopy({
    text: 'I teach the endgame first, because that is where club games are decided. Lessons run on Tuesday evenings at the library on Court Street.'
  });
  assert.equal(result.structuredContent.status, 'pass');
  assert.match(result.content[0].text, /whether the claims are TRUE is still yours to check/i);
});

test('failure: check_copy with neither a folder nor text says which to pass', async () => {
  const result = await checkCopy({});
  assert.equal(result.structuredContent.error_code, 'NOTHING_TO_CHECK');
  assert.ok(result.structuredContent.fix.some((f) => /text:/.test(f)));
});

/* ------------------------------------------------------------------ *
 * Through the real MCP client, so the schemas round-trip
 * ------------------------------------------------------------------ */

test('the flagship works through a real MCP client, with structured output intact', async () => {
  const dir = await tempDir('mcp');
  await write(dir, 'index.html', SLOP);

  const kit = await connect();
  const out = await kit.call('review_site', { directory: dir, max_per_rule: 2 });
  await kit.close();

  assert.equal(out.data.status, 'fail');
  assert.ok(out.data.findings.length > 10);
  assert.ok(out.text.includes('WHAT'));
  assert.ok(Array.isArray(out.data.not_checked));
});
