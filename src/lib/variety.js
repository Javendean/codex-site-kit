/**
 * Choosing, given the record.
 *
 * The ledger itself lives in `rules/ledger.js` — it belongs to the rulebook,
 * because five rules read it. This file is the other half: given what was
 * emitted before, decide what to emit now.
 *
 * research/08-craft.md, on the deepest tell in its whole list:
 *
 *   "Variety must be enforced by a LEDGER that records what was emitted last,
 *    not merely enabled by having options."
 *
 * The authors of an anti-slop tool documented their own tool failing exactly
 * this: twenty-one themes available, one macrostructure emitted. Options are
 * not variety.
 */

import { createHash } from 'node:crypto';

/**
 * Choose the option furthest from what was chosen recently.
 *
 * Deliberately not random. Randomness repeats: with six options and a fair
 * draw, two consecutive builds collide one time in six — and one time in six
 * is often enough to be the two a visitor happens to see side by side. This
 * walks the options from a stable per-subject offset and takes the first that
 * is not in the recent window. Only when every option has been used does it
 * fall back to the one used longest ago.
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

/**
 * Push a hue away from ones used recently, so two consecutive sites do not
 * land on neighbouring colours.
 */
export function spreadHue(base, used = [], minimumGap = 40) {
  let hue = ((base % 360) + 360) % 360;
  for (let attempt = 0; attempt < 9; attempt++) {
    const clash = used.find((u) => {
      const gap = Math.abs(((hue - u + 540) % 360) - 180);
      return 180 - gap < minimumGap;
    });
    if (clash === undefined) return hue;
    hue = (hue + 47) % 360;
  }
  return hue;
}
