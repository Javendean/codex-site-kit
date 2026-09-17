/**
 * Variety — the tell that is not on any single page.
 *
 * research/08-craft.md measured its own generator's output and found this:
 *
 *   sha256 of the <style> block, all 13 previews  →  exactly 2 distinct values
 *   diff of two previews from different verticals →  0 structural CSS
 *                                                    differences; all 115
 *                                                    differing lines are copy
 *   grep -c "<img" previews/*\/index.html          →  0 for all 13
 *   palette chosen by the LLM                     →  ink x10, slate x3
 *                                                    (4 of 6 palettes never used)
 *
 * "There are two stylesheets, not thirteen… The chimney-and-damper supply
 * company and the immigration lawyer receive literally the same page."
 *
 * These rules reproduce those exact measurements, which means they light up on
 * that preview folder. That is the test: a detector for this failure that
 * cannot detect the documented instance of it is not a detector.
 */

import { createHash } from 'node:crypto';
import { register, SEVERITY } from './engine.js';
import { CONFIDENCE } from './sources.js';
import { signature, childElements } from '../lib/dom.js';
import { fingerprint } from '../lib/ledger.js';
import { quote } from './helpers.js';

/** The directory a page belongs to, relative to the review root. */
function siteOf(rel) {
  const parts = rel.split('/');
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/');
}

/** Everything that decides how a page LOOKS, with the words removed. */
function styleFingerprint(ctx, page) {
  const inline = page.styleBlocks.map((b) => b.css).join('\n');
  const linked = page.tree.all
    .filter((n) => n.tag === 'link' && /stylesheet/i.test(n.attrs.rel || ''))
    .map((n) => {
      const href = (n.attrs.href || '').split('?')[0].replace(/^\.\//, '');
      const dir = siteOf(page.rel);
      const candidates = [href, dir === '.' ? href : `${dir}/${href}`];
      const sheet = ctx.stylesheets.find((s) => candidates.includes(s.rel));
      return sheet ? sheet.text : `«${href}»`;
    })
    .join('\n');
  const css = `${linked}\n${inline}`.replace(/\s+/g, ' ').trim();
  return css ? createHash('sha256').update(css).digest('hex') : null;
}

/** The page's bones: element and class structure, three levels deep, words discarded. */
function skeletonFingerprint(page) {
  const body = page.tree.all.find((n) => n.tag === 'body') || page.tree.root;
  const sig = childElements(body).map((c) => signature(c, 3)).join('|');
  return sig ? createHash('sha256').update(sig).digest('hex') : null;
}

/* ------------------------------------------------------------------ */

export const sharedSkeleton = register({
  id: 'shared-skeleton',
  tier: 'variety',
  title: 'Two different sites wearing the same page',
  severity: SEVERITY.BLUNDER,
  confidence: CONFIDENCE.MEASURED,
  who: ['craft', 'hallmark'],
  threshold:
    'Two or more pages in DIFFERENT site folders whose stylesheets hash identically, or whose body structure hashes identically. Pages inside one site are expected to share a shell and are not compared.',
  why:
    'This is the failure that cannot be recovered from by fixing a page, because it is not on a page. research/08-craft.md hashed the style block of thirteen generated sites and got two distinct values: "There are two stylesheets, not thirteen. The only difference between them is three hex values." A viewer who has seen one of your other sites recognises this instantly, and what they learn is not that you used a template — it is that the attention they thought was on their business was on nobody\'s. Hallmark\'s own authors documented the same failure against their own tool, with 21 themes available and one macrostructure still coming out. That is the important part: having options does not produce variety. Only a record of what you did last does.',
  fix:
    'Change the axes that carry, which research/08a-sitegen-spec.md ranks: the section INVENTORY and its order first, because the identity and count of sections is what makes two pages look like different jobs rather than one job run twice; then density; then the ground colour; then the type pairing. Recolouring is the axis that carries least. `init_site` in this kit reads a ledger of what it emitted last and is forbidden from repeating the structural choices — which is the only mechanism that actually works.',
  detect(ctx) {
    const bySite = new Map();
    for (const page of ctx.pages) {
      const site = siteOf(page.rel);
      if (!bySite.has(site)) bySite.set(site, []);
      bySite.get(site).push(page);
    }
    if (bySite.size < 2) return [];

    const out = [];
    for (const [label, hashOf] of [
      ['stylesheet', (p) => styleFingerprint(ctx, p)],
      ['page structure', (p) => skeletonFingerprint(p)]
    ]) {
      const byHash = new Map();
      for (const [site, pages] of bySite) {
        const hash = hashOf(pages[0]);
        if (!hash) continue;
        if (!byHash.has(hash)) byHash.set(hash, []);
        byHash.get(hash).push(site);
      }
      const distinct = byHash.size;
      for (const [hash, sites] of byHash) {
        if (sites.length < 2) continue;
        const page = bySite.get(sites[0])[0];
        out.push({
          rel: page.rel,
          offset: 0,
          what: `${sites.length} of ${bySite.size} sites share one ${label}: ${sites.slice(0, 5).join(', ')}${sites.length > 5 ? `, and ${sites.length - 5} more` : ''}.`,
          measured: `${distinct} distinct ${label} ${distinct === 1 ? 'hash' : 'hashes'} across ${bySite.size} sites (sha256 ${hash.slice(0, 12)})`
        });
      }
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const ledgerRepeat = register({
  id: 'ledger-repeat',
  tier: 'variety',
  title: 'The same shape as something you shipped before',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.MEASURED,
  who: ['craft'],
  threshold: 'A page whose structural fingerprint matches an entry already in the variety ledger for a different subject.',
  why:
    'The ledger exists so that the previous rule can be answered across time rather than only within one folder. Two sites built six weeks apart are still two sites a visitor can put side by side. This rule is the memory.',
  fix:
    'Change the section inventory — not the colours. `init_site` does this automatically when it can see the ledger; if you built this page by hand, the fastest real change is to add or remove a section and reorder what remains.',
  detect(ctx) {
    const entries = ctx.ledger?.variety?.emitted ?? [];
    if (entries.length === 0) return [];
    const out = [];
    for (const page of ctx.pages) {
      const skeleton = skeletonFingerprint(page);
      if (!skeleton) continue;
      const short = fingerprint(skeleton);
      const match = entries.find((e) => e.bones === short && e.subject);
      if (!match) continue;
      out.push({
        rel: page.rel,
        offset: 0,
        what: `This page has the same bones as "${quote(match.subject, 40)}", scaffolded ${match.at ? `on ${String(match.at).slice(0, 10)}` : 'earlier'}.`,
        measured: `structural fingerprint ${short}`
      });
    }
    return out;
  }
});

/* ------------------------------------------------------------------ */

export const zeroImages = register({
  id: 'zero-images',
  tier: 'variety',
  title: 'No photographs anywhere',
  severity: SEVERITY.MISTAKE,
  confidence: CONFIDENCE.MEASURED,
  who: ['craft'],
  threshold: 'No <img> element anywhere in the site, and no <picture> or CSS background-image carrying a real file.',
  why:
    'research/08-craft.md §5.5 measured zero <img> tags across all thirteen generated previews and calls the absence its own signal: "Zero images is itself a signal that nobody visited." A page of pure typography can be beautiful, and the corpus is clear that stock is worse than nothing — but a site about a person, with no picture of the person or of where they teach, has a hole where the most verifiable thing on the page would go. One real photograph is the only element a visitor can check against the world.',
  fix:
    'One photograph, and one is the recommendation rather than a minimum — the corpus says "ONE photo maximum, everything else CSS art." Crop it tightly rather than running it full bleed, bias the composition left or right rather than centring it, desaturate about 8% with `filter: saturate(.92)` so it sits on the page rather than on top of it, give it `aspect-ratio` and `object-fit: cover` so the layout never jumps, and never lazy-load it if it is the hero. If there is no photograph yet, draw the hole and say what will go in it.',
  detect(ctx) {
    const imgs = ctx.pages.reduce((n, p) => n + p.tree.all.filter((e) => e.tag === 'img' || e.tag === 'picture').length, 0);
    const backgrounds = ctx.decls.filter(
      (d) => /background/.test(d.property) && /url\(\s*['"]?(?!data:)[^)'"]+/i.test(d.value)
    ).length;
    if (imgs > 0 || backgrounds > 0) return [];
    if (ctx.pages.length === 0) return [];

    // A hole that is drawn AS a hole is the storefront's answer and the
    // corpus's — "the holes are the pitch". It is still unfinished, and it is
    // not the same failure as a page that simply has no pictures and does not
    // mention it, so it is reported at a different volume.
    const slot = ctx.pages
      .flatMap((p) => p.tree.all.map((n) => ({ p, n })))
      .find(({ n }) => n.attrs['data-photo-slot'] !== undefined || n.classes.some((c) => /photo-slot|photo-hole/.test(c)));

    if (slot) {
      return [
        {
          rel: slot.p.rel,
          offset: slot.n.start,
          severity: 'note',
          title: 'The photograph slot is still empty',
          what: 'There are no photographs yet, and the page says so: a slot is drawn and labelled as an unfilled field.',
          measured: '0 <img> across the site, 1 declared photo slot',
          why:
            'This is the honest state of an unfinished page, and it is deliberately better than a stock photo — research/08-craft.md is explicit that stock is worse than nothing, because "near-miss specificity reads as deception; total abstraction reads as design". It is still the single highest-value thing left to add. A photograph of the actual room, the actual board, the actual person is the one element on a page a visitor can check against the world.',
          fix:
            'Take one photograph on your phone. Crop it tightly rather than running it full bleed, bias the composition left or right rather than centring it, and desaturate it about 8% with `filter: saturate(.92)` so it sits on the page instead of on top of it. One is the recommendation, not the minimum: the corpus says ONE photo maximum, everything else CSS art.'
        }
      ];
    }

    return [
      {
        rel: ctx.pages[0].rel,
        offset: 0,
        scope: 'site',
        what: `No photographs across ${ctx.pages.length} ${ctx.pages.length === 1 ? 'page' : 'pages'}.`,
        measured: '0 <img>, 0 <picture>, 0 CSS background images referencing a file'
      }
    ];
  }
});

export const rules = [sharedSkeleton, ledgerRepeat, zeroImages];
export { skeletonFingerprint, styleFingerprint };
