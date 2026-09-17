/**
 * The command-line entry point.
 *
 * These lock behaviour that has already regressed once during development: the
 * `doctor` subcommand disappeared, the Node floor dropped from 18.17 to 18.0,
 * and the too-old-Node message started telling a beginner to install Homebrew.
 * Each is cheap to break by accident and expensive for the user.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { nodeTooOld, parseNodeVersion, findServerEntry, MIN_NODE } from '../bin/codex-site-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'codex-site-kit.js');

/** Run the bin and capture stdout, stderr and the exit code without throwing. */
function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      code: err.status ?? 1,
    };
  }
}

test('importing the module does not start a server', () => {
  // The direct-invocation guard. Without it this very test file would hang.
  assert.equal(typeof nodeTooOld, 'function');
});

test('doctor: the subcommand exists and runs', () => {
  const { stdout } = run(['doctor']);
  assert.match(stdout, /codex-site-kit doctor/);
  assert.match(stdout, /Node\.js/);
  // README Step 5 promises this command. If it is ever removed again, this fails.
});

test('doctor: --json is machine readable', () => {
  const { stdout } = run(['doctor', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(typeof report.ok, 'boolean');
  assert.ok(Array.isArray(report.checks));
});

test('version: comes from package.json, so it works even if the server is broken', () => {
  const { stdout, code } = run(['--version']);
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  assert.equal(code, 0);
  assert.equal(stdout.trim(), expected);
});

test('help: names the one command a stuck beginner needs', () => {
  const { stdout, code } = run(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /codex-site-kit doctor/);
  assert.match(stdout, /codex mcp add site-kit -- codex-site-kit/);
});

test('failure: an unknown command exits 1 and suggests the doctor, with no stack trace', () => {
  const { stderr, code } = run(['frobnicate']);
  assert.equal(code, 1);
  assert.match(stderr, /is not a codex-site-kit command/);
  assert.match(stderr, /codex-site-kit doctor/);
  assert.doesNotMatch(stderr, /node:internal|at Object\.|Error:/);
});

test('node floor: 18.17 is the floor, matching engines — not 18.0', () => {
  // A major-only check (NODE_MAJOR < 18) silently accepts 18.0 through 18.16,
  // which package.json says are unsupported.
  assert.deepEqual(MIN_NODE, { major: 18, minor: 17 });
  assert.equal(nodeTooOld('v16.20.2'), true);
  assert.equal(nodeTooOld('v18.0.0'), true);
  assert.equal(nodeTooOld('v18.16.9'), true);
  assert.equal(nodeTooOld('v18.17.0'), false);
  assert.equal(nodeTooOld('v22.0.0'), false);
  assert.equal(nodeTooOld('v24.21.0'), false);
});

test('node floor: an unreadable version does not block startup', () => {
  // Better to start and let the doctor explain than to refuse to run because a
  // version string could not be parsed.
  assert.equal(nodeTooOld('weird-custom-build'), false);
  assert.equal(parseNodeVersion('weird-custom-build'), null);
});

test('the Node upgrade advice does not require installing a package manager first', () => {
  // The intended user is a complete beginner on a Mac. Telling them to run
  // `brew install node` asks them to install Homebrew — a second unexplained
  // tool — before they can fix the first problem.
  const sources = [
    fs.readFileSync(BIN, 'utf8'),
    fs.readFileSync(path.join(ROOT, 'scripts', 'doctor.js'), 'utf8'),
  ];
  for (const source of sources) {
    assert.doesNotMatch(source, /brew\s+install/, 'points a beginner at Homebrew');
  }
  assert.match(sources[0], /nodejs\.org/, 'the official installer should be named instead');
});

test('server discovery finds the real entry point', () => {
  const entry = findServerEntry(ROOT);
  assert.ok(entry, 'no server entry found');
  assert.ok(fs.existsSync(entry));
  assert.equal(path.basename(entry), 'server.js');
});

test('server discovery returns null rather than throwing when nothing is there', () => {
  assert.equal(findServerEntry(path.join(ROOT, 'no', 'such', 'place')), null);
});
