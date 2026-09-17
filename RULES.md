# The rulebook

*Generated from `rules/` by `npm run docs`. Do not edit by hand.*

155 rules. Every one names its source, and the kit refuses to load a rule that does not — provenance is a startup error here, not a habit. Run `explain_rule` with any id for the full teaching note.

`??` seen in five seconds · `?` felt but not named · `?!` a habit worth dropping · `!?` a move whose time is passing · `!` worth keeping

## Tier 1 — clocked in five seconds, no design vocabulary needed

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?? | `T1-INDIGO-HEX`<br>The indigo nobody chose | Any of those ten hex values appearing anywhere in the CSS or markup. | DEMONSTRATED | gesso, krebs, hallmark |
| ? | `T1-INDIGO-NEAR`<br>An indigo that dodged the list | A hex whose OKLCH hue is 255-305 degrees, chroma >= 0.09, lightness 0.30-0.80, used as an accent (assigned to a custom property matching /accent\|brand\|primary/, or used as a background/border/fill on an interactive element). | MEASURED_HERE | measured_here |
| ?? | `T1-GRADIENT-3STOP`<br>The third gradient stop | Any gradient function whose argument list contains 3 or more colour stops, counting a bare colour or a colour with a position as one stop. | DEMONSTRATED | gesso, research_08 |
| ?? | `T1-GRADIENT-CLICHE`<br>The three cliché gradient pairs | A two-or-more stop gradient whose first and last stops fall in one of the three named hue pairs, either direction, with both stops at chroma >= 0.07. | DEMONSTRATED | gesso, research_11 |
| ?? | `T1-GRADIENT-TEXT`<br>Gradient text | Any `background-clip: text` or `-webkit-background-clip: text` declaration. | DEMONSTRATED | gesso, impeccable |
| ?? | `T1-EMOJI-ICON`<br>Emoji standing in for icons | One or more emoji code points used as the entire content of an element in an icon position. | DEMONSTRATED | hallmark, impeccable, research_08 |
| ?? | `T1-GLYPH-REGISTER`<br>Two icon registers in one grid | Within one repeated card/list set of 3 or more items, icon slots drawn from more than one register, where a register is one of: colour emoji, monochrome Unicode geometry, inline SVG, icon-font glyph, `<img>`. | MEASURED_HERE | research_08a, hallmark |
| ? | `T1-UNIFORM-CARDS`<br>Identical icon-topped cards as the page structure | >= 3 sibling elements sharing the same tag and class list, each containing an icon-position element followed by a heading followed by a paragraph, all occupying equal grid tracks. | DEMONSTRATED | krebs, impeccable |
| ?? | `T1-HSCROLL`<br>The page scrolls sideways | `document.scrollWidth` exceeds `window.innerWidth` by more than 1 CSS pixel at any of 320 / 375 / 414 / 768 / 1024 / 1440 / 1920. | DEMONSTRATED | hallmark, chess_tee_forge |
| ?? | `T1-BUTTON-WRAP`<br>A button label wrapping to two lines | Any element matching `button, [role=button], a[class*=btn]` whose text node occupies more than one client rect at 320 / 375 / 414 / 768. | DEMONSTRATED | hallmark |
| ?? | `T1-PLACEHOLDER-SRC`<br>A placeholder image service in a shipped page | Any `<img src>` matching a known placeholder host, or empty, or `#`. | DEMONSTRATED | research_08 |
| ? | `T1-STOCK-PEOPLE`<br>Generated or stock people | Reported, not gated. | ASSERTED | febbhav |
| ? | `T1-NO-IMAGES`<br>No photographs at all | Zero `<img>` elements, counting `<picture><img>` but not counting decorative inline SVG or the grain texture. | MEASURED_HERE | research_08, research_11a |
| ? | `T1-FAKE-CHROME`<br>A drawn browser window, phone frame or terminal | A class name or id matching the known chrome-mockup vocabulary, or three circular elements of ~12px sitting in a row above a bordered content box. | DEMONSTRATED | hallmark, febbhav |

## Tier 2 — felt rather than named, but decisive

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?? | `T2-EDGE-STRIPE`<br>The coloured left-border stripe | `border-left` or `border-right` at 2px or more, carrying a colour that is not the page's hairline neutral, on a non-blockquote element. | DEMONSTRATED | gesso, krebs, impeccable |
| ?? | `T2-KICKER-H1`<br>The eyebrow badge above the main headline | The element immediately preceding the primary `<h1>` in document order, when its text is <= 60 characters AND <= 9 words, AND it is either fully uppercase or carries `letter-spacing >= 0.08em`, AND it is not itself a heading, and contains no links, list items, nav or buttons. | DEMONSTRATED | gesso |
| ? | `T2-KICKER-ANY`<br>An eyebrow label above any heading | Same conditions as T2-KICKER-H1, applied to every heading rather than only the primary `<h1>`. | ASSERTED | impeccable, research_11a |
| ?? | `T2-PUFFY-SHADOW`<br>Puffy stacked shadows | >= 3 blurred non-inset layers, OR >= 2 blurred layers where any alpha > 0.12, OR a single blurred layer with alpha > 0.30. | DEMONSTRATED | gesso, research_11, impeccable |
| ? | `T2-COLOR-GLOW`<br>A coloured glow on a light background | A non-inset box-shadow whose colour has OKLCH chroma >= 0.05 (i.e. | ASSERTED | research_08, impeccable, research_11 |
| ?! | `T2-HARD-OFFSET-SHADOW`<br>The zero-blur block shadow | A non-inset box-shadow with blur radius 0 and an offset of 2px or more. | ASSERTED | impeccable |
| ? | `T2-RADIUS-40`<br>Corners rounded past the point of confidence | `border-radius` between 40px and 400px on a filled surface. | DEMONSTRATED | gesso |
| ?! | `T2-PILL-CTA`<br>The fully-rounded pill button | `border-radius` of 999px or more on an element whose selector matches /btn\|button\|cta/. | ASSERTED | research_08, research_08a |
| ?? | `T2-BACKDROP-BLUR`<br>backdrop-filter: blur() | Any `backdrop-filter` or `-webkit-backdrop-filter` containing `blur()`. | DEMONSTRATED | research_08, impeccable, research_11 |
| ?? | `T2-HERO-GLOW`<br>The blurred glow behind the hero | One CSS rule containing both a `radial-gradient` background and a `filter: blur()`. | MEASURED_HERE | research_08a |
| ? | `T2-AVATAR-GRADIENT`<br>The gradient initials mark | A rule whose selector matches /mark\|logo\|avatar\|initials\|brand\|wordmark/ carrying both a `linear-gradient` background and a `border-radius`. | MEASURED_HERE | research_08a, chess_tee_forge |
| ? | `T2-PURE-BW`<br>Pure black on pure white | `#000`/`#000000` as a colour, or `#fff`/`#ffffff` as a background or page ground. | MEASURED_HERE | research_11, hallmark |
| ? | `T2-ZERO-CHROMA-GREY`<br>Greys with no colour in them at all | A colour used as a neutral (chroma < 0.04) whose chroma is below 0.005. | ASSERTED | hallmark, research_11 |
| ? | `T2-SINGLE-FONT`<br>One typeface doing every job | Fewer than 2 distinct primary font families across the declared `font-family` stacks, where a family is the first non-generic entry in each stack. | DEMONSTRATED | gesso, research_11 |
| ? | `T2-BANNED-FONT`<br>A typeface on the named-tell list | A banned face named as the FIRST family in any `font-family` stack. | DEMONSTRATED | gesso, research_11 |
| ? | `T2-DISPLAY-WEIGHT`<br>The headline is shouting | Any `font-weight` >= 620 on an element whose selector matches a display heading. | MEASURED_HERE | research_11 |
| ? | `TY-ANDROID-WEIGHT`<br>A weight ladder that does not exist on Android | >= 3 distinct `font-weight` values outside {100,200,300,400,500,600,700,800,900} declared on a page whose primary font family is a system keyword (`system-ui`, `ui-sans-serif`, `-apple-system`) with no `@font-face` variable font loaded. | MEASURED_HERE | research_11a |
| ? | `T2-TIGHT-TRACKING`<br>Letters pulled too tight on a large heading | `letter-spacing` <= -0.03em in a rule that also sets a display-size `font-size` (>= 2rem, or a `clamp()` whose maximum is >= 2rem). | MEASURED_HERE | research_08 |
| ? | `T2-UNIVERSAL-FADEUP`<br>Every section fading up on scroll | More than half of the page's top-level content blocks carry the same reveal/animate-on-scroll class. | ASSERTED | hallmark, freiberg |
| ?? | `T2-HERO-REVEAL`<br>The biggest thing on the page is hidden until JavaScript runs | The first heading inside the hero region carries a class that the stylesheet sets to `opacity: 0`. | MEASURED_HERE | research_08a |
| ? | `T2-NESTED-REVEAL`<br>A reveal inside a reveal | An element carrying a reveal class that contains a descendant carrying the same class. | MEASURED_HERE | research_08a |
| ? | `T2-AOS-TRAVEL`<br>Elements travelling too far on entry | `translateY` of 15px or more in the hidden state of a reveal rule. | ASSERTED | kowalski, research_11 |
| ? | `T2-PLAIN-EASE-ENTRANCE`<br>The sluggish entrance curve | The `ease` keyword or `cubic-bezier(0.25, 0.1, 0.25, 1)` on a transition or animation in a reveal/entrance rule. | DEMONSTRATED | comeau, research_11 |
| ? | `T2-DURATION-CEILING`<br>Animations longer than 300 milliseconds | A duration above 300ms on an interaction or entrance. | DEMONSTRATED | kowalski |
| ?! | `T2-BOUNCE-EASING`<br>Bounce or overshoot on interface motion | A `cubic-bezier` whose second or fourth control value exceeds 1.05 or falls below -0.05. | ASSERTED | research_08 |
| ?! | `T2-MANY-EASINGS`<br>Too many different timing curves | More than 3 distinct `cubic-bezier(...)` argument tuples in the stylesheet. | MEASURED_HERE | research_11 |
| ? | `T2-TRANSITION-ALL`<br>transition: all | `transition: all` or `transition-property: all`. | ASSERTED | research_08, comeau |
| ? | `T2-LAYOUT-ANIMATION`<br>Animating a property that changes the layout | Any of those properties named in a `transition` or `animation` shorthand or in `transition-property`. | DEMONSTRATED | comeau |
| ?! | `T2-WILL-CHANGE-STATIC`<br>will-change left permanently applied | Any `will-change` other than `auto` in a static rule (not inside a `:hover`, `:active`, or a class that scripts add and remove). | MEASURED_HERE | research_11 |
| ? | `T2-CANVAS-PARTICLES`<br>A full-viewport particle or constellation canvas | A `<canvas>` element plus a `requestAnimationFrame` call in page script. | ASSERTED | research_08 |
| ?! | `T2-SMOOTH-SCROLL`<br>Smooth scrolling | `scroll-behavior: smooth` reports as `info`. | ASSERTED | research_11 |
| ? | `T2-FOCUS-FADE`<br>A focus ring that fades in | A transition affecting `outline`, `outline-offset` or `box-shadow` inside a `:focus` or `:focus-visible` rule. | ASSERTED | research_08 |
| ? | `T2-AI-NAV`<br>The generated navigation bar | A `<nav>` containing 4-5 links, in a sticky container, with a `backdrop-filter`. | ASSERTED | hallmark |
| ? | `T2-AI-FOOTER`<br>The four-column Product / Company / Resources / Legal footer | 3 or more of those words used as column headings inside `<footer>`. | ASSERTED | hallmark |
| ? | `T2-HERO-100VH`<br>The full-screen centred hero | `height: 100vh` or `min-height: 100vh` on a hero-like selector. | ASSERTED | hallmark, research_08 |
| ?! | `L-HERO-PADDING`<br>Symmetric hero padding | Hero `padding-block-end` divided by `padding-block-start` is below 1.3. | ASSERTED | hallmark, research_11 |
| ? | `T2-NESTED-CARDS`<br>A card inside a card | An element whose class matches the card vocabulary containing a descendant whose class also matches it. | ASSERTED | impeccable |
| ?! | `T2-HERO-METRIC`<br>The big-number hero template | A number set at 3rem or larger inside the hero region, with a smaller label adjacent. | ASSERTED | impeccable |
| ?! | `T2-MONO-COSTUME`<br>Monospace as a costume | A monospace family applied to a selector outside code, data and measurement contexts. | ASSERTED | impeccable |
| ?! | `T2-GEOMETRIC-MASK`<br>A geometric shape standing in for a real cut-out | A `clip-path` or mask using a geometric primitive applied to a selector that targets an image. | ASSERTED | impeccable |
| ?! | `T2-DASHED-RULE`<br>Dashed borders as separators | A `dashed` border style outside a selector that names a placeholder. | MEASURED_HERE | research_11a, chess_tee_forge |
| ? | `T2-EMPTY-SPACER`<br>An empty element reserving space | Any non-void element whose content is only whitespace or non-breaking spaces. | MEASURED_HERE | research_11a |
| ?? | `T2-BLINK-MARQUEE`<br>Deprecated presentational elements | Any of those elements present. | DEMONSTRATED | research_04 |

## The floor — what makes a page look broken rather than cheap

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?? | `F-VIEWPORT-META`<br>No viewport meta tag | No `<meta name="viewport">` in the document. | DEMONSTRATED | research_04 |
| ?? | `F-VIEWPORT-LOCKED`<br>Zooming disabled | `user-scalable=no`, `maximum-scale=1`, or a numeric `width=` in the viewport meta. | DEMONSTRATED | research_04, wcag |
| ? | `F-OVERFLOW-CLIP`<br>No horizontal-overflow guard, or the wrong one | `overflow-x: clip` absent from `html` or from `body`. | DEMONSTRATED | research_08 |
| ? | `F-BARE-1FR`<br>Grid tracks written as bare 1fr | A `fr` track in `grid-template-columns` or `grid-auto-columns` not wrapped in `minmax(0, ...)`. | DEMONSTRATED | research_08 |
| ? | `F-TAP-TARGET`<br>No minimum tap target on touch devices | No rule inside `@media (pointer: coarse)` setting `min-height` of 48px or more on an interactive selector. | DEMONSTRATED | research_08, wcag |
| ? | `F-HOVER-UNGUARDED`<br>A hover effect with no touch guard | A `:hover` rule changing transform, translate, scale or box-shadow, outside `@media (hover: hover)`. | MEASURED_HERE | research_08a |
| ? | `F-NO-PRESS`<br>No press feedback on the primary action | No `:active` rule setting a transform on an interactive selector. | DEMONSTRATED | kowalski, research_08a |
| ?? | `F-INPUT-16PX`<br>Form input text below 16px | `font-size` below 16px on an input, select or textarea selector. | DEMONSTRATED | research_08, freiberg |
| ? | `F-STICKY-COLLISION`<br>Two sticky elements that will overlap | Two or more rules setting `position: sticky` with `top: 0`; or a sticky `top` given as a literal pixel value rather than a custom property. | DEMONSTRATED | research_08 |
| ?! | `F-WRAP-ANYWHERE`<br>Display headings with no overflow guard | No `overflow-wrap: anywhere` (or `break-word`) on display-heading selectors. | DEMONSTRATED | research_08 |
| ? | `F-LAZY-HERO`<br>The hero image set to load lazily | `loading="lazy"` on the first `<img>` in the document, or on an image inside the hero region. | ASSERTED | research_08 |
| ?? | `A-IMG-ALT`<br>An image with no alt attribute | Any `<img>` with no `alt` attribute. | DEMONSTRATED | research_08, wcag |
| ?? | `A-CONTRAST-BODY`<br>Body text below 4.5:1 contrast | Computed WCAG 2.1 contrast ratio below 4.5:1 for text under 24px (or under 18.66px bold), against its resolved background. | DEMONSTRATED | wcag, research_08, impeccable |
| ? | `A-CONTRAST-LARGE`<br>Large text or interface elements below 3:1 | Contrast below 3:1 for text at 24px or above, or 18.66px bold, or for a non-text element that carries meaning. | DEMONSTRATED | wcag |
| ? | `A-NO-FOCUS-VISIBLE`<br>No visible focus indicator | No rule in the stylesheet whose selector contains `:focus-visible` or `:focus`. | DEMONSTRATED | wcag, impeccable, chess_tee_forge |
| ? | `A-HEADING-ORDER`<br>Heading levels out of order, or an h1 that is not the subject | Zero or more than one `<h1>`; a jump of more than one level going down; or an `<h1>` inside `<nav>` or `<header>` whose text matches the site wordmark. | DEMONSTRATED | wcag |
| ?! | `F-DARK-MODE-MISSING`<br>No dark mode | No `@media (prefers-color-scheme: dark)` block in the stylesheet. | ASSERTED | research_04 |
| ? | `F-PAGE-BUDGET`<br>Page weight over budget | First-view transfer above 200 KB, or any single category above its line. | MEASURED_HERE | research_11, web_dev_cwv |

## Honesty — claims that cannot be checked, and claims that are not yours

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ? | `H-INVENTED-BRAND`<br>A brand name or logo that does not exist | Reported, not gated. | DEMONSTRATED | chess_tee_forge |
| ?? | `H-QUOTE-ATTRIBUTION`<br>A name set under a quotation | A text block of 12 words or fewer immediately following a `blockquote`, `q`, or an element whose class matches /quote\|testimonial\|words\|pull/, when that block contains a capitalised name pattern, a dash-prefixed name, or a job-title word. | DEMONSTRATED | chess_tee_forge |
| ? | `H-INVENTED-TESTIMONIAL`<br>A testimonial that did not come from a customer | Any testimonial, review or star-rating component present. | ASSERTED | research_08, chess_tee_forge |
| ? | `H-PRESS-LOGOS`<br>A logo wall or 'as seen in' strip | An 'as seen in' / 'trusted by' phrase, or a container whose class names a logo wall. | ASSERTED | research_11 |
| ? | `H-EMPTY-PROOF-SECTION`<br>A proof section with nothing in it | A section whose heading or class names proof, containing no text content beyond its own heading, or containing only elements matching W-PLACEHOLDER-TEXT. | ASSERTED | research_11, hallmark |
| ? | `H-UNSOURCED-METRIC`<br>A number with no method and no date | A numeric claim with no method, date, sample size or source statement within 400 characters. | MEASURED_HERE | research_11, hallmark, chess_tee_forge |
| ?? | `H-SINGLE-SOURCE`<br>The same value written in two places | The same price, phone number, street address or hours string appearing as a literal in 2 or more files of the project. | DEMONSTRATED | chess_tee_forge |
| ? | `H-HIDDEN-PRICE`<br>A price that is not a price | Any of those phrases inside a region whose heading or class names pricing. | MEASURED_HERE | research_11a, research_11 |
| ?! | `H-DECOY-PRICING`<br>The four-column pricing grid with a highlighted middle tier | 3 or more sibling pricing columns, one of which carries a promotional badge. | MEASURED_HERE | research_11a |
| ? | `H-WRONG-LOCAL-DETAIL`<br>A local detail the pipeline did not actually retrieve | Reported, not gated. | ASSERTED | research_08 |
| ?! | `H-OUT-OF-BAND-HIDDEN`<br>A value outside its own stated range, presented as if inside it | Reported, not gated. | DEMONSTRATED | chess_tee_forge |
| ?! | `H-ASSUMPTION-UNLABELLED`<br>An assumption presented as a measurement | Reported, not gated. | DEMONSTRATED | chess_tee_forge, research_08a |
| ? | `H-SPEC-BUILD-PORTFOLIO`<br>An unsolicited build presented as client work | When a project is flagged as speculative, all of: a `noindex` robots meta, a visible non-dismissible banner stating what the page is, no logo reproduction, no working booking or payment path, and a robots.txt written alongside. | ASSERTED | research_11 |

## Structure — the shape of the document underneath the paint

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ? | `S-SECTION-INVENTORY`<br>The same section inventory regardless of trade | Reported, not gated. | DEMONSTRATED | citrous_oyster, research_08a |
| ? | `S-DENSITY-MISMATCH`<br>A dense layout holding thin content | A grid declaring 3 or more columns while the page's total content item count is 4 or fewer. | MEASURED_HERE | research_08a |
| ? | `S-TEL-PRIMARY`<br>No phone link, or a form as the primary action | No `<a href="tel:">` anywhere in the document. | ASSERTED | citrous_oyster, research_11 |
| ?! | `S-STICKY-CALL-BAR`<br>No way to call from the middle of the page on a phone | No fixed or sticky call affordance defined inside a narrow-viewport media query, on a page that has a `tel:` link. | MEASURED_HERE | research_11a, research_11 |
| ?! | `S-ABOVE-FOLD`<br>The first screen does not say who, what, where and how to call | Fewer than 4 of: business name, trade descriptor, neighbourhood or address, tappable phone number, rendered within the first 667 CSS pixels at 375px width. | ASSERTED | citrous_oyster |
| ?! | `S-LOCALBUSINESS-SCHEMA`<br>No LocalBusiness structured data | No JSON-LD block with a LocalBusiness-family `@type`. | MEASURED_HERE | research_11 |
| ?! | `S-SHARE-PREVIEW`<br>No link preview image or theme colour | No `og:image`, or no `theme-color`. | MEASURED_HERE | research_11a |
| ?! | `S-BOILERPLATE-IDENTICAL`<br>Required boilerplate that is byte-identical across every build | A required-boilerplate block whose normalised text is byte-identical to the same block in a previously-built site in the ledger. | MEASURED_HERE | research_08a |

## Tier 3 — copy, which for a teaching practice may matter most of all

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ? | `W-FALSIFIABILITY`<br>A sentence that cannot be true or false | Reported, not gated. | ASSERTED | gesso, research_11 |
| ?? | `W-BENEFIT-SPEAK`<br>Benefit-speak | One or more lexicon terms in visible copy. | DEMONSTRATED | gesso |
| ? | `W-NOT-X-BUT-Y`<br>The 'not just X, it's Y' cadence | A sentence opening with 'not just', 'more than just', "it's not (just) a/an/about" or "isn't just", followed by a contrasting clause. | DEMONSTRATED | gesso |
| ? | `W-EM-DASH`<br>An em dash in short interface copy | A U+2014 EM DASH in a visible text block of 140 characters or fewer. | DEMONSTRATED | gesso |
| ?? | `W-FABRICATED-PRECISION`<br>Fabricated precision | Any of: a 99.9-class uptime figure, an Nx multiplier, '#1', 'trusted by' followed by a round crowd number, an un-abbreviated figure of 10,000 or more, or a vague plural crowd claim. | DEMONSTRATED | gesso |
| ?? | `W-BANNED-STAT-94`<br>The 94% first-impressions statistic | A 94% or 97% figure within 80 characters of 'first impression' or 'design'. | DEMONSTRATED | research_04, research_11 |
| ?! | `W-RULE-OF-THREE`<br>Every list is exactly three items | 3 or more lists on the page, all of exactly 3 items. | ASSERTED | research_08 |
| ?! | `W-CATEGORY-MISMATCH`<br>Items that do not belong in the same list | Reported, not gated. | ASSERTED | research_08 |
| ? | `W-STALE-COPYRIGHT`<br>An out-of-date copyright year | A copyright year earlier than the current year. | DEMONSTRATED | research_04 |
| ?? | `W-PLACEHOLDER-TEXT`<br>Placeholder text shipped | Any of those strings in visible copy. | DEMONSTRATED | chess_tee_forge |
| ? | `W-WEASEL-TRUST`<br>Unearned trust language | Any of those phrases in visible copy, unless an adjacent element supplies the specific award, the specific client, or the specific measurement. | ASSERTED | hallmark, research_08 |
| ?! | `W-PROSE-AS-BULLETS`<br>Prose broken into bullets | A list of 3 or more items averaging over 120 characters each and ending in full stops. | ASSERTED | research_08 |

## Craft — the details that separate considered from competent

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ? | `TY-BODY-SIZE`<br>Body text below the tested floor | Resolved body `font-size` below 19px is a warning; below 16px is a failure, because that is the iOS-zoom floor as well. | DEMONSTRATED | govuk, research_11 |
| ?! | `TY-H1-CAP`<br>The headline is bigger than confidence | H1 maximum size above 3.6rem / 58px, taking the upper bound of any `clamp()`. | ASSERTED | research_11 |
| ?! | `TY-H1-MEASURE`<br>The headline runs too wide | No `max-width` in `ch` on the H1, or a value above 22ch. | MEASURED_HERE | research_11 |
| ?! | `TY-BODY-MEASURE`<br>Body text lines too long or too short | No `max-width` in `ch` on body paragraphs, or a value outside 55-78ch. | ASSERTED | impeccable, research_11 |
| ?! | `TY-TRACKING-LADDER`<br>Tracking applied as a style rather than a correction | Negative letter-spacing on text below 16px; any negative tracking on body copy; or a display heading above 36px with no negative tracking at all. | MEASURED_HERE | research_11 |
| ? | `TY-GOOGLE-FONTS-LINK`<br>Fonts linked from Google rather than self-hosted | Any reference to `fonts.googleapis.com` or `fonts.gstatic.com`. | MEASURED_HERE | research_11 |
| ? | `TY-PRELOAD-CROSSORIGIN`<br>Font preloaded without crossorigin | A `rel="preload" as="font"` link with no `crossorigin` attribute. | DEMONSTRATED | research_11 |
| ? | `TY-FONT-DISPLAY`<br>font-display missing or set to optional | `font-display: optional`, or no `font-display` inside an `@font-face` block. | MEASURED_HERE | research_11 |
| ?! | `TY-FONT-FALLBACK`<br>No metric-matched fallback font | An `@font-face` loading a webfont with no companion fallback face carrying `size-adjust` or `ascent-override`. | MEASURED_HERE | research_11, research_08 |
| ?! | `TY-FONT-UNSUBSET`<br>A self-hosted font that was never subset | A self-hosted `woff2` over 60 KB, or total font weight over 25 KB for the page. | MEASURED_HERE | research_11 |
| ?! | `TY-BODY-TRACKING`<br>Letter-spacing applied to body copy | Any `letter-spacing` other than `normal` or `0` on a body-text selector, beyond -0.011em. | ASSERTED | research_11 |
| ?! | `TY-TABULAR-NUMS`<br>Numbers in a column that do not line up | A table, definition list or price/hours/stat component with no `tabular-nums` anywhere in the stylesheet. | ASSERTED | impeccable, research_11a |
| ?! | `TY-BROWSER-SURFACES`<br>Unthemed browser surfaces | None of `::selection`, `caret-color`, `text-underline-offset` or `accent-color` defined anywhere. | ASSERTED | impeccable |
| ?! | `C-HEX-CENSUS`<br>More than three colours with presence | More than 5 perceptually distinct colour groups each used 3 or more times, after grouping colours within OKLAB distance 0.04 of each other (so a five-step off-white ramp counts as one group, which is what it is). | MEASURED_HERE | research_11 |
| ? | `C-WARM-COOL-SPLIT`<br>Warm grounds with cool greys | The circular hue distance between the page's dominant ground colour and its dominant neutral text colour exceeds 45 degrees, when both carry chroma of at least 0.004. | ASSERTED | hallmark, research_11 |
| ?! | `C-ACCENT-COVERAGE`<br>The accent covering too much of the screen | Accent-coloured pixels above 5% of the first viewport. | ASSERTED | hallmark, research_11 |
| ? | `C-DARK-HUE-SHIFT`<br>The accent changes character in dark mode | A custom property whose value in the dark theme differs in OKLCH hue from its light value by more than 12 degrees. | ASSERTED | research_08, research_11a |
| ?! | `C-DARK-SHADOW-ELEVATION`<br>Shadow used for depth on a dark background | A `box-shadow` other than `none` defined inside a dark-theme block. | ASSERTED | research_08 |
| ? | `C-THEME-CONTRACT`<br>The three-state theme pattern not followed | Any of the three states missing; or a custom property whose ONLY definition is inside a media query or an attribute selector; or a `prefers-color-scheme: dark` block not guarded with `:root:not([data-theme="light"])`. | DEMONSTRATED | chess_tee_forge |
| ?! | `C-THEME-DEAD-CODE`<br>Theme scaffolding with no toggle behind it | `[data-theme]` selectors present in CSS with no script reference to the attribute anywhere in the page. | MEASURED_HERE | research_11a |
| ?! | `C-OKLCH-LITERAL`<br>oklch() shipped without a hex fallback | An `oklch()`, `oklab()`, `lch()` or `lab()` value with no hex or rgb declaration of the same property immediately preceding it in the same rule. | ASSERTED | research_08 |
| ? | `C-HUE-ONLY-STATE`<br>Meaning carried by colour alone | Reported, not gated. | ASSERTED | research_11a, wcag |
| ?! | `C-LAYERED-OFFWHITES`<br>White cards on a grey page | A card or panel background of pure white sitting on a page ground darker than OKLCH lightness 0.97. | MEASURED_HERE | research_11 |
| ? | `MAT-GRAIN-LIVE-FILTER`<br>Grain applied as a live filter rather than a tile | `feTurbulence` referenced from a `filter` property rather than from `background-image`, or a `baseFrequency` that is animated. | MEASURED_HERE | research_11, css_tricks_grain |
| ? | `MAT-GRAIN-PNG`<br>A PNG noise tile instead of generated grain | An image file named for noise or grain, or a base64 PNG data URI over about 3 KB used as a repeating background. | MEASURED_HERE | research_11 |
| ?! | `MAT-GRAIN-OPACITY`<br>Grain outside the usable opacity band | Grain-layer opacity above 0.08 or below 0.02. | ASSERTED | research_08 |
| ? | `MAT-HERO-VIDEO`<br>An autoplaying hero video | A `<video autoplay>` anywhere on the page. | ASSERTED | research_08 |
| ? | `MAT-KENBURNS-DIRECTION`<br>Ken Burns animating up to the larger scale | A keyframe animation whose starting scale is smaller than its ending scale, on an image. | ASSERTED | research_08 |
| ? | `MAT-WEBGL`<br>A WebGL or shader library shipped | Any reference to a WebGL library or a `webgl` canvas context. | MEASURED_HERE | research_11 |
| ?! | `MAT-IMAGE-TREATMENT`<br>A photograph with no treatment | An `<img>` in the document with no `aspect-ratio` and no `object-fit` declared for it. | ASSERTED | research_08, research_11 |
| ?! | `MAT-CSS-SIGNATURE`<br>No hand-built element specific to this business | Reported as an opportunity, never as a failure. | DEMONSTRATED | hallmark, research_08a |
| ?! | `MAT-SLIDER-UNGATED`<br>A before/after slider without its gates | A comparison slider present. | ASSERTED | research_08 |

## The trap tier — reads as sophisticated today, will read as generated soon

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?! | `TRAP-CREAM-WASH`<br>The warm cream ground | The page's dominant ground colour at OKLCH hue 50-100, chroma above 0.012, lightness above 0.90 — i.e. | DEMONSTRATED | gesso |
| ? | `TRAP-CREAM-PACKAGE`<br>The full cream-and-serif package | All three present: a cream ground by the TRAP-CREAM-WASH test, a serif family on display headings, and uppercase monospace or widely-tracked small labels. | ASSERTED | research_11 |
| ? | `TRAP-ITALIC-IN-HEADING`<br>An italic word inside an upright heading | An `<em>` or `<i>` element, or a `font-style: italic` rule, inside an `<h1>`, `<h2>` or `<h3>`. | ASSERTED | hallmark |
| ?! | `TRAP-SAFE-GREEN`<br>Emerald as the not-purple accent | The exact emerald hexes, or an accent at OKLCH hue 150-175 with chroma above 0.12 and lightness 0.60-0.80. | DEMONSTRATED | gesso, research_11a |
| ?! | `TRAP-SECTION-NUMBERS`<br>Editorial section numbering | Two or more zero-padded section numbers used as labels. | DEMONSTRATED | gesso, impeccable |
| ?! | `TRAP-BENTO`<br>The bento grid as the default layout | A grid of 4 or more columns where child items use two or more different `grid-column: span N` values. | ASSERTED | research_04, research_08 |
| ?! | `TRAP-KINETIC-TYPE`<br>Viewport-scaled kinetic display type | A display `font-size` whose clamp maximum is 5rem (80px) or greater. | ASSERTED | research_04, research_11 |
| ?! | `TRAP-LUCIDE-FIVE`<br>The five predictable icon glyphs | Two or more of the named glyphs, by class or icon name. | ASSERTED | febbhav |
| ?! | `TRAP-GLASSMORPHISM`<br>Glassmorphism as a design language | Two or more `backdrop-filter` declarations, i.e. | ASSERTED | research_04, research_08 |
| ? | `TRAP-MODERN-BY-LIST`<br>A design chosen from a what-is-modern list | 5 or more of the eight named cluster members firing on the same page. | MEASURED_HERE | research_08 |

## Variety — the tell that is not on any single page

| | Rule | What it looks for | Confidence | Sources |
|---|---|---|---|---|
| ?? | `V-SKELETON`<br>This page has the same section skeleton as one you already shipped | The `skeleton` hash equals that of any different site among the last 12 ledger entries. | MEASURED_HERE | research_08, hallmark |
| ?? | `V-STYLE-SKELETON`<br>This stylesheet is a previous one with different values | The value-blind `style_skeleton` hash equals that of any different site among the last 12 ledger entries. | MEASURED_HERE | research_08a |
| ? | `V-AGGREGATE-SIMILARITY`<br>This page is a near-copy of one you already shipped | Weighted facet distance to the nearest different site in the last 12 entries below 0.15. | MEASURED_HERE | measured_here |
| ? | `V-PALETTE-MODE-COLLAPSE`<br>One palette used far more often than the others, or options never used at all | One palette family above 50% of the last 12 builds, or fewer than 60% of the declared options ever used. | MEASURED_HERE | research_08a |
| ? | `V-NO-LEDGER`<br>Building repeatedly with no ledger | No ledger file found, or fewer entries in it than the number of sites under this operator's directory. | ASSERTED | research_08 |

## Sources

| id | Who | What it contributes | Confidence |
|---|---|---|---|
| `gesso` | undefined | undefined | — |
| `hallmark` | undefined | undefined | — |
| `krebs` | undefined | undefined | — |
| `kowalski` | undefined | undefined | — |
| `comeau` | undefined | undefined | — |
| `citrous_oyster` | undefined | undefined | — |
| `febbhav` | undefined | undefined | — |
| `freiberg` | undefined | undefined | — |
| `impeccable` | undefined | undefined | — |
| `chess_tee_forge` | undefined | undefined | — |
| `research_08` | undefined | undefined | — |
| `research_08a` | undefined | undefined | — |
| `research_04` | undefined | undefined | — |
| `research_11` | undefined | undefined | — |
| `research_11a` | undefined | undefined | — |
| `research_05_synthesis` | undefined | undefined | — |
| `govuk` | undefined | undefined | — |
| `wcag` | undefined | undefined | — |
| `web_dev_cwv` | undefined | undefined | — |
| `css_tricks_grain` | undefined | undefined | — |
| `measured_here` | undefined | undefined | — |

