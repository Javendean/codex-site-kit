/**
 * The citation registry.
 *
 * A rule with no provenance is not shippable. This file is the reason that is
 * enforceable rather than aspirational: `rules/index.js` refuses to register a
 * rule whose `who` names an id that is not here, and the test suite asserts it.
 *
 * The confidence vocabulary is inherited verbatim from research/08-craft.md so
 * that nothing is laundered on the way into this tool:
 *
 *   DEMONSTRATED   The source ships runnable code, a live comparator,
 *                  production library CSS, or a counted sample. Verifiable
 *                  without trusting anyone.
 *   ASSERTED       Expert opinion, blog prose, or forum anecdote. May be
 *                  right; is not evidence.
 *   MEASURED       Produced by inspecting real artifacts — either the research
 *                  repo's own output on 2026-08-31, or this tool measuring
 *                  your files right now.
 *   INFERENCE      Reasoning by this kit or by the sweep, with no source
 *                  behind it. Said out loud rather than hidden.
 *
 * Every finding carries one of those four, and `review_site` prints it. A tool
 * built on a corpus this careful about attribution has no business being less
 * careful itself.
 */

/** @typedef {'DEMONSTRATED'|'ASSERTED'|'MEASURED'|'INFERENCE'} Confidence */

export const CONFIDENCE = {
  DEMONSTRATED: 'DEMONSTRATED',
  ASSERTED: 'ASSERTED',
  MEASURED: 'MEASURED',
  INFERENCE: 'INFERENCE'
};

export const CONFIDENCE_NOTE = {
  DEMONSTRATED:
    'The source ships code, a live comparator, production library CSS, or a counted sample. You can check it without trusting anyone.',
  ASSERTED:
    'Expert opinion or practitioner prose. It may well be right. It is not evidence, and this tool will not pretend otherwise.',
  MEASURED:
    'Measured, not quoted — either from the research corpus’s own artifacts or from your files just now. The numbers in the finding are the measurement.',
  INFERENCE:
    'Reasoning with no source behind it. Recorded as reasoning so it is never mistaken for a citation.'
};

/**
 * @type {Record<string, {label: string, who: string, what: string, url?: string, caveat?: string}>}
 */
export const SOURCES = {
  /* ---- the anti-slop detectors ---- */

  gesso: {
    label: 'Gesso Build, @gessobuild/anti-slop',
    who: 'Gesso Build',
    what:
      'A deterministic HTML/CSS design linter: 73 rules, CI-runnable, every one an executable detector with an exact numeric threshold and most with an idempotent auto-fix. research/08-craft.md calls it the most rigorous source in the sweep — the only one giving falsifiable trigger conditions rather than adjectives.',
    url: 'https://raw.githubusercontent.com/Gesso-Build/skills/main/skills/anti-slop/references/rules.md'
  },

  hallmark: {
    label: 'Hallmark (Hassan El Mghari / Nutlope)',
    who: 'Hassan El Mghari',
    what:
      'An anti-slop design skill for coding agents. ~45 named anti-patterns each with a why and a fix, plus 58 numbered pass/fail gates. The densest catalogue in the corpus.',
    url: 'https://raw.githubusercontent.com/Nutlope/hallmark/main/skills/hallmark/references/anti-patterns.md',
    caveat:
      'Design opinion with a commercial context. Its CORE tells match Krebs’s independent empirical count, which is why the core is trusted here; its elaborate prescriptions (21 themes, 42,000 fingerprints) are unvalidated and are tagged ASSERTED wherever this kit uses them.'
  },

  krebs: {
    label: 'Adrian Krebs, "Design Slop"',
    who: 'Adrian Krebs',
    what:
      'The only empirical study of AI-design tells the research sweep found: 1,590 Show HN landing pages scored with Playwright and deterministic DOM checks, tier breakdowns published, code open-sourced.',
    url: 'https://www.adriankrebs.ch/blog/design-slop/',
    caveat:
      'Krebs self-reports a 5-10% false-positive rate. He is also honest against his own thesis — an HN commenter caught his own blog post wearing the cream/beige escape hatch he was documenting.'
  },

  febbhav: {
    label: 'febbhav, "Signs of AI Design"',
    who: 'febbhav',
    what:
      'A ~44 KB catalogue of AI tells across web, image, video and copy. The only source in the corpus that tracks which tells have DECAYED — it named the purple-to-cream/emerald/italic-serif migration as an active shift.',
    url: 'https://raw.githubusercontent.com/febbhav/signs-of-ai-design/main/README.md',
    caveat: 'Catalogues rather than demonstrates.'
  },

  /* ---- motion and material ---- */

  kowalski: {
    label: 'Emil Kowalski, 7 Practical Animation Tips',
    who: 'Emil Kowalski',
    what:
      'Design engineer at Linear, author of Sonner and Vaul. The strongest motion source in the corpus and uniquely checkable: he publishes numeric rules in prose AND ships the libraries where you can read the CSS and confirm he follows them. He does.',
    url: 'https://emilkowal.ski/ui/7-practical-animation-tips'
  },

  sonner: {
    label: 'Sonner, shipped styles.css',
    who: 'Emil Kowalski',
    what:
      'Production library source. `transition: transform 500ms, opacity 200ms` — opacity shorter than transform, a 2.5x ratio. research/08-craft.md calls shipped library CSS the strongest evidence class in the whole file.',
    url: 'https://raw.githubusercontent.com/emilkowalski/sonner/main/src/styles.css'
  },

  comeau: {
    label: 'Josh W. Comeau',
    who: 'Josh W. Comeau',
    what:
      'Interactive CSS tutorials where every claim sits next to a live control. The load-bearing source on compositor-safe properties, on prefers-reduced-motion, and on shadow design.',
    url: 'https://www.joshwcomeau.com/animation/css-transitions/'
  },

  freiberg: {
    label: 'Rauno Freiberg, Web Interface Guidelines',
    who: 'Rauno Freiberg',
    what:
      'Design engineer at Vercel. Credible as framing and judgement rather than as parameters — he says so himself. His 90/10 novelty rule is the most useful strategic idea in the corpus for anything that generates pages.',
    url: 'https://interfaces.rauno.me/'
  },

  /* ---- the local-business vernacular ---- */

  citrous: {
    label: 'Ryan / u/Citrous_Oyster, CodeStitch',
    who: 'Ryan (Oak Harbor Web Designs)',
    what:
      'The one practitioner school that demonstrably owns the small-business static-site market: 18 inspectable live client sites across 13 trades, plus an 18,000-comment history. His mechanics and his shipped artifacts agree.',
    url: 'https://codestitch.app/',
    caveat:
      'His revenue claims are self-reported with no ledger. And his accessibility advice contains an error nobody in the corpus corrected: he says contrast "should be at least 3:1", which is the LARGE-text threshold. WCAG AA requires 4.5:1 for body text. This kit follows WCAG, not him.'
  },

  /* ---- the reference storefront ---- */

  storefront: {
    label: 'chess-tee-forge/store, DESIGN-SYSTEM.md',
    who: 'the reference storefront',
    what:
      'A shipped storefront whose design system is written down, and whose honesty rules are encoded in the page rather than asserted about it: no invented brand, logo, testimonial or press; a quotation carried with no attribution because the attribution could not be traced; out-of-band numbers stamped rather than hidden; assumptions labelled "Assumed — untested".',
    caveat:
      'Two of its rules are here because that project shipped the bug first. It advertised one price and charged another, from a second copy of the figure. And it set a name under a quotation, which is an attribution even with no "said" and no dash.'
  },

  /* ---- the research corpus itself ---- */

  craft: {
    label: 'research/08-craft.md',
    who: 'the local-site-forge research sweep, 2026-08-31',
    what:
      'The ranked, sourced AI-slop tell list with executable thresholds, tiered by how fast a non-technical owner clocks each one on a phone. Also the file that measured the generator it was written for and found two distinct stylesheets across thirteen sites.',
    caveat:
      'The file is explicit that the TIERING ITSELF is asserted: the sweep found no study of what non-technical business owners notice. Treat the ordering as a testable hypothesis, not a finding.'
  },

  sitegen: {
    label: 'research/08a-sitegen-spec.md',
    who: 'the local-site-forge research sweep',
    what:
      'The work order that follows from 08-craft: which variation axes carry, which are cosmetic, and the rule that section INVENTORY and COUNT are what make two pages look like different jobs rather than one job run twice.'
  },

  design: {
    label: 'research/04-design-language.md',
    who: 'the local-site-forge research sweep',
    what:
      'What reads modern versus dated in 2026, and the two-tier detector: Tier 1 technical age, cheap and objective, parse the HTML; Tier 2 aesthetic age, which needs a screenshot and a vision model because you cannot parse ugliness.'
  },

  reference: {
    label: 'research/11-reference-tier.md and 11a-verity-build-spec.md',
    who: 'the local-site-forge research sweep',
    what:
      'What a top-tier build actually looks like, and the measured type, grain, shadow and composition values behind it.'
  },

  /* ---- outside the corpus ---- */

  impeccable: {
    label: 'impeccable 4.3.1, craft-floor.md',
    who: 'the impeccable design plugin',
    what:
      'A design skill and edit-time detector installed on this machine. Its craft floor bans the eyebrow outright ("no brief earns it back"), bans coloured border-left above 1px, gradient text, glass as decoration, emoji standing in for icons, and 01/02/03 section numbering; and it requires theming the browser surfaces nobody draws — selection, caret, scrollbars, focus rings.',
    caveat:
      'It runs as an editor hook inside Claude Code, Codex, Cursor and Copilot, not as an MCP server. Where a rule here overlaps, this kit says so and credits it rather than claiming the ground.'
  },

  wcag: {
    label: 'WCAG 2.2, success criterion 1.4.3',
    who: 'W3C',
    what:
      'Contrast (Minimum): 4.5:1 for normal text, 3:1 for large text (>=24px, or >=18.66px bold) and for non-text user-interface components.',
    url: 'https://www.w3.org/TR/WCAG22/#contrast-minimum'
  },

  lindgaard: {
    label: 'Lindgaard, Fernandes, Dudek & Brown (2006)',
    who: 'Gitte Lindgaard et al.',
    what:
      '"Attention web designers: You have 50 milliseconds to make a good first impression!", Behaviour & Information Technology 25(2), 115-126. Three experiments; 50 ms ratings correlate strongly with 500 ms ratings.',
    caveat:
      'Cited here for one reason: it is the REPLACEMENT for the "94% of first impressions are design-related / Stanford" claim, which research/04 documents as a misattribution. Stanford’s Web Credibility Project actually found 46.1%. This kit detects the wrong figure in your copy and will never emit it.'
  },

  hn: {
    label: 'Hacker News practitioner threads',
    who: 'named HN commenters',
    what:
      'Where the corpus quotes a working developer by handle — dematz on the three-card grid, m132 on backdrop-filter, joegibbs on the left stripe, naet on iOS Low Power Mode, vunderba on low-contrast dark sites, zahlman on category-mismatched list items.',
    caveat: 'Forum anecdote. Never better than ASSERTED, and tagged that way.'
  },

  mdn: {
    label: 'MDN and vendor documentation',
    who: 'MDN / web.dev / WebKit',
    what: 'Platform behaviour quoted verbatim from the vendor that implements it.'
  }
};

/** Throws if an id is not registered. Called at rule-registration time. */
export function requireSource(id) {
  if (!Object.prototype.hasOwnProperty.call(SOURCES, id)) {
    throw new Error(
      `Unknown source "${id}". Every rule must cite a source registered in src/rules/sources.js.`
    );
  }
  return SOURCES[id];
}

/** Render one citation as a single line for the critique. */
export function citeLine(id) {
  const s = requireSource(id);
  return s.url ? `${s.label} — ${s.url}` : s.label;
}
