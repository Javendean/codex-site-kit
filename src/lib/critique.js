/**
 * The critique renderer — the teaching surface.
 *
 * The brief that commissioned this kit says the thing worth repeating here:
 *
 *   "The linter is the curriculum. Every check must return not merely
 *    pass/fail but the reasoning, the named source, and the better move.
 *    Using the tool IS the education… An annotated game, not a score."
 *
 * So this is not a formatter. It is the lesson, and the format is the argument.
 * Five rules govern it:
 *
 *   1. Nothing is ever a bare rule id. A wall of ids teaches nothing and is the
 *      exact failure this output exists to avoid.
 *   2. Every finding answers four questions in the same order, every time:
 *      WHAT was found with the evidence, WHY it matters, WHO says so with a
 *      confidence tag and its caveat, and the MOVE that fixes it.
 *   3. Where the rulebook is not sure, the output says so in the finding. A
 *      confidence_note is printed next to the claim it qualifies, not buried.
 *   4. What could NOT be checked is printed as prominently as what failed. A
 *      clean report that hides eleven unrun rules is a lie by omission.
 *   5. The annotation glyphs are chess glyphs, because that is the vocabulary
 *      the reader already thinks in, and because the corpus's own tiering is by
 *      how fast a viewer clocks the fault — which is precisely what `??`
 *      versus `?!` encodes. The rulebook carries a `chess` note per rule for
 *      the same reason, and it is printed where it exists.
 */

import { GLYPH, GLYPH_MEANING, TIER_LABEL, TIER_ORDER, loadSources } from './rulebook.js';

const WIDTH = 78;
const GUTTER = 8;

let sourcesCache = null;
function sources() {
  if (!sourcesCache) sourcesCache = loadSources().sources;
  return sourcesCache;
}

const line = (char = '─', n = WIDTH) => char.repeat(n);

/** Wrap prose to a width, preserving blank lines and indented code blocks. */
export function wrap(text, width = WIDTH, indent = '') {
  const out = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    if (/^\s{2,}/.test(paragraph)) {
      out.push(indent + paragraph);
      continue;
    }
    let current = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (current === '') current = word;
      else if ((current + ' ' + word).length <= width) current += ' ' + word;
      else {
        out.push(indent + current);
        current = word;
      }
    }
    if (current) out.push(indent + current);
  }
  return out.join('\n');
}

/**
 * A labelled block: the label sits in its own column and the prose hangs to
 * the right, so WHAT / WHY / WHO / MOVE line up down the page and read as four
 * columns of one argument rather than as paragraph soup.
 */
function block(label, text) {
  const body = wrap(text, WIDTH - GUTTER).split('\n');
  return [label.padEnd(GUTTER) + body[0], ...body.slice(1).map((l) => ' '.repeat(GUTTER) + l)].join('\n');
}

const pad = (n = GUTTER) => ' '.repeat(n);

/** Who says so, with the confidence tag and the source's own caveat. */
function provenance(finding) {
  const registry = sources();
  const lines = [];

  const primary = finding.source ?? {};
  const entry = registry[primary.name] ?? {};
  lines.push(`${pad()}${entry.full_name ?? primary.name ?? 'unattributed'}`);
  if (primary.where) lines.push(`${pad(10)}${primary.where}`);
  if (primary.quote) lines.push(`${pad(10)}"${primary.quote}"`);
  lines.push(`${pad(10)}confidence: ${primary.confidence ?? 'unstated'}`);
  if (entry.caveat) lines.push(wrap(`caveat: ${entry.caveat}`, WIDTH - 10, pad(10)));

  for (const also of finding.also_in ?? []) {
    const other = registry[also.name] ?? {};
    lines.push(`${pad()}also: ${other.full_name ?? also.name}${also.where ? ` — ${also.where}` : ''}`);
    if (also.note) lines.push(wrap(also.note, WIDTH - 12, pad(12)));
  }

  return lines.join('\n');
}

/** The evidence a detector actually found, trimmed so a report stays readable. */
function evidence(finding, max = 4) {
  const hits = finding.hits ?? [];
  if (hits.length === 0) return null;
  const shown = hits.slice(0, max).map((h) => {
    const text = String(h.evidence ?? '').replace(/\s+/g, ' ').trim();
    const where = h.where ? ` (${h.where})` : '';
    const body = text.length > 88 ? text.slice(0, 87) + '…' : text;
    return `${pad()}› ${body}${where}`;
  });
  if (hits.length > max) shown.push(`${pad()}› …and ${hits.length - max} more`);
  return shown.join('\n');
}

/** One finding, rendered as an annotated move. */
export function renderFinding(finding, index) {
  const glyph = GLYPH[finding.severity] ?? '?';
  const out = [
    `${String(index).padStart(2)}. ${glyph.padEnd(2)}  ${finding.title}`,
    `${pad()}${finding.page ?? '(site)'}    [${finding.id}]`,
    ''
  ];

  out.push(block('WHAT', finding.what_it_is));
  const ev = evidence(finding);
  if (ev) {
    out.push('');
    out.push(`${pad()}found ${finding.count} ${finding.count === 1 ? 'time' : 'times'}:`);
    out.push(ev);
  }
  out.push('');
  out.push(block('WHY', finding.why_it_matters));

  if (finding.teach) {
    out.push('');
    out.push(block('', finding.teach));
  }
  if (finding.chess) {
    out.push('');
    out.push(block('', `In chess terms: ${finding.chess}`));
  }

  out.push('');
  out.push('WHO     says so:');
  out.push(provenance(finding));

  if (finding.confidence_note) {
    out.push('');
    out.push(block('', `Not proven: ${finding.confidence_note}`));
  }

  out.push('');
  out.push(block('WHERE', `the line is drawn: ${finding.threshold}`));
  if (finding.threshold_provenance && finding.threshold_provenance !== 'from_source') {
    out.push(block('', `That number's provenance: ${finding.threshold_provenance}.`));
  }

  out.push('');
  out.push(block('MOVE', finding.fix));
  if (finding.fix_code) {
    out.push('');
    for (const l of String(finding.fix_code).split('\n')) out.push(pad(10) + l);
  }

  out.push('');
  out.push(`${pad()}Go deeper:  explain_rule("${finding.id}")`);
  return out.join('\n');
}

/**
 * The whole annotated critique.
 *
 * @param {object} o
 * @param {object[]} o.findings     what fired, already sorted and capped
 * @param {object} o.counts         severity counts over ALL findings, not the capped set
 * @param {object[]} o.notRun       rules that could not run, with their reasons
 * @param {object[]} o.passed       rules that ran clean
 * @param {object[]} [o.suppressed] rules that do not apply to this project
 * @param {Map} [o.hidden]          rule id -> how many extra hits were not printed
 * @param {object} o.summary        {title, scanned}
 */
export function renderCritique({
  findings,
  counts,
  notRun = [],
  passed = [],
  suppressed = [],
  hidden = new Map(),
  summary
}) {
  const parts = [];
  const total = counts.fail + counts.warn + counts.info;

  parts.push(line('═'));
  parts.push(`  ${summary.title}`);
  parts.push(line('═'));
  parts.push('');
  parts.push(wrap(summary.scanned, WIDTH, '  '));
  parts.push('');
  parts.push('  ' + scoreline(counts));
  parts.push('');
  parts.push(
    wrap(
      'Read this the way you would read an annotated game. The glyph says how loud the move is, not how wrong. ' +
        Object.entries(GLYPH_MEANING)
          .filter(([g]) => ['??', '?', '?!'].includes(g))
          .map(([g, meaning]) => `${g} is ${meaning.split('—')[1]?.trim() ?? meaning}`)
          .join('; ') +
        '.',
      WIDTH,
      '  '
    )
  );
  parts.push('');

  /* ---- the scoresheet ----
     A long critique is unreadable as a wall. Every finding on one line, in the
     order they are annotated below, so the shape of the game is visible before
     any of the notes are read. */
  if (findings.length > 3) {
    parts.push('  The findings, in order:');
    parts.push('');
    let i = 0;
    for (const tier of TIER_ORDER) {
      for (const f of findings.filter((x) => x.tier === tier)) {
        i += 1;
        const glyph = (GLYPH[f.severity] ?? '?').padEnd(2);
        const title = f.title.length > 44 ? f.title.slice(0, 43) + '…' : f.title;
        parts.push(`   ${String(i).padStart(2)}. ${glyph}  ${title.padEnd(45)} ${f.page ?? ''}`);
      }
    }
    parts.push('');
  }

  /* ---- the findings, by tier ---- */
  let n = 0;
  for (const tier of TIER_ORDER) {
    const group = findings.filter((f) => f.tier === tier);
    if (group.length === 0) continue;
    parts.push('');
    parts.push(line('─'));
    parts.push(`  ${TIER_LABEL[tier] ?? `Tier ${tier}`}`);
    parts.push(line('─'));
    parts.push('');
    for (const finding of group) {
      n += 1;
      parts.push(renderFinding(finding, n));
      parts.push('');
    }
  }

  /* ---- what could not be checked ---- */
  if (notRun.length > 0) {
    parts.push('');
    parts.push(line('─'));
    parts.push(`  NOT CHECKED — ${notRun.length} ${notRun.length === 1 ? 'rule' : 'rules'}. These are not passes.`);
    parts.push(line('─'));
    parts.push('');
    parts.push(
      wrap(
        'A check that quietly passes what it cannot test is worse than one that admits the gap, so every rule that could not run is listed here with the reason.',
        WIDTH,
        '  '
      )
    );
    parts.push('');
    for (const item of notRun) {
      parts.push(`  · ${item.title}  [${item.id}]`);
      parts.push(wrap(item.reason, WIDTH - 4, '      '));
      parts.push('');
    }
  }

  /* ---- the good moves ---- */
  if (passed.length > 0) {
    const shown = passed.slice(0, 14);
    parts.push('');
    parts.push(line('─'));
    parts.push(`  !  Clean — ${passed.length} ${passed.length === 1 ? 'rule' : 'rules'} ran and found nothing`);
    parts.push(line('─'));
    parts.push('');
    parts.push(wrap('An annotated game names the strong moves too. These ran on your files and passed:', WIDTH, '  '));
    parts.push('');
    for (const p of shown) parts.push(`  !  ${p.title}  [${p.id}]`);
    if (passed.length > shown.length) parts.push(`     …and ${passed.length - shown.length} more.`);
    parts.push('');
  }

  /* ---- housekeeping ---- */
  if (suppressed.length > 0) {
    parts.push('');
    parts.push('  Not applicable to this project, so not run:');
    for (const s of suppressed) parts.push(`  · ${s.title} — ${s.note ?? ''}`.trimEnd());
    parts.push('');
  }

  if (hidden.size > 0) {
    parts.push('');
    parts.push('  Some rules fired more times than are printed above:');
    for (const [id, count] of hidden) parts.push(`  · ${id}: ${count} more not shown`);
    parts.push(wrap('Fix the ones shown and run review_site again; the rest are the same problem.', WIDTH, '  '));
    parts.push('');
  }

  parts.push('');
  parts.push(line('═'));
  parts.push(wrap(nextStep(findings, counts, notRun, total), WIDTH, '  '));
  parts.push(line('═'));

  return parts.join('\n');
}

function scoreline(counts) {
  const words = {
    fail: ['blunder', 'blunders'],
    warn: ['mistake', 'mistakes'],
    info: ['questionable habit', 'questionable habits']
  };
  const parts = [];
  for (const key of ['fail', 'warn', 'info']) {
    const n = counts[key];
    if (!n) continue;
    parts.push(`${GLYPH[key]} ${n} ${words[key][n === 1 ? 0 : 1]}`);
  }
  return parts.length ? parts.join('   ') : 'nothing fired';
}

function nextStep(findings, counts, notRun, total) {
  if (total === 0) {
    return notRun.length > 0
      ? `Nothing fired. That is worth something, and it is not the same as finished: ${notRun.length} rules could not run here and are listed above. Read that list before treating this as a pass.`
      : 'Nothing fired, and every rule ran. That is as clean as this tool can tell you a page is.';
  }
  const first = findings[0];
  if (counts.fail > 0) {
    return `Start with number 1 — "${first.title}". The ?? findings are the ones a visitor clocks before reading a word, so they buy the most per edit. Fix ONE, then run review_site again: seeing which single change moved the count is where the reasoning sticks.`;
  }
  if (counts.warn > 0) {
    return `No blunders. Start with number 1 — "${first.title}" — and work down. The ? findings are felt rather than named, which is exactly why they are worth more than they look.`;
  }
  return `Nothing loud is left. What remains is habit and drift: worth a pass when you have half an hour, not worth interrupting the work for. Start with "${first.title}".`;
}

/** The long-form teaching note for one rule, used by explain_rule. */
export function renderRule(rule) {
  const registry = sources();
  const out = [];
  const glyph = GLYPH[rule.severity] ?? '?';

  out.push(`${glyph}  ${rule.title}`);
  out.push(`${pad()}[${rule.id}]   ${TIER_LABEL[rule.tier] ?? `tier ${rule.tier}`}   ·   ${rule.category}`);
  out.push('');
  out.push(block('WHAT', rule.what_it_is));
  out.push('');
  out.push(block('WHY', rule.why_it_matters));

  if (rule.teach) {
    out.push('');
    out.push(block('TEACH', rule.teach));
  }
  if (rule.chess) {
    out.push('');
    out.push(block('CHESS', rule.chess));
  }

  out.push('');
  out.push(block('WHERE', `the line is drawn: ${rule.threshold}`));
  if (rule.threshold_provenance) {
    out.push(block('', `That number came from: ${rule.threshold_provenance}.`));
  }

  out.push('');
  out.push(block('MOVE', rule.fix));
  if (rule.fix_code) {
    out.push('');
    for (const l of String(rule.fix_code).split('\n')) out.push(pad(10) + l);
  }

  out.push('');
  out.push('WHO     says so:');
  out.push(provenance(rule));

  if (rule.confidence_note) {
    out.push('');
    out.push(block('', `Not proven: ${rule.confidence_note}`));
  }

  if (rule.measured) {
    out.push('');
    out.push('MEASURED against the corpus this rulebook was built from:');
    const m = rule.measured;
    out.push(`${pad()}${m.corpus ?? 'corpus'}: fired on ${m.pages_firing ?? 0} of ${m.pages_total ?? '?'} pages, ${m.hits_total ?? 0} hits.`);
    if (m.note) out.push(wrap(m.note, WIDTH - 8, pad()));
  }

  if (rule.review_by) {
    out.push('');
    out.push(
      wrap(
        `This rule has an expiry: ${rule.review_by}. Trap-tier rules are time-limited by construction — they describe things that read as sophisticated now and will not later, so the claim has to be re-checked rather than inherited.`,
        WIDTH - 8,
        pad()
      )
    );
  }

  out.push('');
  out.push(`${pad()}Detector: ${rule.detector?.kind ?? 'unknown'}   ·   severity: ${rule.severity}`);
  return out.join('\n');
}
