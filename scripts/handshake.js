#!/usr/bin/env node
/**
 * A raw MCP stdio prober.
 *
 * Starts the server as a subprocess and speaks JSON-RPC to it by hand:
 *   1. initialize            -> expects the server's capabilities
 *   2. notifications/initialized
 *   3. tools/list            -> expects the tool manifest
 *
 * It deliberately does NOT use the MCP client SDK. If both ends of the
 * handshake came from the same library, a bug shared by both would pass the
 * check. Hand-written framing is what makes this evidence.
 *
 * MCP's stdio transport is newline-delimited JSON — one JSON-RPC message per
 * line, no embedded newlines, no Content-Length headers.
 *
 * Usage:
 *   node scripts/handshake.js                      # runs ./bin/codex-site-kit.js
 *   node scripts/handshake.js --command codex-site-kit
 *   node scripts/handshake.js --json               # machine-readable summary
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROTOCOL_VERSION = '2025-11-25';
const TIMEOUT_MS = 30_000;

/** Quote one argument for a Windows shell command line. */
function shellQuote(value) {
  return /[\s"&|<>^]/.test(value) ? `"${String(value).replace(/"/g, '""')}"` : value;
}

export function runHandshake({ command, args = [], cwd = ROOT, timeoutMs = TIMEOUT_MS } = {}) {
  const spawnCommand = command ?? process.execPath;
  const spawnArgs = command ? args : [path.join(ROOT, 'bin', 'codex-site-kit.js'), ...args];

  return new Promise((resolve, reject) => {
    // On Windows a bare command name like `codex-site-kit` is a .cmd shim,
    // which spawn cannot execute without a shell. Pass the whole line as ONE
    // string rather than a command plus an args array — the array form with
    // shell:true is deprecated (DEP0190) because the arguments get concatenated
    // without escaping.
    const needsShell = process.platform === 'win32' && !!command && !path.isAbsolute(spawnCommand);
    const child = needsShell
      ? spawn([spawnCommand, ...spawnArgs].map(shellQuote).join(' '), {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
        })
      : spawn(spawnCommand, spawnArgs, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    const transcript = [];
    const pending = new Map();
    let nextId = 1;
    let stdoutBuffer = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      finish(new Error(`the server did not answer within ${timeoutMs} ms`));
    }, timeoutMs);

    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      if (err) {
        err.stderr = stderr;
        err.transcript = transcript;
        reject(err);
      } else {
        resolve(value);
      }
    }

    function send(message) {
      const line = JSON.stringify(message);
      transcript.push({ direction: 'sent', raw: line, message });
      child.stdin.write(`${line}\n`);
    }

    function request(method, params) {
      // Must be monotonic. Deriving the id from the size of the pending map
      // reuses id 1 for every sequential request, which is invalid JSON-RPC
      // and lets a server that tracks ids reject the second call.
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        send({ jsonrpc: '2.0', id, method, params });
      });
    }

    child.on('error', (err) =>
      finish(new Error(`could not start "${spawnCommand}": ${err.message}`))
    );

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      let newline;
      while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (!line) continue;

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          // Anything non-JSON on stdout corrupts the transport. This is the
          // single most common way an otherwise working MCP server fails, and
          // it is worth failing loudly on.
          finish(
            new Error(
              `the server wrote something that is not JSON to stdout, which corrupts the MCP stream:\n${line}`
            )
          );
          return;
        }

        transcript.push({ direction: 'received', raw: line, message });

        const waiter = message.id != null ? pending.get(message.id) : null;
        if (waiter) {
          pending.delete(message.id);
          if (message.error) {
            waiter.reject(new Error(`${message.method ?? 'request'}: ${message.error.message}`));
          } else {
            waiter.resolve(message);
          }
        }
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        finish(new Error(`the server exited early with code ${code}`));
      }
    });

    (async () => {
      const initialize = await request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'codex-site-kit-handshake', version: '1.0.0' },
      });

      send({ jsonrpc: '2.0', method: 'notifications/initialized' });

      const toolsList = await request('tools/list', {});

      finish(null, {
        initialize: initialize.result,
        tools: toolsList.result?.tools ?? [],
        transcript,
        stderr,
      });
    })().catch((err) => finish(err));
  });
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { json: false, command: null, args: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--command') out.command = argv[++i];
    else out.args.push(argv[i]);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = await runHandshake({ command: opts.command, args: opts.args });
  } catch (err) {
    process.stderr.write(`\nHANDSHAKE FAILED: ${err.message}\n`);
    if (err.stderr) process.stderr.write(`\n--- server stderr ---\n${err.stderr}\n`);
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const out = [];
  out.push('');
  out.push('=== MCP stdio handshake ===');
  out.push('');
  for (const entry of result.transcript) {
    out.push(`${entry.direction === 'sent' ? '-->' : '<--'} ${entry.raw}`);
    out.push('');
  }
  out.push(`server:            ${result.initialize?.serverInfo?.name} ${result.initialize?.serverInfo?.version}`);
  out.push(`protocol agreed:   ${result.initialize?.protocolVersion}`);
  out.push(`tools advertised:  ${result.tools.length}`);
  for (const tool of result.tools) out.push(`  - ${tool.name}`);
  out.push('');
  if (result.stderr.trim()) {
    out.push('--- server stderr (not part of the protocol) ---');
    out.push(result.stderr.trim());
    out.push('');
  }
  process.stdout.write(out.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
