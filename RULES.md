# The rulebook

*Generated from `src/rules/` by `npm run docs`. Do not edit by hand.*

61 rules. Every one names its source, and the kit refuses to load a rule that does not — provenance is a startup error here, not a habit. Run `explain_rule` with any id for the full teaching note.

`??` seen in five seconds · `?` felt but not named · `?!` a habit worth dropping · `!?` a move whose time is passing · `!` worth keeping

## Tier 1 — clocked in five seconds, no design vocabulary needed

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?? | `indigo-accent`<br>The indigo nobody chose | Any of ten exact Tailwind hexes — #6366f1 #818cf8 #4f46e5 #4338ca #3730a3 #8b5cf6 #7c3aed #6d28d9 #a78bfa #5b21b6 — in any colour form: hex, rgb(), hsl() or oklch() resolving to the same pixel. | DEMONSTRATED | gesso, krebs, hallmark |
| ?? | `three-stop-gradient`<br>A gradient with a third colour in it | Any linear-, radial- or conic-gradient whose argument list contains three or more colour stops. | DEMONSTRATED | gesso, craft |
| ?? | `banned-gradient-pair`<br>The gradient everyone else is using | A two-stop gradient whose ends fall in one of three named hue pairs: purple→cyan, purple→blue, orange→pink. | DEMONSTRATED | gesso, krebs |
| ?? | `emoji-feature-icon`<br>Emoji standing in for an icon | An emoji character at the START of a list item, heading, card, step or button — the position where an icon would go. | DEMONSTRATED | hallmark, gesso, krebs, impeccable |
| ?? | `uniform-card-grid`<br>Identical cards in a row | Three or more sibling elements sharing an identical structural signature — same tag, same normalised class list, same child shape to three levels — where each has real internal structure, AND they sit side by side: either they carry a card-like class name, or their container has a `display: grid` or `display: flex` rule. | DEMONSTRATED | krebs, hallmark, gesso, hn, impeccable |
| ?? | `placeholder-imagery`<br>A picture of somebody else | An <img> or <source> whose src points at a placeholder or stock-photo host, or that has an empty src, or that has no alt attribute at all. | DEMONSTRATED | craft, gesso, febbhav |
| ?? | `fixed-width-box`<br>A box wider than a phone | A `width`, `min-width` or `flex-basis` declaration of 361px or more that is not inside a min-width media query. | INFERENCE | craft, hallmark |

## Tier 2 — felt rather than named, but decisive

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ? | `edge-stripe`<br>The coloured stripe down the side of a card | A `border-left` or `border-right` (or the -width/-color longhands) of 2px or more carrying a colour with OKLCH chroma above 0.03 — that is, a colour rather than a hairline. | DEMONSTRATED | gesso, krebs, hn, impeccable |
| ? | `hero-kicker`<br>The little label above the headline | The element immediately preceding the primary <h1> among its siblings, when it is 60 characters or fewer AND 9 words or fewer AND is not itself a heading AND contains no link, list, nav or button. | DEMONSTRATED | gesso, krebs, hallmark, impeccable |
| ? | `heavy-shadow`<br>Puffy stacked shadows | Gesso's executable detector, reproduced exactly: FAIL if ≥3 blurred non-inset layers, OR ≥2 blurred layers where any alpha > 0.12, OR one blurred layer with alpha > 0.30. | DEMONSTRATED | gesso, comeau |
| ? | `over-rounded`<br>Corners rounded past the stop | A `border-radius` of 40px or more on a filled surface. | DEMONSTRATED | gesso |
| ? | `backdrop-blur`<br>Glass as decoration | Any `backdrop-filter` or `-webkit-backdrop-filter` declaration containing blur(). | DEMONSTRATED | hn, krebs, comeau, impeccable |
| ? | `pure-black-white`<br>Pure black, pure white, and greys with no colour in them | A colour used as a page ground or as body ink that is exactly #000 or #fff, or any neutral whose OKLCH chroma is below 0.005. | ASSERTED | hallmark, craft, storefront |
| ? | `single-font-page`<br>One font doing every job | Fewer than two distinct font-family stacks across the whole project, counting the generic fallbacks as one family. | ASSERTED | gesso, krebs, craft |
| ? | `fake-chrome`<br>A drawing of a browser, inside a browser | A class or id naming browser chrome, a device frame, or a terminal window. | ASSERTED | hallmark, febbhav |
| ? | `full-viewport-hero`<br>A hero the height of the screen | A height or min-height of 100vh (or 100dvh/100svh) on any element, and separately on a hero-named element. | DEMONSTRATED | hallmark, krebs, craft |
| ? | `ai-footer`<br>A four-column footer for a one-person business | Three or more of the headings Product / Company / Resources / Legal / Solutions / Developers / Platform inside a <footer>. | ASSERTED | hallmark, craft |
| ? | `universal-reveal`<br>Everything fading up on scroll | Six or more elements carrying a reveal/fade-in/animate-on-scroll class or a data-aos attribute. | DEMONSTRATED | hallmark, febbhav, freiberg, craft |
| ? | `hero-behind-reveal`<br>The headline is hidden until a script runs | The primary <h1>, or an ancestor of it, carries a reveal/fade-in class or a data-aos attribute. | INFERENCE | craft |
| ? | `no-press-feedback`<br>Nothing happens when you tap | The project has buttons or links styled as buttons, and no `:active` rule anywhere in its CSS. | DEMONSTRATED | kowalski, craft, citrous |
| ? | `unguarded-hover`<br>A hover effect on a device with no mouse | A `:hover` rule that changes transform, scale, translate, box-shadow or filter, and is not inside `@media (hover: hover)`. | ASSERTED | craft, kowalski |
| ? | `motion-ceiling`<br>Motion slower than the eye reads as motion | A transition or animation duration above 300ms on anything that is not a large travelling surface (a drawer, a sheet). | DEMONSTRATED | kowalski, sonner, craft |
| ? | `ease-on-entrance`<br>The sluggish easing curve | A transition or animation whose timing function is the plain keyword `ease`, or `ease-in`, on an entering element. | DEMONSTRATED | comeau, kowalski |
| ? | `reveal-travel`<br>A reveal that travels too far | A translateY or translate3d of more than 14px in a transform used for a scroll reveal or keyframe entrance. | ASSERTED | kowalski, craft |
| ? | `sticky-collision`<br>Two sticky things at the same height | Two or more rules setting `position: sticky` with `top: 0`, or a sticky element whose `top` is a hardcoded pixel guess at another element's height. | DEMONSTRATED | craft |
| ? | `nuclear-motion-reset`<br>The reduced-motion sledgehammer | A universal selector inside a prefers-reduced-motion block setting animation-duration or transition-duration to a near-zero value with !important. | DEMONSTRATED | comeau |

## The floor — what makes a page look broken rather than cheap

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ? | `missing-viewport`<br>No viewport tag | An HTML page with no <meta name="viewport"> in its head, or one with a fixed pixel width, or one that disables scaling. | DEMONSTRATED | design |
| ? | `overflow-hidden`<br>overflow-x: hidden on html or body | `overflow-x: hidden` (or `overflow: hidden`) on `html` or `body`. | DEMONSTRATED | craft |
| ? | `input-font-size`<br>A form field iOS will zoom into | A font-size below 16px in a rule whose selector names input, select or textarea. | DEMONSTRATED | craft, freiberg |
| ? | `tap-target`<br>No minimum tap target on touch | The project has buttons or links, and no `@media (pointer: coarse)` rule setting a min-height of 48px or more. | DEMONSTRATED | hallmark, citrous |
| ? | `bare-fr-grid`<br>A grid track that an image can push off the screen | A `grid-template-columns` containing a bare `1fr` track, on a project that contains <img> elements. | DEMONSTRATED | craft |
| ? | `no-reduced-motion`<br>Motion with no way to turn it off | The project declares a transition or animation and has no `@media (prefers-reduced-motion)` block anywhere. | DEMONSTRATED | comeau, kowalski |
| ? | `three-state-theme`<br>A colour that only exists in one theme | A custom property whose only definition sits inside `@media (prefers-color-scheme: dark)` or `[data-theme="dark"]`, with no value in a bare `:root`. | DEMONSTRATED | storefront |
| ? | `contrast`<br>Text too close in lightness to what is behind it | WCAG 2.2 1.4.3: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold). | MEASURED | wcag, craft, citrous, impeccable |
| ? | `stale-copyright`<br>An out-of-date year in the footer | A four-digit year in a copyright line that is earlier than the current year, with no later year beside it. | MEASURED | design |
| ? | `missing-lang`<br>No language on the html element | An <html> element with no `lang` attribute. | DEMONSTRATED | wcag |
| ? | `layout-table`<br>A table used for layout | A <table> with no <th>, <thead>, <tfoot>, <caption>, scope, headers or abbr anywhere inside it — PowerMapper's heuristic for telling a layout table from a data table. | DEMONSTRATED | design |

## Honesty — claims that cannot be checked, and claims that are not yours

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ! | `declared-placeholder`<br>An unfilled field, drawn as one | An element carrying a `data-placeholder` attribute. | MEASURED | storefront, craft |
| ?? | `invented-proof`<br>Proof that nobody supplied | A testimonial block, a star rating, an "as seen in" or "trusted by" line, or a customer count — anywhere in the page, including inside an HTML comment. | DEMONSTRATED | storefront, craft, hallmark |
| ? | `unverified-attribution`<br>A name under a quotation | A quotation block immediately followed by a short block that reads as an attribution: a <cite>, a dash and a capitalised name, a class naming it as an author or source, a <figcaption>, a "said/wrote/according to" verb, or — the subtle one — a person-shaped name standing on its own line. | DEMONSTRATED | storefront |
| ?? | `placeholder-identity`<br>A stand-in name, address or number still in the page | Acme / Contoso / Globex, "Your Company Here", John or Jane Doe, an @example.com address, a 555-01xx phone number, or 123 Main Street. | DEMONSTRATED | storefront |
| ?! | `unfinished-marker`<br>A note to yourself that a visitor can read | TODO, TBD, FIXME, XXX, PLACEHOLDER, COMING SOON, or a bracketed [insert something here] in visible copy. | DEMONSTRATED | storefront |
| ?? | `lorem-ipsum`<br>Filler Latin still in the page | Lorem ipsum, dolor sit amet, consectetur adipiscing, and their neighbours. | DEMONSTRATED | storefront |
| ?! | `unsupported-superlative`<br>An award nobody gave | "Award-winning", "#1 rated", "best-selling", "world-class", "market leader", "the best in the city". | DEMONSTRATED | storefront, gesso |
| ? | `single-source`<br>The same number written in two places | A price, a phone number or an email address appearing as a literal in two or more files. | DEMONSTRATED | storefront |

## Tier 3 — copy, which for a teaching business may matter most of all

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?! | `benefit-speak`<br>Benefit-speak | A word from the benefit-speak lexicon in visible copy: elevate, supercharge, streamline, empower, effortless(ly), seamless(ly), revolutionize, game-changer, world-class, next-level, unleash, turbocharge, "unlock the/your/a/new". | DEMONSTRATED | gesso, craft |
| ?! | `not-x-but-y`<br>The "not just X, it's Y" cadence | "not just X, it's Y", "isn't just X, it's Y", "more than just X", "not only X but also Y" in visible copy. | DEMONSTRATED | gesso |
| ?! | `em-dash-copy`<br>An em dash in short interface copy | A U+2014 em dash in visible copy of 120 characters or fewer — a heading, a button, a label, a card. | DEMONSTRATED | gesso |
| ?! | `fabricated-precision`<br>A number that sounds measured and is not | 99.9% / 99.99%, an "Nx" multiplier, "#1", "trusted by" plus a crowd, a percentage improvement, or a large round count — in visible copy. | DEMONSTRATED | gesso, hallmark, storefront |
| ?! | `misattributed-stat`<br>The statistic that does not check out | The claim that 94% (or 97%) of first impressions are design-related, in any phrasing, attributed to Stanford or not. | DEMONSTRATED | design, lindgaard |
| ?! | `unfalsifiable-claim`<br>A sentence that cannot be false | A phrase from the unfalsifiable lexicon in visible copy. | ASSERTED | gesso, craft |
| ?! | `rule-of-three`<br>Every list exactly three items long | Three or more lists on one page, every one of them exactly three items long. | ASSERTED | hn, craft |

## The trap tier — reads as sophisticated today, will read as generated soon

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| !? | `cream-wash`<br>The cream-and-italic-serif escape | A page ground in OKLCH lightness 0.92-0.99 at hue 40-110 with chroma 0.015-0.06 — warm oat or cream — reported on its own, and reported harder when a serif display face or monospace capital labels appear with it. | ASSERTED | gesso, krebs, febbhav |
| !? | `safe-green`<br>Emerald as the "not purple" accent | Tailwind emerald #10B981 or its immediate neighbours used as an accent. | ASSERTED | gesso, febbhav |
| !? | `numbered-sections`<br>01 / 02 / 03 as section numbering | Two or more short blocks on a page whose entire content is a zero-padded two-digit number. | ASSERTED | gesso, impeccable |
| !? | `italic-in-heading`<br>One italic word inside an upright heading | An <em>, <i>, or an element with font-style: italic, inside an h1, h2 or h3 whose other words are upright. | ASSERTED | hallmark, febbhav |
| !? | `pill-everything`<br>The pill-shaped button | Three or more rules setting a fully-rounded radius (999px or more, or 50%) on non-circular elements. | ASSERTED | craft |
| !? | `gradient-text`<br>A gradient poured into the headline | `background-clip: text` or `-webkit-background-clip: text` combined with a transparent text colour. | DEMONSTRATED | gesso, impeccable |

## Variety — the tell that is not on any single page

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?? | `shared-skeleton`<br>Two different sites wearing the same page | Two or more pages in DIFFERENT site folders whose stylesheets hash identically, or whose body structure hashes identically. | MEASURED | craft, hallmark |
| ? | `ledger-repeat`<br>The same shape as something you shipped before | A page whose structural fingerprint matches an entry already in the variety ledger for a different subject. | MEASURED | craft |
| ? | `zero-images`<br>No photographs anywhere | No <img> element anywhere in the site, and no <picture> or CSS background-image carrying a real file. | MEASURED | craft |

## Sources

| id | Who | What it contributes | Confidence |
|---|---|---|---|
| `gesso` | Gesso Build, @gessobuild/anti-slop | A deterministic HTML/CSS design linter: 73 rules, CI-runnable, every one an executable detector with an exact numeric threshold and most with an idempotent auto-fix. | — |
| `hallmark` | Hallmark (Hassan El Mghari / Nutlope) | An anti-slop design skill for coding agents. | — |
| `krebs` | Adrian Krebs, "Design Slop" | The only empirical study of AI-design tells the research sweep found: 1,590 Show HN landing pages scored with Playwright and deterministic DOM checks, tier breakdowns published, code open-sourced. | — |
| `febbhav` | febbhav, "Signs of AI Design" | A ~44 KB catalogue of AI tells across web, image, video and copy. | — |
| `kowalski` | Emil Kowalski, 7 Practical Animation Tips | Design engineer at Linear, author of Sonner and Vaul. | — |
| `sonner` | Sonner, shipped styles.css | Production library source. | — |
| `comeau` | Josh W. Comeau | Interactive CSS tutorials where every claim sits next to a live control. | — |
| `freiberg` | Rauno Freiberg, Web Interface Guidelines | Design engineer at Vercel. | — |
| `citrous` | Ryan / u/Citrous_Oyster, CodeStitch | The one practitioner school that demonstrably owns the small-business static-site market: 18 inspectable live client sites across 13 trades, plus an 18,000-comment history. | — |
| `storefront` | chess-tee-forge/store, DESIGN-SYSTEM.md | A shipped storefront whose design system is written down, and whose honesty rules are encoded in the page rather than asserted about it: no invented brand, logo, testimonial or press; a quotation carried with no attribution because the attribution could not be traced; out-of-band numbers stamped rather than hidden; assumptions labelled "Assumed — untested". | — |
| `craft` | research/08-craft.md | The ranked, sourced AI-slop tell list with executable thresholds, tiered by how fast a non-technical owner clocks each one on a phone. | — |
| `sitegen` | research/08a-sitegen-spec.md | The work order that follows from 08-craft: which variation axes carry, which are cosmetic, and the rule that section INVENTORY and COUNT are what make two pages look like different jobs rather than one job run twice. | — |
| `design` | research/04-design-language.md | What reads modern versus dated in 2026, and the two-tier detector: Tier 1 technical age, cheap and objective, parse the HTML; Tier 2 aesthetic age, which needs a screenshot and a vision model because you cannot parse ugliness. | — |
| `reference` | research/11-reference-tier.md and 11a-verity-build-spec.md | What a top-tier build actually looks like, and the measured type, grain, shadow and composition values behind it. | — |
| `impeccable` | impeccable 4.3.1, craft-floor.md | A design skill and edit-time detector installed on this machine. | — |
| `wcag` | WCAG 2.2, success criterion 1.4.3 | Contrast (Minimum): 4.5:1 for normal text, 3:1 for large text (>=24px, or >=18.66px bold) and for non-text user-interface components. | — |
| `lindgaard` | Lindgaard, Fernandes, Dudek & Brown (2006) | "Attention web designers: You have 50 milliseconds to make a good first impression!", Behaviour & Information Technology 25(2), 115-126. | — |
| `hn` | Hacker News practitioner threads | Where the corpus quotes a working developer by handle — dematz on the three-card grid, m132 on backdrop-filter, joegibbs on the left stripe, naet on iOS Low Power Mode, vunderba on low-contrast dark sites, zahlman on category-mismatched list items. | — |
| `mdn` | MDN and vendor documentation | Platform behaviour quoted verbatim from the vendor that implements it. | — |

