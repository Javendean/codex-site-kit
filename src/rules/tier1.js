/**
 * Tier 1 — recognised in under five seconds, with no design vocabulary.
 *
 * The ordering is research/08-craft.md §4's, and that file is explicit that the
 * TIERING ITSELF is asserted: the sweep found no study of what non-technical
 * viewers actually notice. So these are not ranked by how wrong they are. They
 * are ranked by how fast someone clocks them, which is a different axis and a
 * hypothesis rather than a finding. Every rule here says so.
 */

import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { childElements, textOf, classShape, signature, classMatches } from '../lib/dom.js';
import { toOklch, parseColor, findColors } from '../lib/oklch.js';
import { gradients, quote, images, CARDY } from './helpers.js';

/* ------------------------------------------------------------------ */

const BANNED_INDIGO = [
  '#6366f1', '#818cf8', '#4f46e5', '#4338ca', '#3730a3',
  '#8b5cf6', '#7c3aed', '#6d28d9', '#a78bfa', '#5b21b6'
];

const INDIGO_RGB = BANNED_INDIGO.map((hex) => {
  const c = parseColor(hex);
  return { hex, r: c.r, g: c.g, b: c.b };
});

export const indigoAccent = register({
  id: 'indigo-accent',
  tier: 1,
  title: 'The indigo nobody chose',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'krebs', 'hallmark'],
  threshold:
    'Any of ten exact Tailwind hexes — #6366f1 #818cf8 #4f46e5 #4338ca #3730a3 #8b5cf6 #7c3aed #6d28d9 #a78bfa #5b21b6 — in any colour form: hex, rgb(), hsl() or oklch() resolving to the same pixel.',
  why:
    'These ten values are the default accent of every generator that ships with Tailwind installed. Krebs scored 1,590 Show HN landing pages and this was the single most common signature; his designers had a name for it before anyone measured it — "VibeCode Purple". Three independent sources agree, which is rare in this corpus and is why the rule is DEMONSTRATED rather than asserted. The colour is not ugly. The problem is that it was not chosen: it is what you get when nobody made a decision, and a viewer who has seen three of these pages this month reads it as exactly that.',
  fix:
    'Derive the accent from something real about the subject — the colour of a board, a jacket, a sign, a room. research/08-craft.md §4 calls this simultaneously the anti-slop fix and the most persuasive thing on the page, "because it proves you looked". Use palette_from_image on a photograph, or palette_from_subject if there is no photograph yet. Both refuse to return these ten.',
  more:
    'The detector matches on the pixel, not the spelling, so rewriting #6366f1 as rgb(99 102 241) does not get past it. That is deliberate: the aim is not to make you hide the colour, it is to make you pick a different one.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      for (const colour of findColors(d.value)) {
        const hit = INDIGO_RGB.find((c) => c.r === colour.r && c.g === colour.g && c.b === colour.b);
        if (!hit) continue;
        const lch = toOklch(colour);
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.property}: ${quote(d.value, 60)}\` resolves to ${hit.hex.toUpperCase()} — Tailwind indigo, one of the ten banned values.`,
          measured: `OKLCH L ${lch.L.toFixed(2)} C ${lch.C.toFixed(3)} H ${Math.round(lch.H)}°`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const threeStopGradient = register({
  id: 'three-stop-gradient',
  tier: 1,
  title: 'A gradient with a third colour in it',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'craft'],
  threshold: 'Any linear-, radial- or conic-gradient whose argument list contains three or more colour stops.',
  why:
    'research/08-craft.md bans all three-stop gradients in one phrase: "the third stop is vanity". Two stops is a direction — light to dark, warm to cool, a surface catching light. A third stop is a decision nobody needed to make, and it is the decision a model makes when it has no reason to stop. research/08-craft.md §6.4 sets the hard rule: two stops maximum.',
  fix:
    'Delete the middle stop. If the gradient then looks flat, the problem was never the number of stops — it is that the two ends are too close together in lightness. Push them apart instead of adding a third.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      for (const g of gradients(d.value)) {
        if (g.stops.length < 3) continue;
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.property}\` uses a ${g.kind} with ${g.stops.length} colour stops: ${g.stops.map((s) => quote(s.text, 18)).join(' → ')}.`,
          measured: `${g.stops.length} stops; the ceiling is 2`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const GRADIENT_SIGNATURES = [
  { name: 'purple to cyan', from: [255, 300], to: [170, 220] },
  { name: 'purple to blue', from: [255, 300], to: [220, 275] },
  { name: 'orange to pink', from: [20, 70], to: [330, 20] }
];

function hueIn(h, [lo, hi]) {
  return lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi;
}

export const bannedGradientPair = register({
  id: 'banned-gradient-pair',
  tier: 1,
  title: 'The gradient everyone else is using',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'krebs'],
  threshold:
    'A two-stop gradient whose ends fall in one of three named hue pairs: purple→cyan, purple→blue, orange→pink. Hue read in OKLCH.',
  why:
    'These three pairs are banned outright by Gesso and were counted by Krebs across 1,590 pages. They are not bad colour combinations in the abstract; they are the three that the generation of tools that produced most of the web\'s landing pages in 2025 and 2026 reached for by default. Using one is not a taste failure, it is a fingerprint.',
  fix:
    'If the gradient is doing real work — a scrim over a photograph, a surface catching light — keep the gradient and change the hues so both stops sit near the subject\'s own anchor hue, one lighter and one darker. If it is decoration, delete it: a flat ground with a considered colour reads more expensive than a gradient.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      for (const g of gradients(d.value)) {
        if (g.stops.length !== 2) continue;
        const [a, b] = g.stops.map((s) => toOklch(s.colour));
        if (a.C < 0.04 || b.C < 0.04) continue; // near-neutral: not the tell
        for (const sig of GRADIENT_SIGNATURES) {
          const forward = hueIn(a.H, sig.from) && hueIn(b.H, sig.to);
          const reverse = hueIn(b.H, sig.from) && hueIn(a.H, sig.to);
          if (!forward && !reverse) continue;
          out.push({
            rel: d.rel,
            offset: d.offset,
            what: `\`${d.property}\` is a ${sig.name} gradient — one of the three banned pairs.`,
            measured: `hues ${Math.round(a.H)}° → ${Math.round(b.H)}° in OKLCH`
          });
          break;
        }
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;

const ICON_SLOT_TAGS = new Set(['li', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'figcaption', 'button', 'a', 'span', 'div', 'p', 'strong']);

export const emojiFeatureIcon = register({
  id: 'emoji-feature-icon',
  tier: 1,
  title: 'Emoji standing in for an icon',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['hallmark', 'gesso', 'krebs', 'impeccable'],
  threshold:
    'An emoji character at the START of a list item, heading, card, step or button — the position where an icon would go. An emoji inside a sentence is left alone.',
  why:
    'Hallmark fails this as gate 30, Gesso ships it as `emoji-icon`, Krebs counted it, and the impeccable craft floor puts it plainly: "Unicode glyphs or emoji standing in for an icon system. Icons are drawn." There is a second reason that matters more for a page shown on a phone: research/08-craft.md §7.2 notes emoji render as Google\'s blob set on Android, which looks nothing like the iOS emoji the page was almost certainly eyeballed against. So the page you approved is not the page half your visitors see.',
  fix:
    'Hand-author the icon as inline SVG — 3 to 8 lines, 200 to 500 bytes. Or use no icon at all: research/08-craft.md quotes the blunter option, "most feature lists don\'t need icons". Watch one trap if you do draw them: febbhav\'s "Lucide five" finding is that even a correctly inlined stock glyph carries a fingerprint if you pick the obvious one — Sparkles for AI, Zap for fast, Shield for secure, Check for benefit, ArrowRight for a CTA.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      for (const node of page.tree.all) {
        if (!ICON_SLOT_TAGS.has(node.tag)) continue;
        const text = textOf(node);
        if (!text) continue;
        const head = text.slice(0, 3);
        if (!EMOJI_RE.test(head)) continue;
        // Report the innermost element holding the glyph. A card whose first
        // child is an emoji span would otherwise be reported twice, and the
        // span is the thing to edit.
        const inner = childElements(node).some((c) => EMOJI_RE.test(textOf(c).slice(0, 3)));
        if (inner) continue;
        out.push({
          rel: page.rel,
          offset: node.start,
          what: `<${node.tag}> opens with an emoji, in the slot an icon would occupy: ${quote(text, 50)}`,
          measured: `emoji at character 1 of a <${node.tag}>`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const uniformCardGrid = register({
  id: 'uniform-card-grid',
  tier: 1,
  title: 'Identical cards in a row',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['krebs', 'hallmark', 'gesso', 'hn', 'impeccable'],
  threshold:
    'Three or more sibling elements sharing an identical structural signature — same tag, same normalised class list, same child shape to three levels — where each has real internal structure, AND they sit side by side: either they carry a card-like class name, or their container has a `display: grid` or `display: flex` rule. Numeric suffixes are stripped, so card-1 and card-2 count as the same card. Sections stacked down a page are not this; a grid of rounded rectangles is.',
  why:
    'The HN comment the corpus quotes says it exactly: "AI tends to spit out a bullet point list of features… then puts them in a grid of rounded rects." research/08-craft.md is careful about what the tell actually is — "the tell is UNIFORMITY, not the number three. Four identical cards is the same page." And there is a commercial argument underneath the aesthetic one, which is the better reason: equal cards claim the three things are equally important. For a chess teacher, beginner group classes and a serious tournament-prep student are not the same size of thing, and a layout that says they are is not just generated-looking, it is wrong about the business.',
  fix:
    'Give them unequal weight. The one that matters most gets more room, a photograph, a longer description, or its own section; the others get a line each. research/08-craft.md §4: "Less sloppy AND more commercially correct." The impeccable craft floor goes further — it treats same-size icon-plus-heading-plus-text cards as the lazy container and nested cards as always wrong.',
  detect(ctx) {
    const out = [];
    // Containers whose repeated children are data or structure, not cards.
    const NOT_A_GRID = new Set(['head', 'html', 'dl', 'tr', 'thead', 'tbody', 'tfoot', 'table', 'select', 'optgroup', 'nav', 'datalist', 'colgroup', 'picture']);
    const CARD_CONTENT = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'img', 'svg', 'figure', 'blockquote']);

    /**
     * Are these siblings laid out side by side?
     *
     * The tell is a GRID of rounded rectangles. Sections stacked down a page
     * are also uniform and are not the tell — a document with several sections
     * that each have a heading and a paragraph is a document. So the rule asks
     * for evidence of a row: either the children name themselves as cards, or
     * the container is declared a grid or a flex row in the stylesheet.
     */
    const laidOutInARow = (parent, group) => {
      if (group.some((g) => classMatches(g, CARDY))) return 'the children carry card-like class names';
      const handles = [
        ...(parent.classes || []).map((c) => `.${c.toLowerCase()}`),
        parent.id ? `#${parent.id.toLowerCase()}` : null
      ].filter(Boolean);

      for (const d of ctx.decls) {
        if (d.property !== 'display') continue;
        if (!/^(grid|flex|inline-grid|inline-flex)$/.test(d.value.trim())) continue;
        // Only SIMPLE selectors. `.masthead .wrap` says something about a .wrap
        // inside a masthead, and this element may be a different .wrap
        // entirely — matching on a substring of a descendant selector is how a
        // detector starts reporting things that are not there.
        const simple = (d.selector || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s && !/[\s>+~]/.test(s));
        if (simple.some((s) => handles.some((h) => s.includes(h)))) {
          return `their container is \`display: ${d.value.trim()}\``;
        }
      }
      return null;
    };

    for (const page of ctx.pages) {
      for (const parent of [page.tree.root, ...page.tree.all]) {
        if (NOT_A_GRID.has(parent.tag)) continue;
        const kids = childElements(parent);
        if (kids.length < 3) continue;
        const groups = new Map();
        for (const kid of kids) {
          const sig = signature(kid, 3);
          if (!groups.has(sig)) groups.set(sig, []);
          groups.get(sig).push(kid);
        }
        for (const [sig, group] of groups) {
          if (group.length < 3) continue;
          if (['option', 'br', 'meta', 'link', 'script', 'style', 'source', 'track', 'col'].includes(group[0].tag)) continue;
          // A card has internal structure and carries content. A repeated row
          // with one line in it is a list, and a list is not the tell.
          const structured = group.every((g) => {
            const inner = childElements(g);
            return inner.length >= 2 && inner.some((c) => CARD_CONTENT.has(c.tag));
          });
          if (!structured) continue;
          const row = laidOutInARow(parent, group);
          if (!row) continue;
          out.push({
            rel: page.rel,
            offset: group[0].start,
            what: `${group.length} sibling <${group[0].tag}>${classShape(group[0])} elements are structurally identical — the same shape ${group.length} times over, differing only in their words.`,
            measured: `${row}; signature ${quote(sig, 60)}`
          });
        }
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const PLACEHOLDER_HOSTS = [
  'pravatar.cc', 'picsum.photos', 'placehold.co', 'placehold.it', 'placeholder.com',
  'via.placeholder', 'placekitten', 'loremflickr', 'dummyimage', 'unsplash.com',
  'images.unsplash', 'source.unsplash', 'pexels.com', 'istockphoto', 'shutterstock',
  'gettyimages', 'stock.adobe'
];

export const placeholderImagery = register({
  id: 'placeholder-imagery',
  tier: 1,
  title: 'A picture of somebody else',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['craft', 'gesso', 'febbhav'],
  threshold:
    'An <img> or <source> whose src points at a placeholder or stock-photo host, or that has an empty src, or that has no alt attribute at all.',
  why:
    'research/08-craft.md §8.6 makes the empty or placeholder src an auto-fail, and §3.1 gives the reason stock is worse than nothing: you are showing a photograph of somebody else\'s room to the person who knows exactly what their own room looks like. The file names the trap precisely — "near-miss specificity reads as deception; total abstraction reads as design". A generic chess-club photo is close enough to your club to invite the comparison and lose it. The missing `alt` is a separate failure with the same shape: it is the attribute that tells a blind visitor, and a search engine, what the picture is, and leaving it off is a claim that the picture does not matter.',
  fix:
    'Use a real photograph you took, tightly cropped rather than full-bleed, desaturated about 8% so it sits on the page instead of on top of it. One real photograph beats every stock image, and it is the one thing on the page a visitor can verify is true. If there is no photograph yet, ship a designed hole that says so — research/08-craft.md §5.3: "the holes are the pitch." And give every image an alt that says what it shows.',
  detect(ctx) {
    const out = [];
    for (const { page, node } of images(ctx)) {
      const src = node.attrs.src || node.attrs.srcset || '';
      const host = PLACEHOLDER_HOSTS.find((h) => src.toLowerCase().includes(h));
      if (host) {
        out.push({
          rel: page.rel,
          offset: node.start,
          what: `<${node.tag}> loads from ${host} — a placeholder or stock host, not a photograph of the thing this page is about.`,
          measured: quote(src, 70)
        });
        continue;
      }
      if (node.tag === 'img' && (!src || src.trim() === '')) {
        out.push({
          rel: page.rel,
          offset: node.start,
          what: '<img> has an empty src. It will render as a broken-image icon on every device.',
          measured: 'src=""'
        });
        continue;
      }
      if (node.tag === 'img' && node.attrs.alt === undefined) {
        out.push({
          rel: page.rel,
          offset: node.start,
          what: `<img src="${quote(src, 40)}"> has no alt attribute.`,
          measured: 'alt absent (alt="" is fine for a purely decorative image — the attribute must still be there)',
          why:
            'alt is how a blind visitor and a search engine learn what the picture shows. An absent attribute is different from an empty one: alt="" says "this is decoration, skip it", which is a decision. No attribute at all says nothing, and a screen reader then falls back to reading the file name aloud.',
          fix: 'Add alt="…" describing what the picture shows. If it is purely decorative, write alt="" explicitly.'
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const fixedWidthBox = register({
  id: 'fixed-width-box',
  tier: 1,
  title: 'A box wider than a phone',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.INFERENCE,
  who: ['craft', 'hallmark'],
  threshold:
    'A `width`, `min-width` or `flex-basis` declaration of 361px or more that is not inside a min-width media query. 360px is the narrowest common phone once you allow for a scrollbar.',
  why:
    'research/08-craft.md §4 Tier 1 puts "anything that scrolls sideways" at the top of the list, and gives the reason it outranks prettier problems: sideways scroll reads as BROKEN, not as cheap, and broken is worse. A hard pixel width above the viewport is the commonest cause. This particular check is INFERENCE, not a measurement: a static read of the stylesheet cannot know whether the box is inside a container that scrolls on purpose, so it can be wrong. `check_responsive` settles it by loading the page in a real browser and reading document.scrollWidth against window.innerWidth at six widths. Run that before you believe this one.',
  fix:
    'Replace the fixed width with `max-width` plus `width: 100%`, so the box is at most that wide and shrinks below it. If the element genuinely must be that wide — a data table, a board diagram — put it in its own `overflow-x: auto` container so it scrolls inside its box instead of pushing the page.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      if (!['width', 'min-width', 'flex-basis'].includes(d.property)) continue;
      if (d.conditions.some((c) => /min-width/i.test(c))) continue;
      const m = /^(\d+(?:\.\d+)?)px$/.exec(d.value.trim());
      if (!m) continue;
      const value = parseFloat(m[1]);
      if (value <= 360) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { ${d.property}: ${d.value} }\` is ${value}px wide with no media query above it.`,
        measured: `${value}px against a 360px phone viewport — ${Math.round(value - 360)}px over`
      });
    }
    return out;
  }
});

export const rules = [
  indigoAccent,
  threeStopGradient,
  bannedGradientPair,
  emojiFeatureIcon,
  uniformCardGrid,
  placeholderImagery,
  fixedWidthBox
];
