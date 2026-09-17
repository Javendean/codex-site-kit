/**
 * The MCP surface itself.
 *
 * Targets @modelcontextprotocol/sdk 1.30.0. These tests drive a real client
 * against a real server over an in-memory transport, so they fail if the SDK's
 * tool-registration contract changes under us rather than silently shipping a
 * server no client can use.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SERVER_INFO } from '../src/server.js';
import { tools } from '../src/tools/index.js';
import { cleanup, connect, tempDir, write } from './helpers.js';

after(cleanup);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED = [
  'init_site',
  'palette_from_image',
  'check_responsive',
  'check_honesty',
  'check_assets',
  'check_single_source'
].sort();

test('the SDK version this server is written against is the one installed', async () => {
  const pkg = JSON.parse(
    await readFile(path.join(ROOT, 'node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8')
  );
  const [major] = pkg.version.split('.');
  assert.equal(major, '1', `registerTool's contract is a v1 API; installed ${pkg.version}`);
});

test('all six tools are advertised, and nothing else', async () => {
  const kit = await connect();
  const { tools: listed } = await kit.client.listTools();
  await kit.close();

  assert.deepEqual(listed.map((t) => t.name).sort(), EXPECTED);
});

test('every tool is usable by a model: a title, a description, and a typed input schema', async () => {
  const kit = await connect();
  const { tools: listed } = await kit.client.listTools();
  await kit.close();

  for (const tool of listed) {
    assert.ok(tool.title || tool.annotations?.title, `${tool.name} has no title`);
    assert.ok(tool.description?.length > 80, `${tool.name} has no useful description`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object input schema`);
    assert.ok(
      Object.keys(tool.inputSchema.properties ?? {}).length > 0,
      `${tool.name} takes no arguments`
    );
    assert.ok(tool.outputSchema, `${tool.name} does not declare what it returns`);

    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
      assert.ok(schema.description?.length > 0, `${tool.name}.${name} has no description`);
    }
  }
});

test('every tool declares its read/write intent, so a client can gate the writes', async () => {
  const kit = await connect();
  const { tools: listed } = await kit.client.listTools();
  await kit.close();

  for (const tool of listed) {
    assert.ok(tool.annotations, `${tool.name} declares no annotations`);
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', `${tool.name}`);
    assert.equal(tool.annotations.openWorldHint, false, `${tool.name} must not claim to touch the network`);
  }

  const writers = listed.filter((t) => t.annotations.readOnlyHint === false).map((t) => t.name);
  assert.deepEqual(writers, ['init_site'], 'init_site is the only tool that writes anything');
});

test('every tool returns both a readable report and structured data', async () => {
  const dir = await tempDir('server-shape');
  await write(dir, 'index.html', '<!doctype html><html lang="en"><head><title>x</title></head><body><p>Hi.</p></body></html>');

  const kit = await connect();
  const calls = [
    ['check_honesty', { directory: dir }],
    ['check_assets', { directory: dir }],
    ['check_single_source', { directory: dir }],
    ['check_responsive', { directory: dir, widths: [768] }]
  ];

  for (const [name, args] of calls) {
    const { raw, data, text } = await kit.call(name, args);
    assert.equal(raw.content[0].type, 'text', `${name} returned no text block`);
    assert.ok(text.length > 40, `${name} returned an empty report`);
    assert.equal(data.tool, name);
    assert.ok(['pass', 'fail', 'skipped', 'error'].includes(data.status), `${name}: ${data.status}`);
    assert.ok(data.headline?.length > 0, `${name} returned no headline`);
    assert.match(text, /^\[(PASS|FAIL|NOT CHECKED|COULD NOT RUN)\]/, `${name} report has no verdict line`);
  }
  await kit.close();
});

test('a bad argument is rejected by the schema, not by a crash inside the tool', async () => {
  const kit = await connect();

  const missing = await kit.client
    .callTool({ name: 'check_honesty', arguments: {} })
    .then((r) => ({ ok: true, r }))
    .catch((e) => ({ ok: false, e }));

  const wrongType = await kit.client
    .callTool({ name: 'check_responsive', arguments: { directory: '/tmp', widths: ['wide'] } })
    .then((r) => ({ ok: true, r }))
    .catch((e) => ({ ok: false, e }));

  await kit.close();

  for (const outcome of [missing, wrongType]) {
    if (outcome.ok) {
      assert.equal(outcome.r.isError, true, 'an invalid call must be reported as an error');
      const text = outcome.r.content.map((c) => c.text).join('\n');
      assert.doesNotMatch(text, /\bat Object\.|\bat async /, 'no stack trace may reach the user');
    } else {
      assert.ok(outcome.e.message.length > 0);
    }
  }
});

test('an unknown tool name is refused rather than silently ignored', async () => {
  const kit = await connect();
  const outcome = await kit.client
    .callTool({ name: 'make_it_pretty', arguments: {} })
    .then((r) => ({ ok: true, r }))
    .catch((e) => ({ ok: false, e }));
  await kit.close();

  if (outcome.ok) assert.equal(outcome.r.isError, true);
  else assert.match(outcome.e.message, /make_it_pretty|not found|unknown/i);
});

test('the server introduces itself with instructions a model can act on', async () => {
  const kit = await connect();
  const instructions = kit.client.getInstructions();
  await kit.close();

  assert.ok(instructions?.length > 200);
  for (const name of EXPECTED) {
    assert.ok(instructions.includes(name), `the instructions never mention ${name}`);
  }
  assert.match(instructions, /"skipped" is never a pass/);
});

test('the tool modules and the advertised list cannot drift apart', () => {
  assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED);
  for (const tool of tools) {
    assert.equal(typeof tool.handler, 'function', `${tool.name} exports no handler`);
    assert.equal(typeof tool.config, 'object', `${tool.name} exports no config`);
  }
});

test('the package can be started as a command, and says nothing on stdout when asked its version', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  const { stdout } = await run(process.execPath, [path.join(ROOT, 'bin/codex-site-kit.js'), '--version'], {
    timeout: 20000
  });

  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/, `expected a bare version, got ${JSON.stringify(stdout)}`);
  assert.equal(stdout.trim(), SERVER_INFO.version);
});

test('the declared dependencies are the ones actually imported', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));

  for (const required of ['@modelcontextprotocol/sdk', 'zod', 'pngjs', 'jpeg-js']) {
    assert.ok(declared.has(required), `${required} is imported but not declared`);
  }

  // Playwright must NOT be a hard dependency: a beginner installing this kit
  // must not be made to download a browser before the other five tools work.
  assert.ok(!declared.has('playwright'), 'playwright must stay optional');
  assert.ok(!declared.has('playwright-core'), 'playwright-core must stay optional');
});
