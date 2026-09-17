#!/usr/bin/env node
/**
 * codex-site-kit — single executable entry point.
 *
 *   codex-site-kit            start the MCP server on stdio (what Codex runs)
 *   codex-site-kit doctor     check this machine and print exactly what to fix
 *
 * STDOUT DISCIPLINE
 * -----------------
 * In server mode stdout IS the MCP transport. A single stray character on it
 * corrupts the JSON-RPC stream, and the client's only symptom is a server that
 * will not connect. Nothing here writes to stdout in server mode; everything
 * human-readable goes to stderr, which Codex shows in its logs.
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export const MIN_NODE = { major: 18, minor: 17 };

export function parseNodeVersion(raw) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw ?? '');
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * The floor is 18.17, not 18.0 — that is what package.json declares, and a
 * major-only check silently accepts 18.0 through 18.16.
 */
export function nodeTooOld(raw) {
  const v = parseNodeVersion(raw);
  if (!v) return false; // unknown: do not block; the doctor will report it
  if (v.major !== MIN_NODE.major) return v.major < MIN_NODE.major;
  return v.minor < MIN_NODE.minor;
}

function readVersion() {
  try {
    return require('../package.json').version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const HELP = `
codex-site-kit ${readVersion()} — an MCP server for building small, honest websites.

The server is not run by hand. Codex starts it and talks to it over stdin and
stdout. There is one command worth remembering:

    codex-site-kit doctor

It checks this computer and prints the exact line to run for anything missing.

To connect it to Codex, run this once:

    codex mcp add site-kit -- codex-site-kit

Then check it registered:

    codex mcp list

Tools: init_site, palette_from_image, check_responsive, check_honesty,
       check_assets, check_single_source

Other options:  --version   --help
`;

/** Print a failure a beginner can act on. Never a stack trace. */
function fail(title, lines) {
  process.stderr.write(`\ncodex-site-kit could not start.\n\n  ${title}\n\n`);
  for (const line of lines) process.stderr.write(`  ${line}\n`);
  process.stderr.write('\n');
  process.exitCode = 1;
}

export function findServerEntry(root = ROOT) {
  for (const rel of ['src/server.js', 'src/index.js', 'src/main.js']) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (argv.includes('--version') || argv.includes('-v')) {
    // Read from package.json rather than the server module, so that asking for
    // the version still works when the server itself is broken.
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  if (argv.includes('--help') || argv.includes('-h') || cmd === 'help') {
    process.stdout.write(HELP);
    return;
  }

  if (cmd === 'doctor') {
    const { runDoctorCli } = await import('../scripts/doctor.js');
    process.exitCode = await runDoctorCli(argv.slice(1));
    return;
  }

  if (cmd && cmd !== 'serve' && cmd !== 'mcp' && !cmd.startsWith('-')) {
    process.stderr.write(
      `\n  "${cmd}" is not a codex-site-kit command.\n\n` +
        '  Did you mean:  codex-site-kit doctor\n\n' +
        '  Run  codex-site-kit --help  to see every command.\n\n'
    );
    process.exitCode = 1;
    return;
  }

  // ---- server mode: stdout belongs to MCP from here on ----

  if (nodeTooOld(process.version)) {
    fail(`This computer is running Node ${process.version}. This needs Node 18.17 or newer.`, [
      'Download the installer from https://nodejs.org and click the big green button.',
      'Open the downloaded file and click Continue until it finishes.',
      '',
      'Then QUIT Terminal completely and open it again — a window that was already',
      'open will keep using the old version.',
      '',
      'To see what you have now:  node --version',
    ]);
    return;
  }

  const entry = findServerEntry();
  if (!entry) {
    fail('The server files are missing from this installation.', [
      'This usually means the download was interrupted. Install it again:',
      '',
      '  npm install -g github:Javendean/codex-site-kit',
      '',
      'Then check it with:  codex-site-kit doctor',
    ]);
    return;
  }

  try {
    // The server exports main() rather than starting on import, so it must be
    // called. Importing alone would exit silently with the client waiting.
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.main !== 'function') {
      throw new Error(`${path.basename(entry)} does not export main()`);
    }
    await mod.main();
  } catch (err) {
    fail('The server was installed but failed to start.', [
      `Reason: ${String(err?.message ?? err).split('\n')[0]}`,
      '',
      'Most often this means the install did not finish. Try:',
      '',
      '  npm install -g github:Javendean/codex-site-kit',
      '',
      'If that does not help, run  codex-site-kit doctor  and share what it prints.',
    ]);
  }
}

/**
 * True when this file was invoked directly rather than imported by a test.
 * Without the guard, importing it to test the helpers would boot an MCP server
 * that then holds stdin open forever.
 */
export function isDirectInvocation() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return fs.realpathSync(invoked) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main().catch((err) => {
    fail('Something went wrong before the server started.', [
      `Reason: ${String(err?.message ?? err).split('\n')[0]}`,
      '',
      'Run  codex-site-kit doctor  and share what it prints.',
    ]);
  });
}
