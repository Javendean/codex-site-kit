/**
 * explain_rule — the way in from a critique to the reasoning behind it.
 *
 * A review names a rule in square brackets. This returns everything behind that
 * name: what it looks for and at exactly what threshold, why it matters, what
 * the rulebook is trying to teach through it, the chess analogy where there is
 * one, the better move with its code, every source with its own caveat, what
 * the rule actually measured across the thirteen-page corpus the rulebook was
 * built against, and — for the trap tier — the date by which the claim has to
 * be re-checked rather than inherited.
 *
 * The caveats are not decoration. Half the value of this corpus is that it
 * records where its own sources are weak: Hallmark has a commercial interest in
 * the problem seeming large, Krebs self-reports a 5-10% false-positive rate,
 * CodeStitch's contrast advice is wrong, and the tiering itself is a hypothesis
 * nobody has tested. A tool that quoted the conclusions and dropped the caveats
 * would be a worse tool than the documents it was built from.
 */

import { z } from 'zod';

import { STATUS, failure, guard, toolResult } from '../lib/report.js';
import { renderRule } from '../lib/critique.js';
import { rulebook, loadSources, TIER_ORDER, TIER_LABEL, GLYPH, RULEBOOK_META } from '../lib/rulebook.js';
import { commonOutput } from './common.js';

const TOOL = 'explain_rule';

export const name = TOOL;

export const config = {
  title: 'Read the full teaching note for one rule',
  description: [
    'Given a rule id from a review — the part in square brackets — return the whole note:',
    'the exact trigger condition and where that number came from, why it matters, what it is',
    'teaching, the better move with its code, every source with its own caveat, and what the',
    'rule measured across the corpus the rulebook was built from.',
    '',
    'Call it with no id to list the rulebook. Pass a tier, a category, or a search term to',
    'narrow it.'
  ].join('\n'),
  inputSchema: {
    rule: z.string().optional().describe('A rule id, for example "T2-EDGE-STRIPE". Leave it out to list the rulebook.'),
    tier: z
      .union([z.string(), z.number()])
      .optional()
      .describe('List one tier: 1, 2, 3, "floor", "honesty", "structure", "craft", "trap" or "ledger".'),
    search: z.string().optional().describe('List rules whose title or description contains this text.')
  },
  outputSchema: {
    ...commonOutput,
    rule: z
      .object({
        id: z.string(),
        tier: z.union([z.number(), z.string()]),
        category: z.string(),
        title: z.string(),
        severity: z.string(),
        what_it_is: z.string(),
        why_it_matters: z.string(),
        teach: z.string().nullable(),
        chess: z.string().nullable(),
        threshold: z.string(),
        threshold_provenance: z.string().nullable(),
        fix: z.string(),
        fix_code: z.string().nullable(),
        confidence: z.string().nullable(),
        confidence_note: z.string().nullable(),
        detector_kind: z.string(),
        review_by: z.string().nullable(),
        measured: z.record(z.string(), z.any()).nullable(),
        sources: z.array(
          z.object({
            name: z.string(),
            full_name: z.string().nullable(),
            where: z.string().nullable(),
            url: z.string().nullable(),
            caveat: z.string().nullable(),
            confidence: z.string().nullable()
          })
        )
      })
      .optional(),
    rules: z
      .array(
        z.object({
          id: z.string(),
          tier: z.union([z.number(), z.string()]),
          category: z.string(),
          title: z.string(),
          severity: z.string(),
          confidence: z.string().nullable(),
          detector_kind: z.string()
        })
      )
      .optional(),
    rulebook: z.record(z.string(), z.any()).optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async (args = {}) => {
  const book = rulebook();

  if (!args.rule) return listing(book, args);

  const id = String(args.rule).trim().replace(/^\[|\]$/g, '');
  const rule = book.byId.get(id) ?? book.byId.get(id.toUpperCase());

  if (!rule) {
    const needle = id.toLowerCase();
    const near = book.rules
      .filter((r) => r.id.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((r) => `${r.id} — ${r.title}`);
    return failure({
      tool: TOOL,
      code: 'UNKNOWN_RULE',
      problem: `There is no rule called "${id}".`,
      why: 'Rule ids appear in square brackets on the second line of every finding in a review.',
      fix: near.length
        ? ['Did you mean one of these?', ...near]
        : [
            'Call explain_rule with no arguments to list the rulebook.',
            'Or pass search: a word from the title you are looking for.'
          ]
    });
  }

  const registry = loadSources().sources;
  const cite = (name, where, confidence) => {
    const entry = registry[name] ?? {};
    return {
      name,
      full_name: entry.full_name ?? null,
      where: where ?? null,
      url: entry.url ?? null,
      caveat: entry.caveat ?? null,
      confidence: confidence ?? entry.default_confidence ?? null
    };
  };

  return toolResult({
    tool: TOOL,
    status: STATUS.PASS,
    headline: `${rule.title} — ${TIER_LABEL[rule.tier] ?? `tier ${rule.tier}`}`,
    sections: [{ body: renderRule(rule) }],
    nextSteps: [
      `Run review_site with focus: ["${rule.id}"] to see only this rule on your own files.`,
      'Every rule id in a critique works here. The ones with a confidence_note are the ones to read twice.'
    ],
    data: {
      rule: {
        id: rule.id,
        tier: rule.tier,
        category: rule.category,
        title: rule.title,
        severity: rule.severity,
        what_it_is: rule.what_it_is,
        why_it_matters: rule.why_it_matters,
        teach: rule.teach ?? null,
        chess: rule.chess ?? null,
        threshold: rule.threshold,
        threshold_provenance: rule.threshold_provenance ?? null,
        fix: rule.fix,
        fix_code: rule.fix_code ?? null,
        confidence: rule.source?.confidence ?? null,
        confidence_note: rule.confidence_note ?? null,
        detector_kind: rule.detector?.kind ?? 'unknown',
        review_by: rule.review_by ?? null,
        measured: rule.measured ?? null,
        sources: [
          cite(rule.source?.name, rule.source?.where, rule.source?.confidence),
          ...(rule.also_in ?? []).map((a) => cite(a.name, a.where ?? a.note, null))
        ]
      }
    }
  });
});

function listing(book, args) {
  const needle = args.search ? String(args.search).toLowerCase() : null;
  let rules = book.rules;
  if (args.tier !== undefined) rules = rules.filter((r) => String(r.tier) === String(args.tier));
  if (needle) {
    rules = rules.filter(
      (r) =>
        r.id.toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle) ||
        (r.what_it_is || '').toLowerCase().includes(needle) ||
        (r.category || '').toLowerCase().includes(needle)
    );
  }

  if (rules.length === 0) {
    return failure({
      tool: TOOL,
      code: 'NOTHING_MATCHED',
      problem: 'Nothing in the rulebook matches that.',
      why: `The tiers are ${TIER_ORDER.join(', ')}. Search matches the id, the title, the description and the category.`,
      fix: ['Call explain_rule with no arguments to see everything.']
    });
  }

  const lines = [];
  lines.push(
    `${book.rules.length} rules, built ${RULEBOOK_META.built}, re-read against fresh evidence by ${RULEBOOK_META.review_by}.`
  );
  lines.push(`Validated against ${RULEBOOK_META.validated_against}.`);
  lines.push('');

  for (const tier of TIER_ORDER) {
    const group = rules.filter((r) => r.tier === tier);
    if (group.length === 0) continue;
    lines.push('');
    lines.push(TIER_LABEL[tier] ?? `Tier ${tier}`);
    lines.push('─'.repeat(78));
    for (const r of group) {
      lines.push(`  ${(GLYPH[r.severity] ?? '?').padEnd(3)} ${r.id.padEnd(26)} ${r.title}`);
      lines.push(
        `      ${String(r.source?.confidence ?? 'unstated').toLowerCase()} · ${r.source?.name ?? 'unattributed'} · detector: ${r.detector?.kind ?? '?'}${r.confidence_note ? ' · carries a "not proven" note' : ''}`
      );
    }
  }

  lines.push('');
  lines.push('Call explain_rule with any id above to read the whole note, its sources and their caveats.');

  return toolResult({
    tool: TOOL,
    status: STATUS.PASS,
    headline: `${rules.length} rules${args.tier !== undefined ? ` in tier ${args.tier}` : ''}${args.search ? ` matching "${args.search}"` : ''}.`,
    sections: [{ body: lines.join('\n') }],
    data: {
      rules: rules.map((r) => ({
        id: r.id,
        tier: r.tier,
        category: r.category,
        title: r.title,
        severity: r.severity,
        confidence: r.source?.confidence ?? null,
        detector_kind: r.detector?.kind ?? 'unknown'
      })),
      rulebook: {
        total: book.rules.length,
        built: RULEBOOK_META.built,
        review_by: RULEBOOK_META.review_by,
        corpus: RULEBOOK_META.corpus,
        validated_against: RULEBOOK_META.validated_against
      }
    }
  });
}
