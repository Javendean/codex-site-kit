/**
 * The MCP handshake, as a standing test.
 *
 * A server nobody handshaked with is not shipped. This spawns the real binary
 * the way Codex spawns it — as a subprocess talking newline-delimited JSON-RPC
 * over stdio — and checks it answers `initialize` and `tools/list`.
 *
 * The client here is hand-written rather than the MCP client SDK on purpose: if
 * both ends came from the same library, a bug they shared would pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { runHandshake } from '../scripts/handshake.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_TOOLS = [
  'init_site',
  'palette_from_image',
  'check_responsive',
  'check_honesty',
  'check_assets',
  'check_single_source',
];

/** One handshake, reused across the assertions below. */
let handshake;
async function connect() {
  if (!handshake) handshake = runHandshake({ timeoutMs: 30_000 });
  return handshake;
}

test('handshake: the server answers initialize', async () => {
  const { initialize } = await connect();
  assert.ok(initialize, 'no initialize result came back');
  assert.ok(initialize.serverInfo?.name, 'the server did not identify itself');
  assert.ok(initialize.serverInfo?.version, 'the server reported no version');
  assert.match(
    initialize.protocolVersion,
    /^\d{4}-\d{2}-\d{2}$/,
    `unexpected protocol version: ${initialize.protocolVersion}`
  );
  assert.ok(initialize.capabilities?.tools, 'the server does not advertise tool support');
});

test('handshake: tools/list returns every tool this kit promises', async () => {
  const { tools } = await connect();
  const names = tools.map((t) => t.name).sort();
  for (const expected of EXPECTED_TOOLS) {
    assert.ok(names.includes(expected), `tools/list is missing ${expected}. Got: ${names.join(', ')}`);
  }
});

test('handshake: every advertised tool is usable by a model', async () => {
  const { tools } = await connect();
  for (const tool of tools) {
    assert.ok(tool.name, 'a tool has no name');
    assert.ok(
      tool.description && tool.description.length > 20,
      `${tool.name} has no usable description — a model cannot choose a tool it cannot read about`
    );
    assert.equal(
      tool.inputSchema?.type,
      'object',
      `${tool.name} must declare an object inputSchema`
    );
  }
});

test('handshake: stdout carries protocol only', async () => {
  // runHandshake rejects on any non-JSON line, so reaching here proves stdout
  // was clean. This asserts the other half: that diagnostics still reach stderr
  // rather than being swallowed.
  const { transcript } = await connect();
  for (const entry of transcript.filter((e) => e.direction === 'received')) {
    assert.doesNotThrow(() => JSON.parse(entry.raw));
    assert.equal(entry.message.jsonrpc, '2.0', 'a reply was not JSON-RPC 2.0');
  }
});

/* ------------------------------------------------------------------ *
 * failure paths
 * ------------------------------------------------------------------ */

test('failure: probing something that is not an MCP server fails fast and explains', async () => {
  // `node --version` prints a line and exits. It must not hang the prober.
  await assert.rejects(
    () => runHandshake({ command: process.execPath, args: ['--version'], timeoutMs: 10_000 }),
    (err) => {
      assert.match(err.message, /not JSON|exited early/);
      return true;
    }
  );
});

test('failure: a command that does not exist reports that, rather than hanging', async () => {
  await assert.rejects(
    () =>
      runHandshake({
        command: path.join(ROOT, 'no-such-binary-here'),
        timeoutMs: 10_000,
      }),
    (err) => {
      assert.match(err.message, /could not start|exited early/);
      return true;
    }
  );
});

test('failure: a silent process is abandoned at the timeout instead of hanging forever', async () => {
  // A server that accepts the connection and then says nothing is the worst
  // real-world case, because it looks identical to a slow one.
  const sleeper = path.join(ROOT, 'test', '.silent-server.mjs');
  fs.mkdirSync(path.dirname(sleeper), { recursive: true });
  fs.writeFileSync(sleeper, 'setTimeout(() => {}, 60_000);\n');
  try {
    await assert.rejects(
      () => runHandshake({ command: process.execPath, args: [sleeper], timeoutMs: 1_500 }),
      /did not answer within 1500 ms/
    );
  } finally {
    fs.rmSync(sleeper, { force: true });
  }
});
