/**
 * The variety ledger.
 *
 * research/08-craft.md §4, on the deepest tell in the whole corpus:
 *
 *   "Variety must be enforced by a LEDGER that records what was emitted last,
 *    not merely enabled by having options."
 *
 * It says so because the authors of one anti-slop tool documented their own tool
 * failing exactly this: twenty-one themes available, one macrostructure emitted.
 * Options are not variety. A record of what you actually shipped is.
 *
 * Design decisions worth knowing:
 *
 *  - It lives OUTSIDE the project, at ~/.codex-site-kit/ledger.json. Site fourteen
 *    is built in a new folder; a ledger stored beside site thirteen can only ever
 *    see one site, which is the failure it exists to prevent.
 *  - It holds hashes and small numeric vectors. No page content, no business names,
 *    no URLs. It never leaves the machine. A rulebook that promises no telemetry has
 *    to keep its own records boring and readable by their owner.
 *  - Recording is explicit. A check never appends. A ledger that fills itself with
 *    every intermediate draft is a ledger of drafts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const LEDGER_VERSION = 1;
const MAX_ENTRIES = 50;
export const DEFAULT_WINDOW = 12;

export function ledgerPath(explicit) {
  if (explicit) return explicit;
  if (process.env.CODEX_SITE_KIT_LEDGER) return process.env.CODEX_SITE_KIT_LEDGER;
  return join(homedir(), '.codex-site-kit', 'ledger.json');
}

export function readLedger(path) {
  const file = ledgerPath(path);
  if (!existsSync(file)) return { version: LEDGER_VERSION, entries: [], exists: false, file };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return {
      version: parsed.version ?? LEDGER_VERSION,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      exists: true,
      file
    };
  } catch (err) {
    // A corrupt ledger is reported, never silently replaced — the whole point of
    // the file is that it is a record, and a record you overwrite on error is not one.
    return { version: LEDGER_VERSION, entries: [], exists: true, file, error: String(err.message || err) };
  }
}

export function writeLedger(ledger, path) {
  const file = ledgerPath(path);
  mkdirSync(dirname(file), { recursive: true });
  const entries = ledger.entries.slice(-MAX_ENTRIES);
  writeFileSync(file, JSON.stringify({ version: LEDGER_VERSION, entries }, null, 2) + '\n', 'utf8');
  return file;
}

/**
 * Append a build. Replaces any earlier entry with the same id, so re-recording a
 * site updates it rather than colliding with itself.
 */
export function record(fingerprint, { label, pathHint, ledgerFile } = {}) {
  const ledger = readLedger(ledgerFile);
  const entry = {
    id: fingerprint.id,
    built_at: new Date().toISOString(),
    label: label || null,
    path_hint: pathHint || null,
    facets: fingerprint.facets,
    vectors: fingerprint.vectors,
    declared: fingerprint.declared || {}
  };
  ledger.entries = ledger.entries.filter((e) => e.id !== entry.id);
  ledger.entries.push(entry);
  const file = writeLedger(ledger, ledgerFile);
  return { file, entry, count: ledger.entries.length };
}

/** The last N entries that are not this site. */
export function comparisonSet(ledger, selfId, window = DEFAULT_WINDOW) {
  return ledger.entries.filter((e) => e.id !== selfId).slice(-window);
}

/**
 * Palette distribution across the window, for V-PALETTE-MODE-COLLAPSE.
 *
 * The rule needs two numbers the corpus measured directly: the share held by the
 * most-used option (it found one palette at 10 of 13) and the proportion of the
 * declared option set that has ever been used (it found 2 of 6).
 */
export function paletteDistribution(entries, declaredOptions) {
  const used = entries
    .map((e) => e.declared?.palette_family)
    .filter(Boolean);
  if (!used.length) return null;

  const counts = new Map();
  for (const p of used) counts.set(p, (counts.get(p) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const optionCount = Array.isArray(declaredOptions) ? declaredOptions.length : counts.size;
  return {
    total: used.length,
    counts: Object.fromEntries(sorted),
    topShare: sorted[0][1] / used.length,
    topName: sorted[0][0],
    optionsUsed: counts.size,
    optionCount,
    usedRatio: optionCount ? counts.size / optionCount : 1,
    neverUsed: Array.isArray(declaredOptions) ? declaredOptions.filter((o) => !counts.has(o)) : []
  };
}
