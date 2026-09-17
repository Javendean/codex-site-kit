/**
 * The floor.
 *
 * research/08-craft.md §7 calls this "the floor beneath everything else in this
 * file — nothing above matters if these fail", and §7.2 is blunt about what
 * kind of failure it is: "Not aesthetics. These are the failures that make the
 * page look BROKEN on the owner's phone."
 *
 * A page that reads as cheap has a taste problem. A page that reads as broken
 * has lost the visitor. The whole floor costs under twenty lines of CSS, which
 * makes the trade the easiest one in this kit.
 *
 * research/04-design-language.md §5 adds the other half: the Tier 1 technical
 * age signals, which are cheap, objective, and parseable from the HTML alone.
 */

import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { themeContract } from '../lib/css.js';
import { contrastRatio, roundRatio, parseHex } from '../lib/color.js';
import { parseColor, toOklch } from '../lib/oklch.js';
import { textOf } from '../lib/dom.js';
import { decls, px, quote, hasReducedMotionGuard } from './helpers.js';

/* ------------------------------------------------------------------ */

export const missingViewport = register({
  id: 'missing-viewport',
  tier: 'floor',
  title: 'No viewport tag',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['design'],
  threshold: 'An HTML page with no <meta name="viewport"> in its head, or one with a fixed pixel width, or one that disables scaling.',
  why:
    'research/04-design-language.md calls this the strongest single signal of technical age, and the reason is mechanical rather than aesthetic: without the tag a phone renders the page at desktop width and then shrinks the whole thing, so every line of body text arrives at about four pixels tall. The visitor pinches to read one sentence. Google has been mobile-first-indexing all new sites for years, so it is also the cheapest SEO failure available. `user-scalable=no` and `maximum-scale=1` are a different failure with the same fingerprint: they take away a visitor\'s ability to zoom, which for anyone over fifty is the difference between reading the page and leaving it.',
  fix: 'Put `<meta name="viewport" content="width=device-width, initial-scale=1">` in the head. Nothing more — no maximum-scale, no user-scalable.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      const meta = page.tree.all.find(
        (n) => n.tag === 'meta' && (n.attrs.name || '').toLowerCase() === 'viewport'
      );
      if (!meta) {
        const head = page.tree.all.find((n) => n.tag === 'head') || page.tree.all[0];
        out.push({
          rel: page.rel,
          offset: head ? head.start : 0,
          what: 'This page has no viewport meta tag.',
          measured: 'meta[name=viewport] absent'
        });
        continue;
      }
      const content = meta.attrs.content || '';
      if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(content)) {
        out.push({
          rel: page.rel,
          offset: meta.start,
          what: `The viewport tag disables zoom: \`${quote(content, 60)}\`.`,
          measured: 'user-scalable=no or maximum-scale=1'
        });
      }
      const fixed = /width\s*=\s*(\d+)/i.exec(content);
      if (fixed) {
        out.push({
          rel: page.rel,
          offset: meta.start,
          what: `The viewport is pinned to ${fixed[1]}px instead of the device width.`,
          measured: `width=${fixed[1]} — forces a desktop layout onto a phone`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const overflowHidden = register({
  id: 'overflow-hidden',
  tier: 'floor',
  title: 'overflow-x: hidden on html or body',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['craft'],
  threshold: '`overflow-x: hidden` (or `overflow: hidden`) on `html` or `body`.',
  why:
    'This is almost always a patch over sideways scroll rather than a fix for it, and the patch has a cost that is easy to miss. research/08-craft.md §7.2 check 1 is specific: use `clip`, not `hidden`, because `hidden` CREATES A SCROLL CONTAINER. That breaks `position: sticky` on everything inside it, and it can trap keyboard focus — a visitor tabbing through the page reaches an element that is scrolled out of view inside a container nobody can scroll. `clip` cuts the overflow without making a scroll container.',
  fix:
    'Use `overflow-x: clip` on BOTH html and body. Then find what was actually overflowing: `check_responsive` names the element and reports how many pixels past the edge it goes.',
  detect(ctx) {
    const out = [];
    for (const d of decls(ctx, /^overflow(-x)?$/)) {
      const sel = (d.selector || '').trim().toLowerCase();
      if (!/^(html|body|html\s*,\s*body|body\s*,\s*html)$/.test(sel)) continue;
      if (!/hidden/i.test(d.value)) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${sel} { ${d.property}: ${d.value} }\``,
        measured: 'hidden creates a scroll container; clip does not'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const inputFontSize = register({
  id: 'input-font-size',
  tier: 'floor',
  title: 'A form field iOS will zoom into',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['craft', 'freiberg'],
  threshold: 'A font-size below 16px in a rule whose selector names input, select or textarea.',
  why:
    'Below 16px, iOS Safari zooms the page when the field takes focus. It does not zoom back out. So the visitor taps your contact field, the page jumps to 150%, they type their email address without being able to see the rest of the form, and then they are stranded at the wrong zoom for the remainder of the visit. research/08-craft.md §7.2 check 6 calls it a hard floor, not a suggestion, and gives the exact threshold — below 15px triggers it, so 16px is the safe number.',
  fix: 'Set `font-size: 16px` on input, select and textarea. If the design wants smaller fields, make the field shorter, not the text.',
  detect(ctx) {
    const out = [];
    for (const d of decls(ctx, /^font-size$/)) {
      const sel = (d.selector || '').toLowerCase();
      if (!/\b(input|select|textarea)\b/.test(sel)) continue;
      const size = px(d.value);
      if (size == null || size >= 16) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${quote(d.selector, 40)} { font-size: ${d.value} }\``,
        measured: `${size}px — below the 16px floor, so iOS zooms on focus`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const tapTarget = register({
  id: 'tap-target',
  tier: 'floor',
  title: 'No minimum tap target on touch',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['hallmark', 'citrous'],
  threshold: 'The project has buttons or links, and no `@media (pointer: coarse)` rule setting a min-height of 48px or more.',
  why:
    'Hallmark ships this as a gate and the CodeStitch practice agrees: 48px minimum on a coarse pointer. The number is not arbitrary — it is roughly the width of an adult fingertip, and below it a tap lands on whatever is next to the thing you aimed at. For a page whose primary action is a phone number or a contact link, a mis-tap is the visit ending.',
  fix: 'Add `@media (pointer: coarse) { .btn, a.button, button { min-height: 48px; } }`. That is the whole fix.',
  detect(ctx) {
    const hasInteractive = ctx.pages.some((p) => p.tree.all.some((n) => n.tag === 'button' || (n.tag === 'a' && n.attrs.href)));
    if (!hasInteractive) return [];
    const guarded = ctx.decls.some(
      (d) =>
        d.conditions.some((c) => /pointer\s*:\s*coarse/i.test(c)) &&
        /^min-height$/.test(d.property) &&
        (px(d.value) ?? 0) >= 44
    );
    if (guarded) return [];
    const first = ctx.cssSources[0];
    if (!first) return [];
    return [
      {
        rel: first.rel,
        offset: first.base,
        scope: 'site',
        what: 'There is no `@media (pointer: coarse)` rule giving interactive elements a minimum height.',
        measured: '0 coarse-pointer min-height rules found'
      }
    ];
  }
});

/* ------------------------------------------------------------------ */

export const bareFrGrid = register({
  id: 'bare-fr-grid',
  tier: 'floor',
  title: 'A grid track that an image can push off the screen',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['craft'],
  threshold: 'A `grid-template-columns` containing a bare `1fr` track, on a project that contains <img> elements.',
  why:
    'research/08-craft.md §7.2 check 3 calls this "the sneakiest bug in the list" and it deserves the title. A bare `1fr` resolves to `minmax(auto, 1fr)`, and that `auto` minimum is the content\'s INTRINSIC width. Put a 1024px photograph in the track and the track now has a 1024px minimum, which pushes the layout off a 375px screen. It looks perfect on a desktop. It fails only on a phone, and only when an image is present, so it survives every casual test. One character fixes it.',
  fix: 'Write `minmax(0, 1fr)` instead of `1fr`. Same layout on desktop, and the track can now actually shrink.',
  detect(ctx) {
    const hasImages = ctx.pages.some((p) => p.tree.all.some((n) => n.tag === 'img'));
    if (!hasImages) return [];
    const out = [];
    for (const d of decls(ctx, /^(grid-template-columns|grid-template)$/)) {
      const withoutMinmax = d.value.replace(/minmax\([^)]*\)/gi, '');
      if (!/\b[\d.]*fr\b/.test(withoutMinmax)) continue;
      out.push({
        rel: d.rel,
        offset: d.offset,
        what: `\`${quote(d.selector, 40)} { ${d.property}: ${quote(d.value, 45)} }\` uses a bare fr track.`,
        measured: 'bare 1fr = minmax(auto, 1fr); auto is the image\'s intrinsic width'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const noReducedMotion = register({
  id: 'no-reduced-motion',
  tier: 'floor',
  title: 'Motion with no way to turn it off',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['comeau', 'kowalski'],
  threshold: 'The project declares a transition or animation and has no `@media (prefers-reduced-motion)` block anywhere.',
  why:
    'Some people get motion sickness from parallax and sliding panels — genuinely sick, not merely annoyed — and their operating system already carries the setting that says so. Honouring it is one media query. Both Comeau and Kowalski publish the pattern; they disagree only about which direction to write it in.',
  fix:
    'Swap the animation rather than deleting it, which is Kowalski\'s pattern:\n\n    @media (prefers-reduced-motion: reduce) { .el { animation: fade .2s; } }\n\nOr invert the default, which is Comeau\'s: no transition at all until `@media (prefers-reduced-motion: no-preference)`. Do not reach for the universal `!important` reset — see `nuclear-motion-reset`.',
  detect(ctx) {
    const animates = ctx.decls.some((d) => /^(transition|animation)/.test(d.property) && !/^\s*none\s*$/.test(d.value));
    if (!animates) return [];
    const guarded = ctx.decls.some((d) => hasReducedMotionGuard(d.conditions)) ||
      ctx.blocks.some((b) => /prefers-reduced-motion/i.test(b.prelude));
    if (guarded) return [];
    const first = ctx.cssSources[0];
    if (!first) return [];
    return [
      {
        rel: first.rel,
        offset: first.base,
        scope: 'site',
        what: 'This site animates things and never checks whether the visitor asked it not to.',
        measured: '0 prefers-reduced-motion blocks'
      }
    ];
  }
});

/* ------------------------------------------------------------------ */

export const threeStateTheme = register({
  id: 'three-state-theme',
  tier: 'floor',
  title: 'A colour that only exists in one theme',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront'],
  threshold:
    'A custom property whose only definition sits inside `@media (prefers-color-scheme: dark)` or `[data-theme="dark"]`, with no value in a bare `:root`. Also fires when a dark media block is not guarded as `:root:not([data-theme="light"])` while a manual toggle exists, and when the two dark states disagree about which tokens they set.',
  why:
    'There are three theme states, not two. An explicit choice stamps `data-theme`; the default setting stamps nothing at all, and only `prefers-color-scheme` separates light from dark. So a colour defined only inside the dark media query does not exist for a visitor whose machine is set to light — which is most of them. The page renders with the property\'s fallback, or with nothing, which on a text colour means invisible text. The reason this bug ships so reliably is that it is invisible to anyone developing on a dark-mode Mac. The pattern that closes it: the complete light palette on bare `:root`; the dark overrides under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])` so an explicit light choice wins; and the same overrides again under `:root[data-theme="dark"]` so the toggle wins in both directions.',
  fix:
    'Define every token in bare `:root` first. Then redefine only what changes, in both dark blocks. And give `body` an explicit background from a token — a transparent body borrows whatever the host is painting behind it.',
  detect(ctx) {
    const out = [];
    for (const source of ctx.cssSources) {
      let contract;
      try {
        contract = themeContract(source.css);
      } catch {
        continue;
      }
      for (const token of contract.conditional_only) {
        out.push({
          rel: source.rel,
          offset: source.base + token.offset,
          what: `\`${token.property}\` is only defined inside ${quote(token.conditions[0] || token.selector, 50)}.`,
          measured: `states defined: ${token.states.join(', ') || 'none'} — "default" missing`
        });
      }
      if (contract.has_dark_media && contract.has_dark_attribute && !contract.dark_media_guarded) {
        out.push({
          rel: source.rel,
          offset: source.base,
          what: 'There is a manual dark toggle and the dark media query is not guarded, so a visitor who chooses light on a dark machine still gets dark.',
          measured: 'expected `:root:not([data-theme="light"])` inside @media (prefers-color-scheme: dark)',
          fix: 'Write the dark media block as `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`.'
        });
      }
      for (const gap of contract.state_gaps.slice(0, 4)) {
        out.push({
          rel: source.rel,
          offset: source.base,
          what: `\`${gap.property}\` is missing from ${gap.missing_from}.`,
          measured: gap.consequence,
          fix: 'Set the same tokens in both dark states. Anything in one and not the other is a colour that changes depending on how dark was reached.'
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

/**
 * Resolve custom properties one level at a time so `color: var(--ink)` can be
 * compared against `background: var(--paper)`.
 */
function tokenMap(ctx) {
  const map = new Map();
  for (const d of ctx.decls) {
    if (!d.custom) continue;
    if (d.conditions.length > 0) continue; // the light default only
    if (!/^(:root|html|body|\*)/.test((d.selector || '').trim())) continue;
    if (!map.has(d.property)) map.set(d.property, d.value.trim());
  }
  return map;
}

function resolve(value, map, depth = 0) {
  if (depth > 6 || typeof value !== 'string') return value;
  const m = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/.exec(value);
  if (!m) return value;
  const replacement = map.get(m[1]) ?? m[2] ?? '';
  return resolve(value.replace(m[0], replacement.trim()), map, depth + 1);
}

export const contrast = register({
  id: 'contrast',
  tier: 'floor',
  title: 'Text too close in lightness to what is behind it',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.MEASURED,
  who: ['wcag', 'craft', 'citrous', 'impeccable'],
  threshold:
    'WCAG 2.2 1.4.3: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold). Computed from the resolved colours in each rule, falling back to the page ground where a rule sets a colour and no background.',
  why:
    'This is the one rule here with a legal standard behind it rather than a practitioner opinion, and the corpus contains a correction worth knowing: CodeStitch\'s own accessibility advice says contrast "should be at least 3:1", and that is wrong for body text. 3:1 is the LARGE-text threshold. Emitting 3:1 body text fails an audit. research/08-craft.md §6.4 adds the reason to bias higher still, which is about where the page is actually read: a phone screen in daylight. "Low-contrast tinted greys that look refined indoors vanish outdoors." A page reviewed on a bright laptop in a dim room is being reviewed under the best possible conditions, which are not the conditions it will be read in.',
  fix:
    'Darken the text or lighten the ground until the ratio clears 4.5:1. Keep the hue — move the lightness. In OKLCH that is one number, and it is why the palette tools in this kit return a full contrast matrix rather than a list of colours: a pair that fails should be impossible to choose by accident.',
  detect(ctx) {
    const map = tokenMap(ctx);
    const out = [];

    // The page ground, used when a rule sets a colour and no background of its own.
    let ground = null;
    for (const d of ctx.decls) {
      if (!/^(background|background-color)$/.test(d.property)) continue;
      const sel = (d.selector || '').trim().toLowerCase();
      if (sel !== 'body' && sel !== ':root' && sel !== 'html') continue;
      if (d.conditions.length) continue;
      const parsed = parseColor(resolve(d.value, map).split(/\s+/)[0]);
      if (parsed) ground = { colour: parsed, from: sel };
    }

    const bySelector = new Map();
    for (const d of ctx.decls) {
      if (d.conditions.length) continue;
      const key = `${d.rel}|${d.selector}`;
      if (!bySelector.has(key)) bySelector.set(key, { rel: d.rel, selector: d.selector, decls: [] });
      bySelector.get(key).decls.push(d);
    }

    /**
     * The background a selector actually sits on.
     *
     * A rule like `.banner b` does not set its own background; `.banner` does.
     * Falling straight back to the page ground reports a colour pair that never
     * appears on screen, so this walks the selector's own prefixes first — the
     * cheapest honest approximation of the cascade available without a browser.
     */
    function backgroundFor(rule) {
      const own = rule.decls.find((d) => /^(background|background-color)$/.test(d.property));
      if (own) return { decl: own, source: 'its own rule', assumed: false };

      const parts = (rule.selector || '').split(',')[0].trim().split(/\s+/);
      for (let cut = parts.length - 1; cut >= 1; cut--) {
        const prefix = parts.slice(0, cut).join(' ');
        for (const other of bySelector.values()) {
          if (other.rel !== rule.rel) continue;
          const selectors = (other.selector || '').split(',').map((s) => s.trim());
          if (!selectors.includes(prefix)) continue;
          const decl = other.decls.find((d) => /^(background|background-color)$/.test(d.property));
          if (decl) return { decl, source: `\`${prefix}\``, assumed: false };
        }
      }
      return ground ? { decl: null, source: `the page ground (${ground.from})`, assumed: true } : null;
    }

    for (const rule of bySelector.values()) {
      const fg = rule.decls.find((d) => d.property === 'color');
      if (!fg) continue;
      const background = backgroundFor(rule);
      if (!background) continue;
      const bgDecl = background.decl;
      const fgColour = parseColor(resolve(fg.value, map).trim().split(/\s+/)[0]);
      if (!fgColour) continue;
      const bgColour = bgDecl ? parseColor(resolve(bgDecl.value, map).trim().split(/\s+/)[0]) : ground?.colour;
      if (!bgColour) continue;
      if ((fgColour.a ?? 1) < 0.95 || (bgColour.a ?? 1) < 0.95) continue;

      const sizeDecl = rule.decls.find((d) => d.property === 'font-size');
      const weightDecl = rule.decls.find((d) => d.property === 'font-weight');
      const size = sizeDecl ? px(sizeDecl.value) : null;
      const bold = weightDecl ? parseInt(weightDecl.value, 10) >= 700 || /bold/i.test(weightDecl.value) : false;
      const large = size != null && (size >= 24 || (bold && size >= 18.66));
      const required = large ? 3 : 4.5;

      const ratio = contrastRatio(fgColour, bgColour);
      if (ratio >= required) continue;

      out.push({
        rel: fg.rel,
        offset: fg.offset,
        confidence: background.assumed ? CONFIDENCE.INFERENCE : CONFIDENCE.MEASURED,
        what: `\`${quote(rule.selector, 40)}\` sets text ${quote(fg.value, 24)} on ${bgDecl ? `${quote(bgDecl.value, 24)} from ${background.source}` : background.source}.`,
        measured:
          `${roundRatio(ratio)}:1 — WCAG AA needs ${required}:1 for ${large ? `large text (${size}px${bold ? ' bold' : ''})` : 'body text'}` +
          (background.assumed
            ? '. No background is set on this rule or on any ancestor selector this tool can see, so the page ground was assumed — check it on a rendered page before acting.'
            : '')
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const staleCopyright = register({
  id: 'stale-copyright',
  tier: 'floor',
  title: 'An out-of-date year in the footer',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.MEASURED,
  who: ['design'],
  threshold: 'A four-digit year in a copyright line that is earlier than the current year, with no later year beside it.',
  why:
    'research/04-design-language.md lists this first among dated signals and calls it "the single cheapest, most legible signal" — free to check and devastating when someone points at it. A stale year does not say the site is old. It says nobody has looked at it since, which for a teaching practice is the same as saying nobody is home.',
  fix:
    'Write the year once, from the machine, rather than typing it: `<script>document.querySelector("#year").textContent = new Date().getFullYear()</script>` with a `<span id="year">` fallback holding the current year in the markup so it is correct even with JavaScript off. Or simply drop the year — a copyright notice is valid without one.',
  detect(ctx) {
    const year = ctx.now.getFullYear();
    const out = [];
    for (const doc of ctx.documents) {
      const re = /(?:©|&copy;|\(c\)|copyright)[^\n<]{0,40}?((?:19|20)\d{2})(\s*[–-]\s*((?:19|20)\d{2}))?/gi;
      let m;
      while ((m = re.exec(doc.text)) !== null) {
        const latest = parseInt(m[3] || m[1], 10);
        if (latest >= year) continue;
        out.push({
          rel: doc.rel,
          offset: m.index,
          what: `The copyright line reads ${latest}.`,
          measured: `${latest} against ${year} — ${year - latest} ${year - latest === 1 ? 'year' : 'years'} stale`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const missingLang = register({
  id: 'missing-lang',
  tier: 'floor',
  title: 'No language on the html element',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['wcag'],
  threshold: 'An <html> element with no `lang` attribute.',
  why:
    'A screen reader chooses its pronunciation rules from this attribute. Without it, an English page may be read in the voice of whatever language the visitor\'s reader defaults to, which makes it unintelligible rather than merely accented. It is one attribute and it is WCAG 3.1.1.',
  fix: 'Write `<html lang="en">`.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      const html = page.tree.all.find((n) => n.tag === 'html');
      if (!html) continue;
      if (html.attrs.lang) continue;
      out.push({
        rel: page.rel,
        offset: html.start,
        what: '<html> has no lang attribute.',
        measured: 'lang absent'
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const layoutTable = register({
  id: 'layout-table',
  tier: 'floor',
  title: 'A table used for layout',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['design'],
  threshold:
    'A <table> with no <th>, <thead>, <tfoot>, <caption>, scope, headers or abbr anywhere inside it — PowerMapper\'s heuristic for telling a layout table from a data table.',
  why:
    'research/04-design-language.md lists this among its Tier 1 technical-age signals, with the detection rule quoted above. A table with no header structure is not describing data, it is positioning boxes — a 2004 technique that the HTML specification now expressly forbids. A screen reader announces it as a table and then reads the layout aloud, cell by cell.',
  fix: 'Use CSS grid or flexbox for layout. Keep tables for data, and when you do, give them a <caption> and <th scope="…"> headers.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      for (const table of page.tree.all.filter((n) => n.tag === 'table')) {
        const inner = page.text.slice(table.start, table.end);
        if (/<(th|thead|tfoot|caption|colgroup)\b|\b(scope|headers|abbr)\s*=/i.test(inner)) continue;
        out.push({
          rel: page.rel,
          offset: table.start,
          what: 'A <table> with no header cells, caption or scope attributes — so it is holding a layout, not data.',
          measured: 'no th/thead/tfoot/caption/colgroup/scope/headers/abbr inside'
        });
      }
    }
    return out;
  }
});

export const rules = [
  missingViewport,
  overflowHidden,
  inputFontSize,
  tapTarget,
  bareFrGrid,
  noReducedMotion,
  threeStateTheme,
  contrast,
  staleCopyright,
  missingLang,
  layoutTable
];
