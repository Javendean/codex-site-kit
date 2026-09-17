/**
 * The MCP server.
 *
 * Targets @modelcontextprotocol/sdk 1.30.0, read from the package's own README
 * and its shipped type declarations rather than from memory:
 *
 *   registerTool<OutputArgs, InputArgs>(
 *     name: string,
 *     config: { title?, description?, inputSchema?, outputSchema?, annotations?, _meta? },
 *     cb: ToolCallback<InputArgs>
 *   ): RegisteredTool
 *
 * `inputSchema` and `outputSchema` take a Zod RAW SHAPE — a plain object of
 * field name to Zod schema — which the SDK converts to JSON Schema for the
 * tools/list response. zod is a required peer dependency; the SDK imports
 * `zod/v4` internally and this package is on 4.6.5.
 *
 * stdio transport only. Nothing here opens a port, reads an environment
 * secret, or makes a network request. The only process it ever spawns is
 * `npm root -g`, and only when check_responsive is hunting for Playwright.
 *
 * STDOUT DISCIPLINE. stdout IS the JSON-RPC stream. Anything written there
 * that is not a protocol message corrupts it, and the client's only symptom is
 * a server that will not connect, with no error anywhere. Every diagnostic in
 * this package goes to stderr.
 */

import { createRequire } from 'node:module';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { tools } from './tools/index.js';
import { rulebook } from './lib/rulebook.js';

const RULEBOOK = rulebook().rules;

/**
 * The version is READ from package.json, never typed here.
 *
 * This kit ships a rule called `single-source` whose whole argument is that a
 * value written in two files is two values and they will drift. They had, by
 * one minor version, before this was changed: package.json said 1.0.0 while the
 * handshake announced 2.0.0. A tool cannot enforce a discipline it does not
 * keep itself.
 */
const require = createRequire(import.meta.url);
const { version, name } = require('../package.json');

export const SERVER_INFO = {
  name,
  version,
  title: 'Site Kit'
};

const INSTRUCTIONS = [
  `Tools for building small websites well, and for learning the craft by having your own work`,
  `criticised against a real corpus. ${RULEBOOK.length} rules, every one carrying its source.`,
  '',
  'THE ONE TO KNOW ABOUT',
  '',
  '  review_site runs the whole rulebook over a folder and returns an annotated critique.',
  '  Every finding says WHAT was found with the measurement, WHY it matters, WHO says so with',
  '  a confidence tag, and the better MOVE. It is ordered by how fast a visitor would notice,',
  '  and annotated the way a chess game is: ?? clocked in five seconds, ? felt but not named,',
  '  ?! a habit worth dropping, !? a move whose time is passing, ! worth keeping.',
  '',
  '  explain_rule takes any rule id from that output and returns the full teaching note with',
  '  every source and every caveat. That is the way in when a finding is interesting.',
  '',
  'THE USUAL ORDER',
  '',
  '  1. init_site to scaffold. It reads a local ledger of what it built last and is forbidden',
  '     from repeating the structure, so two sites differ in their SECTIONS, not their colours.',
  '  2. palette_from_image on a photograph of the subject, or palette_from_subject when there',
  '     is no photograph yet. Both refuse the banned hexes and return a WCAG contrast matrix.',
  '  3. Write the content, replacing the labelled holes.',
  '  4. review_site, check_copy, then check_responsive once there is content to measure.',
  '  5. doctor whenever anything does not work. It prints the exact line to paste.',
  '',
  '  check_honesty, check_assets and check_single_source each run one slice on their own,',
  '  for when you have just changed the words, the images, or a price. learning_path puts the',
  '  whole rulebook in the order a beginner needs rather than the order a critique needs.',
  '',
  'WHAT THIS KIT HOLDS TO, AND WHY IT IS IN THE TOOLS RATHER THAN THE ADVICE',
  '',
  '  Every rule names its source and carries a confidence tag. DEMONSTRATED means the source',
  '  ships code or a counted sample. ASSERTED means it is expert opinion and may be wrong.',
  '  MEASURED means these numbers came from your files just now. INFERENCE means nobody said',
  '  it and the tool is reasoning. A rule that cannot name a source is not in the rulebook.',
  '',
  '  Nothing is invented. No testimonials, no ratings, no "as seen in", no customer counts,',
  '  and no quotation carrying a name that has not been checked — including the subtle case,',
  '  a name set on its own line under a quotation, which is an attribution with no "said" and',
  '  no dash. Unfilled fields are drawn AS unfilled fields, which is honest and is the design.',
  '',
  '  Verification is measured, not asserted. check_responsive loads pages in a real browser',
  '  and reports pixel numbers. Without the browser it reports "skipped" and the one command',
  '  that installs it. It never reports a pass it did not measure, and review_site lists what',
  '  it could not measure rather than letting a clean report imply those checks passed.',
  '',
  '  Colour is authored in OKLCH and emitted as hex, because an oklch() literal that an old',
  '  in-app WebView cannot parse drops the declaration, and on a text colour that means',
  '  invisible text.',
  '',
  'Every tool returns plain text a non-programmer can read, plus structured data. status is',
  '"pass", "fail", "skipped" (nothing was measured) or "error" (the tool could not run).',
  '"skipped" is never a pass.'
].join('\n');

/** Build the server with every tool registered. Exported so tests can drive it in-process. */
export function createServer() {
  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS,
    capabilities: { tools: {} }
  });

  for (const tool of tools) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  return server;
}

/** Connect to stdio. Used by bin/codex-site-kit.js. */
export async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr, never stdout: stdout is the JSON-RPC stream.
  process.stderr.write(
    `codex-site-kit ${SERVER_INFO.version} ready on stdio — ${tools.length} tools, ${RULEBOOK.length} rules\n`
  );

  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default createServer;
