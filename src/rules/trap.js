/**
 * The trap tier.
 *
 * research/08-craft.md calls this "the most strategically important part of the
 * list, because it means the problem cannot be solved once."
 *
 * Everything here reads as sophisticated TODAY. Each one is an escape hatch
 * from the indigo-and-three-cards house style, which is why designers reached
 * for it — and reaching for it is precisely what is burning it. febbhav is the
 * only source in the corpus tracking which tells have DECAYED, and it named the
 * purple → cream / emerald / italic-serif migration as an active shift.
 *
 * So these findings are not "you did something wrong". They are "you did what
 * the taste-forward people did eighteen months ago, and the crowd has arrived".
 * The critique renders them with `!?` — the annotation for a move that is
 * interesting, unresolved, and worth knowing you are making.
 */

import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { toOklch, findColors } from '../lib/oklch.js';
import { textOf, HEADINGS } from '../lib/dom.js';
import { decls, quote, copyBlocks, splitList } from './helpers.js';

/* ------------------------------------------------------------------ */

export const creamWash = register({
  id: 'cream-wash',
  tier: 'trap',
  title: 'The cream-and-italic-serif escape',
  severity: SEVERITY.TRAP,
  confidence: CONFIDENCE.ASSERTED,
  who: ['gesso', 'krebs', 'febbhav'],
  threshold:
    'A page ground in OKLCH lightness 0.92-0.99 at hue 40-110 with chroma 0.015-0.06 — warm oat or cream — reported on its own, and reported harder when a serif display face or monospace capital labels appear with it.',
  why:
    'Gesso ships this as `cream-default-wash`, and the detail that makes the point is that an HN commenter caught Adrian Krebs\'s OWN BLOG POST wearing it while he was documenting AI design tells: "recently it\'s more of the same beige scheme this very blog post is using." Cream became the answer to purple. Then everyone answered purple the same way. The palette is not the problem — the reference storefront in this same corpus is deliberately bone #F3EDE1 rather than white, and it is right to be. The difference is that its cream is DERIVED: it is the measured colour of the ink it prints with. A cream chosen because cream reads as tasteful is a different object from a cream chosen because it is the colour of the thing.',
  fix:
    'Keep the warm ground if you can say where it came from. If you cannot, move the hue somewhere the crowd is not — the anchor hue of a real object in the subject, with the neutrals carrying 0.005-0.015 chroma of it. And if you are also pairing it with a large italic serif and monospace capital labels, you are wearing the full uniform, not one piece of it.',
  detect(ctx) {
    const out = [];
    const grounds = ctx.decls.filter(
      (d) => /^(background|background-color)$/.test(d.property) || /^--(paper|bg|ground|surface|page)/.test(d.property)
    );
    const serif = ctx.decls.some(
      (d) => /font-family|--font/.test(d.property) && /serif|georgia|garamond|fraunces|newsreader|instrument|playfair|iowan|palatino/i.test(d.value) && !/sans-serif/i.test(splitList(d.value)[0] || '')
    );
    const monoLabels = ctx.decls.some(
      (d) => /font-family|--font/.test(d.property) && /mono/i.test(d.value)
    ) && ctx.decls.some((d) => d.property === 'text-transform' && /uppercase/i.test(d.value));

    for (const d of grounds) {
      for (const colour of findColors(d.value)) {
        const lch = toOklch(colour);
        if (lch.L < 0.92 || lch.L > 0.995) continue;
        if (lch.C < 0.015 || lch.C > 0.06) continue;
        if (lch.H < 40 || lch.H > 110) continue;
        const companions = [serif ? 'a serif display face' : null, monoLabels ? 'monospace capital labels' : null].filter(Boolean);
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.property}: ${quote(d.value, 40)}\` is a warm cream ground${companions.length ? `, and the project also carries ${companions.join(' and ')}` : ''}.`,
          measured: `OKLCH L ${lch.L.toFixed(2)} C ${lch.C.toFixed(3)} H ${Math.round(lch.H)}° — inside the cream band${companions.length === 2 ? '; all three pieces of the uniform present' : ''}`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const SAFE_GREENS = ['#10b981', '#34d399', '#059669', '#6ee7b7', '#047857'];

export const safeGreen = register({
  id: 'safe-green',
  tier: 'trap',
  title: 'Emerald as the "not purple" accent',
  severity: SEVERITY.TRAP,
  confidence: CONFIDENCE.ASSERTED,
  who: ['gesso', 'febbhav'],
  threshold: 'Tailwind emerald #10B981 or its immediate neighbours used as an accent.',
  why:
    'Gesso ships this as `safe-green-default`. It is the second move in the same game as `indigo-accent`: a generator told not to use purple reaches for the next colour in the same palette file, and emerald is where it lands. It is already flagged, which means it is already burned. Worth noticing what the pattern is, because it will happen again with whatever replaces emerald: the problem was never the hue, it was that the hue came out of a palette rather than out of the subject.',
  fix: 'Derive the accent from something real. If the subject has no object to take a colour from, palette_from_subject will build one and will refuse both indigo and this green.',
  detect(ctx) {
    const out = [];
    const banned = SAFE_GREENS.map((h) => findColors(h)[0]);
    for (const d of ctx.decls) {
      for (const colour of findColors(d.value)) {
        const hit = banned.find((b) => b.r === colour.r && b.g === colour.g && b.b === colour.b);
        if (!hit) continue;
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.property}: ${quote(d.value, 40)}\` is Tailwind emerald.`,
          measured: `${colour.raw ?? colour.text} — the "not purple" default`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const numberedSections = register({
  id: 'numbered-sections',
  tier: 'trap',
  title: '01 / 02 / 03 as section numbering',
  severity: SEVERITY.TRAP,
  confidence: CONFIDENCE.ASSERTED,
  who: ['gesso', 'impeccable'],
  threshold: 'Two or more short blocks on a page whose entire content is a zero-padded two-digit number.',
  why:
    'Gesso ships this as `numbered-section-markers` and the impeccable craft floor refuses it unless "the sequence itself carries information the reader needs". That qualifier is the whole rule. If the reader must do step 01 before step 02, the numbers are information. If they are on the sections of a homepage, they are editorial costume — borrowed from print design where the numbers indexed something, applied to a page where they index nothing.',
  fix:
    'Delete them. If the sequence genuinely matters — a lesson pathway, an enrolment process — number them 1, 2, 3 without the zero padding, because the padding is the part that is decoration.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      const markers = page.tree.all.filter((n) => {
        const t = textOf(n);
        return /^0\d$/.test(t);
      });
      if (markers.length < 2) continue;
      out.push({
        rel: page.rel,
        offset: markers[0].start,
        what: `${markers.length} elements contain nothing but a zero-padded number: ${markers.map((m) => textOf(m)).join(', ')}.`,
        measured: `${markers.length} markers`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const italicInHeading = register({
  id: 'italic-in-heading',
  tier: 'trap',
  title: 'One italic word inside an upright heading',
  severity: SEVERITY.TRAP,
  confidence: CONFIDENCE.ASSERTED,
  who: ['hallmark', 'febbhav'],
  threshold: 'An <em>, <i>, or an element with font-style: italic, inside an h1, h2 or h3 whose other words are upright.',
  why:
    'Hallmark gate 38a auto-fails this as "among the most reliable AI tells", and adds the observation that makes it a trap rather than a mistake: this is the CURRENT fix for a boring headline, and it is already burned. The move is to take a flat headline and italicise the one word that was supposed to carry the meaning — which is a way of pointing at the interesting word instead of writing an interesting sentence.',
  fix:
    'Rewrite the headline so no word needs pointing at. If the emphasis is genuinely semantic, <em> is correct HTML and a screen reader will read it as emphasis — but then ask whether the surrounding sentence has earned it.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      for (const heading of page.tree.all.filter((n) => ['h1', 'h2', 'h3'].includes(n.tag))) {
        const full = textOf(heading);
        const italics = (heading.children || []).filter((c) => c.tag === 'em' || c.tag === 'i');
        if (italics.length === 0) continue;
        const inner = italics.map((i) => textOf(i)).join(' ');
        if (!full || inner.length >= full.length) continue;
        out.push({
          rel: page.rel,
          offset: italics[0].start,
          what: `<${heading.tag}> "${quote(full, 60)}" italicises "${quote(inner, 30)}".`,
          measured: `${inner.split(/\s+/).length} of ${full.split(/\s+/).length} words set in italic`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const pillEverything = register({
  id: 'pill-everything',
  tier: 'trap',
  title: 'The pill-shaped button',
  severity: SEVERITY.TRAP,
  confidence: CONFIDENCE.ASSERTED,
  who: ['craft'],
  threshold: 'Three or more rules setting a fully-rounded radius (999px or more, or 50%) on non-circular elements.',
  why:
    'research/08-craft.md §8.2 passes the pill through its radius detector and then adds a caveat in the same row: "the pill CTA is separately the most-cloned single element of 2026." It is not a failure. It is a shape that was distinctive three years ago, became the default, and is now on the way to reading as dated — the same arc the 2015 flat-design button travelled. Recorded here so the choice is made deliberately rather than inherited.',
  fix:
    'If the pill is the house shape and everything else agrees with it, keep it — consistency beats novelty. If it is on the buttons because buttons come pill-shaped now, try the page\'s own radius instead: an 8-12px button next to an 8-12px card is a system, and a system is what reads as expensive.',
  detect(ctx) {
    const pills = decls(ctx, /^border-radius$/).filter((d) => /\b(9{3,}px|50%)\b/.test(d.value));
    if (pills.length < 3) return [];
    return [
      {
        rel: pills[0].rel,
        offset: pills[0].offset,
        what: `${pills.length} rules use a fully-rounded radius: ${pills.slice(0, 4).map((p) => quote(p.selector, 20)).join(', ')}${pills.length > 4 ? ', …' : ''}.`,
        measured: `${pills.length} pill or circle radii`
      }
    ];
  }
});

/* ------------------------------------------------------------------ */

export const gradientText = register({
  id: 'gradient-text',
  tier: 'trap',
  title: 'A gradient poured into the headline',
  severity: SEVERITY.TRAP,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'impeccable'],
  threshold: '`background-clip: text` or `-webkit-background-clip: text` combined with a transparent text colour.',
  why:
    'Gesso ships `gradient-text`; the impeccable craft floor refuses it in four words — "Gradient text. Emphasis comes from weight or size." It is the most legible single marker of the 2023-2026 generated-landing-page house style. It also costs real legibility: the lighter end of the gradient always has less contrast against the page than the darker end, so part of every headline fails a contrast check even when the average passes.',
  fix: 'Set the headline in one colour and get the emphasis from weight, size, or the space around it.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      if (!/background-clip$/.test(d.property)) continue;
      if (!/text/i.test(d.value)) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${quote(d.selector, 40)} { ${d.property}: ${d.value} }\` clips a background into the text.`,
        measured: 'background-clip: text'
      });
    }
    return out;
  }
});

export const rules = [creamWash, safeGreen, numberedSections, italicInHeading, pillEverything, gradientText];
