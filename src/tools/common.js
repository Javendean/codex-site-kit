/**
 * Shared input/output schema pieces.
 *
 * Every tool's output schema carries the error fields as optional, so a
 * `failure(...)` result validates against the same schema as a success. A
 * beginner should never see "structured content does not match the declared
 * output schema" on top of whatever actually went wrong.
 */

import { z } from 'zod';

export const statusEnum = z.enum(['pass', 'fail', 'skipped', 'error']);

export const commonOutput = {
  tool: z.string().describe('Which tool produced this.'),
  status: statusEnum.describe(
    'pass = checked and clean. fail = checked and found problems. skipped = nothing was measured. error = the tool could not run.'
  ),
  headline: z.string().describe('One sentence verdict, safe to show a non-technical user.'),
  error_code: z.string().optional().describe('Set only when status is "error".'),
  problem: z.string().optional(),
  why: z.string().nullable().optional(),
  fix: z.array(z.string()).optional()
};

export const directoryInput = z
  .string()
  .min(1)
  .describe('Full path to the site folder, for example /Users/brian/Sites/chess-lessons.');

export const ignoreInput = z
  .array(z.string())
  .optional()
  .describe('Folder or file names to skip. Defaults cover node_modules, .git, dist, build and friends.');

export const findingShape = z.object({
  rule: z.string(),
  label: z.string().optional(),
  severity: z.enum(['error', 'warn', 'info']),
  file: z.string().describe('Path relative to the site folder.'),
  line: z.number().int(),
  column: z.number().int().optional(),
  excerpt: z.string().optional(),
  matched: z.string().optional(),
  quotation: z.string().optional(),
  attributed_to: z.string().optional(),
  confidence: z.string().optional(),
  why: z.string(),
  fix: z.string(),
  in_comment: z.boolean().optional()
});
