/**
 * The rule engine: the shape of a rule, the context every rule reads, and the
 * registration check that makes provenance a build error rather than a habit.
 *
 * The design constraint, from the brief that commissioned this kit:
 *
 *   No finding may be a bare boolean. Every one carries WHAT, WHY, WHO SAYS
 *   SO, and WHAT TO DO.
 *
 * So a rule is not a predicate. It is a teaching note with a detector attached,
 * and the detector is the smaller half. `register()` below refuses anything
 * missing a threshold, a why, a fix, a confidence tag, or a registered source.
 */

import { requireSource, CONFIDENCE } from './sources.js';
import { parse } from '../lib/dom.js';
import { analyse, inlineStyles, inlineStyleAttributes } from '../lib/css.js';
import { lineIndex } from '../lib/files.js';

/**
 * Severity, in the vocabulary of an annotated game.
 *
 * This is not decoration. The corpus ranks its tells by how fast a
 * non-technical viewer clocks them, which is exactly the axis a chess
 * annotator uses: a blunder is the one your opponent sees immediately.
 */
export const SEVERITY = {
  BLUNDER: 'blunder',   // ??  seen in five seconds, no vocabulary needed
  MISTAKE: 'mistake',   // ?   felt rather than named, but decisive
  DUBIOUS: 'dubious',   // ?!  questionable; often a copy habit
  TRAP: 'trap',         // !?  reads as sophisticated today, will not for long
  NOTE: 'note'          // !   something worth knowing, or worth keeping
};

export const GLYPH = {
  blunder: '??',
  mistake: '?',
  dubious: '?!',
  trap: '!?',
  note: '!'
};

export const SEVERITY_RANK = { blunder: 0, mistake: 1, dubious: 2, trap: 3, note: 4 };

export const TIERS = {
  1: 'Tier 1 — clocked in five seconds, no design vocabulary needed',
  2: 'Tier 2 — felt rather than named, but decisive',
  3: 'Tier 3 — copy, which for a teaching business may matter most of all',
  trap: 'The trap tier — reads as sophisticated today, will read as generated soon',
  floor: 'The floor — what makes a page look broken rather than cheap',
  honesty: 'Honesty — claims that cannot be checked, and claims that are not yours',
  variety: 'Variety — the tell that is not on any single page'
};

export const TIER_ORDER = [1, 2, 'floor', 'honesty', 3, 'trap', 'variety'];

const REQUIRED = ['id', 'tier', 'title', 'severity', 'confidence', 'who', 'threshold', 'why', 'fix', 'detect'];

/**
 * Validate and normalise a rule definition.
 * @param {object} rule
 */
export function register(rule) {
  for (const key of REQUIRED) {
    if (rule[key] === undefined || rule[key] === null || rule[key] === '') {
      throw new Error(`Rule "${rule.id ?? '(no id)'}" is missing "${key}". A rule without one is not shippable.`);
    }
  }
  if (!Object.values(SEVERITY).includes(rule.severity)) {
    throw new Error(`Rule "${rule.id}" has severity "${rule.severity}", which is not one of ${Object.values(SEVERITY).join(', ')}.`);
  }
  if (!Object.values(CONFIDENCE).includes(rule.confidence)) {
    throw new Error(`Rule "${rule.id}" has confidence "${rule.confidence}", which is not one of ${Object.values(CONFIDENCE).join(', ')}.`);
  }
  if (!Array.isArray(rule.who) || rule.who.length === 0) {
    throw new Error(`Rule "${rule.id}" cites no source. A rule with no provenance is not shippable.`);
  }
  for (const id of rule.who) requireSource(id);
  if (!TIERS[rule.tier]) {
    throw new Error(`Rule "${rule.id}" is in tier "${rule.tier}", which is not a tier.`);
  }
  return Object.freeze({ ...rule });
}

/* ------------------------------------------------------------------ *
 * The context
 * ------------------------------------------------------------------ */

/**
 * Build the object every rule reads.
 *
 * @param {{root: string, files: Array<{rel: string, kind: string, text: string}>, ledger?: object, now?: Date}} input
 */
export function buildContext({ root, files, ledger = null, now = new Date() }) {
  const pages = [];
  const stylesheets = [];
  const scripts = [];
  const documents = [];
  const byRel = new Map();

  for (const file of files) {
    byRel.set(file.rel, file);
    if (file.kind === 'html') {
      const tree = parse(file.text);
      const page = {
        rel: file.rel,
        text: file.text,
        tree,
        styleBlocks: inlineStyles(file.text),
        styleAttributes: inlineStyleAttributes(file.text)
      };
      pages.push(page);
      documents.push(page);
    } else if (file.kind === 'css') {
      stylesheets.push({ rel: file.rel, text: file.text });
    } else if (file.kind === 'js') {
      scripts.push({ rel: file.rel, text: file.text });
    } else if (file.kind === 'md') {
      documents.push({ rel: file.rel, text: file.text, tree: null, markdown: true });
    }
  }

  // Every CSS body in the project, wherever it lives, with the offset that maps
  // a position inside it back to a position inside its own file.
  const cssSources = [];
  for (const sheet of stylesheets) cssSources.push({ rel: sheet.rel, css: sheet.text, base: 0, from: 'stylesheet' });
  for (const page of pages) {
    for (const block of page.styleBlocks) {
      cssSources.push({ rel: page.rel, css: block.css, base: block.offset, from: '<style> block' });
    }
    for (const attr of page.styleAttributes) {
      cssSources.push({ rel: page.rel, css: `*{${attr.css}}`, base: attr.offset - 2, from: 'style attribute', isAttribute: true });
    }
  }

  const decls = [];
  const blocks = [];
  for (const source of cssSources) {
    let parsed;
    try {
      parsed = analyse(source.css);
    } catch {
      continue;
    }
    for (const d of parsed.all) {
      decls.push({ ...d, rel: source.rel, offset: source.base + d.offset, from: source.from });
    }
    for (const b of parsed.blocks) {
      blocks.push({ ...b, rel: source.rel, offset: source.base + b.offset, from: source.from });
    }
  }

  const indexCache = new Map();
  function position(rel, offset) {
    const file = byRel.get(rel);
    if (!file) return { line: 1, column: 1 };
    if (!indexCache.has(rel)) indexCache.set(rel, lineIndex(file.text));
    const index = indexCache.get(rel);
    const at = Math.max(0, Math.min(offset, file.text.length));
    return { line: index.lineAt(at), column: index.columnAt(at) };
  }

  function excerpt(rel, offset, length = 90) {
    const file = byRel.get(rel);
    if (!file) return '';
    const text = file.text;
    let start = offset;
    while (start > 0 && text[start - 1] !== '\n' && offset - start < 60) start--;
    const raw = text.slice(start, Math.min(text.length, start + length));
    return raw.replace(/\s+/g, ' ').trim();
  }

  return {
    root,
    files,
    byRel,
    pages,
    stylesheets,
    scripts,
    documents,
    cssSources,
    decls,
    blocks,
    ledger,
    now,
    position,
    excerpt,
    /** All CSS in the project as one string — for presence checks only, never for offsets. */
    allCss: cssSources.map((s) => s.css).join('\n'),
    /** All HTML in the project as one string — presence checks only. */
    allHtml: pages.map((p) => p.text).join('\n')
  };
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

/**
 * Run a rulebook over a context.
 *
 * A rule that throws is reported as a rule failure rather than being allowed to
 * take the whole review down with it. A review that dies on one bad page is
 * worse than a review that says "this rule could not run here".
 *
 * @returns {{findings: object[], passed: object[], errors: object[]}}
 */
export function run(rules, ctx, { only = null, skip = [] } = {}) {
  const findings = [];
  const passed = [];
  const errors = [];
  const skipSet = new Set(skip);

  for (const rule of rules) {
    if (only && !only.includes(rule.id)) continue;
    if (skipSet.has(rule.id)) continue;

    let hits;
    try {
      hits = rule.detect(ctx) || [];
    } catch (err) {
      errors.push({ rule: rule.id, message: String(err?.message ?? err).split('\n')[0] });
      continue;
    }

    if (hits.length === 0) {
      if (rule.creditWhenClean) passed.push({ rule: rule.id, title: rule.title, credit: rule.creditWhenClean });
      continue;
    }

    for (const hit of hits) {
      const where = hit.rel && hit.offset != null ? ctx.position(hit.rel, hit.offset) : null;
      findings.push({
        rule: rule.id,
        tier: rule.tier,
        title: hit.title || rule.title,
        // A rule may soften one hit. A declared, labelled hole is the honest
        // form of the thing the rule is looking for, and reporting it at the
        // same volume as the dishonest form would teach the wrong lesson.
        severity: hit.severity || rule.severity,
        confidence: hit.confidence || rule.confidence,
        who: rule.who,
        threshold: rule.threshold,
        why: hit.why || rule.why,
        fix: hit.fix || rule.fix,
        file: hit.rel ?? null,
        line: where?.line ?? null,
        column: where?.column ?? null,
        excerpt: hit.excerpt ?? (hit.rel && hit.offset != null ? ctx.excerpt(hit.rel, hit.offset) : null),
        what: hit.what,
        measured: hit.measured ?? null,
        scope: hit.scope ?? (hit.rel ? 'file' : 'site')
      });
    }
  }

  findings.sort((a, b) => {
    const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (t !== 0) return t;
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    if (a.rule !== b.rule) return a.rule.localeCompare(b.rule);
    if ((a.file ?? '') !== (b.file ?? '')) return (a.file ?? '').localeCompare(b.file ?? '');
    return (a.line ?? 0) - (b.line ?? 0);
  });

  return { findings, passed, errors };
}

/** Cap the number of findings one rule may report, so one bad file cannot bury the rest. */
export function capPerRule(findings, cap = 6) {
  const seen = new Map();
  const kept = [];
  const suppressed = new Map();
  for (const f of findings) {
    const n = (seen.get(f.rule) ?? 0) + 1;
    seen.set(f.rule, n);
    if (n <= cap) kept.push(f);
    else suppressed.set(f.rule, (suppressed.get(f.rule) ?? 0) + 1);
  }
  return { kept, suppressed };
}
