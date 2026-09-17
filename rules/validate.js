#!/usr/bin/env node
/**
 * Run the rulebook over a directory of pages and print the table.
 *
 *   node rules/validate.js <dir> [--json] [--rule ID] [--page N]
 *
 * The corpus this was built against is local-site-forge/previews/ — thirteen real
 * generated pages the research already proved slop-ridden. A rulebook that finds
 * nothing there is wrong, and this script is how that is checked rather than
 * asserted.
 *
 * It also runs the variety ledger across the whole set: each page is fingerprinted
 * and recorded into a throwaway in-memory ledger, so V-SKELETON and friends see
 * the other twelve pages the way they would see twelve previous builds.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { loadRules, describe } from './index.js';
import { analysePage } from './page.js';
import { checkAll, applyExpiry } from './engine.js';
import { fingerprint, fingerprintDistance } from './fingerprint.js';

function findPages(dir) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (/\.html?$/i.test(name)) out.push(p);
    }
  };
  walk(dir, 0);
  return out.sort();
}

function main() {
  const args = process.argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith('--')) || '.');
  const asJson = args.includes('--json');
  const onlyRule = args.includes('--rule') ? args[args.indexOf('--rule') + 1] : null;

  const { rules, problems } = loadRules({ strict: false });
  const notes = problems.filter((p) => p.includes('NOTE —'));
  const hard = problems.filter((p) => !p.includes('NOTE —'));

  const files = findPages(dir);
  if (!files.length) {
    console.error(`No .html files under ${dir}`);
    process.exit(1);
  }

  // Pass 1: parse and fingerprint every page, so the ledger rules have a corpus.
  const pages = files.map((f) => {
    const html = readFileSync(f, 'utf8');
    const id = basename(join(f, '..')) || basename(f);
    const page = analysePage(html, { path: f, id });
    return { file: f, id, page, fp: fingerprint(page) };
  });

  const ledger = {
    exists: true,
    file: '(in-memory, for validation)',
    entries: pages.map((p) => ({ id: p.id, label: p.id, facets: p.fp.facets, vectors: p.fp.vectors, declared: {} }))
  };

  // Palette family is not declared by these pages, so derive it from the accent
  // hex so V-PALETTE-MODE-COLLAPSE has something real to count. This mirrors what
  // research/08a measured by hand: "ink x10, slate x3".
  for (const p of pages) {
    const accentH = p.fp.vectors.palette.accentH;
    const accentC = p.fp.vectors.palette.accentC;
    const family = accentC < 0.02 ? 'neutral' : `hue-${Math.round(accentH / 30) * 30}`;
    p.fp.declared.palette_family = family;
    const e = ledger.entries.find((x) => x.id === p.id);
    if (e) e.declared.palette_family = family;
  }
  const paletteOptions = ['hue-0', 'hue-60', 'hue-120', 'hue-180', 'hue-240', 'hue-270', 'neutral'];

  const active = onlyRule ? rules.filter((r) => r.id === onlyRule) : rules;

  // Pass 2: run.
  const results = new Map(); // ruleId -> { pages: Set, hits: number, notRun, reason }
  for (const p of pages) {
    const findings = checkAll(active, p.page, {
      ledger,
      fingerprint: p.fp,
      paletteOptions
    });
    for (const f of findings) {
      if (!results.has(f.id)) results.set(f.id, { rule: active.find((r) => r.id === f.id), pages: new Set(), hits: 0, notRun: 0, reasons: new Set(), examples: [] });
      const acc = results.get(f.id);
      if (f.status === 'fire') {
        acc.pages.add(p.id);
        acc.hits += f.count;
        if (acc.examples.length < 2 && f.hits[0]) acc.examples.push(`${p.id}: ${f.hits[0].evidence}`);
      } else if (f.status === 'not_run') {
        acc.notRun += 1;
        if (f.reason) acc.reasons.add(f.reason.split('.')[0]);
      }
    }
  }

  if (asJson) {
    const out = [...results].map(([id, r]) => ({
      id,
      tier: r.rule?.tier, category: r.rule?.category, severity: r.rule?.severity,
      pages_firing: r.pages.size, hits_total: r.hits, pages_total: pages.length,
      not_run: r.notRun > 0, examples: r.examples
    }));
    console.log(JSON.stringify({ dir, pages: pages.length, rules: active.length, results: out, rulebook_problems: hard }, null, 2));
    return;
  }

  const d = describe();
  console.log('');
  console.log(`RULEBOOK   ${d.rules} rules across ${Object.keys(d.tiers).length} tiers, citing ${d.sources} named sources`);
  console.log(`           ${d.automatable} run automatically · ${d.needsBrowser} need a browser · ${d.needsHuman} need a person`);
  console.log(`CORPUS     ${pages.length} pages under ${dir}`);
  if (hard.length) {
    console.log('');
    console.log('RULEBOOK VALIDATION FAILURES:');
    for (const p of hard) console.log('  ! ' + p);
  }
  console.log('');

  const rows = [...results]
    .map(([id, r]) => ({ id, r }))
    .sort((a, b) => {
      const sev = { fail: 0, warn: 1, info: 2 };
      const sa = sev[a.r.rule?.severity] ?? 3, sb = sev[b.r.rule?.severity] ?? 3;
      if (b.r.pages.size !== a.r.pages.size) return b.r.pages.size - a.r.pages.size;
      if (sa !== sb) return sa - sb;
      return a.id.localeCompare(b.id);
    });

  const firing = rows.filter((x) => x.r.pages.size > 0);
  const clean = rows.filter((x) => x.r.pages.size === 0 && x.r.notRun === 0);
  const skipped = rows.filter((x) => x.r.pages.size === 0 && x.r.notRun > 0);

  const pad = (s, n) => String(s).padEnd(n);
  const line = (x) => `  ${pad(x.id, 24)} ${pad(x.r.rule?.severity ?? '?', 5)} ${pad(x.r.rule?.tier ?? '?', 8)} ${String(x.r.pages.size).padStart(3)}/${pages.length}  ${String(x.r.hits).padStart(4)} hits  ${x.r.rule?.title ?? ''}`;

  console.log(`FIRING (${firing.length} rules)`);
  console.log(`  ${pad('RULE', 24)} ${pad('SEV', 5)} ${pad('TIER', 8)} PAGES   HITS  TITLE`);
  console.log('  ' + '-'.repeat(100));
  for (const x of firing) console.log(line(x));

  console.log('');
  console.log(`CLEAN (${clean.length} rules ran and found nothing)`);
  console.log('  ' + clean.map((x) => x.id).join(', '));

  console.log('');
  console.log(`NOT RUN (${skipped.length} rules need a browser or a person)`);
  for (const x of skipped) {
    console.log(`  ${pad(x.id, 24)} ${[...x.r.reasons][0] || ''}`);
  }

  // The variety ledger, across the whole set.
  console.log('');
  console.log('VARIETY LEDGER — cross-page');
  const skel = new Set(pages.map((p) => p.fp.facets.skeleton));
  const style = new Set(pages.map((p) => p.fp.facets.style_skeleton));
  const boiler = new Set(pages.map((p) => p.fp.facets.boilerplate));
  console.log(`  distinct skeleton hashes         ${skel.size} across ${pages.length} pages`);
  console.log(`  distinct style_skeleton hashes   ${style.size} across ${pages.length} pages   <- the value-blind hash`);
  console.log(`  distinct boilerplate hashes      ${boiler.size} across ${pages.length} pages`);

  let sum = 0, n = 0, max = 0, maxPair = '';
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const { distance } = fingerprintDistance(pages[i].fp, pages[j].fp);
      sum += distance; n++;
      if (distance > max) { max = distance; maxPair = `${pages[i].id} vs ${pages[j].id}`; }
    }
  }
  console.log(`  mean pairwise distance           ${(sum / n).toFixed(3)} over ${n} pairs (threshold 0.150)`);
  console.log(`  most distant pair                ${max.toFixed(3)}  ${maxPair}`);

  const fams = new Map();
  for (const p of pages) fams.set(p.fp.declared.palette_family, (fams.get(p.fp.declared.palette_family) || 0) + 1);
  console.log(`  palette families emitted         ${[...fams].map(([k, v]) => `${k} x${v}`).join(', ')}  (${fams.size} of ${paletteOptions.length} options)`);

  // Expiry state
  const now = new Date();
  const expiring = rules.filter((r) => r.review_by).map((r) => ({ r, e: applyExpiry(r, now) }));
  const past = expiring.filter((x) => x.e.note);
  console.log('');
  console.log(`TRAP TIER   ${expiring.length} rules carry a review_by; ${past.length} are past it today (${now.toISOString().slice(0, 10)})`);
  if (notes.length) {
    console.log('');
    console.log(`TEACH-FIELD NOTES (${notes.length}) — terms to check are explained in place`);
    for (const p of notes.slice(0, 12)) console.log('  ~ ' + p.replace(': NOTE — ', ': '));
  }
  console.log('');
}

main();
