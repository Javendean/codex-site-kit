/**
 * Packaging tests — the install path, locked down.
 *
 * `npx github:Javendean/codex-site-kit` and `npm install -g github:...` only
 * work if package.json obeys a handful of npm rules that are easy to break by
 * accident and invisible until a beginner hits them. Each test below encodes
 * one rule and cites it.
 *
 * The last test does not assert — it MEASURES, by asking npm what it would
 * actually put in the tarball.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('ESM: the package declares type=module', () => {
  // Every source file in this project is ESM. Without this the .js files are
  // parsed as CommonJS and `import` throws at load.
  assert.equal(pkg.type, 'module');
});

test('npx: there is exactly one bin, and its name is the package name', () => {
  // npm docs, `npx`: "If the package has a single entry in its bin field ...
  // that command will be used. If the package has multiple bin entries, and
  // one of them matches the unscoped portion of the name field, then that
  // command will be used." Satisfying BOTH clauses means npx can never fail
  // with "could not determine executable to run".
  assert.equal(typeof pkg.bin, 'object', 'bin should be an object, not a bare string');
  const names = Object.keys(pkg.bin);
  assert.equal(names.length, 1, `expected one bin, found: ${names.join(', ')}`);
  assert.equal(names[0], pkg.name);
});

test('npx: the bin file exists and is executable by the shim', () => {
  const rel = Object.values(pkg.bin)[0];
  const abs = path.join(ROOT, rel);
  assert.ok(fs.existsSync(abs), `bin target missing: ${rel}`);
  const firstLine = fs.readFileSync(abs, 'utf8').split('\n')[0];
  // npm docs, bin: "File(s) referenced in bin starts with #!/usr/bin/env node;
  // otherwise, the scripts are started without the node executable."
  assert.equal(firstLine.trim(), '#!/usr/bin/env node');
});

test('git install: no script that makes npm think a build is needed', () => {
  // npm docs, git dependencies: if the repo defines build / prepare / prepack /
  // preinstall / install / postinstall, npm clones, installs devDependencies
  // and runs them. This package ships plain .js with no build step, so those
  // scripts must stay absent — otherwise every `npx github:...` pays for a
  // dependency install it does not need, and fails if devDeps cannot resolve.
  const forbidden = ['build', 'prepare', 'prepack', 'preinstall', 'install', 'postinstall'];
  const present = forbidden.filter((s) => pkg.scripts && pkg.scripts[s]);
  assert.deepEqual(present, [], `these scripts would trigger a build on git install: ${present.join(', ')}`);
});

test('engines: Node floor is declared and is at least 18', () => {
  assert.ok(pkg.engines && pkg.engines.node, 'engines.node must be declared');
  const floor = /(\d+)\.(\d+)/.exec(pkg.engines.node);
  assert.ok(floor, `engines.node should name a concrete version, got ${pkg.engines.node}`);
  assert.ok(Number(floor[1]) >= 18, 'the MCP SDK requires Node 18 or newer');
});

test('files: the runtime directories are shipped', () => {
  assert.ok(Array.isArray(pkg.files), 'files must be an array');
  for (const needed of ['bin/', 'src/', 'scripts/']) {
    assert.ok(
      pkg.files.some((f) => f === needed || f === needed.replace(/\/$/, '')),
      `files must include ${needed} or the installed package cannot run`
    );
  }
});

test('startup weight: Playwright is NOT a dependency', () => {
  // Playwright plus its browsers is a ~150 MB download. Making it a dependency
  // would put that cost on the first run of `npx github:...`, which is the
  // moment a beginner is most likely to give up. check_responsive discovers it
  // at runtime instead, and the doctor prints the install command.
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  assert.ok(!('playwright' in all), 'playwright must not be installed with the package');
  assert.ok(!('playwright-core' in all), 'playwright-core must not be installed with the package');
});

test('metadata: license and repository are set so npm and GitHub resolve it', () => {
  assert.ok(pkg.license, 'a missing license makes npm warn on every install');
  assert.match(pkg.repository?.url ?? '', /github\.com\/Javendean\/codex-site-kit/);
});

test('MEASURED: npm pack actually includes the bin, the server and the doctor', () => {
  // Asserting that `files` looks right is not the same as checking what npm
  // puts in the tarball. This asks npm.
  let out;
  try {
    out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  } catch (err) {
    assert.fail(`npm pack --dry-run failed: ${err.stderr || err.message}`);
  }

  const entries = JSON.parse(out)[0].files.map((f) => f.path.replace(/\\/g, '/'));
  const binRel = Object.values(pkg.bin)[0].replace(/\\/g, '/');

  assert.ok(entries.includes(binRel), `tarball is missing the bin: ${binRel}`);
  assert.ok(entries.includes('package.json'), 'tarball is missing package.json');
  assert.ok(
    entries.some((f) => f.startsWith('scripts/doctor')),
    'tarball is missing the doctor'
  );
  assert.ok(
    entries.some((f) => f.startsWith('src/')),
    'tarball contains no src/ — the installed package would have no server'
  );
  // node_modules can never be published; if it shows up something is very wrong.
  assert.ok(!entries.some((f) => f.startsWith('node_modules/')), 'node_modules must not be packed');
});
