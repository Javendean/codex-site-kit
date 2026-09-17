/**
 * The rulebook's own tests.
 *
 * These are integrity tests, not detector tests: they check that the rulebook
 * keeps the promises it makes about itself. The detectors are exercised by
 * `node rules/validate.js` against the thirteen-page corpus, and every rule's
 * `measured` block is written from that run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadRules, loadSources, describe as describeRulebook, RULEBOOK_META } from '../rules/index.js';
import { analysePage } from '../rules/page.js';
import { check, applyExpiry, DOUBLE_EXPIRY_DAYS } from '../rules/engine.js';
import { toOklch, hueDistance } from '../rules/color-space.js';
import { fingerprint, fingerprintDistance, parseShadow } from '../rules/fingerprint.js';

test('the rulebook loads in strict mode', () => {
  const { rules } = loadRules({ strict: true });
  assert.ok(rules.length > 100, `expected a substantial rulebook, got ${rules.length}`);
});

test('every rule can answer WHAT, WHY, WHO SAYS SO and WHAT TO DO', () => {
  const { rules } = loadRules({ strict: false });
  for (const r of rules) {
    for (const field of ['what_it_is', 'why_it_matters', 'teach']) {
      assert.ok(r[field] && r[field].length > 20, `${r.id}: ${field} is missing or too short to teach anything`);
    }
    // A fix may be terse when it ships the literal replacement alongside it.
    assert.ok((r.fix && r.fix.length > 20) || r.fix_code,
      `${r.id}: fix is too short to act on and carries no fix_code`);
    assert.ok(r.source?.name, `${r.id}: no source`);
    assert.ok(r.source?.confidence, `${r.id}: source has no confidence tag`);
  }
});

test('every cited source is described in sources.json', () => {
  const { rules } = loadRules({ strict: false });
  const known = new Set(Object.keys(loadSources().sources));
  for (const r of rules) {
    assert.ok(known.has(r.source.name), `${r.id} cites unknown source "${r.source.name}"`);
    for (const a of r.also_in ?? []) {
      assert.ok(known.has(a.name), `${r.id} corroborates with unknown source "${a.name}"`);
    }
  }
});

test('an unproven rule says what is unproven, and is not a hard gate', () => {
  const { rules } = loadRules({ strict: false });
  for (const r of rules) {
    if (!['ASSERTED', 'INFERRED'].includes(r.source.confidence)) continue;
    assert.ok(r.confidence_note, `${r.id} is ${r.source.confidence} with no confidence_note`);
    if (r.severity === 'fail') {
      assert.match(r.source.where || '', /GATE|gate \d|auto-fail/i,
        `${r.id} is ASSERTED at severity fail without the corpus gating on it`);
    }
  }
});

test('every trap-tier rule admits it will rot', () => {
  const { rules } = loadRules({ strict: false });
  const trap = rules.filter((r) => r.tier === 'trap');
  assert.ok(trap.length >= 5, 'the trap tier should not be empty');
  for (const r of trap) {
    assert.ok(r.review_by, `${r.id} has no review_by`);
    assert.ok(r.decay?.status, `${r.id} has no decay status`);
    assert.ok(!Number.isNaN(Date.parse(r.review_by)), `${r.id} has an unparseable review_by`);
  }
});

test('expiry downgrades, then suspends', () => {
  const rule = { id: 'X', severity: 'fail', review_by: '2027-01-01' };
  const before = applyExpiry(rule, new Date('2026-12-01'));
  assert.equal(before.severity, 'fail');
  assert.equal(before.suspended, false);

  const after = applyExpiry(rule, new Date('2027-02-01'));
  assert.equal(after.severity, 'info', 'a rule past review should be demoted, not trusted');
  assert.equal(after.suspended, false);
  assert.match(after.note, /nobody has checked/i);

  const stale = applyExpiry(rule, new Date(Date.parse('2027-01-01') + (DOUBLE_EXPIRY_DAYS + 5) * 86400000));
  assert.equal(stale.suspended, true, 'two cycles stale should stop being evaluated');
});

test('every rule records what it actually found over the corpus', () => {
  const { rules } = loadRules({ strict: false });
  for (const r of rules) {
    assert.ok(r.measured, `${r.id} has no measured block — the rulebook must not claim anything it has not run`);
    assert.equal(r.measured.pages_total, 13);
    const needsHuman = ['browser', 'manual'].includes(r.detector.kind) || r.detector.mode === 'cross_file_duplicate';
    if (!needsHuman) {
      assert.equal(typeof r.measured.pages_firing, 'number', `${r.id}: an automatable rule must have a number`);
    }
  }
});

test('the rulebook finds slop in a corpus proven to be slop-ridden', () => {
  const { rules } = loadRules({ strict: false });
  const firing = rules.filter((r) => (r.measured?.pages_firing ?? 0) > 0);
  // The corpus's own audit of these same thirteen pages named roughly this many
  // distinct defects. A rulebook that found a handful would be wrong.
  assert.ok(firing.length >= 40,
    `only ${firing.length} rules fire on a corpus the research already proved slop-ridden`);
  const onEveryPage = firing.filter((r) => r.measured.pages_firing === 13);
  assert.ok(onEveryPage.length >= 25,
    'the shared-skeleton failure should show up as many rules firing on every page');
});

test('OKLCH calibration: the banned indigos cluster, and the corpus cyan does not', () => {
  const banned = ['#6366f1', '#818cf8', '#4f46e5', '#4338ca', '#3730a3', '#8b5cf6', '#7c3aed', '#6d28d9', '#a78bfa', '#5b21b6'];
  for (const hex of banned) {
    const { h, C } = toOklch(hex);
    assert.ok(h >= 255 && h <= 305, `${hex} at hue ${h.toFixed(1)} should be inside the band`);
    assert.ok(C >= 0.09, `${hex} at chroma ${C.toFixed(3)} should be above the floor`);
  }
  // the accent the preview corpus actually emitted, which the hex list misses
  const near = toOklch('#4f6bed');
  assert.ok(near.h >= 255 && near.h <= 305 && near.C >= 0.09, 'the near-miss indigo must be caught');
  // and the one that must not fire
  const cyan = toOklch('#1f9ecb');
  assert.ok(cyan.h < 255, `${cyan.h.toFixed(1)} should fall outside the indigo band`);
});

test('shadow parsing reads a bare zero offset as a length', () => {
  // The bug this test exists for: `0 1px 2px rgba(0,0,0,.05)` parsed as
  // offset(1,2) blur(0), which is a hard offset shadow. It is not.
  const [layer] = parseShadow('0 1px 2px rgba(0, 0, 0, .05)');
  assert.equal(layer.ox, 0);
  assert.equal(layer.oy, 1);
  assert.equal(layer.blur, 2);
  assert.ok(Math.abs(layer.alpha - 0.05) < 1e-9);
});

test('the value-blind fingerprint ignores a colour change and sees a structural one', () => {
  const base = (accent, extra = '') => `<!doctype html><html><head><style>
    :root { --accent: ${accent}; }
    .btn { background: var(--accent); border-radius: 999px; }
    ${extra}
  </style></head><body><main><section class="hero"><h1>Hi</h1></section></main></body></html>`;

  const a = fingerprint(analysePage(base('#4f6bed'), { id: 'a' }));
  const b = fingerprint(analysePage(base('#1f9ecb'), { id: 'b' }));
  const c = fingerprint(analysePage(base('#4f6bed', '.btn:active { transform: scale(.97); }'), { id: 'c' }));

  assert.equal(a.facets.style_skeleton, b.facets.style_skeleton,
    'changing only a colour must not register as structural variation');
  assert.notEqual(a.facets.style_skeleton, c.facets.style_skeleton,
    'adding a rule must register');
  assert.ok(fingerprintDistance(a, b).distance < fingerprintDistance(a, c).distance);
});

test('a detector that cannot run says so instead of passing', () => {
  const { rules } = loadRules({ strict: false });
  const manual = rules.find((r) => r.detector.kind === 'manual');
  const page = analysePage('<!doctype html><html><body><p>hi</p></body></html>', { id: 'x' });
  const result = check(manual, page, {});
  assert.equal(result.status, 'not_run');
  assert.ok(result.reason && result.reason.length > 10);
});

test('a rule can be suppressed by project context rather than fired wrongly', () => {
  const { rules } = loadRules({ strict: false });
  const rule = rules.find((r) => r.suppress_when === 'speculative');
  assert.ok(rule, 'at least one rule should declare a context it does not apply in');
  const page = analysePage('<!doctype html><html><body><p>hi</p></body></html>', { id: 'x' });
  assert.equal(check(rule, page, {}).status, 'fire');
  assert.equal(check(rule, page, { project: { speculative: true } }).status, 'suppressed');
});

test('the rulebook declares its own review date', () => {
  assert.ok(RULEBOOK_META.review_by);
  assert.ok(Date.parse(RULEBOOK_META.review_by) > Date.parse(RULEBOOK_META.built));
  const d = describeRulebook();
  assert.ok(d.needsBrowser > 0 && d.needsHuman > 0,
    'a rulebook claiming to check everything automatically would be lying');
});
