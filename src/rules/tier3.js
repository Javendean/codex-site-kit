/**
 * Tier 3 — copy.
 *
 * research/08-craft.md heads this tier "which for this audience may matter most
 * of all", and for a teacher's own site that is almost certainly right: the
 * words are the part a parent reads twice.
 *
 * The organising idea underneath every rule here is one sentence from Gesso,
 * which research/08-craft.md calls the single most useful thing found in the
 * whole sweep:
 *
 *   "'Search your meeting notes' beats 'Unlock your knowledge' because it can
 *    be true."
 *
 * That is the test. Can this sentence be true or false? "Quality service you
 * can trust" cannot be. "I open the board at 7 so you can play before school"
 * can. Everything below is a way of finding sentences that failed the test.
 */

import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { copyBlocks, quote } from './helpers.js';

/* ------------------------------------------------------------------ */

const BENEFIT_SPEAK = [
  'elevate', 'supercharge', 'streamline', 'empower', 'effortless', 'effortlessly',
  'seamless', 'seamlessly', 'revolutionize', 'revolutionise', 'game-changer',
  'game changer', 'world-class', 'next-level', 'unleash', 'turbocharge',
  'cutting-edge', 'best-in-class', 'transformative', 'leverage', 'robust',
  'unlock the', 'unlock your', 'unlock a', 'unlock new', 'take it to the next level'
];

// Functional uses are spared: "Unlock with Face ID" is an instruction, not a claim.
const FUNCTIONAL_UNLOCK = /\bunlock(?:ing|s|ed)?\s+(?:with|using|via|the door|your phone)\b/i;

export const benefitSpeak = register({
  id: 'benefit-speak',
  tier: 3,
  title: 'Benefit-speak',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'craft'],
  threshold:
    'A word from the benefit-speak lexicon in visible copy: elevate, supercharge, streamline, empower, effortless(ly), seamless(ly), revolutionize, game-changer, world-class, next-level, unleash, turbocharge, "unlock the/your/a/new". Functional uses ("unlock with Face ID") are spared.',
  why:
    'Gesso ships this as a hard gate. Each of these words describes a FEELING the reader is supposed to have rather than a thing you do, which means none of them can be checked. That is why they cluster: a sentence with no checkable content has to be filled with something, and this is the vocabulary that fills it. A parent choosing a chess teacher is not evaluating whether you will "elevate" their child. They are working out whether you will turn up, whether you can teach, and what it costs.',
  fix:
    'Replace the word with the thing it was standing in for. Not "elevate your game" — "we work through your own losses, one a week, until you stop losing the same way." The second sentence can be wrong, which is exactly what makes it worth believing.',
  detect(ctx) {
    const out = [];
    for (const doc of ctx.documents) {
      for (const block of copyBlocks(doc)) {
        const lower = block.text.toLowerCase();
        for (const word of BENEFIT_SPEAK) {
          const at = lower.indexOf(word);
          if (at === -1) continue;
          if (word.startsWith('unlock') && FUNCTIONAL_UNLOCK.test(block.text)) continue;
          out.push({
            rel: doc.rel,
            offset: block.offset + at,
            what: `"${quote(block.text, 70)}" uses "${word}".`,
            measured: `benefit-speak lexicon hit: "${word}"`
          });
          break;
        }
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const NOT_X_BUT_Y = [
  /\bnot just\b[^.!?]{2,60}?\b(?:it'?s|but|they'?re|we'?re|this is)\b/i,
  /\bisn'?t just\b[^.!?]{2,60}?\b(?:it'?s|but)\b/i,
  /\bmore than just\b[^.!?]{2,60}?\b(?:it'?s|but)\b/i,
  /\bnot only\b[^.!?]{2,60}?\bbut also\b/i
];

export const notXButY = register({
  id: 'not-x-but-y',
  tier: 3,
  title: 'The "not just X, it\'s Y" cadence',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso'],
  threshold: '"not just X, it\'s Y", "isn\'t just X, it\'s Y", "more than just X", "not only X but also Y" in visible copy.',
  why:
    'Gesso names it "the single most recognized generated-copy cadence: contrast as a tic." The structure promises a reversal and then delivers a synonym — "not just lessons, it\'s a journey" tells the reader nothing except that the writer wanted the sentence to feel bigger than it was. It is a rhythm rather than an argument, which is why a model produces it: the shape is learnable without any content behind it.',
  fix:
    'Delete the first half. Whatever comes after "it\'s" was the claim; say that, and say it in terms that could be checked. If the second half turns out to be nothing once the scaffolding is gone, you have found a sentence that was never saying anything.',
  detect(ctx) {
    const out = [];
    for (const doc of ctx.documents) {
      for (const block of copyBlocks(doc)) {
        for (const re of NOT_X_BUT_Y) {
          const m = re.exec(block.text);
          if (!m) continue;
          out.push({
            rel: doc.rel,
            offset: block.offset + m.index,
            what: `"${quote(block.text, 80)}"`,
            measured: `matched the contrast cadence: "${quote(m[0], 40)}"`
          });
          break;
        }
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const emDashCopy = register({
  id: 'em-dash-copy',
  tier: 3,
  title: 'An em dash in short interface copy',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso'],
  threshold:
    'A U+2014 em dash in visible copy of 120 characters or fewer — a heading, a button, a label, a card. Unspaced ranges (Mon–Fri, 9–5) use an en dash and are spared. Long prose is spared.',
  why:
    'Gesso ships `em-dash-copy` with an auto-fix to a comma, and the corpus puts it alongside the coloured left border as one of the two most reliable machine signatures. That is not because the punctuation is wrong — in an essay the em dash is the right mark. It is because short UI copy has no room for an aside, so when one appears it is usually the model reaching for a rhythm rather than the writer making a break. In a button label or a card heading it reads as written-by-something.',
  fix:
    'Use a comma, a full stop, or two sentences. If the aside is worth keeping, it is worth its own line. Keep the em dash for prose where you are genuinely interrupting yourself.',
  detect(ctx) {
    const out = [];
    for (const doc of ctx.documents) {
      for (const block of copyBlocks(doc)) {
        if (block.text.length > 120) continue;
        const at = block.text.indexOf('—');
        if (at === -1) continue;
        out.push({
          rel: doc.rel,
          offset: block.offset + at,
          what: `<${block.tag}> "${quote(block.text, 70)}"`,
          measured: `em dash in ${block.text.length} characters of copy`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const PRECISION = [
  { re: /\b99\.9{1,2}\s*%/, label: 'a 99.9% figure' },
  { re: /\b(?:10|20|50|100)x\b/i, label: 'an "Nx" multiplier' },
  { re: /#1\b/, label: 'a "#1" claim' },
  { re: /\btrusted by\s+(?:\d{1,3}[,\d]*\+?|thousands|hundreds|millions)\b/i, label: 'a "trusted by" crowd' },
  { re: /\b\d+\s*%\s+(?:faster|better|more|improvement|increase|of (?:our )?students)\b/i, label: 'a percentage improvement' },
  { re: /\b(?:over|more than)\s+\d{1,3}(?:,\d{3})+\b/i, label: 'a large round count' }
];

export const fabricatedPrecision = register({
  id: 'fabricated-precision',
  tier: 3,
  title: 'A number that sounds measured and is not',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['gesso', 'hallmark', 'storefront'],
  threshold:
    '99.9% / 99.99%, an "Nx" multiplier, "#1", "trusted by" plus a crowd, a percentage improvement, or a large round count — in visible copy.',
  why:
    'Gesso ships `fabricated-precision` and `oversized-number`; Hallmark\'s gate 46 is broader and is the one that matters here: ANY metric the client did not supply. The corpus states the principle in one line — "The number-shaped hole is honest; the fabricated number is slop." A decimal place is a claim that somebody counted. 99.9% says a measurement was taken; "10x" says a comparison was run. If neither happened, the number is doing the work of evidence while being decoration, and the person most likely to notice is the one who knows the real figure.',
  fix:
    'research/08-craft.md gives the fixes in preference order. Replace the number with an em dash and a plainly-labelled "metric to confirm" block. Or ask and wait. Or — the honest one nobody likes — rebuild the section without a proof slot at all, because "a stat-led macrostructure with no real stats is the wrong macrostructure." If you DO have the number, say where it came from: "37 students since 2019, from my own records" beats "trusted by hundreds" and cannot be doubted.',
  detect(ctx) {
    const out = [];
    for (const doc of ctx.documents) {
      for (const block of copyBlocks(doc)) {
        for (const { re, label } of PRECISION) {
          const m = re.exec(block.text);
          if (!m) continue;
          out.push({
            rel: doc.rel,
            offset: block.offset + m.index,
            what: `"${quote(block.text, 70)}" contains ${label}: "${m[0]}".`,
            measured: `no source given for "${m[0]}"`
          });
          break;
        }
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const misattributedStat = register({
  id: 'misattributed-stat',
  tier: 3,
  title: 'The statistic that does not check out',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['design', 'lindgaard'],
  threshold:
    'The claim that 94% (or 97%) of first impressions are design-related, in any phrasing, attributed to Stanford or not.',
  why:
    'research/04-design-language.md carries a red statistic-integrity warning about exactly this, because it is the stat anyone writing about web design reaches for first, and it is wrong. Stanford\'s Web Credibility Project found 46.1% — that consumers assessed credibility partly on visual design. The 94% figure comes from a DIFFERENT study measuring what participants gave feedback about (94% of feedback concerned design, 6% content), which is a completely different claim. The "2026 update, 97%, 19,000 participants" version has no corroboration at all and appears only on SEO-content aggregator pages. The reason this is a hard rule rather than a nitpick is in the source file: "A business owner who Googles your stat and finds it\'s wrong has learned you don\'t check things." In a trust sale that is fatal, and teaching is entirely a trust sale.',
  fix:
    'Cite Lindgaard, Fernandes, Dudek & Brown (2006), "Attention web designers: You have 50 milliseconds to make a good first impression!", Behaviour & Information Technology 25(2), 115-126 — real, peer-reviewed, around 1,068 citations, and it says what you wanted the other one to say. Or cite Stanford\'s actual 46.1%. Or cite nothing, which is also fine.',
  detect(ctx) {
    const out = [];
    const re = /\b9[47]\s*%[^.!?]{0,60}?(?:first impression|design)|(?:first impression|design)[^.!?]{0,60}?\b9[47]\s*%/i;
    for (const doc of ctx.documents) {
      for (const block of copyBlocks(doc)) {
        const m = re.exec(block.text);
        if (!m) continue;
        out.push({
          rel: doc.rel,
          offset: block.offset + m.index,
          what: `"${quote(block.text, 90)}"`,
          measured: 'the 94%/97% first-impressions claim — documented misattribution; the real figure is 46.1%'
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

const UNFALSIFIABLE = [
  'quality service you can trust', 'we are passionate about', 'passionate about delivering',
  'committed to excellence', 'dedicated to excellence', 'your success is our', 'second to none',
  'unparalleled', 'unmatched', 'industry-leading', 'state-of-the-art', 'tailored to your needs',
  'bespoke solutions', 'holistic approach', 'proven track record', 'attention to detail is'
];

export const unfalsifiableClaim = register({
  id: 'unfalsifiable-claim',
  tier: 3,
  title: 'A sentence that cannot be false',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.ASSERTED,
  who: ['gesso', 'craft'],
  threshold: 'A phrase from the unfalsifiable lexicon in visible copy.',
  why:
    'This is the falsifiability test applied directly. research/08-craft.md §5.3 calls it the single most useful sentence in the whole sweep: "Search your meeting notes" beats "Unlock your knowledge" because it CAN BE TRUE. Every phrase in this lexicon fails the test — no possible state of the world would make "committed to excellence" false, which is why it conveys nothing and why every competitor can write it too. The corpus adds the point that matters for a small practice: for this audience "bespoke" does not mean aesthetically unique, it means "this person looked at MY situation". That is a content property. No amount of design produces it; one specific fact does.',
  fix:
    'Replace it with something that could be wrong. Not "tailored to your needs" — "we start from your last three losses, not from an opening book." Not "proven track record" — "eleven of my students have crossed 1600; two have not, and I will tell you why on the call." The second half of that sentence is what makes the first half believable.',
  detect(ctx) {
    const out = [];
    for (const doc of ctx.documents) {
      for (const block of copyBlocks(doc)) {
        const lower = block.text.toLowerCase();
        for (const phrase of UNFALSIFIABLE) {
          const at = lower.indexOf(phrase);
          if (at === -1) continue;
          out.push({
            rel: doc.rel,
            offset: block.offset + at,
            what: `"${quote(block.text, 80)}" — "${phrase}" cannot be checked.`,
            measured: 'no state of the world would make this sentence false'
          });
          break;
        }
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const ruleOfThree = register({
  id: 'rule-of-three',
  tier: 3,
  title: 'Every list exactly three items long',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.ASSERTED,
  who: ['hn', 'craft'],
  threshold: 'Three or more lists on one page, every one of them exactly three items long.',
  why:
    'From the HN practitioner thread the corpus quotes: prose forced into bullets, lists always exactly three items, and "items that don\'t all seem to belong in the same natural category". The last is the sharpest detector in the set and no tool can automate it — but the first two are countable. Three is the length a list comes out when the number was chosen by rhythm rather than by the subject. Real inventories are lumpy: you teach four things, or two, or seven with three that matter.',
  fix:
    'Count the actual things and list that many. If one of them is more important than the others — and for a teaching practice one usually is — do not give it equal billing in a bullet list. Say it in a sentence and let the rest be a list.',
  detect(ctx) {
    const out = [];
    for (const page of ctx.pages) {
      const lists = page.tree.all.filter((n) => n.tag === 'ul' || n.tag === 'ol');
      if (lists.length < 3) continue;
      const counts = lists.map((l) => l.children.filter((c) => c.tag === 'li').length).filter((n) => n > 0);
      if (counts.length < 3) continue;
      if (!counts.every((c) => c === 3)) continue;
      out.push({
        rel: page.rel,
        offset: lists[0].start,
        what: `All ${counts.length} lists on this page have exactly three items.`,
        measured: `${counts.length} lists, every one of length 3`
      });
    }
    return out;
  }
});

export const rules = [
  benefitSpeak,
  notXButY,
  emDashCopy,
  fabricatedPrecision,
  misattributedStat,
  unfalsifiableClaim,
  ruleOfThree
];
