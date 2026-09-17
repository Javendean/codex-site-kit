/**
 * Composing a site that passes the rulebook.
 *
 * Two things this file is doing that a normal scaffolder does not.
 *
 * 1. It is written against the rulebook in ../rules, and the test suite asserts
 *    that what it emits comes back clean from review_site. A scaffolder that
 *    fails its own linter is teaching the wrong thing on the first run.
 *
 * 2. The structure is chosen from a LEDGER, not from a default. research/08-craft.md
 *    is explicit that this is the only mechanism that works: "Variety must be
 *    enforced by a ledger that records what was emitted last, not merely enabled
 *    by having options." research/08a-sitegen-spec.md ranks the axes by how much
 *    they carry, and this follows that ranking — section inventory first, because
 *    "the section identity and count is what makes two pages look like different
 *    jobs rather than one job run twice"; then density; then ground; then type.
 *    Accent hue is last, and is explicitly called cosmetic.
 *
 * The copy is holes, not filler. Every unwritten field is a `data-placeholder`
 * element that says what belongs there — the storefront's dashed-box pattern.
 * Nothing invents a fact, a number, a quotation or a name.
 */

import { paletteCss } from './palette_rules.js';

/* ------------------------------------------------------------------ *
 * The axes
 * ------------------------------------------------------------------ */

/**
 * Section inventories. The highest-carry axis: identity and COUNT, not order
 * alone. Each is a different account of what the visitor needs to know first.
 */
export const INVENTORIES = {
  'lead-with-the-work': ['hero', 'lesson', 'photo', 'suits', 'rates', 'when', 'contact'],
  'lead-with-the-person': ['hero', 'about', 'photo', 'teach', 'lesson', 'rates', 'contact'],
  'lead-with-the-question': ['hero', 'answer', 'lesson', 'suits', 'photo', 'when', 'contact'],
  'lead-with-the-schedule': ['hero', 'when', 'lesson', 'photo', 'rates', 'about', 'contact'],
  'lead-with-the-record': ['hero', 'record', 'teach', 'photo', 'lesson', 'when', 'contact'],
  'lead-with-the-first-step': ['hero', 'first', 'photo', 'lesson', 'rates', 'about', 'contact']
};

/** Hero families. The second-highest carry, and the part seen before any scrolling. */
export const HEROES = ['type-led', 'statement-and-facts', 'split-with-photo', 'list-led', 'question-led'];

/**
 * Type pairings, all from system stacks so nothing is downloaded.
 *
 * ⚠️ research/08-craft.md §6.1 states the conflict this cannot escape: under a
 * no-external-requests constraint the answer is a system stack, and on Android
 * the generic sans resolves to Roboto, which is on the overused-face list. So
 * every pairing here has a NAMED display face first and the generic only as the
 * last resort, and the notes say this out loud. The real escape is inlining one
 * subsetted display face — the sweep measured that at about 43 KB, 66 ms on a
 * 5 Mbps connection — and this scaffolder leaves that to a deliberate decision
 * rather than making it for you.
 */
export const TYPE_PAIRINGS = {
  'iowan-over-sans': {
    display: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
    body: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
    label: 'a book serif for the headings, the system sans for reading'
  },
  'charter-over-sans': {
    display: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif",
    body: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
    label: 'a newspaper serif for the headings, the system sans for reading'
  },
  'sans-over-georgia': {
    display: "Optima, Candara, 'Gill Sans', 'Gill Sans MT', 'Trebuchet MS', ui-sans-serif, sans-serif",
    body: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
    label: 'a humanist sans for the headings, a serif for reading, which is the inverse of the usual'
  },
  'hoefler-over-sans': {
    display: "'Hoefler Text', 'Baskerville Old Face', Baskerville, 'Times New Roman', serif",
    body: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
    label: 'a high-contrast serif for the headings, the system sans for reading'
  },
  'avenir-over-serif': {
    display: "'Avenir Next', Avenir, Corbel, 'Segoe UI', ui-sans-serif, sans-serif",
    body: "Charter, 'Sitka Text', Georgia, serif",
    label: 'a geometric sans for the headings, a text serif for reading'
  }
};

/**
 * Corner, shadow and border language.
 *
 * research/08a-sitegen-spec.md marks this axis 🎲 hash-seeded and says why:
 * "nothing derives it, so say so". It is not derived from the subject and this
 * file does not pretend otherwise.
 */
export const SURFACES = {
  hairline: { radius: '4px', shadow: 'none', border: '1px solid var(--hairline)', panel: 'var(--paper)', label: 'hairlines, almost no radius, no shadow' },
  soft: { radius: '12px', shadow: '0 1px 2px rgba(0, 0, 0, .06)', border: 'none', panel: 'var(--paper-raised)', label: 'a 12px radius and one very light shadow' },
  sunk: { radius: '8px', shadow: 'none', border: 'none', panel: 'var(--paper-sunk)', label: 'inset panels, no borders, no shadow' },
  ruled: { radius: '2px', shadow: 'none', border: 'none', panel: 'var(--paper)', rule: true, label: 'horizontal rules between rows, square corners' }
};

export const DENSITIES = {
  roomy: { section: 'clamp(3.5rem, 8vw, 6.5rem)', gap: '1.5rem', measure: '62ch' },
  close: { section: 'clamp(2.25rem, 5vw, 4rem)', gap: '1rem', measure: '68ch' }
};

/* ------------------------------------------------------------------ *
 * Copy — holes, never filler
 * ------------------------------------------------------------------ */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A visible, labelled hole. The storefront's dashed-box pattern, in words. */
const hole = (name, what) =>
  `<p class="hole" data-placeholder="${esc(name)}">${esc(what)}</p>`;

const holeInline = (name, what) =>
  `<span class="hole hole--inline" data-placeholder="${esc(name)}">${esc(what)}</span>`;

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function heroSection(family, { subject, siteName }) {
  const name = esc(siteName);
  const heading = `<h1>${name}</h1>`;

  if (family === 'type-led') {
    return `    <section class="hero hero--type">
      ${heading}
      <p class="lede">${hole('what you do, in one sentence', 'One sentence here saying what you actually do and for whom. Write it so it could be false: a sentence nobody could disagree with is not telling anyone anything.')}</p>
      <p class="actions"><a class="btn" href="#contact">Get in touch</a></p>
    </section>`;
  }

  if (family === 'statement-and-facts') {
    return `    <section class="hero hero--facts">
      <div class="hero__say">
        ${heading}
        <p class="lede">${hole('the one sentence', 'One sentence saying what you do and for whom.')}</p>
        <p class="actions"><a class="btn" href="#contact">Get in touch</a></p>
      </div>
      <dl class="facts">
        <div><dt>Since</dt><dd>${holeInline('the year you started', 'the year')}</dd></div>
        <div><dt>Where</dt><dd>${holeInline('where you are', 'the place')}</dd></div>
        <div><dt>Who for</dt><dd>${holeInline('who it is for', 'the people')}</dd></div>
      </dl>
    </section>`;
  }

  if (family === 'split-with-photo') {
    return `    <section class="hero hero--split">
      <div class="hero__say">
        ${heading}
        <p class="lede">${hole('the one sentence', 'One sentence saying what you do and for whom.')}</p>
        <p class="actions"><a class="btn" href="#contact">Get in touch</a></p>
      </div>
      <figure class="photo" data-photo-slot="the one photograph">
        <div class="photo__frame" aria-hidden="true"></div>
        <figcaption>A photograph belongs here: the room, the board, the work, or you. Take it on your phone. One real photograph is the only thing on this page a visitor can check against the world, and it beats every stock image ever licensed.</figcaption>
      </figure>
    </section>`;
  }

  if (family === 'list-led') {
    return `    <section class="hero hero--list">
      ${heading}
      <p class="lede">${hole('the one sentence', 'One sentence saying what you do and for whom.')}</p>
      <ul class="plain">
        <li>${holeInline('the first thing', 'The first thing someone needs to know.')}</li>
        <li>${holeInline('the second thing', 'The second thing.')}</li>
        <li>${holeInline('the third thing', 'The third, and if there is no third, delete this line rather than finding one.')}</li>
        <li>${holeInline('anything else', 'Anything else that is actually true. Lists of exactly three are a habit, not a count.')}</li>
      </ul>
      <p class="actions"><a class="btn" href="#contact">Get in touch</a></p>
    </section>`;
  }

  // question-led
  return `    <section class="hero hero--question">
    ${heading}
    <p class="ask">${hole('the question a visitor arrives with', 'The question someone actually arrives with, in their words rather than yours.')}</p>
    <p class="lede">${hole('your answer', 'Your answer to it, in one sentence.')}</p>
    <p class="actions"><a class="btn" href="#contact">Get in touch</a></p>
  </section>`;
}

const SECTIONS = {
  lesson: {
    heading: 'What actually happens',
    body: () => `      <p>${hole('what happens, step by step', 'Describe what a session actually consists of, in order, in plain words. Specifics beat adjectives: what you open with, what you work on, what the person leaves with.')}</p>`
  },
  suits: {
    heading: 'Who this suits, and who it does not',
    body: () => `      <p>${hole('who it suits', 'Who this is right for.')}</p>
      <p>${hole('who it does not suit', 'And who it is not right for. Saying this out loud is the most persuasive paragraph on most pages, because nobody writes it.')}</p>`
  },
  rates: {
    heading: 'What it costs',
    body: () => `      <p>${hole('the rate', 'The rate. Write it once, here, and nowhere else on the site. A second copy of a price is a second price, and it will drift.')}</p>
      <p>${hole('what is included', 'What that includes, and what it does not.')}</p>`
  },
  when: {
    heading: 'Where and when',
    body: () => `      <dl class="rows">
        <div><dt>Where</dt><dd>${holeInline('the place', 'the place')}</dd></div>
        <div><dt>When</dt><dd>${holeInline('the hours', 'the hours')}</dd></div>
        <div><dt>Getting there</dt><dd>${holeInline('how to arrive', 'how someone arrives')}</dd></div>
      </dl>`
  },
  about: {
    heading: 'About',
    body: () => `      <p>${hole('who you are', 'Who you are, and the one fact about you that is checkable. A qualification, a title, a year, a place. One checkable fact is worth more than a paragraph of adjectives.')}</p>`
  },
  teach: {
    heading: 'What is taught',
    body: () => `      <p>${hole('what you teach', 'What you teach, and in what order, and why that order. The reasoning is the part that shows you have one.')}</p>`
  },
  record: {
    heading: 'The record',
    body: () => `      <p>${hole('what you have actually done', 'What you have actually done, with the numbers you can support and no others. If a figure is not in your own records, leave the space here rather than filling it — an unfilled space is honest and a fabricated number is not.')}</p>`
  },
  answer: {
    heading: 'The short answer',
    body: () => `      <p>${hole('the short answer', 'The short answer to the question above, before any qualifications.')}</p>`
  },
  first: {
    heading: 'The first lesson',
    body: () => `      <p>${hole('what the first session is', 'What the first session is, what it costs, and what happens at the end of it.')}</p>`
  },
  photo: {
    heading: 'The room',
    body: () => `      <figure class="photo" data-photo-slot="the one photograph">
        <div class="photo__frame" aria-hidden="true"></div>
        <figcaption>A photograph belongs here: the room, the board, the work, or you. Take it on your phone. One real photograph is the only thing on this page a visitor can check against the world, and it beats every stock image ever licensed. A stock photograph is worse than none, because it is close enough to the real thing to invite the comparison and to lose it.</figcaption>
      </figure>`
  },
  contact: {
    heading: 'Get in touch',
    body: () => `      <p>${hole('how to reach you', 'How to reach you. Put the real address or number here, once. The rest of the site should link to this section rather than repeating it.')}</p>
      <p class="actions"><a class="btn" href="#contact">Write to me</a></p>`
  }
};

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

function renderCss({ palette, type, surface, density }) {
  const pairing = TYPE_PAIRINGS[type];
  const s = SURFACES[surface];
  const d = DENSITIES[density];

  return `/* ------------------------------------------------------------------
   Colour.

   The complete light palette sits on bare :root, so it exists in the state
   most visitors are actually in. Dark is defined twice: once for a machine
   set to dark — guarded so an explicit light choice still wins — and once
   for the toggle. Three states, not two.

   Authored in OKLCH and emitted as hex on purpose. An oklch() literal that
   an old in-app WebView cannot parse drops the declaration, and on a text
   colour that means invisible text.
   ------------------------------------------------------------------ */

${paletteCss(palette)}

:root {
  --font-display: ${pairing.display};
  --font-body: ${pairing.body};

  --radius: ${s.radius};
  --shadow: ${s.shadow};
  --panel: ${s.panel};

  --section: ${d.section};
  --gap: ${d.gap};
  --measure: ${d.measure};
  --gutter: clamp(1.25rem, 5vw, 3rem);
  --max: 68rem;

  /* Entrances are ease-out and under 300ms. Plain \`ease\` has an ease-IN
     component, which is the sluggish signature. */
  --ease-out: cubic-bezier(0.33, 1, 0.68, 1);
  --dur-press: 120ms;
}

/* clip, not hidden: hidden creates a scroll container, which breaks
   position: sticky and can trap keyboard focus. */
html, body { overflow-x: clip; }

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 1.0625rem;
  line-height: 1.6;
  -webkit-text-size-adjust: 100%;
}

/* The browser surfaces nobody draws still belong to the design. */
::selection { background: var(--accent); color: var(--on-accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
::marker { color: var(--ink-muted); }

.wrap { max-width: var(--max); margin-inline: auto; padding-inline: var(--gutter); }

h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1.12;
  letter-spacing: -0.012em;
  text-wrap: balance;
  overflow-wrap: anywhere;
  min-width: 0;
  margin: 0 0 0.5em;
}
h1 { font-size: clamp(2rem, 5vw + 0.5rem, 3.25rem); }
h2 { font-size: clamp(1.4rem, 2.4vw + 0.6rem, 1.9rem); }
p { max-width: var(--measure); margin: 0 0 1em; }

a { color: var(--accent); text-underline-offset: 0.18em; }

.skip {
  position: absolute; left: -9999px; top: 0;
  background: var(--paper-raised); color: var(--ink);
  padding: 0.75rem 1rem; border-radius: var(--radius); z-index: 10;
}
.skip:focus { left: 0.5rem; top: 0.5rem; }

/* ---- header and footer -------------------------------------------- */

.masthead {
  border-bottom: 1px solid var(--hairline);
  padding-block: 1rem;
}
.masthead .wrap { display: flex; flex-wrap: wrap; gap: var(--gap); align-items: baseline; justify-content: space-between; }
.wordmark { font-family: var(--font-display); font-size: 1.0625rem; font-weight: 600; color: var(--ink); text-decoration: none; }
.masthead nav ul { display: flex; flex-wrap: wrap; gap: 1.25rem; list-style: none; margin: 0; padding: 0; }
.masthead nav a { color: var(--ink-muted); text-decoration: none; }
.masthead nav a:hover, .masthead nav a:focus-visible { color: var(--ink); text-decoration: underline; }

.colophon {
  border-top: 1px solid var(--hairline);
  padding-block: 2rem 3rem;
  color: var(--ink-muted);
  font-size: 0.9375rem;
}

/* ---- sections ------------------------------------------------------ */

section { padding-block: var(--section); }
section + section { border-top: 1px solid var(--hairline); }

.hero { padding-block: calc(var(--section) * 0.8) calc(var(--section) * 1.05); }
.hero .lede { font-size: 1.1875rem; color: var(--ink-muted); }
.hero--split { display: grid; grid-template-columns: minmax(0, 1fr); gap: calc(var(--gap) * 2); align-items: start; }
.hero--facts { display: grid; grid-template-columns: minmax(0, 1fr); gap: calc(var(--gap) * 1.5); }
.ask { font-family: var(--font-display); font-size: 1.25rem; color: var(--ink); }

@media (min-width: 52rem) {
  .hero--split { grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); }
  .hero--facts { grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.6fr); }
}

.facts, .rows { margin: 0; }
.facts > div, .rows > div {
  display: grid; grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
  gap: 0.75rem; padding-block: 0.65rem;${s.rule ? '\n  border-bottom: 1px solid var(--hairline);' : ''}
}
.facts dt, .rows dt { color: var(--ink-muted); font-size: 0.9375rem; }
.facts dd, .rows dd { margin: 0; }

.plain { list-style: none; margin: 0 0 1.5rem; padding: 0; max-width: var(--measure); }
.plain li { padding-block: 0.5rem; border-bottom: 1px solid var(--hairline); }

/* ---- the photograph slot ------------------------------------------- */

.photo { margin: 0; }
.photo__frame {
  aspect-ratio: 4 / 3;
  border: 1px dashed var(--hairline);
  border-radius: var(--radius);
  background: var(--panel);
}
.photo figcaption { margin-top: 0.75rem; font-size: 0.9375rem; color: var(--ink-muted); max-width: var(--measure); }

/* ---- holes ---------------------------------------------------------
   An unfilled field drawn AS an unfilled field. A premature sentence is
   worse than none, so the dashed box is the design. Delete the
   data-placeholder attribute when the real words go in.
   ------------------------------------------------------------------ */

.hole {
  border: 1px dashed var(--hairline);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--ink-muted);
  padding: 0.85rem 1rem;
}
.hole--inline { display: inline-block; padding: 0.15rem 0.5rem; }

/* ---- the button ----------------------------------------------------
   These four rules ship together. Guarding hover alone would leave a
   phone with no feedback at all, which is worse than the stuck hover
   state the guard fixes.
   ------------------------------------------------------------------ */

.btn {
  display: inline-block;
  background: var(--accent);
  color: var(--on-accent);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.7rem 1.15rem;
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: transform var(--dur-press) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .btn:hover { transform: translateY(-2px); }
}
.btn:active { transform: translateY(0) scale(0.97); }
@media (pointer: coarse) {
  .btn { min-height: 48px; display: inline-flex; align-items: center; }
}

input, select, textarea {
  font: inherit;
  font-size: 16px; /* below 16px iOS zooms on focus and never zooms back */
  border: 1px solid var(--hairline);
  border-radius: var(--radius);
  background: var(--paper-raised);
  color: var(--ink);
  padding: 0.6rem 0.7rem;
}

@media (prefers-reduced-motion: reduce) {
  /* Swap the motion, do not nuke it: a universal !important reset kills
     animations that were already safe and can speed up JS-driven ones. */
  .btn { transition: none; }
  .btn:active { transform: none; background: var(--paper-sunk); color: var(--ink); }
}

@media print {
  .masthead nav, .actions { display: none; }
  body { background: #fff; color: #111; }
}
`;
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

function renderPage({ subject, siteName, choices, year }) {
  const inventory = INVENTORIES[choices.inventory];
  const nav = inventory.filter((id) => id !== 'hero').slice(0, 4);

  const body = inventory
    .map((id) => {
      if (id === 'hero') return heroSection(choices.hero, { subject, siteName });
      const section = SECTIONS[id];
      if (!section) return '';
      return `    <section id="${id}">
      <h2>${esc(section.heading)}</h2>
${section.body()}
    </section>`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(siteName)}</title>
<meta name="description" content="${esc(subject)}">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>

<header class="masthead">
  <div class="wrap">
    <a class="wordmark" href="./">${esc(siteName)}</a>
    <nav aria-label="Sections of this page">
      <ul>
${nav.map((id) => `        <li><a href="#${id}">${esc(SECTIONS[id].heading)}</a></li>`).join('\n')}
      </ul>
    </nav>
  </div>
</header>

<main id="main" class="wrap">
${body}
</main>

<footer class="colophon">
  <div class="wrap">
    <p>${esc(siteName)}. ${holeInline('how to reach you', 'the address or number, written once')}</p>
    <p>&copy; ${year} ${esc(siteName)}</p>
  </div>
</footer>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * The notes file — the reasoning, kept with the site
 * ------------------------------------------------------------------ */

function renderNotes({ subject, siteName, choices, palette, notes }) {
  const pairing = TYPE_PAIRINGS[choices.type];
  const surface = SURFACES[choices.surface];

  return `# ${siteName}: how this page was put together

Scaffolded by codex-site-kit for: ${subject}

Nothing here is decoration. Each choice below is on a named axis, and the axes
are ranked by how much they carry — section inventory first, colour last. If
you change one thing, change the inventory; recolouring is the axis the
research ranks lowest.

## What was chosen, and why it is not the same as last time

| Axis | This site | Why it varies |
|---|---|---|
| Section inventory | \`${choices.inventory}\` | The highest-carry axis. The identity and COUNT of the sections is what makes two pages look like different jobs rather than one job run twice. |
| Hero | \`${choices.hero}\` | The part seen before anything is scrolled. |
| Type pairing | \`${choices.type}\` | ${pairing.label}. |
| Surface language | \`${choices.surface}\` | ${surface.label}. Nothing derives this from the subject. It is chosen from the ledger, and saying so is the honest version. |
| Density | \`${choices.density}\` | Space, not size. |
| Anchor hue | ${Math.round(palette.anchor_hue)}° | ${palette.provenance ?? 'not recorded'} |

These were not picked at random. A local ledger records what was emitted last
and this scaffold is forbidden from repeating the structural axes. Random
choice repeats: with six options and a fair draw, two consecutive scaffolds
collide one time in six — and one time in six is often enough to be the two
someone happens to see side by side.

## The rules this page already keeps

- Three theme states, not two: the full light palette on bare \`:root\`, dark
  under \`prefers-color-scheme\` guarded so an explicit light choice wins, and
  dark again under \`[data-theme="dark"]\`.
- Every neutral carries a trace of the anchor hue rather than being a flat
  grey, and nothing is pure #000 or #fff.
- Press feedback and a hover guard ship together. On a phone there is no
  hover; an unguarded \`:hover\` sticks after a tap on Android.
- Buttons are at least 48px tall on a touch screen, and their labels never wrap.
- Inputs are 16px, because below that iOS zooms on focus and does not zoom back.
- Grid tracks are \`minmax(0, 1fr)\`, never a bare \`1fr\`: bare \`1fr\` takes its
  minimum from an image's intrinsic width and pushes the layout off a phone.
- \`overflow-x: clip\`, not \`hidden\`. \`hidden\` makes a scroll container, which
  breaks sticky positioning and can trap focus.
- No animation on anything above the fold. An element at \`opacity: 0\` does not
  count toward Largest Contentful Paint.
- No eyebrow above the heading, no emoji icons, no coloured side stripes, no
  backdrop blur, no gradient text, no 01/02/03 numbering.

## What is deliberately unfinished

Every dashed box is a \`data-placeholder\`. That is not laziness, it is the
pattern: an unfilled field drawn as an unfilled field. A premature sentence is
worse than none, and a visible hole is a conversation rather than a claim.

There are no testimonials, no ratings, no customer counts and no press
mentions, because none of them are true yet. When the first real one arrives it
will land with the weight of being the only one on the page.

${notes.length ? `## Notes from the palette\n\n${notes.map((n) => `- ${n}`).join('\n')}\n` : ''}
## The one thing that is known to be missing

There is no photograph. That is the highest-value thing left to add, and it
cannot be automated: one real photograph of the actual room, the actual board,
the actual person is the only element on a page that a visitor can check
against the world. A stock photograph is worse than none — close enough to the
real thing to invite the comparison, and to lose it.

## The honest caveat about the fonts

The type pairing uses system fonts, so nothing is downloaded and the page works
with no network. The cost: on Android the generic sans in the fallback chain
resolves to Roboto, which is on every overused-face list there is. The escape
is to inline one subsetted display face — measured at about 43 KB, roughly 66 ms
on a 5 Mbps connection — and that is a decision worth making deliberately
rather than having a scaffolder make for you.

## Next

Run \`review_site\` on this folder. It should come back with no faults and one
note: the empty photograph slot.
`;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * @param {object} o
 * @param {string} o.subject
 * @param {string} o.siteName
 * @param {object} o.palette      from lib/palette_rules.js
 * @param {object} o.choices      {inventory, hero, type, surface, density}
 * @param {Date}   [o.now]
 * @returns {{files: Record<string,string>, choices: object}}
 */
export function composeSite({ subject, siteName, palette, choices, now = new Date() }) {
  const year = now.getFullYear();
  return {
    choices,
    files: {
      'index.html': renderPage({ subject, siteName, choices, year }),
      'styles.css': renderCss({ palette, type: choices.type, surface: choices.surface, density: choices.density }),
      'NOTES.md': renderNotes({ subject, siteName, choices, palette, notes: palette.notes ?? [] })
    }
  };
}

export const AXES = {
  inventory: Object.keys(INVENTORIES),
  hero: HEROES,
  type: Object.keys(TYPE_PAIRINGS),
  surface: Object.keys(SURFACES),
  density: Object.keys(DENSITIES)
};
