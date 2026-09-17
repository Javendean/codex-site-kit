/**
 * explain_rule — the way in from a critique to the reasoning behind it.
 *
 * A review names a rule in square brackets. This returns everything behind that
 * name: what it looks for and at what threshold, why it matters at length, the
 * better move, the confidence tag with what that tag actually means, and every
 * source with its own caveat.
 *
 * The caveats are not decoration. Half the value of this corpus is that it
 * records where its sources are weak — Hallmark has a commercial interest in
 * the problem seeming large, Krebs self-reports a 5-10% false-positive rate,
 * CodeStitch's contrast advice is wrong, and the whole tiering is a hypothesis.
 * A tool that quoted the conclusions and dropped the caveats would be a worse
 * tool than the documents it was built from.
 */

import { z } from 'zod';

import { STATUS, failure, guard, toolResult } from '../lib/report.js';
import { renderRule } from '../lib/critique.js';
import { RULEBOOK, BY_ID } from '../rules/index.js';
import { SOURCES, CONFIDENCE_NOTE } from '../rules/sources.js';
import { TIERS, TIER_ORDER, GLYPH } from '../rules/engine.js';
import { commonOutput } from './common.js';

const TOOL = 'explain_rule';

export const name = TOOL;

export const config = {
  title: 'Read the full teaching note for one rule',
  description: [
    'Given a rule id from a review — the part in square brackets — return the whole note:',
    'the exact trigger condition, why it matters, the better move, the confidence tag and',
    'what that tag means, and every source with its own caveat.',
    '',
    'Call it with no id to list the whole rulebook by tier.'
  ].join('\n'),
  inputSchema: {
    rule: z
      .string()
      .optional()
      .describe('A rule id, for example "edge-stripe". Leave it out to list every rule.'),
    tier: z
      .string()
      .optional()
      .describe('List one tier only: "1", "2", "3", "trap", "floor", "honesty" or "variety".')
  },
  outputSchema: {
    ...commonOutput,
    rule: z
      .object({
        id: z.string(),
        tier: z.union([z.number(), z.string()]),
        title: z.string(),
        severity: z.string(),
        confidence: z.string(),
        confidence_means: z.string(),
        threshold: z.string(),
        why: z.string(),
        fix: z.string(),
        more: z.string().nullable(),
        sources: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            what: z.string(),
            url: z.string().nullable(),
            caveat: z.string().nullable()
          })
        )
      })
      .optional(),
    rules: z
      .array(z.object({ id: z.string(), tier: z.union([z.number(), z.string()]), title: z.string(), severity: z.string(), confidence: z.string() }))
      .optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async (args) => {
  if (!args.rule) return listing(args.tier);

  const id = String(args.rule).trim().replace(/^\[|\]$/g, '');
  const rule = BY_ID[id];

  if (!rule) {
    const near = Object.keys(BY_ID)
      .filter((k) => k.includes(id) || id.includes(k) || distance(k, id) <= 3)
      .slice(0, 5);
    return failure({
      tool: TOOL,
      code: 'UNKNOWN_RULE',
      problem: `There is no rule called "${id}".`,
      why: 'Rule ids appear in square brackets at the end of the first line of every finding in a review.',
      fix: near.length
        ? [`Did you mean: ${near.join(', ')}?`, 'Or call explain_rule with no arguments to see the whole rulebook.']
        : ['Call explain_rule with no arguments to see the whole rulebook.'],
      data: { rules: Object.keys(BY_ID).map((k) => ({ id: k, tier: BY_ID[k].tier, title: BY_ID[k].title, severity: BY_ID[k].severity, confidence: BY_ID[k].confidence })) }
    });
  }

  return toolResult({
    tool: TOOL,
    status: STATUS.PASS,
    headline: `${rule.title} — ${TIERS[rule.tier]}`,
    sections: [{ body: renderRule(rule) }],
    data: {
      rule: {
        id: rule.id,
        tier: rule.tier,
        title: rule.title,
        severity: rule.severity,
        confidence: rule.confidence,
        confidence_means: CONFIDENCE_NOTE[rule.confidence],
        threshold: rule.threshold,
        why: rule.why,
        fix: rule.fix,
        more: rule.more ?? null,
        sources: rule.who.map((sid) => ({
          id: sid,
          label: SOURCES[sid].label,
          what: SOURCES[sid].what,
          url: SOURCES[sid].url ?? null,
          caveat: SOURCES[sid].caveat ?? null
        }))
      }
    }
  });
});

function listing(tier) {
  const wanted = tier == null ? null : String(tier);
  const tiers = TIER_ORDER.filter((t) => wanted == null || String(t) === wanted);

  if (tiers.length === 0) {
    return failure({
      tool: TOOL,
      code: 'UNKNOWN_TIER',
      problem: `"${tier}" is not a tier.`,
      why: 'The tiers are 1, 2, 3, trap, floor, honesty and variety.',
      fix: ['Call explain_rule with no arguments to see all of them.']
    });
  }

  const lines = [];
  for (const t of tiers) {
    const group = RULEBOOK.filter((r) => r.tier === t);
    if (group.length === 0) continue;
    lines.push('');
    lines.push(TIERS[t]);
    lines.push('─'.repeat(74));
    for (const r of group) {
      lines.push(`  ${GLYPH[r.severity].padEnd(3)} ${r.id.padEnd(24)} ${r.title}`);
      lines.push(`      ${r.confidence.toLowerCase()} · ${r.who.map((w) => SOURCES[w].who).join(', ')}`);
    }
  }
  lines.push('');
  lines.push('Call explain_rule with any id above to read the whole note.');

  return toolResult({
    tool: TOOL,
    status: STATUS.PASS,
    headline: `${RULEBOOK.filter((r) => tiers.includes(r.tier)).length} rules${wanted ? ` in tier ${wanted}` : ' across seven tiers'}.`,
    sections: [{ body: lines.join('\n') }],
    data: {
      rules: RULEBOOK.filter((r) => tiers.includes(r.tier)).map((r) => ({
        id: r.id,
        tier: r.tier,
        title: r.title,
        severity: r.severity,
        confidence: r.confidence
      }))
    }
  });
}

/** Levenshtein, capped — only used to suggest a near miss on a typo'd id. */
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 4) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = temp;
    }
  }
  return prev[b.length];
}
