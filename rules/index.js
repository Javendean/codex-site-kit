/**
 * Load the rulebook, and refuse to load a broken one.
 *
 * The rulebook is the asset the whole tool rests on, so its integrity checks are
 * strict on exactly the things that make a finding teachable:
 *
 *   - every rule cites a source that exists in sources.json;
 *   - every ASSERTED or INFERRED rule carries a confidence_note saying what is
 *     not proven, so the tool can print it and a reader can discount it;
 *   - no ASSERTED rule is severity `fail` unless the corpus itself gates on it;
 *   - every rule has all four teachable fields.
 *
 * That last constraint is the design. A finding that cannot answer WHAT, WHY,
 * WHO SAYS SO and WHAT TO DO is a score, and a score teaches nothing.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const RULEBOOK_META = {
  version: '1.0.0',
  built: '2026-09-17',
  // The whole rulebook, not just the trap tier, is re-read against fresh evidence
  // on this cadence. The trap tier carries its own per-rule review_by, which is
  // stricter; this is the backstop for everything else.
  review_by: '2027-09-17',
  corpus: [
    'local-site-forge/research/08-craft.md',
    'local-site-forge/research/08a-sitegen-spec.md',
    'local-site-forge/research/04-design-language.md',
    'local-site-forge/research/11-reference-tier.md',
    'local-site-forge/research/11a-verity-build-spec.md',
    'local-site-forge/research/05-practitioner-corpus.md',
    'local-site-forge/corpus/SYNTHESIS.md',
    'chess-tee-forge/store/DESIGN-SYSTEM.md + store/',
    'impeccable 4.3.1 (skills/impeccable/reference/craft-floor.md)'
  ],
  validated_against: 'local-site-forge/previews/ — 13 real generated pages'
};

const FILES = [
  '01-instant.json',
  '02-felt.json',
  '03-copy.json',
  '04-honesty.json',
  '05-floor.json',
  '06-typography.json',
  '07-color.json',
  '08-structure.json',
  '09-material.json',
  '10-trap-tier.json',
  '11-variety-ledger.json'
];

const readJson = (name) => JSON.parse(readFileSync(join(HERE, name), 'utf8'));

export function loadSources() {
  return readJson('sources.json');
}

/** Every rule, in file order. Throws on an invalid rulebook. */
export function loadRules({ strict = true } = {}) {
  const sources = loadSources();
  const known = new Set(Object.keys(sources.sources));
  const rules = [];
  const problems = [];
  const seen = new Set();

  for (const file of FILES) {
    const doc = readJson(file);
    for (const rule of doc.rules || []) {
      rule._file = file;
      if (doc.expiry_policy) rule._expiry_policy = doc.expiry_policy;

      if (seen.has(rule.id)) problems.push(`${file}: duplicate rule id ${rule.id}`);
      seen.add(rule.id);

      for (const field of ['id', 'tier', 'category', 'title', 'what_it_is', 'why_it_matters', 'source', 'detector', 'threshold', 'severity', 'fix', 'teach']) {
        if (rule[field] === undefined || rule[field] === '') problems.push(`${rule.id}: missing required field "${field}"`);
      }
      if (rule.source && !known.has(rule.source.name)) {
        problems.push(`${rule.id}: source "${rule.source?.name}" is not in sources.json — a rule with no provenance is not shippable`);
      }
      if (rule.source && ['ASSERTED', 'INFERRED'].includes(rule.source.confidence) && !rule.confidence_note) {
        problems.push(`${rule.id}: source is ${rule.source.confidence} but there is no confidence_note. The corpus's own discipline: do not launder a hypothesis into a hard gate.`);
      }
      if (rule.source?.confidence === 'ASSERTED' && rule.severity === 'fail' && !/GATE|gate \d|auto-fail|auto-fails/i.test(rule.source.where || '')) {
        problems.push(`${rule.id}: ASSERTED source at severity "fail" without the corpus gating on it. Downgrade to warn, or cite the gate.`);
      }
      if (rule.tier === 'trap' && !rule.review_by) {
        problems.push(`${rule.id}: trap-tier rules must carry review_by. These rules are time-limited by construction.`);
      }
      if (rule.teach && /\b(?:LCP|CLS|INP|compositor|rasteris|OKLCH|chroma|viewport|em dash)\b/.test(rule.teach)) {
        // not a failure — a nudge, surfaced only in strict listing
        problems.push(`${rule.id}: NOTE — teach field uses a technical term; check it is explained in place.`);
      }
      rules.push(rule);
    }
  }

  const hard = problems.filter((p) => !p.includes('NOTE —'));
  if (strict && hard.length) {
    throw new Error('Rulebook failed validation:\n  ' + hard.join('\n  '));
  }
  return { rules, sources, problems, meta: RULEBOOK_META };
}

export function byId(rules) {
  return new Map(rules.map((r) => [r.id, r]));
}

export function byTier(rules) {
  const out = new Map();
  for (const r of rules) {
    if (!out.has(r.tier)) out.set(r.tier, []);
    out.get(r.tier).push(r);
  }
  return out;
}

/** A one-line summary of what the rulebook contains right now. */
export function describe() {
  const { rules, sources } = loadRules({ strict: false });
  const kinds = new Map();
  for (const r of rules) kinds.set(r.detector.kind, (kinds.get(r.detector.kind) || 0) + 1);
  const automatable = rules.filter((r) => !['browser', 'manual'].includes(r.detector.kind)).length;
  return {
    rules: rules.length,
    automatable,
    needsBrowser: rules.filter((r) => r.detector.kind === 'browser').length,
    needsHuman: rules.filter((r) => r.detector.kind === 'manual').length,
    sources: Object.keys(sources.sources).length,
    tiers: Object.fromEntries([...byTier(rules)].map(([k, v]) => [k, v.length])),
    detectorKinds: Object.fromEntries([...kinds].sort((a, b) => b[1] - a[1]))
  };
}

export { RULEBOOK_META as meta };
export * from './engine.js';
export * from './page.js';
export * from './fingerprint.js';
export * from './ledger.js';
