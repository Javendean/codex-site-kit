/**
 * learning_path — the ordered route from "I have never made a website" to
 * "I understand why that gradient was wrong".
 *
 * Generated from the rulebook, not written alongside it. Every stop names real
 * rule ids and quotes the reasoning those rules already carry, and the renderer
 * throws if a stop names a rule that no longer exists. A course that teaches a
 * rule the tool does not run is worse than no course, because it teaches the
 * person to distrust the tool.
 */

import { z } from 'zod';

import { failure, guard, toolResult } from '../lib/report.js';
import { STOPS, render, validate } from '../lib/learning-path.js';
import { rulebook } from '../lib/rulebook.js';

const RULEBOOK = rulebook().rules;
import { commonOutput } from './common.js';

const TOOL = 'learning_path';

export const name = TOOL;

export const config = {
  title: 'The route from never having made a website to understanding one',
  description: [
    'Ten stops, in the order a beginner needs them — which is NOT the order the critique uses.',
    'review_site sorts by how fast a visitor notices a fault. That is right for a critique and',
    'wrong for learning. This sorts by what you need first: make it work, then make it not look',
    'broken, then make it not look generic, then make it honest, then understand why the escape',
    'routes keep closing.',
    '',
    'Every stop is built from the rulebook itself and names the rule ids that carry its',
    'reasoning, so it cannot drift away from what the tool actually checks. Pass a stop number',
    'to read one at a time.'
  ].join('\n'),
  inputSchema: {
    stop: z
      .number()
      .int()
      .min(1)
      .max(STOPS.length)
      .optional()
      .describe(`Read one stop on its own, 1 to ${STOPS.length}. Leave it out for the whole route.`),
    depth: z
      .enum(['route', 'full'])
      .optional()
      .describe(
        '"route" is the ten stops and what to do at each. "full" (the default) adds each rule\'s own reasoning and the better move underneath the stop that teaches it.'
      )
  },
  outputSchema: {
    ...commonOutput,
    stops: z
      .array(
        z.object({
          n: z.number().int(),
          title: z.string(),
          claim: z.string(),
          doing: z.array(z.string()),
          rules: z.array(z.string())
        })
      )
      .optional(),
    rules_total: z.number().int().optional(),
    rules_uncovered: z.array(z.string()).optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false }
};

export const handler = guard(TOOL, async (args = {}) => {
  const { missing, uncovered } = validate();
  if (missing.length) {
    return failure({
      tool: TOOL,
      code: 'PATH_OUT_OF_SYNC',
      problem: `The learning path names ${missing.length} rule(s) that are not in the rulebook.`,
      why: missing.map((m) => `stop ${m.stop} names "${m.rule}"`).join('; '),
      fix: [
        'This is a bug in codex-site-kit, not in your site.',
        'The path is generated from the rulebook so the two cannot drift; if they have, one of them was edited without the other. Please report it.'
      ]
    });
  }

  const text = render({ depth: args.depth ?? 'full', stop: args.stop ?? null });
  const stops = args.stop ? STOPS.filter((s) => s.n === args.stop) : STOPS;

  return toolResult({
    tool: TOOL,
    status: 'pass',
    headline: args.stop
      ? `Stop ${args.stop} of ${STOPS.length}: ${stops[0]?.title}.`
      : `${STOPS.length} stops, built from ${RULEBOOK.length} rules.`,
    sections: [{ body: text }],
    nextSteps: args.stop
      ? [
          `Read the next one: learning_path with stop ${Math.min(args.stop + 1, STOPS.length)}.`,
          'Run explain_rule on any rule id above to read its full teaching note and its sources.'
        ]
      : [
          'Start at stop 1 and actually do it. One page on your own machine, open in your own browser.',
          'Run review_site after each stop, and fix ONE finding rather than forty. The reasoning sticks when you can see which single change moved the count.',
          'Run explain_rule on any rule id to read where it came from and how confident the research is in it.'
        ],
    data: {
      stops: stops.map((s) => ({ n: s.n, title: s.title, claim: s.claim, doing: s.doing, rules: s.rules })),
      rules_total: RULEBOOK.length,
      rules_uncovered: uncovered
    }
  });
});
