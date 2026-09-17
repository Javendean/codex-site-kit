/**
 * Honesty — claims that cannot be checked, and claims that are not yours.
 *
 * These come from the reference storefront in chess-tee-forge/store, where the
 * rules are encoded in the page rather than asserted about it: no invented
 * brand, logo, testimonial or press; a quotation carried with NO attribution
 * because the attribution could not be traced to a primary source; out-of-band
 * numbers stamped rather than hidden; assumptions labelled "Assumed — untested".
 *
 * Two of these exist because that project shipped the bug first. That is worth
 * saying out loud, because it is the difference between a rule somebody thought
 * of and a rule somebody paid for.
 *
 * research/08-craft.md §5.3 supplies the strategic half, and it is the part
 * that matters most for a teacher with no online history yet:
 *
 *   "For a concept site the honest hole is an advantage… a visible 'your
 *    Google rating goes here' block is a conversation opener, proves you did
 *    not fabricate, and gives the owner something to do. The holes are the
 *    pitch."
 *
 * The detection itself lives in ../lib/honesty.js, which already does the hard
 * part — the block-stream walk that makes "a name set under a quotation"
 * expressible at all. This file gives each of its rules provenance and a
 * teaching note, and hands them to the same critique renderer as everything
 * else.
 */

import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { scanDocument, applyLedger } from '../lib/honesty.js';

/** Run the honesty scan once per review and cache it on the context. */
function scan(ctx) {
  if (ctx._honesty) return ctx._honesty;
  const findings = [];
  for (const doc of ctx.documents) {
    const kind = doc.markdown ? 'markdown' : doc.tree ? 'html' : 'other';
    findings.push(...scanDocument({ path: doc.rel, text: doc.text, kind }));
  }
  const applied = ctx.ledger?.honesty ? applyLedger(findings, ctx.ledger.honesty) : { findings, suppressed: 0 };
  ctx._honesty = applied;
  return applied;
}

/** Turn a lib/honesty.js finding into an engine finding. Offsets come back as line/column. */
function bridge(ctx, id, extra = {}) {
  return scan(ctx)
    .findings.filter((f) => f.rule === id)
    .map((f) => ({
      rel: f.file,
      offset: offsetFor(ctx, f),
      what: extra.what ? extra.what(f) : `${f.label}: "${f.matched}" — ${f.excerpt}`,
      measured: f.in_comment ? 'inside an HTML comment: not visible yet, but a claim waiting to be uncommented' : `matched "${f.matched}"`,
      // lib/honesty.js already decided how loud this is: a match inside a
      // sentence that NEGATES the claim ("there are no testimonials") is a
      // statement of fact about the site, not an invented one, and reporting
      // it at full volume would punish the honest form of the sentence.
      severity: f.severity === 'info' ? 'note' : f.severity === 'warn' ? 'dubious' : undefined,
      confidence: f.severity === 'info' ? CONFIDENCE.MEASURED : undefined,
      ...(f.severity === 'info' ? { why: f.why, title: 'A claim this page says it does NOT make' } : {})
    }));
}

/** lib/honesty.js reports line+column; convert back to an offset for the engine. */
function offsetFor(ctx, finding) {
  const file = ctx.byRel.get(finding.file);
  if (!file) return 0;
  const lines = file.text.split('\n');
  let offset = 0;
  for (let i = 0; i < finding.line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
  return offset + Math.max(0, (finding.column ?? 1) - 1);
}

/* ------------------------------------------------------------------ */

export const inventedProof = register({
  id: 'invented-proof',
  tier: 'honesty',
  title: 'Proof that nobody supplied',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront', 'craft', 'hallmark'],
  threshold:
    'A testimonial block, a star rating, an "as seen in" or "trusted by" line, or a customer count — anywhere in the page, including inside an HTML comment. A sentence that NEGATES the claim ("no testimonials yet") is reported as a note instead.',
  why:
    'research/08-craft.md §5.3 puts the stake in the ground: "Never fabricate proof. A fake testimonial from \'Sarah M.\' with a generated headshot, shown to a man who knows every regular in his shop, is unrecoverable." For a chess teacher the equivalent is sharper still, because the club is small and everybody knows everybody. An invented parent quote is a quote that a real parent will read, and recognise as not theirs. The reference storefront handles this by saying outright, on the page, that it has no reviews and no press — which is not an apology, it is the thing that makes everything else on the page believable.',
  fix:
    'Delete it, and leave a labelled hole where it was: a visible block that says what will go there and who it will come from. research/08-craft.md gives the reasoning in one line — "The holes are the pitch." When the first real quotation arrives, you will have somewhere to put it, and it will land with the weight of the only quotation on the page.',
  detect(ctx) {
    return [
      ...bridge(ctx, 'testimonial'),
      ...bridge(ctx, 'star_rating'),
      ...bridge(ctx, 'as_seen_in'),
      ...bridge(ctx, 'social_proof_count')
    ];
  }
});

/* ------------------------------------------------------------------ */

export const unverifiedAttribution = register({
  id: 'unverified-attribution',
  tier: 'honesty',
  title: 'A name under a quotation',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront'],
  threshold:
    'A quotation block immediately followed by a short block that reads as an attribution: a <cite>, a dash and a capitalised name, a class naming it as an author or source, a <figcaption>, a "said/wrote/according to" verb, or — the subtle one — a person-shaped name standing on its own line.',
  why:
    'A name set under a quotation IS an attribution, even with no "said" and no dash. The reference storefront shipped exactly this bug, which is why the rule exists in this form: it carried a famous chess quotation with a name beneath it, and the attribution was one of those that is repeated everywhere and traces to no primary source. The page now carries the same words with no name and a note explaining why. That is the harder and better answer — the quotation is still worth reading, and the claim about who said it was the part that could not be supported. For a chess site this is not hypothetical. A large share of the most-quoted chess aphorisms are misattributed, and the audience for your site is the exact population that knows it.',
  fix:
    'Three options, in order of preference. Find the primary source and cite it, with the book and the page. Or keep the quotation and drop the name, with a line saying why — that is what the storefront does. Or drop the quotation. If you have verified it, record it in a `.honesty.json` file at the site root: `{"verified":[{"text":"…","source":"Lasker, Manual of Chess, 1925, p. 121"}]}`. An entry with no source suppresses nothing, deliberately — a promise is not a citation.',
  detect(ctx) {
    return scan(ctx)
      .findings.filter((f) => f.rule === 'unverified_attribution')
      .map((f) => ({
        rel: f.file,
        offset: offsetFor(ctx, f),
        what: `"${f.quotation ?? f.excerpt}" is followed by "${f.attributed_to ?? f.matched}".`,
        measured: `${f.confidence ?? 'medium'} confidence — ${f.why?.split('.')[0] ?? 'reads as an attribution'}`
      }));
  }
});

/* ------------------------------------------------------------------ */

export const placeholderIdentity = register({
  id: 'placeholder-identity',
  tier: 'honesty',
  title: 'A stand-in name, address or number still in the page',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront'],
  threshold:
    'Acme / Contoso / Globex, "Your Company Here", John or Jane Doe, an @example.com address, a 555-01xx phone number, or 123 Main Street.',
  why:
    'These are worse than an empty space because a visitor will read them as real and may try to use them. The reference storefront\'s answer is worth copying exactly: it draws the unfilled fields AS unfilled fields — a dashed box reading WORDMARK, with the words "placeholder, no name chosen" beside it, and a sentence in the footer saying the four legal fields must be filled before a single order is taken. "A premature logo is worse than none, so the dashed field is the design: an unfilled box on a drawing."',
  fix:
    'Put the real detail in. If you do not have it yet, draw the hole: mark the element `data-placeholder` and style it as an obviously unfilled field, so nobody — including you, six weeks from now — mistakes it for content.',
  detect(ctx) {
    return bridge(ctx, 'placeholder_identity');
  }
});

/* ------------------------------------------------------------------ */

export const unfinishedMarker = register({
  id: 'unfinished-marker',
  tier: 'honesty',
  title: 'A note to yourself that a visitor can read',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront'],
  threshold: 'TODO, TBD, FIXME, XXX, PLACEHOLDER, COMING SOON, or a bracketed [insert something here] in visible copy.',
  why:
    'A visitor cannot tell the difference between a site that is unfinished and a site that is abandoned. "Coming soon" has meant both for thirty years.',
  fix: 'Fill it in, or delete the block until you can. A shorter complete page beats a longer one with holes in it.',
  detect(ctx) {
    return bridge(ctx, 'open_placeholder');
  }
});

/* ------------------------------------------------------------------ */

export const loremIpsum = register({
  id: 'lorem-ipsum',
  tier: 'honesty',
  title: 'Filler Latin still in the page',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront'],
  threshold: 'Lorem ipsum, dolor sit amet, consectetur adipiscing, and their neighbours.',
  why: 'A visitor reads this as a broken site, not as a draft. It is the single most legible sign that nobody has read the page.',
  fix: 'Write the real sentence, or delete the block until there is one.',
  detect(ctx) {
    return bridge(ctx, 'lorem_ipsum');
  }
});

/* ------------------------------------------------------------------ */

export const unsupportedSuperlative = register({
  id: 'unsupported-superlative',
  tier: 'honesty',
  title: 'An award nobody gave',
  severity: SEVERITY.DUBIOUS,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront', 'gesso'],
  threshold: '"Award-winning", "#1 rated", "best-selling", "world-class", "market leader", "the best in the city".',
  why:
    'A superlative reads as a checkable claim, because it is one. If there is no award and no ranking behind it, a visitor who looks and finds nothing has learned something about everything else on the page.',
  fix:
    'Name the award and link to it. Or say the specific true thing, which is almost always more persuasive: not "award-winning coach" but "FIDE Candidate Master, teaching since 1998".',
  detect(ctx) {
    return bridge(ctx, 'unsupported_superlative');
  }
});

/* ------------------------------------------------------------------ */

export const singleSource = register({
  id: 'single-source',
  tier: 'honesty',
  title: 'The same number written in two places',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.DEMONSTRATED,
  who: ['storefront'],
  threshold:
    'A price, a phone number or an email address appearing as a literal in two or more files.',
  why:
    'This rule is here because the reference storefront shipped the bug. Four agents built it in parallel against two different pricing documents, and the product grid, the basket and the payment worker each ended up with their own copy of the numbers. A customer walking from a card to the basket watched the price fall and a shipping line appear. The rule the project adopted afterwards is absolute and is worth adopting whole: "A second copy of a price is a second price, and it will drift." It drifts because the two copies are updated by different people on different days, and nothing in the system notices they disagree.',
  fix:
    'Pick one place for each fact — a small JSON file, or a single element that the others read from — and reference it everywhere else. If that is more machinery than the site deserves, the smaller discipline still works: decide which file is the source, write it in a comment at the top of the others, and check it when you change the number.',
  detect(ctx) {
    const seen = new Map();
    const record = (kind, value, doc, offset) => {
      const key = `${kind}:${value}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push({ rel: doc.rel, offset, value, kind });
    };

    for (const doc of ctx.documents) {
      for (const m of doc.text.matchAll(/(?:^|[\s>("'])(\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/g)) {
        record('price', m[1].replace(/\s+/g, ''), doc, m.index);
      }
      for (const m of doc.text.matchAll(/\b(\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})\b/g)) {
        record('phone', m[1].replace(/\D/g, ''), doc, m.index);
      }
      for (const m of doc.text.matchAll(/\b([\w.+-]+@[\w-]+\.[\w.]{2,})\b/g)) {
        if (/example\.(com|org|net)$/i.test(m[1])) continue;
        record('email', m[1].toLowerCase(), doc, m.index);
      }
    }

    const out = [];
    for (const [key, hits] of seen) {
      const files = [...new Set(hits.map((h) => h.rel))];
      if (files.length < 2) continue;
      const [kind] = key.split(':');
      out.push({
        rel: hits[0].rel,
        offset: hits[0].offset,
        what: `The ${kind} "${hits[0].value}" is written as a literal in ${files.length} files: ${files.join(', ')}.`,
        measured: `${hits.length} occurrences across ${files.length} files`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const declaredPlaceholder = register({
  id: 'declared-placeholder',
  tier: 'honesty',
  title: 'An unfilled field, drawn as one',
  severity: SEVERITY.NOTE,
  confidence: CONFIDENCE.MEASURED,
  who: ['storefront', 'craft'],
  threshold: 'An element carrying a `data-placeholder` attribute.',
  why:
    'This is not a fault. It is the pattern the reference storefront uses on purpose: a dashed box reading WORDMARK with "placeholder, no name chosen" beside it, and a footer sentence saying the four legal fields must be filled before an order is taken. "A premature logo is worse than none, so the dashed field is the design: an unfilled box on a drawing." It is listed so it is not forgotten, not because it is wrong — and because a visible hole is a conversation rather than a lie.',
  fix: 'Write the real content and delete the data-placeholder attribute. Until then, leave it exactly as it is.',
  detect(ctx) {
    return scan(ctx)
      .findings.filter((f) => f.rule === 'declared_placeholder')
      .map((f) => ({
        rel: f.file,
        offset: offsetFor(ctx, f),
        what: `${f.excerpt}`,
        measured: 'marked data-placeholder — honest, and not finished'
      }));
  }
});

export const rules = [
  declaredPlaceholder,
  inventedProof,
  unverifiedAttribution,
  placeholderIdentity,
  unfinishedMarker,
  loremIpsum,
  unsupportedSuperlative,
  singleSource
];
