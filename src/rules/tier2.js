/**
 * Tier 2 — felt rather than named, but decisive.
 *
 * These are the ones a visitor cannot articulate and reacts to anyway. The
 * corpus's own ranking puts the coloured left border at the top of this tier
 * and calls it "the highest signal-to-effort tell in the whole list".
 */

import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { childElements, textOf, previousElement, primaryHeading, HEADINGS } from '../lib/dom.js';
import { toOklch, findColors, parseColor } from '../lib/oklch.js';
import {
  decls, declsWithValue, px, ms, shadowLayers, quote, splitList,
  selectorLooksCardy, hasHoverGuard, hasReducedMotionGuard, HEROISH
} from './helpers.js';

/* ------------------------------------------------------------------ */

export const edgeStripe = register({
  id: 'edge-stripe',
  tier: 2,
  title: 'The coloured stripe down the side of a card',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'krebs', 'hn', 'impeccable'],
  threshold:
    'A `border-left` or `border-right` (or the -width/-color longhands) of 2px or more carrying a colour with OKLCH chroma above 0.03 — that is, a colour rather than a hairline.',
  why:
    'research/08-craft.md calls this "the highest signal-to-effort tell in the whole list", and quotes the sentence that makes it stick: "colored left borders are almost as reliable a sign of AI-generated design as em-dashes for text." Krebs built his whole study around it. Gesso ships it as `edge-stripe`. The impeccable craft floor bans anything above 1px. Four independent sources, one conclusion. It is worth understanding WHY it became the signature rather than just avoiding it: it is the cheapest possible way to make a box look designed. One declaration, instant visual interest, no judgement required. Which is exactly why a machine with no judgement reaches for it.',
  fix:
    'Use a hairline on all four sides — `border: 1px solid var(--line)` — and let space do the separating. research/08-craft.md §8.3: "the hairline costs nothing and reads cleaner than glass." If you want an accent near a heading, set a small accent square beside it instead: same colour, deliberate placement, no template signature.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      if (!/^border-(left|right)(-width|-color)?$/.test(d.property)) continue;
      const side = d.property.includes('left') ? 'left' : 'right';
      const widths = (d.value.match(/[\d.]+(?:px|rem|em)/g) || []).map(px).filter((n) => n != null);
      const width = d.property.endsWith('-color') ? null : widths[0];
      if (width != null && width < 2) continue;
      const colours = findColors(d.value);
      const coloured = colours.find((c) => toOklch(c).C > 0.03 && (c.a ?? 1) > 0.2);
      if (!coloured && !d.property.endsWith('-color')) continue;
      if (!coloured) continue;
      const lch = toOklch(coloured);
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { ${d.property}: ${quote(d.value, 50)} }\` puts a coloured stripe down the ${side} edge${width != null ? ` at ${width}px` : ''}.`,
        measured: `chroma ${lch.C.toFixed(3)} at hue ${Math.round(lch.H)}° — above the 0.03 hairline threshold${selectorLooksCardy(d.selector) ? '; the selector names a card' : ''}`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const heroKicker = register({
  id: 'hero-kicker',
  tier: 2,
  title: 'The little label above the headline',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'krebs', 'hallmark', 'impeccable'],
  threshold:
    'The element immediately preceding the primary <h1> among its siblings, when it is 60 characters or fewer AND 9 words or fewer AND is not itself a heading AND contains no link, list, nav or button. Uppercase text or letter-spacing of 0.08em or more strengthens the match but is not required.',
  why:
    'Gesso ships this as `hero-kicker-eyebrow` with an auto-fix that simply deletes it. Hallmark auto-fails the tag-left/heading-right variant as "the single most reliable templated-editorial tell". The impeccable craft floor is the strictest voice in the corpus and the only one that calls it a ban rather than a default: "A kicker or eyebrow above a heading. This one is a ban, not a default: no brief earns it back. The heading carries its own weight; delete the label and let the heading speak." The eyebrow exists because a headline felt thin and something had to fill the space above it. It never adds information — it restates the category the headline is already in.',
  fix:
    'Delete it. Then read the H1 on its own. If the page now feels thin, the eyebrow was propping up a weak headline and the real fix is a better headline: one that could be true or false. "Chess lessons" is a category. "I teach the endgame first, because that is where club games are decided" is a sentence somebody could disagree with, which is what makes it worth reading.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      const h1 = primaryHeading(page.tree);
      if (!h1) continue;
      const before = previousElement(h1);
      if (!before) continue;
      if (HEADINGS.has(before.tag)) continue;
      const text = textOf(before);
      if (!text) continue;
      const words = text.split(/\s+/).filter(Boolean);
      if (text.length > 60 || words.length > 9) continue;
      const kids = childElements(before);
      if (kids.some((k) => ['a', 'nav', 'ul', 'ol', 'button', 'form'].includes(k.tag))) continue;
      if (['nav', 'ul', 'ol', 'form', 'button'].includes(before.tag)) continue;

      const upper = text === text.toUpperCase() && /[A-Z]/.test(text);
      const trackingDecl = ctx.decls.find(
        (d) =>
          d.property === 'letter-spacing' &&
          (px(d.value) ?? 0) >= 0.08 * 16 &&
          before.classes.some((c) => (d.selector || '').includes(c))
      );

      const signals = [
        `${text.length} characters`,
        `${words.length} words`,
        upper ? 'set in capitals' : null,
        trackingDecl ? `letter-spacing ${trackingDecl.value}` : null
      ].filter(Boolean);

      out.push({
        rel: page.rel,
        offset: before.start,
        what: `<${before.tag}> sits immediately above the H1 and reads "${quote(text, 50)}".`,
        measured: signals.join(', ')
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const heavyShadow = register({
  id: 'heavy-shadow',
  tier: 2,
  title: 'Puffy stacked shadows',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'comeau'],
  threshold:
    'Gesso\'s executable detector, reproduced exactly: FAIL if ≥3 blurred non-inset layers, OR ≥2 blurred layers where any alpha > 0.12, OR one blurred layer with alpha > 0.30.',
  why:
    'A heavy shadow is what a page reaches for when it wants depth it has not earned with layout. research/08-craft.md §8.1 is unusually careful here, because two good sources disagree: Comeau\'s crafted five-layer shadow — doubling offsets and blurs at a consistent 0.075 alpha — would trip Gesso\'s ≥3-layer detector. The corpus resolves it by intent rather than by count: "one ratio + low per-layer alpha + hue matched to the surface = craft. Three arbitrary layers at 0.1 / 0.15 / 0.18 = slop." And then it gives a generator the shorter instruction: ship Gesso\'s single subtle layer.',
  fix:
    'Flatten to `box-shadow: 0 1px 2px rgba(0, 0, 0, .06)` — that is Gesso\'s own auto-fix, and it cannot be got wrong. On a dark surface, do not use a shadow at all: signal elevation with lightness, about +3% per level. And never a coloured glow on a light ground.',
  detect(ctx) {
    const out = [];
    for (const d of decls(ctx, /^(box-shadow|-webkit-box-shadow)$/)) {
      const layers = shadowLayers(d.value).filter((l) => !l.inset);
      const blurred = layers.filter((l) => l.blur > 0);
      if (blurred.length === 0) continue;
      const maxAlpha = Math.max(...blurred.map((l) => l.alpha));
      let reason = null;
      if (blurred.length >= 3) reason = `${blurred.length} blurred layers (the ceiling is 2)`;
      else if (blurred.length >= 2 && maxAlpha > 0.12) reason = `${blurred.length} blurred layers with alpha up to ${maxAlpha} (the ceiling is 0.12 once there are two)`;
      else if (blurred.length === 1 && maxAlpha > 0.3) reason = `one blurred layer at alpha ${maxAlpha} (the ceiling is 0.30)`;
      if (!reason) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { box-shadow: ${quote(d.value, 60)} }\``,
        measured: reason
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const overRounded = register({
  id: 'over-rounded',
  tier: 2,
  title: 'Corners rounded past the stop',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso'],
  threshold:
    'A `border-radius` of 40px or more on a filled surface. Pills (9999px, 999px) and circles (50%) are exempt — they are a different shape, not an over-rounded rectangle.',
  why:
    'Gesso\'s own wording is the teaching note: "40px+ corners turn content cards into blobs: the \'friendly\' dial turned past its stop. Confident systems hold 8-24px." The radius is a claim about how formal the thing is. At 8px it is a document. At 16px it is an app. At 48px it is a toy, and a chess teacher\'s page is not a toy — the subject is the most serious game there is, and the page should not be apologising for that.',
  fix: 'Clamp to 24px. Gesso\'s auto-fix does exactly that. Hold one radius across the whole page rather than varying it per component.',
  detect(ctx) {
    const out = [];
    for (const d of decls(ctx, /^border(-[a-z]+)?-radius$/)) {
      const tokens = d.value.split('/')[0].trim().split(/\s+/);
      for (const token of tokens) {
        if (/%$/.test(token)) continue;
        const value = px(token);
        if (value == null || value < 40) continue;
        if (value >= 900) continue; // a pill
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.selector || '(a rule)'} { ${d.property}: ${quote(d.value, 40)} }\``,
          measured: `${value}px — confident systems hold 8-24px`
        });
        break;
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const backdropBlur = register({
  id: 'backdrop-blur',
  tier: 2,
  title: 'Glass as decoration',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['hn', 'krebs', 'comeau', 'impeccable'],
  threshold: 'Any `backdrop-filter` or `-webkit-backdrop-filter` declaration containing blur().',
  why:
    'Three separate costs, and only the first is aesthetic. It is a named AI tell — the HN comment the corpus quotes twice, two years apart: "It\'s not a Claude generated website without at least one backdrop-filter: blur(1000px) element that slows older machines to a crawl." It forces a continuous repaint on scroll, which is the thing research/08-craft.md §7.1 lists as forbidden on a mid-range Android. And it disables subpixel text rendering for everything above it, so the text in a blurred nav is measurably worse than the text everywhere else on the same page. The impeccable craft floor names the distinction to keep: glass as a specific effect can be earned; glass as decoration cannot.',
  fix:
    'Give the element a solid background from your own palette and a 1px hairline underneath it. That is what the blur was approximating anyway, and it costs nothing to paint.',
  detect(ctx) {
    const out = [];
    for (const d of decls(ctx, /backdrop-filter$/)) {
      if (!/blur\s*\(/i.test(d.value)) continue;
      const amount = /blur\s*\(\s*([\d.]+)(px|rem|em)?\s*\)/i.exec(d.value);
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { ${d.property}: ${quote(d.value, 40)} }\``,
        measured: amount ? `blur radius ${amount[1]}${amount[2] || 'px'}` : 'blur present'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const pureBlackWhite = register({
  id: 'pure-black-white',
  tier: 2,
  title: 'Pure black, pure white, and greys with no colour in them',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.ASSERTED,
  who: ['hallmark', 'craft', 'storefront'],
  threshold:
    'A colour used as a page ground or as body ink that is exactly #000 or #fff, or any neutral whose OKLCH chroma is below 0.005. The corpus band is 0.005-0.015 chroma of the anchor hue; the floor is 0.005 and it is never 0.',
  why:
    'Hallmark\'s colour guidance gives the band, and research/08-craft.md §6.4 quotes the sentence that explains why it matters: "A page with a warm accent and cool grey body copy looks wrong and most people can\'t name why." That is the whole mechanism. Nobody sees the chroma. Everybody sees that the page does not hang together. Pure white is also a physical claim no real surface makes — paper, board, cloth all carry a cast, and a page that does not is why screens feel like screens. The reference storefront made this concrete: its page is bone #F3EDE1, not white, because the ink it prints with is bone, and its type colour is the garment colour.',
  fix:
    'Pick the anchor hue first — from a photograph, or from palette_from_subject. Then build every neutral at that hue with chroma between 0.005 and 0.015: paper at OKLCH L 0.96-0.98, ink at L 0.16-0.22. The difference is invisible one colour at a time and obvious across a page. This rule is tagged ASSERTED: it is Hallmark\'s design opinion, corroborated by practice but not by a study.',
  detect(ctx) {
    const out = [];
    const GROUND = new Set(['background', 'background-color', 'color', '--paper', '--ink', '--bg', '--fg']);
    for (const d of ctx.decls) {
      const isGround = GROUND.has(d.property) || /^--(paper|ink|bg|fg|surface|text|ground)/.test(d.property);
      if (!isGround) continue;
      // Print is a different medium. Paper really is white and toner really is
      // near-black, so @media print is the one place these values are correct.
      if (d.conditions.some((c) => /\bprint\b/i.test(c))) continue;
      for (const colour of findColors(d.value)) {
        if ((colour.a ?? 1) < 0.9) continue;
        const lch = toOklch(colour);
        const pure = (colour.r === 0 && colour.g === 0 && colour.b === 0) || (colour.r === 255 && colour.g === 255 && colour.b === 255);
        if (!pure && lch.C >= 0.005) continue;
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: pure
            ? `\`${d.property}: ${quote(d.value, 40)}\` is pure ${colour.r === 0 ? 'black' : 'white'}.`
            : `\`${d.property}: ${quote(d.value, 40)}\` is a grey with no colour in it.`,
          measured: `OKLCH chroma ${lch.C.toFixed(4)} — the floor is 0.005, the band is 0.005-0.015`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const OVERUSED_FACES = [
  'inter', 'space grotesk', 'geist', 'instrument serif', 'roboto', 'open sans',
  'lato', 'poppins', 'montserrat', 'raleway', 'work sans', 'dm sans', 'nunito'
];

export const singleFontPage = register({
  id: 'single-font-page',
  tier: 2,
  title: 'One font doing every job',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.ASSERTED,
  who: ['gesso', 'krebs', 'craft'],
  threshold:
    'Fewer than two distinct font-family stacks across the whole project, counting the generic fallbacks as one family. Also fires on a named overused face used as the display voice.',
  why:
    'Gesso ships `single-font-page` and `overused-font-stack`; Krebs counted the faces. research/08-craft.md quotes it in four words: "A one-font page is a template page." A page needs at least a display voice and a reading voice, because they do different work — a headline is seen, body text is read, and the shapes that suit one are wrong for the other. research/08-craft.md §6.1 is honest about the trap underneath this, and it is worth knowing before you fix it: under a no-external-requests constraint the obvious answer is a system stack, but on Android `system-ui` resolves to Roboto, and Roboto is on the banned list. So the constraint-satisfying answer lands on a named tell for exactly the device most visitors use. The escape is to inline one subsetted display face — the sweep measured a single face at about 43 KB, which is 66 ms on a 5 Mbps connection.',
  fix:
    'Pair a display face with a reading face. If you cannot carry a web font, pair two DIFFERENT system stacks — a serif for display (Iowan Old Style, Palatino, Georgia) against the system sans for body — which is still two voices and avoids the one-font signature. If you can carry one font, carry the display face and let body text use the system stack: research/08-craft.md §6.2 says that buys most of the visual difference for about 43 KB.',
  detect(ctx) {
    const families = new Map();
    for (const d of decls(ctx, /^(font-family|--font[a-z-]*|font)$/)) {
      const stacks = d.property === 'font' ? [d.value] : [d.value];
      for (const stack of stacks) {
        const first = splitList(stack)[0];
        if (!first) continue;
        const name = first.replace(/["']/g, '').trim().toLowerCase();
        if (!name || /^(inherit|initial|unset|revert)$/.test(name)) continue;
        if (!families.has(name)) families.set(name, d);
      }
    }
    const out = [];
    const distinct = [...families.keys()].filter((n) => !/^(-apple-system|blinkmacsystemfont)$/.test(n));

    if (distinct.length > 0 && distinct.length < 2) {
      const [name] = distinct;
      const d = families.get(name);
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `The whole project uses one font family: ${name}.`,
        measured: `${distinct.length} distinct family declared across ${ctx.cssSources.length} CSS ${ctx.cssSources.length === 1 ? 'source' : 'sources'}`
      });
    }

    for (const [name, d] of families) {
      if (!OVERUSED_FACES.includes(name)) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.property}\` names ${name}, which is on the overused-face list.`,
        measured: `"${name}" — Gesso \`overused-font-stack\`; Krebs counted it across 1,590 pages`,
        why:
          'These faces are not bad. They are the defaults, and a viewer who has seen four pages this week has seen them four times. research/08-craft.md §6.1 records the awkward corollary: Roboto is on the banned list AND is what system-ui resolves to on Android, so the constraint-satisfying choice and the distinctive choice pull in opposite directions. Know which one you are making.',
        fix: 'Use it for body text if you must, and give the DISPLAY role to something else. The display voice is where a page gets its character; body text is where it gets its manners.'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const CHROME_CLASSES = ['browser-chrome', 'browser-bar', 'window-controls', 'traffic-light', 'phone-frame', 'device-frame', 'terminal-window', 'mockup-browser', 'fake-browser', 'macos-window', 'titlebar'];

export const fakeChrome = register({
  id: 'fake-chrome',
  tier: 2,
  title: 'A drawing of a browser, inside a browser',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.ASSERTED,
  who: ['hallmark', 'febbhav'],
  threshold: 'A class or id naming browser chrome, a device frame, or a terminal window.',
  why:
    'Hallmark fails this as gate 47 and the line it uses is the argument: "The user already has the chrome… Redrawing it in a page is like printing a photograph of a picture frame inside a real picture frame." It is also a tell about intent — the frame exists to make a screenshot look like a product, and a page that needs that has decided the thing inside the frame cannot carry itself.',
  fix: 'Show the content without the frame. If it needs a boundary, a hairline and some space will do it.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      for (const node of page.tree.all) {
        const haystack = [...node.classes, node.id || ''].join(' ').toLowerCase();
        const hit = CHROME_CLASSES.find((c) => haystack.includes(c));
        if (!hit) continue;
        out.push({
          rel: page.rel,
          offset: node.start,
          what: `<${node.tag} class="${quote(node.classes.join(' '), 40)}"> draws browser or device chrome.`,
          measured: `matched "${hit}"`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const fullViewportHero = register({
  id: 'full-viewport-hero',
  tier: 2,
  title: 'A hero the height of the screen',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['hallmark', 'krebs', 'craft'],
  threshold: 'A height or min-height of 100vh (or 100dvh/100svh) on any element, and separately on a hero-named element.',
  why:
    'Two problems stacked. The aesthetic one: Hallmark auto-fails a 100vh hero with everything centred, and research/08-craft.md §5.2 says what it costs a local business — on a 375×667 phone the first screen should carry the name, what you do, where you are, and a tappable number; a full-height centred statement spends all of it on a slogan. The technical one is worse and is independent of taste: browser chrome makes 100vh TALLER than the visible viewport on a phone, so content at the bottom of a 100vh block is cut off. `dvh` helps and is not universally reliable.',
  fix:
    'Let the hero be the height of its content. If it needs breathing room, use padding. research/08-craft.md adds one measured detail worth keeping: hero `padding-block-end` should be at least 1.3× `padding-block-start`, so the hero sits ON the page rather than floating in the middle of it.',
  detect(ctx) {
    const out = [];
    for (const d of decls(ctx, /^(height|min-height)$/)) {
      if (!/\b100(dvh|svh|vh)\b/.test(d.value)) continue;
      const heroish = HEROISH.some((h) => (d.selector || '').toLowerCase().includes(h));
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { ${d.property}: ${d.value} }\`${heroish ? ' — and the selector names the hero.' : ''}`,
        measured: `${d.value}; on a phone, browser chrome makes this taller than the visible screen`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const AI_FOOTER_COLUMNS = ['product', 'company', 'resources', 'legal', 'solutions', 'developers', 'platform', 'use cases'];

export const aiFooter = register({
  id: 'ai-footer',
  tier: 2,
  title: 'A four-column footer for a one-person business',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.ASSERTED,
  who: ['hallmark', 'craft'],
  threshold: 'Three or more of the headings Product / Company / Resources / Legal / Solutions / Developers / Platform inside a <footer>.',
  why:
    'Hallmark gates 42-43 name the pattern and research/08-craft.md quotes the line that settles it: "A bakery doesn\'t have a Resources column." This footer is the org chart of a Series-B SaaS company rendered as navigation. A one-person teaching practice that ships it is describing a company that does not exist, and the visitor — who came to find out whether you can teach their kid — now has to hunt for a phone number among four columns of nothing.',
  fix:
    'A footer for a small practice is: who you are, how to reach you, where you are, and the one legal line you actually need. Four lines, not four columns. The nav above it should be the pages that exist, in the order someone needs them.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      for (const footer of page.tree.all.filter((n) => n.tag === 'footer')) {
        const headings = footer.children
          ? collectText(footer).filter((t) => AI_FOOTER_COLUMNS.includes(t.toLowerCase().trim()))
          : [];
        const unique = [...new Set(headings.map((h) => h.toLowerCase().trim()))];
        if (unique.length < 3) continue;
        out.push({
          rel: page.rel,
          offset: footer.start,
          what: `The footer has ${unique.length} of the generic SaaS column headings: ${unique.join(', ')}.`,
          measured: `${unique.length} matched against the list of 7`
        });
      }
    }
    return out;
  }
});

function collectText(node) {
  const out = [];
  (function walk(n) {
    for (const child of n.children || []) {
      if (child.tag === '#text' || child.tag === '#comment') continue;
      if (HEADINGS.has(child.tag) || ['strong', 'b', 'dt', 'p', 'span', 'div', 'a'].includes(child.tag)) {
        const t = textOf(child);
        if (t && t.length < 30) out.push(t);
      }
      walk(child);
    }
  })(node);
  return out;
}

/* ------------------------------------------------------------------ */

export const universalReveal = register({
  id: 'universal-reveal',
  tier: 2,
  title: 'Everything fading up on scroll',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['hallmark', 'febbhav', 'freiberg', 'craft'],
  threshold: 'Six or more elements carrying a reveal/fade-in/animate-on-scroll class or a data-aos attribute.',
  why:
    'Hallmark and febbhav both name it; the sentence that lands is "Every section fades in when it enters the viewport. Every list staggers. The page never settles." AOS.js has been emitting fade-in-up on every element since 2015, so the pattern is a decade old and unmistakable. research/08-craft.md §2.2 adds the strategic reading via Freiberg\'s 90/10 rule: when the whole motion budget is one uniform reveal applied to twelve elements, the UNIFORMITY is the tell. Spending the same budget on two or three moments that respond to the user — a press, a confirmation — reads as more considered while doing strictly less.',
  fix:
    'Delete the reveal from everything above the fold, and from most of what is below it. Keep at most one deliberate entrance, and spend what you save on press feedback, which is the motion a visitor actually causes.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      const revealed = page.tree.all.filter(
        (n) =>
          n.attrs['data-aos'] !== undefined ||
          n.classes.some((c) => /^(reveal|fade-?in|fade-?up|animate-?on-?scroll|aos|scroll-?reveal|slide-?up)/i.test(c))
      );
      if (revealed.length < 6) continue;
      out.push({
        rel: page.rel,
        offset: revealed[0].start,
        what: `${revealed.length} elements on this page are set to animate in on scroll.`,
        measured: `${revealed.length} elements; the tell is the uniformity, not the technique`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const heroBehindReveal = register({
  id: 'hero-behind-reveal',
  tier: 2,
  title: 'The headline is hidden until a script runs',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.INFERENCE,
  who: ['craft'],
  threshold: 'The primary <h1>, or an ancestor of it, carries a reveal/fade-in class or a data-aos attribute.',
  why:
    'This is a bug, not a taste call, and research/08-craft.md §2.2 found it in its own generator. The H1 is almost certainly the Largest Contentful Paint element, and an element at opacity: 0 does not count for LCP. So the page has put its own largest paint behind a script parse, an IntersectionObserver callback, and a transition — and it is above the fold, where there is no scroll yet to trigger the reveal in the first place. On a mid-range phone over a slow connection that is several hundred milliseconds of self-inflicted delay on the one element the visitor came for. There is a second, sharper reason: if the script fails, the headline never appears at all. The corpus flags the LCP half of this reasoning as the sweep\'s own INFERENCE rather than a vendor statement, and this rule inherits that tag.',
  fix:
    'Take the reveal off the hero entirely — H1, subhead, buttons and any list inside it. research/08-craft.md found nested reveals there too: a revealed <ul> containing revealed <li> children, each with its own delay, which is an opacity:0 subtree inside an opacity:0 parent. Pull the whole hero out rather than tuning it.',
  detect(ctx) {
    const out = [];
    const revealish = (n) =>
      n.attrs['data-aos'] !== undefined ||
      n.classes.some((c) => /^(reveal|fade-?in|fade-?up|animate-?on-?scroll|aos|scroll-?reveal|slide-?up)/i.test(c));

    for (const page of ctx.pages) {
      const h1 = primaryHeading(page.tree);
      if (!h1) continue;
      const chain = [h1];
      let cur = h1.parent;
      while (cur && cur.tag !== '#root') {
        chain.push(cur);
        cur = cur.parent;
      }
      const culprit = chain.find(revealish);
      if (!culprit) continue;
      out.push({
        rel: page.rel,
        offset: culprit.start,
        what:
          culprit === h1
            ? 'The <h1> itself is set to fade in on scroll.'
            : `The <h1> sits inside <${culprit.tag} class="${quote(culprit.classes.join(' '), 30)}">, which fades in on scroll.`,
        measured: 'an element at opacity:0 does not count toward Largest Contentful Paint'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const noPressFeedback = register({
  id: 'no-press-feedback',
  tier: 2,
  title: 'Nothing happens when you tap',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['kowalski', 'craft', 'citrous'],
  threshold: 'The project has buttons or links styled as buttons, and no `:active` rule anywhere in its CSS.',
  why:
    'research/08-craft.md measured this across 13 generated sites and found `grep -l ":active" → 0` and `grep -l "hover: hover" → 0`. Zero press feedback, zero hover guards, on pages whose whole purpose was to be demonstrated on a phone. Kowalski\'s first practical tip is the two-line fix, and his reason is the one to remember: "The interface should feel as if it\'s listening to the user." On a phone there is no hover. The visitor taps your Contact button and the interface does nothing at all until the next page loads — which on a slow connection is a second of wondering whether the tap registered. `transform: scale()` is composite-only, so the acknowledgement lands within one frame even while the main thread is still parsing. It is arguably the only animation on a page guaranteed to be smooth on a cheap phone.',
  fix:
    'Ship these together, because guarding hover alone leaves touch users with nothing:\n\n    .btn { transition: transform .12s ease-out; }\n    @media (hover: hover) and (pointer: fine) { .btn:hover { transform: translateY(-2px); } }\n    .btn:active { transform: translateY(0) scale(.97); }\n    @media (pointer: coarse) { .btn { min-height: 48px; } }\n\nWrite the FULL transform on :active — a bare scale() would clobber the hover translate. The floor for the scale is about 0.95; below that it reads as collapse rather than depression. Apply it only to real interactive elements, never to a card, or you imply a tap that does nothing.',
  detect(ctx) {
    const hasInteractive = ctx.pages.some((p) =>
      p.tree.all.some((n) => n.tag === 'button' || (n.tag === 'a' && n.attrs.href))
    );
    if (!hasInteractive) return [];
    const hasActive = ctx.decls.some((d) => /:active\b/.test(d.selector || ''));
    if (hasActive) return [];
    const first = ctx.cssSources[0];
    if (!first) return [];
    return [
      {
        rel: first.rel,
        offset: first.base,
        scope: 'site',
        what: 'There are buttons and links on this site, and not one `:active` rule in the whole stylesheet.',
        measured: `0 \`:active\` selectors across ${ctx.cssSources.length} CSS ${ctx.cssSources.length === 1 ? 'source' : 'sources'}`
      }
    ];
  }
});

/* ------------------------------------------------------------------ */

export const unguardedHover = register({
  id: 'unguarded-hover',
  tier: 2,
  title: 'A hover effect on a device with no mouse',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.ASSERTED,
  who: ['craft', 'kowalski'],
  threshold: 'A `:hover` rule that changes transform, scale, translate, box-shadow or filter, and is not inside `@media (hover: hover)`. A hover that only changes colour or underline is left alone: its stuck state is not visible as a fault.',
  why:
    'On Android Chrome an unguarded :hover STICKS after a tap. The visitor taps your call-to-action, the dialer opens, they come back, and the button is still lifted — which to a non-technical viewer reads as a rendering bug on your site. research/08-craft.md flags this rule as one the sweep asserts itself: the browser behaviour is well documented and trivially reproducible, but no practitioner citation was retrieved for the guard. So it is ASSERTED and you can falsify it in thirty seconds on a real phone.',
  fix:
    'Wrap hover effects in `@media (hover: hover) and (pointer: fine)`, and give touch users a `:active` state instead. Those two must ship together — see `no-press-feedback`.',
  detect(ctx) {
    const out = [];
    const seen = new Set();
    for (const d of ctx.decls) {
      if (!/:hover\b/.test(d.selector || '')) continue;
      if (hasHoverGuard(d.conditions)) continue;
      // Only the properties whose stuck state is visible as a fault. A colour
      // that stays changed after a tap is invisible; a card that stays lifted
      // reads as a rendering bug.
      if (!['transform', 'box-shadow', 'scale', 'translate', 'filter'].includes(d.property)) continue;
      const key = `${d.rel}|${d.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${quote(d.selector, 50)}\` changes \`${d.property}\` on hover, with no \`@media (hover: hover)\` around it.`,
        measured: 'no hover-capability guard on this rule'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const motionCeiling = register({
  id: 'motion-ceiling',
  tier: 2,
  title: 'Motion slower than the eye reads as motion',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['kowalski', 'sonner', 'craft'],
  threshold:
    'A transition or animation duration above 300ms on anything that is not a large travelling surface (a drawer, a sheet). Kowalski states the ceiling twice across two articles and his shipped libraries hold to it.',
  why:
    'Kowalski\'s worked comparison is a 400ms dropdown against a 180ms one: the 400ms version "noticeably underperforms". research/08-craft.md §2.2 sharpens it into a better way to think about the number — velocity, not duration. Fourteen pixels over 450ms is about 31 px/second, which is below the threshold at which the eye reads movement as movement. It reads as DRIFT: the element appears to be settling rather than arriving. At 240ms the same 14px travels at about 58 px/s and reads as intent. The practical bands: 100-200ms for hover, press and state changes; 200-300ms for entrances; 400-500ms only for something large that physically travels, like Vaul\'s iOS sheet at 500ms with cubic-bezier(0.32, 0.72, 0, 1).',
  fix:
    'Bring it under 300ms. And split the durations per property the way Sonner ships them — `transition: transform 500ms, opacity 200ms` — because opacity should always be shorter than transform. Exits run at about 75% of entrances.',
  detect(ctx) {
    const out = [];
    const LARGE = /drawer|sheet|modal|dialog|overlay|panel-slide/i;
    for (const d of ctx.decls) {
      if (!/^(transition|transition-duration|animation|animation-duration)$/.test(d.property)) continue;
      if (LARGE.test(d.selector || '')) continue;
      const times = (d.value.match(/[\d.]+m?s\b/g) || []).map(ms).filter((n) => n != null);
      const worst = Math.max(0, ...times);
      if (worst <= 300) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { ${d.property}: ${quote(d.value, 50)} }\``,
        measured: `${worst}ms — ${Math.round(worst - 300)}ms over the 300ms ceiling`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const easeOnEntrance = register({
  id: 'ease-on-entrance',
  tier: 2,
  title: 'The sluggish easing curve',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['comeau', 'kowalski'],
  threshold: 'A transition or animation whose timing function is the plain keyword `ease`, or `ease-in`, on an entering element. Also fires on `transition: all`.',
  why:
    'Plain `ease` is `cubic-bezier(0.25, 0.1, 0.25, 1)`, which has an ease-IN component — the element starts from zero velocity. That slow start is the sluggish signature, and it is the default, so it is what you get by not deciding. Comeau describes what ease-out gives instead: "the effect that something came hustling in from far away, and settles in front of the user." Kowalski: "Easing is the most important part of any animation." It is a one-token fix with a payoff out of all proportion to the edit. `transition: all` is a separate problem in the same declaration: it animates properties you did not intend, including layout properties that invalidate the layout every frame.',
  fix:
    'Use `ease-out` for anything entering and `ease-in` for anything leaving. Sharper drop-ins, ascending: out-cubic `cubic-bezier(0.33, 1, 0.68, 1)`, out-quart `(0.25, 1, 0.5, 1)`, out-expo `(0.16, 1, 0.3, 1)`. research/08-craft.md flags those three triples as recalled rather than retrieved — verify them before you rely on the exact numbers, though the ordering is not in doubt. Never `transition: all`; name the properties.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      if (/^transition$/.test(d.property) && /(^|\s)all(\s|,|$)/.test(d.value)) {
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.selector || '(a rule)'} { transition: ${quote(d.value, 50)} }\` animates \`all\`.`,
          measured: 'transition: all — animates properties you did not choose, layout properties included'
        });
      }
      if (!/^(transition|transition-timing-function|animation|animation-timing-function)$/.test(d.property)) continue;
      if (!/(^|[\s,])(ease|ease-in)([\s,]|$)/.test(d.value)) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${d.selector || '(a rule)'} { ${d.property}: ${quote(d.value, 50)} }\` uses the default \`ease\` curve.`,
        measured: 'ease = cubic-bezier(0.25, 0.1, 0.25, 1) — it starts from zero velocity'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const revealTravel = register({
  id: 'reveal-travel',
  tier: 2,
  title: 'A reveal that travels too far',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.ASSERTED,
  who: ['kowalski', 'craft'],
  threshold: 'A translateY or translate3d of more than 14px in a transform used for a scroll reveal or keyframe entrance.',
  why:
    'The tasteful band for a scroll reveal is 8-14px. Forty pixels and above is the AOS.js default and, in research/08-craft.md\'s words, "the most recognisable template-site signature there is". The reason is physical: a real object entering your field of view does not start forty pixels away and drift in. The corpus tags this ASSERTED — it is Kowalski\'s scale rule inverted — while noting the AOS default is a matter of public record.',
  fix: 'Bring the travel to 8-14px and the duration to 200-300ms. Both numbers, not one: a short travel over a long duration is the drift problem in `motion-ceiling`.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      if (!/^(transform|translate)$/.test(d.property)) continue;
      const matches = [...d.value.matchAll(/translate(?:Y|3d)?\(([^)]*)\)/gi)];
      for (const m of matches) {
        const parts = m[1].split(',').map((s) => s.trim());
        const yRaw = /translateY/i.test(m[0]) ? parts[0] : parts[1];
        const y = px(yRaw || '');
        if (y == null || Math.abs(y) <= 14) continue;
        out.push({
          rel: d.rel,
          offset: d.offset,
          what: `\`${d.selector || '(a rule)'} { ${d.property}: ${quote(d.value, 50)} }\` travels ${Math.abs(y)}px.`,
          measured: `${Math.abs(y)}px — the band is 8-14px; 40px+ is the AOS.js default`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const stickyCollision = register({
  id: 'sticky-collision',
  tier: 2,
  title: 'Two sticky things at the same height',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['craft'],
  threshold: 'Two or more rules setting `position: sticky` with `top: 0`, or a sticky element whose `top` is a hardcoded pixel guess at another element\'s height.',
  why:
    'Two elements both stuck at `top: 0` overlap during scroll, and the one deeper in the DOM paints over the nav. It looks badly broken rather than slightly wrong. research/08-craft.md §8.5 found the same bug in its own generator, in a form worth recognising: a banner sticky at top:0 and a nav sticky at a hardcoded `top: 36px` — a GUESSED banner height, not a measured one. On a narrow phone the banner wraps to two lines, becomes taller than 36px, and the nav lands on top of it.',
  fix:
    'Define the height as a custom property — `--banner-height: 44px` — use it in both places, and give the nav a higher z-index than any in-page sticky box. One source of truth for the number, which is the same rule as `single-source`.',
  detect(ctx) {
    const sticky = ctx.decls.filter((d) => d.property === 'position' && /sticky/i.test(d.value));
    if (sticky.length < 2) return [];
    const tops = new Map();
    for (const s of sticky) {
      const top = ctx.decls.find(
        (d) => d.property === 'top' && d.selector === s.selector && d.rel === s.rel
      );
      const value = top ? top.value.trim() : '0';
      if (!tops.has(value)) tops.set(value, []);
      tops.get(value).push({ ...s, top: value });
    }
    const out = [];
    for (const [value, group] of tops) {
      if (group.length < 2) continue;
      out.push({
        rel: group[0].rel,
        offset: group[0].offset,
        what: `${group.length} rules set \`position: sticky\` with \`top: ${value}\`: ${group.map((g) => quote(g.selector, 24)).join(', ')}.`,
        measured: `${group.length} sticky elements sharing top: ${value}`
      });
    }
    const guessed = ctx.decls.filter(
      (d) => d.property === 'top' && /^\d+px$/.test(d.value.trim()) && sticky.some((s) => s.selector === d.selector)
    );
    for (const g of guessed) {
      out.push({
        rel: g.rel,
        offset: g.offset,
        what: `\`${quote(g.selector, 40)}\` is sticky at a hardcoded \`top: ${g.value}\`.`,
        measured: `${g.value} is a guess at another element's height, not a measurement of it`,
        fix: 'Put the height in a custom property and use it in both places, so the offset cannot drift from the thing it is offsetting.'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const nuclearMotionReset = register({
  id: 'nuclear-motion-reset',
  tier: 2,
  title: 'The reduced-motion sledgehammer',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['comeau'],
  threshold: 'A universal selector inside a prefers-reduced-motion block setting animation-duration or transition-duration to a near-zero value with !important.',
  why:
    'Comeau gives three objections to `* { animation-duration: 0.01ms !important }`. It kills motion-free animations that were already safe for someone with a vestibular disorder. With JavaScript-driven physics it can actually SPEED MOTION UP, because the CSS duration is not what is driving it. And the honest one: "the only real way to know whether our app is accessible or not is to test it." Worth knowing that practitioners genuinely disagree here — Kowalski\'s own Sonner ships close to the nuclear version. This kit sides with Comeau and says so rather than pretending the question is settled.',
  fix:
    'Swap the animation rather than removing it: `.el { animation: bounce .2s } @media (prefers-reduced-motion: reduce) { .el { animation: fade .2s } }`. Or invert the default the way Comeau does — no transition at all by default, added back under `(prefers-reduced-motion: no-preference)`.',
  detect(ctx) {
    const out = [];
    for (const d of ctx.decls) {
      if (!hasReducedMotionGuard(d.conditions)) continue;
      if (!/^(animation-duration|transition-duration|animation|transition)$/.test(d.property)) continue;
      if (!/!important/i.test(d.value)) continue;
      if (!/^\s*\*/.test(d.selector || '')) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${quote(d.selector, 30)} { ${d.property}: ${quote(d.value, 40)} }\` inside a reduced-motion block.`,
        measured: 'universal selector + !important — the nuclear reset'
      });
    }
    return out;
  }
});

export const rules = [
  edgeStripe,
  heroKicker,
  heavyShadow,
  overRounded,
  backdropBlur,
  pureBlackWhite,
  singleFontPage,
  fakeChrome,
  fullViewportHero,
  aiFooter,
  universalReveal,
  heroBehindReveal,
  noPressFeedback,
  unguardedHover,
  motionCeiling,
  easeOnEntrance,
  revealTravel,
  stickyCollision,
  nuclearMotionReset
];
