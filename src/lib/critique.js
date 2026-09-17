/**
 * The critique renderer — the teaching surface.
 *
 * The brief that commissioned this kit says the thing worth repeating here:
 *
 *   "The linter is the curriculum. Every check must return not merely
 *    pass/fail but the reasoning, the named source, and the better move.
 *    Using the tool IS the education… An annotated game, not a score."
 *
 * So this file is not a formatter. It is the lesson, and the format is the
 * argument. Four rules govern it:
 *
 *   1. Nothing is a bare rule id. A wall of ids teaches nothing and is the
 *      failure mode this output exists to avoid.
 *   2. Every finding answers four questions in the same order, every time:
 *      WHAT was found (with the measurement), WHY it matters, WHO says so
 *      (with a confidence tag), and the MOVE that fixes it.
 *   3. Good moves are named too. An annotated game marks the strong move as
 *      well as the blunder, and a critique that only lists faults teaches a
 *      player to fear the board.
 *   4. The annotation glyphs are the chess ones, because they are the exact
 *      vocabulary the reader already thinks in — and because the corpus's own
 *      tiering is by how fast a viewer clocks the fault, which is precisely
 *      what `??` versus `?!` encodes.
 */

import { GLYPH, TIERS, TIER_ORDER, SEVERITY_RANK } from '../rules/engine.js';
import { SOURCES, CONFIDENCE_NOTE, citeLine } from '../rules/sources.js';

const SEVERITY_WORD = {
  blunder: ['blunder', 'blunders'],
  mistake: ['mistake', 'mistakes'],
  dubious: ['questionable habit', 'questionable habits'],
  trap: ['move whose time is passing', 'moves whose time is passing'],
  note: ['note', 'notes']
};

const rule = (char = '─', n = 74) => char.repeat(n);

function wrap(text, width, indent = '') {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    // Preserve deliberately indented code blocks inside a teaching note.
    if (/^\s{4}/.test(paragraph)) {
      out.push(indent + paragraph);
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line === '') line = word;
      else if ((line + ' ' + word).length <= width) line += ' ' + word;
      else {
        out.push(indent + line);
        line = word;
      }
    }
    if (line) out.push(indent + line);
  }
  return out.join('\n');
}

/** "styles.css:14:3" — the form a terminal and an editor both linkify. */
function where(finding) {
  if (!finding.file) return '(whole site)';
  if (finding.line == null) return finding.file;
  return finding.column == null ? `${finding.file}:${finding.line}` : `${finding.file}:${finding.line}:${finding.column}`;
}

/** The WHO block: each source on its own line, with the confidence tag. */
function provenance(finding) {
  const lines = finding.who.map((id) => `       · ${SOURCES[id].label}`);
  lines.push(`       · confidence: ${finding.confidence}`);
  return lines.join('\n');
}

/**
 * One finding, rendered as an annotated move.
 */
/**
 * A labelled block: the label sits in its own column and the prose hangs to
 * its right, so WHAT / WHY / MOVE line up down the page and can be read as
 * three columns of one argument rather than as a paragraph soup.
 */
function block(label, text, width = 74) {
  const gutter = 7;
  const body = wrap(text, width - gutter).split('\n');
  const head = label.padEnd(gutter) + body[0];
  const rest = body.slice(1).map((l) => ' '.repeat(gutter) + l);
  return [head, ...rest].join('\n');
}

export function renderFinding(finding, index, { width = 74 } = {}) {
  const glyph = GLYPH[finding.severity] ?? '?';
  const lines = [
    `${String(index).padStart(2)}. ${glyph.padEnd(2)}  ${finding.title}`,
    `       ${where(finding)}   [${finding.rule}]`,
    ''
  ];

  lines.push(block('WHAT', finding.what, width));
  if (finding.measured) lines.push(block('', `measured: ${finding.measured}`, width));
  if (finding.excerpt) {
    lines.push('       > ' + (finding.excerpt.length > 84 ? finding.excerpt.slice(0, 83) + '…' : finding.excerpt));
  }
  lines.push('');
  lines.push(block('WHY', finding.why, width));
  lines.push('');
  lines.push('WHO    says so:');
  lines.push(provenance(finding));
  lines.push('');
  lines.push(block('MOVE', finding.fix, width));
  lines.push('');
  lines.push(`       Go deeper:  explain_rule("${finding.rule}")`);
  return lines.join('\n');
}

/**
 * The full annotated critique.
 *
 * @param {object} o
 * @param {object[]} o.findings
 * @param {object[]} o.passed        rules that ran clean and are worth crediting
 * @param {object[]} o.errors        rules that could not run
 * @param {object} o.summary        counts and what was scanned
 * @param {object[]} o.notMeasured  checks this run could not perform, with the command that would
 */
export function renderCritique({ findings, passed = [], errors = [], summary, notMeasured = [], suppressed = new Map() }) {
  const parts = [];
  const counts = countBySeverity(findings);

  /* ---- the verdict ---- */
  parts.push(rule('═'));
  parts.push(`  ${summary.title}`);
  parts.push(rule('═'));
  parts.push('');
  parts.push(
    wrap(
      `${summary.scanned}. ${findings.length === 0 ? 'Nothing in the rulebook fired.' : `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}, ordered by how fast a visitor would notice.`}`,
      74
    )
  );
  parts.push('');
  parts.push('  ' + scoreline(counts));
  parts.push('');
  parts.push(
    wrap(
      'Read this the way you would read an annotated game. The glyph is how loud the move is, not how wrong: ?? is seen in five seconds by someone with no design vocabulary, ? is felt rather than named, ?! is a habit worth dropping, !? is a move that reads well today and will not for long, and ! is something worth keeping.',
      74,
      '  '
    )
  );
  parts.push('');

  /* ---- the move list ----
     A long critique is unreadable as a wall. This is the scoresheet: every
     finding on one line, in the order they are annotated below, so the shape
     of the game is visible before any of the notes are read. */
  if (findings.length > 3) {
    parts.push('  The findings, in order:');
    parts.push('');
    let i = 0;
    for (const tier of TIER_ORDER) {
      for (const f of findings.filter((x) => x.tier === tier)) {
        i += 1;
        const glyph = (GLYPH[f.severity] ?? '?').padEnd(2);
        parts.push(`   ${String(i).padStart(2)}. ${glyph}  ${f.title.padEnd(42)} ${where(f)}`);
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
    parts.push(rule('─'));
    parts.push(`  ${TIERS[tier]}`);
    parts.push(rule('─'));
    parts.push('');
    for (const finding of group) {
      n += 1;
      parts.push(renderFinding(finding, n));
      parts.push('');
    }
  }

  /* ---- what could not be measured ---- */
  if (notMeasured.length > 0) {
    parts.push('');
    parts.push(rule('─'));
    parts.push('  Not measured — these are not passes');
    parts.push(rule('─'));
    parts.push('');
    for (const item of notMeasured) {
      parts.push(wrap(`· ${item.what}`, 74, '  '));
      parts.push(wrap(`  ${item.how}`, 74, '  '));
      parts.push('');
    }
  }

  /* ---- the good moves ---- */
  if (passed.length > 0) {
    parts.push('');
    parts.push(rule('─'));
    parts.push('  ! Good moves — things this page does that most do not');
    parts.push(rule('─'));
    parts.push('');
    for (const p of passed) {
      parts.push(wrap(`!  ${p.credit}`, 74, '  '));
      parts.push('');
    }
  }

  /* ---- housekeeping ---- */
  if (suppressed.size > 0) {
    const lines = [...suppressed.entries()].map(([id, count]) => `  · ${id}: ${count} more not shown`);
    parts.push('');
    parts.push('  Some rules fired more times than are printed above:');
    parts.push(lines.join('\n'));
    parts.push('  Fix the ones shown and run review_site again; the rest are the same problem.');
  }

  if (errors.length > 0) {
    parts.push('');
    parts.push('  These rules could not run on this site, so nothing they check was checked:');
    for (const e of errors) parts.push(`  · ${e.rule}: ${e.message}`);
  }

  parts.push('');
  parts.push(rule('═'));
  parts.push(wrap(nextStep(findings, counts), 74, '  '));
  parts.push(rule('═'));

  return parts.join('\n');
}

function countBySeverity(findings) {
  const counts = { blunder: 0, mistake: 0, dubious: 0, trap: 0, note: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

function scoreline(counts) {
  const parts = [];
  for (const key of ['blunder', 'mistake', 'dubious', 'trap', 'note']) {
    const n = counts[key];
    if (!n) continue;
    parts.push(`${GLYPH[key]} ${n} ${SEVERITY_WORD[key][n === 1 ? 0 : 1]}`);
  }
  return parts.length ? parts.join('   ') : 'no findings';
}

function nextStep(findings, counts) {
  if (findings.length === 0) {
    return 'Nothing fired. That is worth something, and it is not the same as finished: this tool reads files, so anything that only exists once the page is rendered — sideways scroll, a button label wrapping to two lines, real contrast on a real screen — is measured by check_responsive, not here.';
  }
  const first = findings[0];
  if (counts.blunder > 0) {
    return `Start with number 1 — "${first.title}". The ?? findings are the ones a visitor clocks before reading a word, so they buy the most per edit. Then run review_site again: fixing one of these often clears two.`;
  }
  if (counts.mistake > 0) {
    return `No blunders. Start with number 1 — "${first.title}" — and work down; the ? findings are felt rather than named, which is why they are worth more than they look.`;
  }
  return `Nothing loud is left. What remains is habit and drift: worth a pass when you have half an hour, not worth interrupting the work for. Start with "${first.title}".`;
}

/**
 * The long-form teaching note for one rule, used by explain_rule.
 */
export function renderRule(rule, { width = 74 } = {}) {
  const parts = [];
  parts.push(rule.title ? `${GLYPH[rule.severity]}  ${rule.title}` : rule.id);
  parts.push(`    [${rule.id}]   ${TIERS[rule.tier]}`);
  parts.push('');
  parts.push('WHAT IT LOOKS FOR');
  parts.push(wrap(rule.threshold, width, '  '));
  parts.push('');
  parts.push('WHY IT MATTERS');
  parts.push(wrap(rule.why, width, '  '));
  parts.push('');
  parts.push('THE BETTER MOVE');
  parts.push(wrap(rule.fix, width, '  '));
  if (rule.more) {
    parts.push('');
    parts.push('ALSO WORTH KNOWING');
    parts.push(wrap(rule.more, width, '  '));
  }
  parts.push('');
  parts.push(`CONFIDENCE: ${rule.confidence}`);
  parts.push(wrap(CONFIDENCE_NOTE[rule.confidence], width, '  '));
  parts.push('');
  parts.push('SOURCES');
  for (const id of rule.who) {
    const s = SOURCES[id];
    parts.push(`  ${s.label}`);
    parts.push(wrap(s.what, width - 4, '    '));
    if (s.url) parts.push(`    ${s.url}`);
    if (s.caveat) {
      parts.push(wrap(`Caveat: ${s.caveat}`, width - 4, '    '));
    }
    parts.push('');
  }
  return parts.filter((p) => p !== undefined).join('\n');
}

export { wrap, where, citeLine };
