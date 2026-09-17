/**
 * The adapter between the rulebook and the MCP tools.
 *
 * The rulebook lives in `rules/` as data — 155 declarative rules, each with a
 * detector, a threshold, a source, and the four fields that make a finding
 * teachable. This file is the only place the tools touch it, so there is one
 * way in and one shape of finding coming out.
 *
 * Three things it does that are not obvious:
 *
 *  1. It splices linked stylesheets into the page before analysis. `analysePage`
 *     reads a document, and a real site keeps its CSS in a separate file; a
 *     checker that only sees inline <style> would report a clean page and mean
 *     "I could not see the stylesheet".
 *
 *  2. It keeps `not_run` findings and hands them back as a separate list.
 *     A rule that could not run is not a rule that passed, and the difference
 *     is the whole reason this kit exists. They are reported, never dropped.
 *
 *  3. It computes the page fingerprint and loads the variety ledger, so the
 *     five ledger rules — the ones that catch the deepest tell, every site you
 *     ship sharing a skeleton — can actually run.
 */

import { loadRules, loadSources, RULEBOOK_META } from '../../rules/index.js';
import { analysePage, parseCss, parseKeyframes } from '../../rules/page.js';
import { checkAll, applyExpiry } from '../../rules/engine.js';
import { fingerprint } from '../../rules/fingerprint.js';
import { readLedger } from '../../rules/ledger.js';

let cache = null;

/** Load the rulebook once per process. Strict: a broken rulebook must not ship. */
export function rulebook() {
  if (!cache) {
    const { rules, sources, problems } = loadRules({ strict: true });
    cache = { rules, sources, problems, meta: RULEBOOK_META, byId: new Map(rules.map((r) => [r.id, r])) };
  }
  return cache;
}

/** Tier order and labels for a report. Loudest first, which is how the corpus ranks them. */
export const TIER_ORDER = [1, 2, 'floor', 'honesty', 'structure', 3, 'craft', 'trap', 'ledger'];

export const TIER_LABEL = {
  1: 'Tier 1 — clocked in five seconds, no design vocabulary needed',
  2: 'Tier 2 — felt rather than named, but decisive',
  3: 'Tier 3 — copy, which for a teaching practice may matter most of all',
  floor: 'The floor — what makes a page look broken rather than cheap',
  honesty: 'Honesty — claims that cannot be checked, and claims that are not yours',
  structure: 'Structure — the shape of the document underneath the paint',
  craft: 'Craft — the details that separate considered from competent',
  trap: 'The trap tier — reads as sophisticated today, will read as generated soon',
  ledger: 'Variety — the tell that is not on any single page'
};

/**
 * Chess annotation, by severity.
 *
 * Not decoration. The corpus ranks its tells by how fast a viewer clocks them,
 * which is exactly the axis a chess annotator uses: a blunder is the one your
 * opponent sees immediately. The rulebook carries a `chess` note per rule for
 * the same reason.
 */
export const GLYPH = { fail: '??', warn: '?', info: '?!' };
export const GLYPH_MEANING = {
  '??': 'a blunder — seen in five seconds by someone with no design vocabulary',
  '?': 'a mistake — felt rather than named, and decisive anyway',
  '?!': 'dubious — a habit worth dropping, not an emergency',
  '!?': 'speculative — reads well today and will not for long',
  '!': 'worth knowing — not a fault'
};

const SEVERITY_RANK = { fail: 0, warn: 1, info: 2 };

/**
 * Build one analysed page, with any linked stylesheet spliced in.
 *
 * @param {{rel: string, html: string, stylesheets: Array<{rel: string, text: string}>}} o
 */
export function buildPage({ rel, html, stylesheets = [], declared = {} }) {
  const page = analysePage(html, { path: rel, id: rel, declared });

  const linked = linkedStylesheets(html, rel, stylesheets);
  for (const sheet of linked) {
    page.cssSource += '\n' + sheet.text;
    page.cssRules.push(...parseCss(sheet.text, 'sheet'));
    for (const [name, frames] of Object.entries(parseKeyframes(sheet.text) || {})) {
      page.keyframes[name] = frames;
    }
  }
  page.linkedStylesheets = linked.map((s) => s.rel);
  page.missingStylesheets = missingStylesheets(html, rel, stylesheets);
  return page;
}

/** Resolve <link rel=stylesheet href> against the files that were actually read. */
function linkedStylesheets(html, rel, stylesheets) {
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const out = [];
  for (const href of stylesheetHrefs(html)) {
    const candidates = [href, dir ? `${dir}/${href}` : null, href.replace(/^\.\//, '')].filter(Boolean);
    const found = stylesheets.find((s) => candidates.includes(s.rel));
    if (found) out.push(found);
  }
  return out;
}

function missingStylesheets(html, rel, stylesheets) {
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  return stylesheetHrefs(html).filter((href) => {
    if (/^(https?:)?\/\//.test(href)) return false; // an external sheet is a different problem
    const candidates = [href, dir ? `${dir}/${href}` : null, href.replace(/^\.\//, '')].filter(Boolean);
    return !stylesheets.some((s) => candidates.includes(s.rel));
  });
}

function stylesheetHrefs(html) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = (href?.[1] ?? href?.[2] ?? href?.[3] ?? '').split('?')[0].split('#')[0];
    if (value) out.push(value);
  }
  return out;
}

/**
 * Run the rulebook over a set of pages.
 *
 * @param {object} o
 * @param {object[]} o.pages     from buildPage
 * @param {object[]} [o.rules]   defaults to the whole rulebook
 * @param {object} [o.project]   declared project facts, for suppress_when
 * @param {object} [o.ledger]    from readLedger; pass null to skip the ledger rules
 * @param {Date} [o.now]
 * @returns {{findings: object[], notRun: object[], passed: object[], suppressed: object[], counts: object}}
 */
export function review({
  pages,
  rules = null,
  project = {},
  ledger = undefined,
  now = new Date(),
  paletteOptions = null,
  selfId = null
}) {
  const book = rulebook();
  const active = rules ?? book.rules;
  const lg = ledger === undefined ? readLedger() : ledger;

  const findings = [];
  const notRun = new Map();
  const passed = new Map();
  const suppressed = new Map();

  // TWO PASSES, and the first one is the whole point of the variety family.
  //
  // Previously review() looped pages once and compared each against the HOME
  // ledger only, so pages read in the same call were never compared to each
  // other. Pointed at the 13-page previews corpus — whose documented defect is
  // that all 13 collapse to ONE skeleton hash — every variety rule reported
  // CLEAN. The kit's own rules/fingerprint.js measured the collision correctly
  // the whole time; the wiring simply never handed it the siblings.
  //
  // It also made results machine-dependent: a rule fired or not depending on
  // whether the reviewer's ~/.codex-site-kit/ledger.json happened to hold that
  // hash, so "0 findings" was not reproducible on another machine.
  const prints = new Map();
  for (const page of pages) {
    try {
      const p = fingerprint(page);
      if (selfId) p.id = `${selfId}:${p.facets.skeleton}`;
      prints.set(page.path, p);
    } catch {
      prints.set(page.path, null);
    }
  }
  // Sibling ids are keyed on the PATH, never on page.id. With selfId set, every
  // same-skeleton page collapses to one id, and comparisonSet drops entries by
  // id — so id-keyed siblings would all be filtered out as "self" and the fix
  // would silently do nothing. The per-page exclusion below is by path instead,
  // which is correct whatever the id scheme.
  const siblings = [...prints.entries()]
    .filter(([, p]) => p)
    .map(([path, p]) => ({
      id: `run:${path}`,
      built_at: null,
      label: path,
      path_hint: path,
      facets: p.facets,
      vectors: p.vectors,
      declared: p.declared || {},
      from_this_run: true
    }));

  for (const page of pages) {
    let print = prints.get(page.path) ?? null;
    try {
      if (!print) print = fingerprint(page);
      // The ledger identifies a build by folder and skeleton. Reviewing a site
      // that is already in the ledger must not report the site as a copy of
      // ITSELF, so the id is constructed the same way here as it is when
      // init_site records it, and the ledger's own comparison set drops it.
      if (selfId) print.id = `${selfId}:${print.facets.skeleton}`;
    } catch {
      print = null;
    }

    // Siblings go last: comparisonSet takes the LAST N entries, and the pages in
    // this same run are the most relevant comparison a page has.
    const pageLedger = lg
      ? { ...lg, entries: [...(lg.entries || []), ...siblings.filter((s) => s.path_hint !== page.path)] }
      : lg;

    const results = checkAll(active, page, {
      now,
      project,
      ledger: pageLedger,
      fingerprint: print,
      paletteOptions
    });

    for (const r of results) {
      if (r.status === 'fire') {
        findings.push({ ...r, page: page.path });
        continue;
      }
      if (r.status === 'not_run') {
        if (!notRun.has(r.id)) {
          const rule = book.byId.get(r.id);
          notRun.set(r.id, {
            id: r.id,
            title: rule?.title ?? r.id,
            tier: rule?.tier ?? '?',
            kind: rule?.detector?.kind ?? 'unknown',
            reason: r.reason ?? r.note ?? 'no reason given'
          });
        }
        continue;
      }
      if (r.status === 'suppressed') {
        if (!suppressed.has(r.id)) suppressed.set(r.id, { id: r.id, title: r.title, note: r.note });
        continue;
      }
      if (r.status === 'pass' && !passed.has(r.id)) {
        const rule = book.byId.get(r.id);
        passed.set(r.id, { id: r.id, title: rule?.title ?? r.id, tier: rule?.tier ?? '?' });
      }
    }
  }

  // A rule that fires on one page and passes on another has fired.
  for (const f of findings) passed.delete(f.id);

  findings.sort((a, b) => {
    const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (t !== 0) return t;
    const s = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
    if (s !== 0) return s;
    if (a.page !== b.page) return String(a.page).localeCompare(String(b.page));
    return a.id.localeCompare(b.id);
  });

  const counts = { fail: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  return {
    findings,
    notRun: [...notRun.values()],
    passed: [...passed.values()],
    suppressed: [...suppressed.values()],
    counts,
    ledger: lg,
    rulesRun: active.length
  };
}

/** Cap how many times one rule may report, so one bad file cannot bury the rest. */
export function capPerRule(findings, cap = 4) {
  const seen = new Map();
  const kept = [];
  const hidden = new Map();
  for (const f of findings) {
    const n = (seen.get(f.id) ?? 0) + 1;
    seen.set(f.id, n);
    if (n <= cap) kept.push(f);
    else hidden.set(f.id, (hidden.get(f.id) ?? 0) + 1);
  }
  return { kept, hidden };
}

export { applyExpiry, loadSources, fingerprint, readLedger, RULEBOOK_META };
