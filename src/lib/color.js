/**
 * Colour maths: sRGB <-> hex, WCAG 2.1 relative luminance and contrast,
 * and two real quantisers (median cut, k-means++).
 *
 * Everything here is pure and synchronous so it can be unit tested against
 * published reference values rather than eyeballed.
 */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Parse "#RGB", "#RGBA", "#RRGGBB" or "#RRGGBBAA" into {r,g,b,a}. Throws on anything else. */
export function parseHex(value) {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected a hex colour string, received ${typeof value}`);
  }
  const m = HEX_RE.exec(value.trim());
  if (!m) {
    throw new TypeError(
      `Not a hex colour: ${JSON.stringify(value)}. Expected a form like "#1a2b3c".`
    );
  }
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));

/** {r,g,b} (0-255) -> "#RRGGBB", always uppercase, always 6 digits. */
export function toHex({ r, g, b }) {
  return (
    '#' +
    [r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('').toUpperCase()
  );
}

/**
 * WCAG 2.1 relative luminance.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance({ r, g, b }) {
  const lin = (c8) => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG 2.1 contrast ratio between two colours, 1:1 .. 21:1.
 * Accepts hex strings or {r,g,b} objects, in either order.
 */
export function contrastRatio(a, b) {
  const ca = typeof a === 'string' ? parseHex(a) : a;
  const cb = typeof b === 'string' ? parseHex(b) : b;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Round to 2dp, the way contrast ratios are normally quoted. */
export const roundRatio = (n) => Math.round(n * 100) / 100;

/**
 * WCAG pass/fail bands for a ratio.
 * "Large" text is >=24px, or >=18.66px bold.
 */
export function wcagVerdict(ratio) {
  return {
    ratio: roundRatio(ratio),
    aa_normal: ratio >= 4.5,
    aa_large: ratio >= 3,
    aaa_normal: ratio >= 7,
    aaa_large: ratio >= 4.5,
    ui_component: ratio >= 3
  };
}

/** CIE L* 0..100, from relative luminance. Used only for ordering. */
export function lightness(rgb) {
  const y = relativeLuminance(rgb);
  return y <= 216 / 24389 ? y * (24389 / 27) : Math.pow(y, 1 / 3) * 116 - 16;
}

/** Straight-line distance in sRGB. Cheap, and adequate for de-duplicating swatches. */
export function rgbDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** HSV saturation, 0..1. Used to pick an accent. */
export function saturation({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/* ------------------------------------------------------------------ *
 * Median cut
 * ------------------------------------------------------------------ */

function widestChannel(box) {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const p of box) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  const ranges = [
    { channel: 'r', range: rMax - rMin },
    { channel: 'g', range: gMax - gMin },
    { channel: 'b', range: bMax - bMin }
  ];
  ranges.sort((a, b) => b.range - a.range);
  return ranges[0];
}

/**
 * Median-cut quantisation (Heckbert, 1982).
 *
 * Repeatedly splits the colour box with the widest single-channel range, at
 * the median of that channel, until `count` boxes exist. Each box is then
 * averaged. This is a real quantiser: it finds the colours the image is
 * actually made of, which "average the pixels" does not.
 *
 * @param {Array<{r:number,g:number,b:number}>} pixels
 * @param {number} count
 * @returns {Array<{r:number,g:number,b:number,population:number}>} largest population first
 */
export function medianCut(pixels, count) {
  if (!Array.isArray(pixels) || pixels.length === 0) {
    throw new RangeError('medianCut needs at least one pixel.');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`medianCut needs a positive integer count, received ${count}`);
  }

  let boxes = [pixels.slice()];

  while (boxes.length < count) {
    let target = -1;
    let bestRange = -1;
    let bestChannel = 'r';
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { channel, range } = widestChannel(boxes[i]);
      if (range > bestRange) {
        bestRange = range;
        target = i;
        bestChannel = channel;
      }
    }
    if (target === -1 || bestRange <= 0) break; // nothing left worth splitting

    const box = boxes[target];
    box.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.length >> 1;
    const left = box.slice(0, mid);
    const right = box.slice(mid);
    if (left.length === 0 || right.length === 0) break;
    boxes.splice(target, 1, left, right);
  }

  return boxes
    .map((box) => {
      let r = 0, g = 0, b = 0;
      for (const p of box) {
        r += p.r;
        g += p.g;
        b += p.b;
      }
      const n = box.length;
      return {
        r: clampByte(r / n),
        g: clampByte(g / n),
        b: clampByte(b / n),
        population: n
      };
    })
    .sort((a, b) => b.population - a.population);
}

/* ------------------------------------------------------------------ *
 * k-means++
 * ------------------------------------------------------------------ */

/** Deterministic PRNG, so the same image always yields the same palette. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * k-means with k-means++ seeding, in sRGB, with a fixed PRNG seed so results
 * are reproducible run to run.
 *
 * @returns {Array<{r:number,g:number,b:number,population:number}>} largest population first
 */
export function kMeans(pixels, count, { maxIterations = 32, seed = 0x5eed, initial = null } = {}) {
  if (!Array.isArray(pixels) || pixels.length === 0) {
    throw new RangeError('kMeans needs at least one pixel.');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`kMeans needs a positive integer count, received ${count}`);
  }
  const k = Math.min(count, pixels.length);
  const rand = mulberry32(seed);

  // Seeding from median cut, when offered, is strictly better than seeding at
  // random: the boxes already sit in the right regions and Lloyd's iterations
  // only have to pull each centroid onto its cluster's true centre.
  if (initial && initial.length > 0) {
    const centroids = initial.slice(0, k).map((c) => ({ r: c.r, g: c.g, b: c.b }));
    return lloyd(pixels, centroids, maxIterations);
  }

  const centroids = [{ ...pixels[Math.floor(rand() * pixels.length)] }];
  const d2 = new Float64Array(pixels.length);
  while (centroids.length < k) {
    let total = 0;
    for (let i = 0; i < pixels.length; i++) {
      let best = Infinity;
      for (const c of centroids) {
        const d = rgbDistance(pixels[i], c);
        if (d * d < best) best = d * d;
      }
      d2[i] = best;
      total += best;
    }
    if (total === 0) break; // every pixel already sits on a centroid
    let target = rand() * total;
    let chosen = pixels.length - 1;
    for (let i = 0; i < pixels.length; i++) {
      target -= d2[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push({ ...pixels[chosen] });
  }

  return lloyd(pixels, centroids, maxIterations);
}

/** Lloyd's iterations: assign, average, repeat until nothing moves. */
function lloyd(pixels, centroids, maxIterations) {
  const assign = new Int32Array(pixels.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = rgbDistance(pixels[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }

    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < pixels.length; i++) {
      const s = sums[assign[i]];
      s.r += pixels[i].r;
      s.g += pixels[i].g;
      s.b += pixels[i].b;
      s.n++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n === 0) continue;
      centroids[c] = {
        r: clampByte(sums[c].r / sums[c].n),
        g: clampByte(sums[c].g / sums[c].n),
        b: clampByte(sums[c].b / sums[c].n)
      };
    }
    if (!moved) break;
  }

  const counts = new Array(centroids.length).fill(0);
  for (let i = 0; i < pixels.length; i++) counts[assign[i]]++;

  return centroids
    .map((c, i) => ({ ...c, population: counts[i] }))
    .filter((c) => c.population > 0)
    .sort((a, b) => b.population - a.population);
}

/**
 * Median cut, then Lloyd's iterations from those boxes.
 *
 * Median cut alone returns the AVERAGE of each box, and a box that straddles
 * two real colours averages to a colour the image does not contain. On a
 * product photograph where the accent covers a tenth of the frame, that is
 * exactly what happens to the accent. Refining from the boxes pulls each
 * representative onto a colour that is really there.
 */
export function medianCutRefined(pixels, count, { maxIterations = 24 } = {}) {
  const seeds = medianCut(pixels, count);
  return lloyd(pixels, seeds.map((s) => ({ r: s.r, g: s.g, b: s.b })), maxIterations);
}

/** Drop swatches that sit within `threshold` of an earlier, larger one. */
export function dedupe(swatches, threshold = 12) {
  const kept = [];
  for (const s of swatches) {
    if (kept.some((k) => rgbDistance(k, s) < threshold)) continue;
    kept.push(s);
  }
  return kept;
}

/** Mix two colours in sRGB. amount 0 = a, 1 = b. */
export function mix(a, b, amount) {
  const ca = typeof a === 'string' ? parseHex(a) : a;
  const cb = typeof b === 'string' ? parseHex(b) : b;
  return {
    r: clampByte(ca.r + (cb.r - ca.r) * amount),
    g: clampByte(ca.g + (cb.g - ca.g) * amount),
    b: clampByte(ca.b + (cb.b - ca.b) * amount)
  };
}

/** Nudge a colour toward white or black until it clears `target` against `against`. */
export function ensureContrast(colour, against, target, { maxSteps = 100 } = {}) {
  const base = typeof colour === 'string' ? parseHex(colour) : colour;
  const bg = typeof against === 'string' ? parseHex(against) : against;
  if (contrastRatio(base, bg) >= target) return { ...base, adjusted: false, steps: 0 };

  // Move away from the background: darken if the background is light.
  const toward = relativeLuminance(bg) > 0.35 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  for (let i = 1; i <= maxSteps; i++) {
    const candidate = mix(base, toward, i / maxSteps);
    if (contrastRatio(candidate, bg) >= target) {
      return { ...candidate, adjusted: true, steps: i };
    }
  }
  return { ...toward, adjusted: true, steps: maxSteps };
}
