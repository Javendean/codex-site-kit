/**
 * Tests for `codex-site-kit doctor`.
 *
 * The doctor exists to serve a beginner on a broken machine, so the failure
 * paths are the point. Each test below fakes a machine that is missing
 * something and asserts both the verdict AND that the report tells the user
 * what to type.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  collectDiagnostics,
  formatDoctorReport,
  runDoctorCli,
  scanCodexConfig,
  entryLaunchesSiteKit,
  playwrightCacheDir,
  moduleResolutionBases,
  parseSemver,
  satisfiesMinimum,
} from '../scripts/doctor.js';

/* ------------------------------------------------------------------ *
 * a fake machine
 * ------------------------------------------------------------------ */

const HOME = path.join('/Users', 'brian');
const PKG_ROOT = path.join('/usr', 'local', 'lib', 'node_modules', 'codex-site-kit');
const CACHE = path.join(HOME, 'Library', 'Caches', 'ms-playwright');

const HEALTHY_CONFIG = `
model = "gpt-5.5"

[mcp_servers.site-kit]
command = "codex-site-kit"
args = []
enabled = true
`;

/**
 * @param over what to break. Anything not overridden is healthy.
 */
function machine(over = {}) {
  const files = new Map(
    over.files ?? [
      [path.join(PKG_ROOT, 'src', 'server.js'), 'export {}'],
      [path.join(PKG_ROOT, 'package.json'), '{"version":"1.0.0"}'],
      [path.join(HOME, '.codex', 'config.toml'), HEALTHY_CONFIG],
    ]
  );
  const dirs = new Map(over.dirs ?? [[CACHE, ['chromium-1234', 'ffmpeg-1011']]]);

  const fs = {
    existsSync: (p) => files.has(p) || dirs.has(p),
    readFileSync: (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p);
    },
    readdirSync: (p) => {
      if (!dirs.has(p)) throw new Error(`ENOENT: ${p}`);
      return dirs.get(p);
    },
  };

  return collectDiagnostics({
    nodeVersion: over.nodeVersion ?? 'v20.11.0',
    platform: 'darwin',
    execPath: '/usr/local/bin/node',
    env: over.env ?? {},
    homedir: HOME,
    cwd: '/Users/brian/Sites/chess',
    fs,
    packageVersion: '1.0.0',
    packageRoot: PKG_ROOT,
    resolveModule: over.resolveModule ?? (() => '/usr/local/lib/node_modules/playwright/index.js'),
  });
}

const byId = (report, id) => report.checks.find((c) => c.id === id);
const fixText = (check) => (check.fix ?? []).join('\n');

/* ------------------------------------------------------------------ *
 * happy path
 * ------------------------------------------------------------------ */

test('happy path: a fully set-up Mac passes every check', () => {
  const report = machine();
  assert.equal(report.ok, true);
  assert.deepEqual(report.failed, []);
  assert.deepEqual(report.warned, []);
  for (const check of report.checks) {
    assert.equal(check.status, 'pass', `${check.id} should pass`);
    assert.deepEqual(check.fix, [], `${check.id} should need no fix`);
  }
  assert.match(report.summary, /Everything is ready/);
});

test('happy path: the rendered report contains no FIX section when nothing is wrong', () => {
  const text = formatDoctorReport(machine());
  assert.doesNotMatch(text, /^FIX$/m);
  assert.match(text, /\[OK {2}\] {2}Node\.js/);
});

test('happy path: the CLI exits 0 and can emit JSON', async () => {
  let out = '';
  const code = await runDoctorCli(['--json'], { write: (s) => (out += s), deps: {} });
  const parsed = JSON.parse(out);
  assert.equal(typeof parsed.ok, 'boolean');
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(parsed.checks.length >= 5);
  assert.equal(code, parsed.ok ? 0 : 1);
});

/* ------------------------------------------------------------------ *
 * failure paths
 * ------------------------------------------------------------------ */

test('failure: Node too old fails and points at the official installer', () => {
  const report = machine({ nodeVersion: 'v16.20.2' });
  const check = byId(report, 'node');
  assert.equal(check.status, 'fail');
  assert.equal(report.ok, false);
  assert.match(fixText(check), /nodejs\.org/);
  assert.match(fixText(check), /node --version/);
  // A beginner with a Terminal window already open hits this trap every time.
  assert.match(fixText(check), /QUIT Terminal/);
});

test('failure: Node 18.16 is rejected but 18.17 is accepted', () => {
  assert.equal(byId(machine({ nodeVersion: 'v18.16.1' }), 'node').status, 'fail');
  assert.equal(byId(machine({ nodeVersion: 'v18.17.0' }), 'node').status, 'pass');
});

test('failure: missing server files fails with a reinstall command', () => {
  const report = machine({
    files: [[path.join(HOME, '.codex', 'config.toml'), HEALTHY_CONFIG]],
  });
  const check = byId(report, 'install');
  assert.equal(check.status, 'fail');
  assert.match(fixText(check), /npm install -g github:Javendean\/codex-site-kit/);
});

test('failure: no Playwright is a NOTE, not a failure — it must not block the beginner', () => {
  const report = machine({ resolveModule: () => null, dirs: [] });
  assert.equal(byId(report, 'playwright-module').status, 'warn');
  assert.equal(byId(report, 'playwright-chromium').status, 'warn');
  assert.equal(report.ok, true, 'a missing optional browser must not fail the doctor');
  assert.match(report.summary, /Ready to use/);
});

test('failure: missing Chromium names the single install command', () => {
  const report = machine({ dirs: [] });
  const check = byId(report, 'playwright-chromium');
  assert.equal(check.status, 'warn');
  assert.match(fixText(check), /npx playwright install chromium/);
});

test('failure: no Codex config at all fails with the exact one-line add command', () => {
  const report = machine({
    files: [
      [path.join(PKG_ROOT, 'src', 'server.js'), 'export {}'],
      [path.join(PKG_ROOT, 'package.json'), '{"version":"1.0.0"}'],
    ],
  });
  const check = byId(report, 'codex-config');
  assert.equal(check.status, 'fail');
  assert.equal(report.ok, false);
  assert.match(fixText(check), /codex mcp add site-kit -- codex-site-kit/);
  assert.match(fixText(check), /codex mcp list/);
  // Verified against codex-cli 0.154.0: the command is NOT silent on success.
  assert.match(fixText(check), /Added global MCP server 'site-kit'\./);
  // Codex reads its config once, at startup. Omitting this produces the single
  // most common "I did it and nothing happened" report.
  assert.match(fixText(check), /quit Codex and start it again/i);
});

test('CODEX_HOME: the config is found where Codex actually puts it', () => {
  // Verified against codex-cli 0.154.0: with CODEX_HOME set, `codex mcp add`
  // writes $CODEX_HOME/config.toml — NOT $CODEX_HOME/.codex/config.toml.
  const home = '/Users/brian/custom-codex';
  const report = machine({
    env: { CODEX_HOME: home },
    files: [
      [path.join(PKG_ROOT, 'src', 'server.js'), 'export {}'],
      [path.join(PKG_ROOT, 'package.json'), '{"version":"1.0.0"}'],
      [path.join(home, 'config.toml'), HEALTHY_CONFIG],
    ],
  });
  const check = byId(report, 'codex-config');
  assert.equal(check.status, 'pass', check.detail);
  assert.match(check.detail, /custom-codex/);
});

test('failure: a Codex config with other servers but not ours says so precisely', () => {
  const other = '[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp"]\n';
  const report = machine({
    files: [
      [path.join(PKG_ROOT, 'src', 'server.js'), 'export {}'],
      [path.join(PKG_ROOT, 'package.json'), '{"version":"1.0.0"}'],
      [path.join(HOME, '.codex', 'config.toml'), other],
    ],
  });
  const check = byId(report, 'codex-config');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /no entry runs codex-site-kit/);
});

test('failure: an entry that exists but is switched off is reported as switched off', () => {
  const disabled = '[mcp_servers.site-kit]\ncommand = "codex-site-kit"\nenabled = false\n';
  const report = machine({
    files: [
      [path.join(PKG_ROOT, 'src', 'server.js'), 'export {}'],
      [path.join(PKG_ROOT, 'package.json'), '{"version":"1.0.0"}'],
      [path.join(HOME, '.codex', 'config.toml'), disabled],
    ],
  });
  const check = byId(report, 'codex-config');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /switched off/);
  assert.match(fixText(check), /enabled = false\s+to\s+enabled = true/);
});

test('failure: the CLI exits 1 when something is actually broken', async () => {
  let out = '';
  const code = await runDoctorCli([], {
    write: (s) => (out += s),
    deps: {
      nodeVersion: 'v16.0.0',
      platform: 'darwin',
      execPath: '/usr/local/bin/node',
      env: {},
      homedir: HOME,
      cwd: '/tmp',
      packageRoot: PKG_ROOT,
      packageVersion: '1.0.0',
      resolveModule: () => null,
      fs: { existsSync: () => false, readFileSync: () => { throw new Error('ENOENT'); }, readdirSync: () => { throw new Error('ENOENT'); } },
    },
  });
  assert.equal(code, 1);
  assert.match(out, /^FIX$/m);
  assert.doesNotMatch(out, /at Object\.|node:internal/, 'no stack traces in user-facing output');
});

/* ------------------------------------------------------------------ *
 * the invariant that makes the doctor worth having
 * ------------------------------------------------------------------ */

test('invariant: every non-passing check carries an actionable fix', () => {
  const broken = machine({
    nodeVersion: 'v14.0.0',
    files: [],
    dirs: [],
    resolveModule: () => null,
  });
  const notPassing = broken.checks.filter((c) => c.status !== 'pass');
  assert.ok(notPassing.length >= 4, 'this machine should be thoroughly broken');
  for (const check of notPassing) {
    assert.ok(check.fix.length > 0, `${check.id} reports a problem with no fix`);
    assert.ok(
      check.fix.some((l) => /^\s*(npm|npx|codex|node|Open|Go to|Find)/.test(l)),
      `${check.id} fix contains no command or concrete instruction`
    );
  }
});

/* ------------------------------------------------------------------ *
 * the TOML scan
 * ------------------------------------------------------------------ */

test('scan: reads the shape Codex actually writes', () => {
  const { servers } = scanCodexConfig(`
[mcp_servers.context7]
args = ["-y", "@upstash/context7-mcp"]
command = "npx"
enabled = true
`);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].command, 'npx');
  assert.deepEqual(servers[0].args, ['-y', '@upstash/context7-mcp']);
});

test("scan: single-quoted TOML literal strings are unquoted (Codex writes Windows paths this way)", () => {
  const { servers } = scanCodexConfig("[mcp_servers.node_repl]\ncommand = 'C:\\bin\\node_repl.exe'\n");
  assert.equal(servers[0].command, 'C:\\bin\\node_repl.exe');
});

test('scan: an env subtable does NOT leak into the parent server entry', () => {
  // Regression: a token or path containing our own name used to register as a
  // false positive, telling a beginner they were set up when they were not.
  const { servers } = scanCodexConfig(`
[mcp_servers.other]
command = "npx"
args = ["other-mcp"]

[mcp_servers.other.env]
SOME_PATH = "/Users/brian/codex-site-kit/notes"
command = "not-the-real-command"
`);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].command, 'npx');
  assert.equal(entryLaunchesSiteKit(servers[0]), false);
});

test('scan: a non-mcp table ends collection', () => {
  const { servers } = scanCodexConfig(`
[mcp_servers.a]
command = "npx"

[features]
command = "codex-site-kit"
`);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].command, 'npx');
});

test('scan: a multi-line args array is flagged rather than silently misread', () => {
  const scan = scanCodexConfig('[mcp_servers.a]\nargs = [\n  "-y",\n  "x"\n]\n');
  assert.equal(scan.unparsable, true);
});

test('scan: reads the exact file `codex mcp add` writes', () => {
  // Captured verbatim from codex-cli 0.154.0 running
  //   codex mcp add site-kit -- codex-site-kit
  // Note what is ABSENT: no args line, no enabled line. A scanner that
  // required either would report a correctly-installed machine as broken.
  const REAL = '[mcp_servers.site-kit]\ncommand = "codex-site-kit"\n';
  const { servers } = scanCodexConfig(REAL);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, 'site-kit');
  assert.equal(servers[0].command, 'codex-site-kit');
  assert.deepEqual(servers[0].args, []);
  assert.equal(servers[0].enabled, true, 'a missing enabled key means enabled');
  assert.equal(entryLaunchesSiteKit(servers[0]), true);
});

test('scan: our server is recognised whether installed globally or run via npx', () => {
  const global = scanCodexConfig('[mcp_servers.site-kit]\ncommand = "codex-site-kit"\n').servers[0];
  const viaNpx = scanCodexConfig(
    '[mcp_servers.site-kit]\ncommand = "npx"\nargs = ["-y", "github:Javendean/codex-site-kit"]\n'
  ).servers[0];
  assert.equal(entryLaunchesSiteKit(global), true);
  assert.equal(entryLaunchesSiteKit(viaNpx), true);
});

/* ------------------------------------------------------------------ *
 * small pure helpers
 * ------------------------------------------------------------------ */

test('semver: parses and compares the forms Node reports', () => {
  assert.deepEqual(parseSemver('v20.11.0'), { major: 20, minor: 11, patch: 0 });
  assert.equal(parseSemver('not a version'), null);
  assert.equal(satisfiesMinimum('v22.0.0'), true);
  assert.equal(satisfiesMinimum('v18.17.0'), true);
  assert.equal(satisfiesMinimum('v18.16.9'), false);
  assert.equal(satisfiesMinimum('garbage'), false);
});

test('cache dir: macOS location is the one a Mac beginner will have', () => {
  const dir = playwrightCacheDir({ platform: 'darwin', env: {}, homedir: HOME });
  assert.equal(dir, path.join(HOME, 'Library', 'Caches', 'ms-playwright'));
});

test('cache dir: PLAYWRIGHT_BROWSERS_PATH wins, but the "0" sentinel does not', () => {
  assert.equal(
    playwrightCacheDir({ platform: 'darwin', env: { PLAYWRIGHT_BROWSERS_PATH: '/opt/pw' }, homedir: HOME }),
    '/opt/pw'
  );
  assert.equal(
    playwrightCacheDir({ platform: 'darwin', env: { PLAYWRIGHT_BROWSERS_PATH: '0' }, homedir: HOME }),
    path.join(HOME, 'Library', 'Caches', 'ms-playwright')
  );
});

test('resolution bases: the global node_modules sibling is searched', () => {
  // This is what makes `npm install -g playwright` visible to a globally
  // installed codex-site-kit.
  const bases = moduleResolutionBases({ execPath: '/usr/local/bin/node', env: {}, packageRoot: PKG_ROOT });
  assert.ok(bases.includes(PKG_ROOT));
  assert.ok(bases.some((b) => b.endsWith(path.join('lib', 'node_modules'))));
});
