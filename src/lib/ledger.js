/**
 * The variety ledger.
 *
 * "Variety must be enforced by a LEDGER that records what was emitted last,
 * not merely enabled by having options."
 *
 * That sentence is in the research because the authors of an anti-slop design
 * tool measured their OWN tool shipping one macrostructure with twenty-one
 * themes available. Options do not produce variety. A record of what was used
 * last does, because it is the only thing that can notice a repeat.
 *
 * The file is local, small, and holds nothing but shape names and timestamps.
 * No telemetry, nothing leaves the machine, and it can be deleted at any time
 * without breaking anything — the kit falls back to deriving from the subject.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const LEDGER_VERSION = 1;
const KEEP = 24;

/** Where the ledger lives. Overridable, mostly so tests do not touch $HOME. */
export function ledgerPath() {
  const override = process.env.CODEX_SITE_KIT_STATE;
  if (override) return path.resolve(override, 'variety-ledger.json');
  return path.join(os.homedir(), '.codex-site-kit', 'variety-ledger.json');
}

export async function readLedger(file = ledgerPath()) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.emitted)) throw new Error('shape');
    return { version: parsed.version ?? LEDGER_VERSION, emitted: parsed.emitted, file };
  } catch {
    return { version: LEDGER_VERSION, emitted: [], file };
  }
}

/** The shape ids most recently emitted, newest first, without repeats. */
export function recentShapes(ledger) {
  const seen = new Set();
  const out = [];
  for (const entry of ledger.emitted) {
    if (!entry?.skeleton || seen.has(entry.skeleton)) continue;
    seen.add(entry.skeleton);
    out.push(entry.skeleton);
  }
  return out;
}

export async function appendLedger(entry, file = ledgerPath()) {
  const ledger = await readLedger(file);
  ledger.emitted.unshift({ at: new Date().toISOString(), ...entry });
  ledger.emitted = ledger.emitted.slice(0, KEEP);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ version: LEDGER_VERSION, emitted: ledger.emitted }, null, 2)}\n`, 'utf8');
    return { written: true, file, entries: ledger.emitted.length };
  } catch (err) {
    // A read-only home directory must not stop a site being scaffolded. The
    // fallback is deriving from the subject, which still works.
    return { written: false, file, error: err.message, entries: ledger.emitted.length };
  }
}

/* ------------------------------------------------------------------ *
 * Choosing, given the record
 * ------------------------------------------------------------------ */

/** Values used recently on one axis, newest first. */
export function usedOn(ledger, axis, n = 6) {
  return (ledger.emitted ?? [])
    .slice(0, n)
    .map((e) => e?.choices?.[axis])
    .filter((v) => typeof v === 'string');
}

/**
 * Choose the option furthest from what was chosen recently.
 *
 * Deliberately not random. Randomness repeats: with six options and a fair
 * draw, two consecutive scaffolds collide one time in six — and one time in
 * six is often enough to be the two a visitor happens to see side by side.
 * This walks the options from a stable per-subject offset and takes the first
 * that is not in the recent window. Only when every option has been used does
 * it fall back to the one used longest ago.
 *
 * @param {string[]} options  the axis's values, in a stable order
 * @param {string[]} used     recent values on this axis, newest first
 * @param {number} seed       a per-subject offset, so two different subjects
 *                            still differ on a fresh machine with no ledger
 */
export function chooseDistinct(options, used = [], seed = 0) {
  if (!options || options.length === 0) return null;
  const start = Math.abs(seed) % options.length;
  const rotated = [...options.slice(start), ...options.slice(0, start)];

  const unused = rotated.find((o) => !used.includes(o));
  if (unused) return unused;

  let best = rotated[0];
  let bestAge = -1;
  for (const option of rotated) {
    const index = used.indexOf(option);
    const age = index === -1 ? Infinity : index;
    if (age > bestAge) {
      bestAge = age;
      best = option;
    }
  }
  return best;
}

/** A stable non-negative integer from a string. Used only to offset the rotation. */
export function seedFrom(text) {
  return createHash('sha256').update(String(text)).digest().readUInt32BE(0);
}

/** Short stable fingerprint of a string, for recording a page's bones. */
export function fingerprint(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}
