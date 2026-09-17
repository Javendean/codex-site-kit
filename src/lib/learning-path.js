/**
 * The learning path.
 *
 * Deliberately NOT an essay. Every word of substance in the route below comes
 * out of the rulebook — each stop names real rule ids, and the reasoning it
 * teaches is the `why` and `fix` those rules already carry. So the course
 * cannot drift away from the tool: change a rule and the path changes with it,
 * and `npm run docs` fails loudly if a stop names a rule that no longer exists.
 *
 * The ORDER is the only thing this file adds, and it is not the rulebook's
 * order. The rulebook is sorted by how fast a visitor notices a fault, which is
 * the right order for a critique and the wrong one for a beginner. A beginner
 * needs: make it work, then make it not look broken, then make it not look
 * generic, then make it honest, then learn why the escape routes keep closing.
 */

import { rulebook, TIER_LABEL as TIERS } from './rulebook.js';

const { rules: RULEBOOK, byId: RULE_INDEX } = rulebook();
const BY_ID = Object.fromEntries(RULEBOOK.map((r) => [r.id, r]));

/**
 * The route. Each stop is a lesson with a claim, a thing to do, and the rules
 * that carry the reasoning.
 */
export const STOPS = [
  {
    n: 1,
    title: 'Make one page exist',
    claim:
      'A website is a text file that a browser knows how to read. There is no installation, no account, and no framework between you and it. Everything after this stop is refinement of something you can already do today.',
    doing: [
      'Ask Codex: "make me a folder called chess-lessons with one page in it". It will call init_site.',
      'Double-click index.html. That is your website. It is open on your screen.',
      'Change one word in the file, save it, press reload in the browser.',
      'That loop — edit, save, reload — is the whole job. Everything else is knowing what to change.'
    ],
    rules: []
  },
  {
    n: 2,
    title: 'The page must not look broken',
    claim:
      'There is a short list of faults that make a page look BROKEN rather than cheap, and the research is explicit that broken is worse. They are not matters of taste. Most of them are one line, and all of them are invisible on the machine you are building on, because they only show up on a phone.',
    doing: [
      'Run review_site and read only the findings in the floor tier first.',
      'Fix them before you look at anything else. Nothing further on this list matters while one of these is live.',
      'Then run check_responsive, which loads the page in a real browser at four phone widths and MEASURES it. The rules below are read out of the source text; only a browser can tell you whether the page actually scrolls sideways.'
    ],
    rules: ['F-VIEWPORT-META', 'F-VIEWPORT-LOCKED', 'F-OVERFLOW-CLIP', 'F-BARE-1FR', 'F-INPUT-16PX', 'F-TAP-TARGET', 'T2-HERO-100VH', 'T1-HSCROLL', 'T1-BUTTON-WRAP', 'A-IMG-ALT', 'W-STALE-COPYRIGHT']
  },
  {
    n: 3,
    title: 'Where colour comes from',
    claim:
      'Every palette on every page was either derived from something real or picked off a menu, and a visitor can tell which within about a second without being able to say why. The single most persuasive colour on a site about a real place is a colour that place actually contains.',
    doing: [
      'Photograph the subject. The room you teach in, the board, the sign on the door.',
      'Run palette_from_image on that photograph. It quantises the image and hands back real values plus a contrast matrix.',
      'Pass those colours to init_site. Now the page is the colour of the thing it is about, and you can say so out loud to anyone who asks.'
    ],
    rules: ['T1-INDIGO-HEX', 'T1-INDIGO-NEAR', 'T1-GRADIENT-3STOP', 'T1-GRADIENT-CLICHE', 'T1-GRADIENT-TEXT', 'T2-PURE-BW', 'T2-ZERO-CHROMA-GREY', 'A-CONTRAST-BODY', 'C-THEME-CONTRACT', 'C-OKLCH-LITERAL']
  },
  {
    n: 4,
    title: 'The quiet voice',
    claim:
      'This is the largest single improvement available and it costs nothing. Measured across two tiers of real sites: everything cheap shouts at weight 900 in uppercase; everything expensive whispers at 400 to 510 and pays back the lost volume with space. An untrained eye cannot see 450 against 900 as a weight — it sees loud against quiet.',
    doing: [
      'Take every heading weight down to about 450.',
      'Cap the biggest headline at 56px, and cap its width at about 18 characters.',
      'Take body text UP to 19px. GOV.UK serves the least technical audience of any digital product in English and has tested this harder than any agency will.',
      'Cap every paragraph at 60 to 70 characters wide.'
    ],
    rules: ['T2-SINGLE-FONT', 'T2-BANNED-FONT', 'T2-KICKER-H1', 'T1-EMOJI-ICON', 'TRAP-ITALIC-IN-HEADING', 'TY-BODY-MEASURE', 'TY-H1-MEASURE']
  },
  {
    n: 5,
    title: 'Ornament that carries no information',
    claim:
      'The test that runs through all of this: what job is this doing? A shadow modelling one light source is depth. A shadow at three arbitrary opacities is a costume. Same CSS property, different answer — and the answer is what a trained eye is reading.',
    doing: [
      'For each decoration on the page, ask what it tells the reader that the page would not otherwise say.',
      'If two of them are the same colour but mark different kinds of thing, the colour is not a signal. It is paint.',
      'Delete the ones that survive neither question. Subtraction is most of what "designed" means here.'
    ],
    rules: ['T2-EDGE-STRIPE', 'T2-PUFFY-SHADOW', 'T2-RADIUS-40', 'T2-PILL-CTA', 'T2-BACKDROP-BLUR', 'T1-UNIFORM-CARDS', 'T1-FAKE-CHROME', 'T2-AI-FOOTER', 'T1-PLACEHOLDER-SRC', 'T1-NO-IMAGES']
  },
  {
    n: 6,
    title: 'The motion budget',
    claim:
      'You get to animate about two things. A generated page typically spends its whole budget on one fade-up applied to a dozen elements — and that uniformity IS the signature, because one library has been emitting exactly that since 2015. Spend the budget on what responds to the VISITOR instead, and the page reads as more considered while doing strictly less.',
    doing: [
      'Add the press state. On a phone there is no hover, so it is the only feedback a tap can produce, and without it the visitor taps your phone number and nothing happens until the dialler opens.',
      'Guard every hover in @media (hover: hover) — and ship the two together, because guarding hover alone leaves touch users with no feedback at all.',
      'Nothing above the fold animates in. There is no scroll yet, and hiding your biggest heading delays the page\'s own largest paint.',
      'Handle prefers-reduced-motion by killing the movement and keeping the fade.'
    ],
    rules: ['F-NO-PRESS', 'F-HOVER-UNGUARDED', 'T2-DURATION-CEILING', 'T2-PLAIN-EASE-ENTRANCE', 'T2-AOS-TRAVEL', 'T2-TRANSITION-ALL', 'T2-UNIVERSAL-FADEUP', 'T2-HERO-REVEAL', 'T2-NESTED-REVEAL', 'F-STICKY-COLLISION']
  },
  {
    n: 7,
    title: 'Can this sentence be false?',
    claim:
      'The most useful editing tool in the whole corpus, and it is free. "Search your meeting notes" beats "Unlock your knowledge" because it can be true. "Quality service you can trust" cannot be true or false, so it carries no information and the reader\'s eye passes straight over it. "We open at seven so you can play before school" can be checked, which is exactly why it persuades.',
    doing: [
      'Read every line on the page and ask whether it could be false.',
      'Delete the ones that could not. What is left is the only part carrying information.',
      'Ask the second question too: could a competitor put this sentence on their page unchanged? If so it is not about you, and it is occupying the space where something about you would go.',
      'Run check_copy, which runs only the copy rules, so you can work on the words without the page in front of you.'
    ],
    rules: ['W-BENEFIT-SPEAK', 'W-NOT-X-BUT-Y', 'W-EM-DASH', 'W-FABRICATED-PRECISION', 'W-BANNED-STAT-94', 'W-WEASEL-TRUST', 'W-FALSIFIABILITY', 'W-RULE-OF-THREE']
  },
  {
    n: 8,
    title: 'Nothing invented',
    claim:
      'This is the only thing on the whole list that cannot be recovered from once it is noticed. Everything else is craft; this is character, and a reader grades it that way. A fabricated testimonial shown to somebody who knows every regular in the room does not embarrass you — it tells them what the rest of the page is worth.',
    doing: [
      'No testimonial, star rating, press logo or customer count that nobody gave you.',
      'No name set under a quotation whose attribution you have not traced to a primary source. A name under a quote IS an attribution, with no "said" and no dash — this kit carries that rule because the project it came from shipped exactly that bug.',
      'Leave the hole and label it. For a page that is still a proposal the honest hole is an ADVANTAGE: it proves the rest was not fabricated either, and it hands the subject something concrete to supply.',
      'Write every fact once. A price in two files is two prices, and they agree right up until the day one of them is edited.'
    ],
    rules: ['H-INVENTED-TESTIMONIAL', 'H-QUOTE-ATTRIBUTION', 'H-INVENTED-BRAND', 'H-PRESS-LOGOS', 'W-PLACEHOLDER-TEXT', 'H-SINGLE-SOURCE', 'H-UNSOURCED-METRIC', 'H-EMPTY-PROOF-SECTION']
  },
  {
    n: 9,
    title: 'Why the escape routes keep closing',
    claim:
      'The hardest idea here, and the reason the problem cannot be solved once. Every escape from a cliché becomes the next cliché on a delay. Indigo was the tell, so everyone moved to cream grounds and italic serifs — and one commenter caught the author of the study on AI design tells wearing the exact look in the blog post announcing the study. A shared escape route is still a shared route.',
    doing: [
      'Read the trap-tier findings as questions rather than as failures. They are marked !? for exactly that reason.',
      'For each one ask: did I choose this, or did I arrive at it because the last thing was burned? Choosing by elimination leaves the same trace as not choosing.',
      'The only stable position is deriving choices from the specific subject, because that is the one thing nobody else can adopt.'
    ],
    rules: ['TRAP-CREAM-WASH', 'TRAP-CREAM-PACKAGE', 'TRAP-SAFE-GREEN', 'TRAP-SECTION-NUMBERS', 'TRAP-BENTO', 'TRAP-GLASSMORPHISM', 'TRAP-LUCIDE-FIVE', 'TRAP-MODERN-BY-LIST']
  },
  {
    n: 10,
    title: 'The deepest tell, which is not on any single page',
    claim:
      'You cannot see this one by looking at the page. It is that every page you ship shares a skeleton — and somebody who has seen one of your sites recognises the next one instantly. It was measured on a real generator: thirteen pages produced exactly two distinct stylesheets, and a diff of two pages from entirely different trades showed zero structural differences. All the differing lines were copy.',
    doing: [
      'Run review_site on a FOLDER holding more than one site, not on a single page. These rules cannot fire otherwise.',
      'Let init_site pick the shape. It keeps a ledger of what it emitted last and deliberately steps past it — having five shapes available is not variety, recording which one was used last is.',
      'Vary the axis that actually carries: the list of sections and their order. Do NOT vary the motion; identical motion across every site reads as competence, and varied motion reads as indecision.',
      'Then measure it rather than arguing about it: screenshot the top of twenty pages, put them on one sheet, and see whether you can tell which is which.'
    ],
    rules: ['V-SKELETON', 'V-STYLE-SKELETON', 'V-AGGREGATE-SIMILARITY', 'V-PALETTE-MODE-COLLAPSE', 'V-NO-LEDGER', 'S-SECTION-INVENTORY', 'S-BOILERPLATE-IDENTICAL']
  }
];

/** Validate: a stop that names a rule which no longer exists is a broken course. */
export function validate() {
  const missing = [];
  for (const stop of STOPS) {
    for (const id of stop.rules) {
      if (!BY_ID[id]) missing.push({ stop: stop.n, rule: id });
    }
  }
  const covered = new Set(STOPS.flatMap((s) => s.rules));
  const uncovered = RULEBOOK.filter((r) => !covered.has(r.id)).map((r) => r.id);
  return { missing, uncovered };
}

/**
 * Render the path.
 *
 * `depth` "route" gives the ten stops and what to do at each. "full" adds every
 * rule's own reasoning underneath the stop that teaches it, which is what makes
 * this a course rather than a table of contents.
 */
export function render({ depth = 'full', stop = null, width = 78 } = {}) {
  const { missing, uncovered } = validate();
  if (missing.length) {
    throw new Error(
      `The learning path names ${missing.length} rule(s) that are not in the rulebook: ` +
        missing.map((m) => `${m.rule} (stop ${m.stop})`).join(', ') +
        '. Fix src/lib/learning-path.js or the rulebook; a course that teaches a rule the tool does not run is worse than no course.'
    );
  }

  const out = [];
  out.push('FROM NEVER HAVING MADE A WEBSITE, TO KNOWING WHY THAT GRADIENT WAS WRONG');
  out.push('='.repeat(width));
  out.push('');
  out.push(
    wrap(
      'Ten stops. Every claim below comes out of the rulebook the tool actually runs, and every stop names the rule ids that carry its reasoning — so this route cannot drift away from the tool. Run `explain_rule` on any id to read its full teaching note, its sources, and how confident the research is in it.',
      width
    )
  );
  out.push('');
  out.push(
    wrap(
      'The order is not the rulebook\'s order. The rulebook sorts by how fast a visitor notices a fault, which is right for a critique and wrong for a beginner. This sorts by what you need first.',
      width
    )
  );
  out.push('');

  const stops = stop ? STOPS.filter((s) => s.n === Number(stop)) : STOPS;
  for (const s of stops) {
    out.push('');
    out.push(`${String(s.n).padStart(2, ' ')}. ${s.title.toUpperCase()}`);
    out.push('-'.repeat(width));
    out.push(wrap(s.claim, width));
    out.push('');
    out.push('   WHAT TO DO');
    for (const d of s.doing) out.push(wrap(`- ${d}`, width - 3, '     '));
    if (s.rules.length) {
      out.push('');
      out.push(`   THE RULES THAT CARRY THIS  (${s.rules.length})`);
      for (const id of s.rules) {
        const rule = BY_ID[id];
        out.push(`     ${id}  —  ${rule.title}   [${rule.source?.confidence ?? 'unstated'}]`);
        if (depth === 'full') {
          out.push(wrap(rule.why_it_matters, width - 7, '        '));
          out.push(wrap(`MOVE: ${rule.fix}`, width - 7, '        '));
          out.push('');
        }
      }
    }
  }

  if (!stop) {
    out.push('');
    out.push('AFTER THE TENTH STOP');
    out.push('-'.repeat(width));
    out.push(
      wrap(
        'There is no eleventh. The rules will change — the trap tier exists precisely because they must — but the method does not: build it, run review_site, read one finding properly rather than fixing forty, make the move, run it again. The reasoning sticks when you can see which single change moved the count.',
        width
      )
    );
    out.push('');
    out.push(
      wrap(
        `The rulebook holds ${RULEBOOK.length} rules across ${Object.keys(TIERS).length} tiers. ${
          uncovered.length === 0
            ? 'Every one of them is taught by a stop above.'
            : `${uncovered.length} of them are not named by any stop above, because they are variants of rules that are: ${uncovered.slice(0, 12).join(', ')}${uncovered.length > 12 ? ', …' : ''}. explain_rule reads any of them.`
        }`,
        width
      )
    );
  }

  return out.join('\n');
}

function wrap(text, width, indent = '') {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = indent;
  for (const word of words) {
    if (line.trim() && line.length + word.length + 1 > width) {
      lines.push(line);
      line = `${indent}${word}`;
    } else {
      line = line.trim() ? `${line} ${word}` : `${indent}${word}`;
    }
  }
  if (line.trim()) lines.push(line);
  return lines.join('\n');
}

export { wrap };
