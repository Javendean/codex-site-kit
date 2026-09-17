/**
 * The rulebook.
 *
 * One flat list, assembled from the tier files, with an id index. Every entry
 * has already been through `register()`, which refuses a rule with no
 * threshold, no teaching note, no fix, no confidence tag, or a source id that
 * is not in the citation registry.
 */

import { rules as tier1 } from './tier1.js';
import { rules as tier2 } from './tier2.js';
import { rules as tier3 } from './tier3.js';
import { rules as trap } from './trap.js';
import { rules as floor } from './floor.js';
import { rules as honesty } from './honesty.js';
import { rules as variety } from './variety.js';

export const RULEBOOK = [...tier1, ...tier2, ...floor, ...honesty, ...tier3, ...trap, ...variety];

export const BY_ID = Object.fromEntries(RULEBOOK.map((r) => [r.id, r]));

/** The copy rules — what `check_copy` runs on its own. */
export const COPY_RULES = [...tier3, BY_ID['invented-proof'], BY_ID['unverified-attribution'], BY_ID['unsupported-superlative'], BY_ID['unfinished-marker'], BY_ID['lorem-ipsum'], BY_ID['placeholder-identity']].filter(Boolean);

/** Guard against two rules claiming the same id. */
const seen = new Set();
for (const rule of RULEBOOK) {
  if (seen.has(rule.id)) throw new Error(`Two rules share the id "${rule.id}".`);
  seen.add(rule.id);
}

export { tier1, tier2, tier3, trap, floor, honesty, variety };
export * from './engine.js';
export { SOURCES, CONFIDENCE, CONFIDENCE_NOTE, citeLine, requireSource } from './sources.js';
