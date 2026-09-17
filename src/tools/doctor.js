/**
 * doctor — turn "it doesn't work" into one line to paste.
 *
 * This is the tool that matters most for someone who has never opened a
 * terminal and will not debug an install. Every check either prints the exact
 * command that fixes it or explains in a sentence why no command is needed. A
 * check that can only say "something is wrong" has failed at its job.
 *
 * The diagnostic core lives in ../../scripts/doctor.js and is
 * dependency-injected, so the tests can drive a machine that does NOT have
 * Node 18, does NOT have Playwright, and does NOT have a Codex config — which
 * are the paths that actually matter.
 */

import { z } from 'zod';

import { STATUS, guard, toolResult } from '../lib/report.js';
import { collectDiagnostics, formatDoctorReport } from '../../scripts/doctor.js';
import { commonOutput } from './common.js';

const TOOL = 'doctor';

export const name = TOOL;

export const config = {
  title: 'Check this machine and print exactly what to fix',
  description: [
    'Checks Node, the optional headless browser, and whether Codex has this server registered.',
    '',
    'For anything missing it prints the literal command to paste. Nothing here is a suggestion',
    'to "check your configuration": every failure comes with the line that fixes it.',
    '',
    'Run this first whenever something does not work.'
  ].join('\n'),
  inputSchema: {},
  outputSchema: {
    ...commonOutput,
    checks: z
      .array(
        z.object({
          name: z.string(),
          ok: z.boolean(),
          detail: z.string(),
          fix: z.string().nullable(),
          optional: z.boolean().optional()
        })
      )
      .optional(),
    ready: z.boolean().optional(),
    blocking_failures: z.number().int().optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true }
};

export const handler = guard(TOOL, async () => {
  const report = collectDiagnostics();
  const text = formatDoctorReport(report);

  const checks = (report.checks ?? []).map((c) => ({
    name: c.title ?? c.id ?? 'check',
    ok: c.status === 'pass',
    detail: String(c.detail ?? ''),
    // A "note" is something optional that is missing: the page-measuring
    // browser, for instance. It is not a pass and it does not block anything,
    // and conflating the two is how a tool tells someone everything is fine
    // while a check quietly never ran.
    optional: c.status === 'warn',
    fix: Array.isArray(c.fix) && c.fix.length ? c.fix.filter(Boolean).join('\n') : null
  }));

  const blocking = checks.filter((c) => !c.ok && !c.optional);
  const ready = blocking.length === 0;

  return toolResult({
    tool: TOOL,
    status: ready ? STATUS.PASS : STATUS.FAIL,
    headline: ready
      ? checks.some((c) => !c.ok)
        ? 'Everything needed is here. One optional thing is missing, and the line that installs it is below.'
        : 'Everything checks out.'
      : `${blocking.length} thing${blocking.length === 1 ? '' : 's'} need fixing before this will work. The exact command for each is below.`,
    sections: [{ body: text }],
    nextSteps: ready
      ? ['Nothing to do. If a tool still misbehaves, run review_site and share what it prints.']
      : blocking.map((c) => c.fix ?? `Fix: ${c.name}`),
    data: { checks, ready, blocking_failures: blocking.length }
  });
});
