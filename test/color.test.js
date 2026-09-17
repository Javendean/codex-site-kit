/**
 * The colour maths, checked against published reference values rather than
 * against itself. If this file is wrong, every contrast number the kit reports
 * is wrong, and reporting a confident wrong number is worse than reporting
 * nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contrastRatio,
  dedupe,
  ensureContrast,
  kMeans,
  medianCut,
  mix,
  parseHex,
  relativeLuminance,
  roundRatio,
  toHex,
  wcagVerdict
} from '../src/lib/color.js';

test('contrast: white on black is exactly 21:1, the top of the scale', () => {
  assert.equal(roundRatio(contrastRatio('#FFFFFF', '#000000')), 21);
  assert.equal(roundRatio(contrastRatio('#000000', '#FFFFFF')), 21, 'order must not matter');
});

test('contrast: a colour against itself is exactly 1:1', () => {
  assert.equal(roundRatio(contrastRatio('#B4331F', '#B4331F')), 1);
});

test("contrast: #767676 on white is 4.54:1 — WCAG's own worked boundary example", () => {
  // This is the canonical grey that sits just above the 4.5:1 AA threshold.
  // If this number drifts, the luminance curve is wrong.
  assert.equal(roundRatio(contrastRatio('#767676', '#FFFFFF')), 4.54);
  assert.equal(wcagVerdict(contrastRatio('#767676', '#FFFFFF')).aa_normal, true);
});

test('contrast: #777777 on white drops below AA, and is reported as failing', () => {
  const verdict = wcagVerdict(contrastRatio('#777777', '#FFFFFF'));
  assert.ok(verdict.ratio < 4.5, `expected below 4.5, got ${verdict.ratio}`);
  assert.equal(verdict.aa_normal, false);
  assert.equal(verdict.aa_large, true, 'it still clears the 3:1 large-text bar');
});

test('luminance: the sRGB primaries carry their published coefficients', () => {
  assert.equal(Math.round(relativeLuminance(parseHex('#FF0000')) * 10000) / 10000, 0.2126);
  assert.equal(Math.round(relativeLuminance(parseHex('#00FF00')) * 10000) / 10000, 0.7152);
  assert.equal(Math.round(relativeLuminance(parseHex('#0000FF')) * 10000) / 10000, 0.0722);
  assert.equal(relativeLuminance(parseHex('#000000')), 0);
  assert.equal(Math.round(relativeLuminance(parseHex('#FFFFFF')) * 1000) / 1000, 1);
});

test('hex: shorthand, longhand and alpha all parse, and round-trip uppercase', () => {
  assert.deepEqual(parseHex('#abc'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  assert.deepEqual(parseHex('AABBCC'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  assert.equal(parseHex('#00000080').a, 128 / 255);
  assert.equal(toHex({ r: 10, g: 200, b: 3 }), '#0AC803');
});

test('hex: failure path — a non-colour throws a message that names the input', () => {
  assert.throws(() => parseHex('rebeccapurple'), /Not a hex colour: "rebeccapurple"/);
  assert.throws(() => parseHex('#12345'), /Not a hex colour/);
  assert.throws(() => parseHex(null), /received object/);
  assert.throws(() => parseHex(42), /received number/);
});

test('median cut: recovers planted colours exactly, and does not average them away', () => {
  const planted = ['#FF0000', '#00FF00', '#0000FF', '#FFFFFF'];
  const pixels = [];
  for (const hex of planted) {
    const rgb = parseHex(hex);
    for (let i = 0; i < 40; i++) pixels.push({ r: rgb.r, g: rgb.g, b: rgb.b });
  }

  const result = medianCut(pixels, 4);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map(toHex).sort(), [...planted].sort());
  assert.deepEqual(
    result.map((s) => s.population),
    [40, 40, 40, 40]
  );

  // The point of a quantiser: the mean of these four is a mid grey, and a mid
  // grey is not in the image.
  assert.ok(!result.map(toHex).includes('#BF4040'));
});

test('k-means: recovers the same planted colours, deterministically', () => {
  const planted = ['#111111', '#EEEEEE', '#CC2200'];
  const pixels = [];
  for (const hex of planted) {
    const rgb = parseHex(hex);
    for (let i = 0; i < 50; i++) pixels.push({ r: rgb.r, g: rgb.g, b: rgb.b });
  }

  const once = kMeans(pixels, 3).map(toHex).sort();
  const twice = kMeans(pixels, 3).map(toHex).sort();

  assert.deepEqual(once, [...planted].sort());
  assert.deepEqual(once, twice, 'the fixed seed must make this reproducible');
});

test('quantisers: population ordering puts the dominant colour first', () => {
  const pixels = [];
  for (let i = 0; i < 90; i++) pixels.push({ r: 20, g: 20, b: 20 });
  for (let i = 0; i < 10; i++) pixels.push({ r: 240, g: 240, b: 240 });

  assert.equal(toHex(medianCut(pixels, 2)[0]), '#141414');
  assert.equal(toHex(kMeans(pixels, 2)[0]), '#141414');
});

test('quantisers: failure path — empty input and bad counts are refused by name', () => {
  assert.throws(() => medianCut([], 4), /at least one pixel/);
  assert.throws(() => kMeans([], 4), /at least one pixel/);
  assert.throws(() => medianCut([{ r: 0, g: 0, b: 0 }], 0), /positive integer count, received 0/);
  assert.throws(() => kMeans([{ r: 0, g: 0, b: 0 }], 2.5), /positive integer count, received 2.5/);
  assert.throws(() => medianCut('not pixels', 2), /at least one pixel/);
});

test('quantisers: asking for more colours than the image has does not invent any', () => {
  const pixels = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 }
  ];
  assert.ok(medianCut(pixels, 8).length <= 2);
  assert.ok(kMeans(pixels, 8).length <= 2);
});

test('dedupe: near-identical swatches collapse, distinct ones survive', () => {
  const swatches = [
    { r: 100, g: 100, b: 100, population: 10 },
    { r: 103, g: 101, b: 99, population: 5 },
    { r: 250, g: 10, b: 10, population: 3 }
  ];
  assert.equal(dedupe(swatches, 14).length, 2);
  assert.equal(dedupe(swatches, 1).length, 3);
});

test('mix: the endpoints are the inputs, and the midpoint is between them', () => {
  assert.equal(toHex(mix('#000000', '#FFFFFF', 0)), '#000000');
  assert.equal(toHex(mix('#000000', '#FFFFFF', 1)), '#FFFFFF');
  assert.equal(toHex(mix('#000000', '#FFFFFF', 0.5)), '#808080');
});

test('ensureContrast: leaves a passing colour alone and says it did not move it', () => {
  const result = ensureContrast('#000000', '#FFFFFF', 4.5);
  assert.equal(result.adjusted, false);
  assert.equal(toHex(result), '#000000');
});

test('ensureContrast: moves a failing colour until it clears, and reports that it moved', () => {
  const result = ensureContrast('#DDDDDD', '#FFFFFF', 4.5);
  assert.equal(result.adjusted, true);
  assert.ok(
    contrastRatio(result, '#FFFFFF') >= 4.5,
    `expected >= 4.5 after adjustment, got ${roundRatio(contrastRatio(result, '#FFFFFF'))}`
  );
});

test('ensureContrast: on a dark ground it moves toward white, not toward black', () => {
  const result = ensureContrast('#222222', '#111111', 4.5);
  assert.ok(relativeLuminance(result) > relativeLuminance(parseHex('#222222')));
  assert.ok(contrastRatio(result, '#111111') >= 4.5);
});
