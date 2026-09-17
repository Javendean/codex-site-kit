/**
 * palette_from_image — read the colours off the subject.
 *
 * The move this encodes: the storefront's page colour and type colour are the
 * actual garment and the actual ink, measured off the product photograph, not
 * chosen from a grey ramp. A site whose ground is the thing it sells looks
 * like it belongs to that thing, and no amount of taste applied to #F5F5F5
 * gets there.
 *
 * Real quantisation, not an average. Averaging a photograph of a black shirt
 * on a white table returns grey, which is in neither.
 *
 * Every returned colour comes with its WCAG contrast against every other one,
 * so a pair that cannot carry text cannot be chosen without seeing the number
 * that says so.
 */

import path from 'node:path';
import { z } from 'zod';

import { ImageError, SUPPORTED_FORMATS, decodeImage, samplePixels } from '../lib/image.js';
import { dedupe, kMeans, lightness, medianCutRefined, relativeLuminance, saturation, toHex } from '../lib/color.js';
import { contrastMatrix, derivePalette } from '../lib/palette.js';
import { auditPalette, BANNED_HEXES } from '../lib/palette_rules.js';
import { toOklch, roundChroma } from '../lib/oklch.js';
import { STATUS, count, failure, guard, table, toolResult } from '../lib/report.js';
import { commonOutput } from './common.js';

const TOOL = 'palette_from_image';

export const config = {
  title: 'Derive a palette from a photograph',
  description: [
    'Quantises an image with median cut or k-means and returns a small, considered palette: the',
    'colours the subject is actually made of, with how much of the image each one covers.',
    '',
    'Returns a full WCAG 2.1 contrast matrix alongside the colours, computed from relative',
    'luminance, so an unreadable pair cannot be chosen by accident. Also returns a ready-made',
    'token set for both theme states, which can be passed straight to init_site.',
    '',
    `Reads PNG and JPEG (${SUPPORTED_FORMATS.join(', ')}). Everything is done locally; nothing is uploaded.`
  ].join('\n'),
  inputSchema: {
    image: z.string().min(1).describe('Full path to a PNG or JPEG file.'),
    count: z.number().int().min(2).max(16).optional().describe('How many colours to extract. Default 6.'),
    algorithm: z
      .enum(['median-cut', 'k-means'])
      .optional()
      .describe(
        'median-cut (default) splits the colour space at medians, then refines with Lloyd iterations so each colour returned is one the image really contains. k-means seeds with k-means++ instead, and is sometimes better on photographs with soft gradients.'
      ),
    merge_similar: z
      .boolean()
      .optional()
      .describe('Drop colours that are nearly identical to one already found. Default true.'),
    sample_budget: z
      .number()
      .int()
      .min(1000)
      .max(200000)
      .optional()
      .describe('How many pixels to sample. Default 20000, which is plenty and keeps this instant.')
  },
  outputSchema: {
    ...commonOutput,
    image: z.string().optional(),
    format: z.string().optional(),
    dimensions: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
    algorithm: z.string().optional(),
    pixels_sampled: z.number().int().optional(),
    swatches: z
      .array(
        z.object({
          hex: z.string(),
          rgb: z.object({ r: z.number().int(), g: z.number().int(), b: z.number().int() }),
          population: z.number().int(),
          share: z.number(),
          relative_luminance: z.number(),
          lightness: z.number(),
          saturation: z.number()
        })
      )
      .optional(),
    contrast_matrix: z
      .array(
        z.object({
          colour: z.string(),
          luminance: z.number(),
          against: z.array(
            z.object({
              colour: z.string(),
              ratio: z.number(),
              aa_normal: z.boolean(),
              aa_large: z.boolean(),
              aaa_normal: z.boolean()
            })
          )
        })
      )
      .optional(),
    readable_pairs: z
      .array(z.object({ foreground: z.string(), background: z.string(), ratio: z.number(), rating: z.string() }))
      .optional(),
    suggested_tokens: z
      .object({
        light: z.record(z.string(), z.string()),
        dark: z.record(z.string(), z.string()),
        contrast: z.array(
          z.object({
            pair: z.string(),
            state: z.string(),
            foreground: z.string(),
            background: z.string(),
            ratio: z.number(),
            target: z.number(),
            passes: z.boolean(),
            aa_normal: z.boolean(),
            aa_large: z.boolean()
          })
        ),
        adjustments: z.array(z.record(z.string(), z.any()))
      })
      .optional(),
    corpus_audit: z
      .array(z.object({ token: z.string(), hex: z.string(), problem: z.string(), measured: z.string() }))
      .optional(),
    banned_hexes_checked: z.number().int().optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async (args) => {
  let image;
  try {
    image = await decodeImage(args.image);
  } catch (err) {
    if (err instanceof ImageError) {
      return failure({
        tool: TOOL,
        code: err.code,
        problem: err.message,
        why: `This tool reads ${SUPPORTED_FORMATS.join(', ')} and nothing else, on purpose: everything else would mean asking you to install a compiler.`,
        fix: err.fix,
        data: { image: path.resolve(args.image) }
      });
    }
    throw err;
  }

  const wanted = args.count ?? 6;
  const algorithm = args.algorithm ?? 'median-cut';
  const budget = args.sample_budget ?? 20000;

  const { pixels, sampled, skippedTransparent } = samplePixels(image, { budget });

  if (pixels.length === 0) {
    return failure({
      tool: TOOL,
      code: 'IMAGE_FULLY_TRANSPARENT',
      problem: 'Every pixel in that image is transparent, so there is no colour to read.',
      why: `All ${skippedTransparent} sampled pixels had an alpha value below the opaque threshold.`,
      fix: 'Use an image with a visible subject, or flatten it onto a background first.',
      data: {
        image: path.resolve(args.image),
        format: image.format,
        dimensions: { width: image.width, height: image.height }
      }
    });
  }

  // Ask for more than we need, then merge near-duplicates back down. A
  // photograph of one object often quantises into four shades of the same
  // colour, and four shades of one colour is not a palette.
  const overshoot = Math.min(16, wanted + 4);
  const raw = algorithm === 'k-means' ? kMeans(pixels, overshoot) : medianCutRefined(pixels, overshoot);
  const merged = args.merge_similar === false ? raw : dedupe(raw, 14);
  const chosen = merged.slice(0, wanted);

  const total = chosen.reduce((sum, s) => sum + s.population, 0) || 1;
  const swatches = chosen.map((s) => ({
    hex: toHex(s),
    rgb: { r: s.r, g: s.g, b: s.b },
    population: s.population,
    share: Math.round((s.population / sampled) * 1000) / 1000,
    relative_luminance: Math.round(relativeLuminance(s) * 10000) / 10000,
    lightness: Math.round(lightness(s) * 10) / 10,
    saturation: Math.round(saturation(s) * 1000) / 1000
  }));

  const hexes = swatches.map((s) => s.hex);
  const matrix = contrastMatrix(hexes);

  const readablePairs = [];
  for (const row of matrix) {
    for (const cell of row.against) {
      if (cell.colour === row.colour) continue;
      if (!cell.aa_large) continue;
      readablePairs.push({
        foreground: row.colour,
        background: cell.colour,
        ratio: cell.ratio,
        rating: cell.aaa_normal ? 'AAA' : cell.aa_normal ? 'AA' : 'AA large text only'
      });
    }
  }
  readablePairs.sort((a, b) => b.ratio - a.ratio);

  const suggested = derivePalette(chosen, { source: path.resolve(args.image) });

  // The colours came off a photograph, so they cannot be a Tailwind default by
  // accident — but the corpus's colour BANDS still apply, and a photograph of
  // something grey really does produce a zero-chroma neutral. Reporting that is
  // the point: research/08-craft.md, "minimum 0.005, never 0".
  const corpusAudit = auditPalette({ light: suggested.light, dark: suggested.dark });

  /* -- report ----------------------------------------------------------- */
  const sections = [
    {
      title: 'The colours this image is made of:',
      body: table(
        [
          { key: 'hex', label: 'HEX', max: 8 },
          { key: 'rgb', label: 'RGB', max: 16 },
          { key: 'share', label: 'SHARE', align: 'right', max: 7 },
          { key: 'light', label: 'L*', align: 'right', max: 6 },
          { key: 'sat', label: 'SAT', align: 'right', max: 6 },
          { key: 'note', label: 'READS AS', max: 22 }
        ],
        swatches.map((s) => ({
          hex: s.hex,
          rgb: `${s.rgb.r}, ${s.rgb.g}, ${s.rgb.b}`,
          share: `${Math.round(s.share * 100)}%`,
          light: s.lightness,
          sat: s.saturation,
          note:
            s.lightness > 78
              ? 'a ground'
              : s.lightness < 30
                ? 'ink'
                : s.saturation > 0.35
                  ? 'an accent'
                  : 'a mid tone'
        }))
      )
    },
    {
      title: 'WCAG 2.1 contrast, every colour against every other:',
      body: renderMatrix(hexes, matrix)
    },
    {
      title: 'A token set built from these colours, ready to pass to init_site:',
      body:
        '  light:\n' +
        Object.entries(suggested.light)
          .map(([k, v]) => `    ${k.padEnd(14)} ${v}`)
          .join('\n') +
        '\n\n  dark:\n' +
        Object.entries(suggested.dark)
          .map(([k, v]) => `    ${k.padEnd(14)} ${v}`)
          .join('\n')
    },
    {
      title: 'Measured contrast for that token set:',
      body: table(
        [
          { key: 'pair', label: 'PAIR', max: 26 },
          { key: 'state', label: 'STATE', max: 6 },
          { key: 'colours', label: 'COLOURS', max: 20 },
          { key: 'ratio', label: 'RATIO', align: 'right', max: 7 },
          { key: 'verdict', label: 'VERDICT', max: 16 }
        ],
        suggested.contrast.map((c) => ({
          pair: c.pair,
          state: c.state,
          colours: `${c.foreground} / ${c.background}`,
          ratio: `${c.ratio}:1`,
          verdict: c.passes ? `pass (needs ${c.target})` : `FAILS ${c.target}:1`
        }))
      )
    }
  ];

  if (suggested.adjustments.length > 0) {
    sections.push({
      title: 'Colours that had to be moved to stay readable:',
      body: suggested.adjustments
        .map((a) => `  ${a.token} (${a.state}) -> ${a.to}\n      ${a.reason}`)
        .join('\n')
    });
  }

  if (corpusAudit.length > 0) {
    sections.push({
      title: 'Where this palette sits against the corpus colour rules:',
      body: corpusAudit
        .map((a) => [`  ${a.token.padEnd(20)} ${a.hex}  ${a.problem}`, `      ${a.measured}`].join('\n'))
        .join('\n')
    });
  }

  const unreadable = suggested.contrast.filter((c) => !c.passes);

  // The contrast pairs decide pass or fail, because those are a property of
  // the palette. The corpus colour bands are reported alongside but do not
  // fail the tool: a near-greyscale photograph really does yield colourless
  // neutrals, and that is a fact about the photograph rather than a fault in
  // reading it. The report says so and says what to do instead.
  const clean = unreadable.length === 0;

  const nextSteps = [];
  if (unreadable.length > 0) {
    nextSteps.push('The pairs marked FAILS cannot carry body text at that size.');
    nextSteps.push(
      'Either pick a source image with more separation between its light and its dark, or set those two tokens by hand from a pair in the matrix above that reads AA.'
    );
  }
  if (corpusAudit.some((a) => /no colour in it/.test(a.problem))) {
    nextSteps.push(
      'The neutrals came back colourless, which means the photograph is near-greyscale. The corpus rule is that every neutral carries 0.005-0.015 chroma of the anchor hue — so pick the anchor from the most saturated thing in the frame and tint the greys toward it, or use palette_from_subject, which builds the tint in.'
    );
  }
  if (corpusAudit.some((a) => /accent with too little colour/.test(a.problem))) {
    nextSteps.push(
      'There is no accent in this image: nothing in it is saturated enough to be one. That is a fact about the photograph, not a fault. Either photograph something with the colour in frame, or choose the accent separately with palette_from_subject and keep the ground and ink from here.'
    );
  }
  if (clean) {
    nextSteps.push(
      `Pass "palette" from this result to init_site, or give init_site source_image: "${path.resolve(args.image)}" and it will do this itself.`
    );
    nextSteps.push('Use the ground and the ink as they are. They come from the subject, which is the whole point.');
  }

  return toolResult({
    tool: TOOL,
    status: clean ? STATUS.PASS : STATUS.FAIL,
    headline: clean
      ? `${count(swatches.length, 'colour')} read from ${path.basename(args.image)}. Every text pair clears WCAG AA` +
        (corpusAudit.length > 0
          ? `, and ${count(corpusAudit.length, 'token')} sits outside the corpus colour bands — that is usually a fact about the photograph rather than a fault, and the report says which.`
          : ', and every token sits inside the corpus colour bands.')
      : `${count(swatches.length, 'colour')} read from ${path.basename(args.image)}, but ${count(unreadable.length, 'pair')} cannot carry text.`,
    sections,
    nextSteps,
    data: {
      image: path.resolve(args.image),
      format: image.format,
      dimensions: { width: image.width, height: image.height },
      algorithm,
      pixels_sampled: sampled,
      swatches,
      contrast_matrix: matrix,
      readable_pairs: readablePairs.slice(0, 20),
      suggested_tokens: {
        light: suggested.light,
        dark: suggested.dark,
        contrast: suggested.contrast,
        adjustments: suggested.adjustments
      },
      corpus_audit: corpusAudit,
      banned_hexes_checked: BANNED_HEXES.length
    }
  });
});

/** A square grid of ratios. AA-failing cells are marked so the eye finds them. */
function renderMatrix(hexes, matrix) {
  const width = 9;
  const header = '  ' + ' '.repeat(width) + hexes.map((h) => h.padStart(width)).join('');
  const rows = matrix.map((row) => {
    const cells = row.against
      .map((cell) => {
        if (cell.colour === row.colour) return '—'.padStart(width);
        const mark = cell.aaa_normal ? '' : cell.aa_normal ? '' : cell.aa_large ? '*' : '!';
        return `${cell.ratio}${mark}`.padStart(width);
      })
      .join('');
    return '  ' + row.colour.padEnd(width) + cells;
  });
  return [header, ...rows, '', '  Blank = clears AA for body text (4.5:1).  * = large text only (3:1).  ! = unreadable.'].join('\n');
}

export const name = TOOL;
