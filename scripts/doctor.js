/**
 * codex-site-kit doctor
 *
 * Answers one question: "why isn't it working, and what do I type?"
 *
 * Every check returns a fix — the literal command to paste. A check that can
 * only say "something is wrong" is a check that has failed at its job, so each
 * one below either prints a command or explains in a sentence why no command
 * is needed.
 *
 * The whole diagnostic core is pure and dependency-injected so the tests can
 * drive a machine that does NOT have Node 18, does NOT have Playwright and
 * does NOT have a Codex config — the failure paths that actually matter.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fsDefault from 'node:fs';
import osDefault from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');

export const MIN_NODE = { major: 18, minor: 17 };
export const PACKAGE_NAME = 'codex-site-kit';
export const GITHUB_SPEC = 'github:Javendean/codex-site-kit';

/* ------------------------------------------------------------------ *
 * version helpers
 * ------------------------------------------------------------------ */

export function parseSemver(raw) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(raw ?? '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3] ?? 0) };
}

export function satisfiesMinimum(raw, min = MIN_NODE) {
  const v = parseSemver(raw);
  if (!v) return false;
  if (v.major !== min.major) return v.major > min.major;
  return v.minor >= min.minor;
}

/* ------------------------------------------------------------------ *
 * Codex config scanning
 *
 * Node has no TOML parser in the standard library and this package refuses to
 * take a dependency just to read six lines, so this is a deliberate SCAN, not
 * a parse. It walks section headers and the key/value lines beneath them.
 * It understands the shapes Codex actually writes. It does not understand
 * multi-line arrays or inline tables, and says so rather than guessing.
 * ------------------------------------------------------------------ */

export function scanCodexConfig(text) {
  const servers = new Map();
  let current = null;
  let unparsable = false;

  const lines = String(text ?? '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const header = /^\[\s*mcp_servers\s*\.\s*([^\].\s]+)\s*(\.\s*[^\]\s]+\s*)?\]$/.exec(line);
    if (header) {
      const name = stripQuotes(header[1]);
      if (!servers.has(name)) {
        servers.set(name, { name, command: null, args: [], enabled: true, raw: [] });
      }
      // `[mcp_servers.foo.env]` is a SUBTABLE. Its keys belong to the env, not
      // to the server, so stop collecting. Without this, an env var holding the
      // string "codex-site-kit" would be misread as the server's command, and a
      // key named `command` inside env would overwrite the real one.
      current = header[2] ? null : name;
      continue;
    }
    if (/^\[/.test(line)) {
      current = null; // some other table
      continue;
    }
    if (!current) continue;

    const entry = servers.get(current);
    entry.raw.push(line);

    const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();

    if (key === 'command') {
      entry.command = stripQuotes(value);
    } else if (key === 'args') {
      if (value.startsWith('[') && value.includes(']')) {
        entry.args = value
          .slice(value.indexOf('[') + 1, value.lastIndexOf(']'))
          .split(',')
          .map((s) => stripQuotes(s.trim()))
          .filter(Boolean);
      } else if (value.startsWith('[')) {
        unparsable = true; // array continues on later lines
      }
    } else if (key === 'enabled') {
      entry.enabled = !/^false$/i.test(value);
    }
  }

  return { servers: [...servers.values()], unparsable };
}

function stripQuotes(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Does this server entry launch codex-site-kit, however it was installed? */
export function entryLaunchesSiteKit(entry) {
  const haystack = [entry.command ?? '', ...(entry.args ?? [])].join(' ').toLowerCase();
  return haystack.includes(PACKAGE_NAME);
}

/* ------------------------------------------------------------------ *
 * Playwright discovery
 * ------------------------------------------------------------------ */

export function playwrightCacheDir({ platform, env, homedir }) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return env.PLAYWRIGHT_BROWSERS_PATH;
  }
  if (platform === 'darwin') return path.join(homedir, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local'), 'ms-playwright');
  }
  return path.join(homedir, '.cache', 'ms-playwright');
}

/**
 * Resolution bases, in the order that matters.
 *
 * The second entry is the one that makes the recommended install work: when a
 * user runs `npm install -g codex-site-kit` and `npm install -g playwright`,
 * both land as siblings inside the global node_modules directory, and Node's
 * upward lookup from our own file finds the sibling. Listing the global root
 * explicitly means the check still works if that lookup is defeated by a
 * symlinked prefix.
 */
export function moduleResolutionBases({ execPath, env, packageRoot = PACKAGE_ROOT }) {
  const bases = [packageRoot];
  const prefix = env.npm_config_prefix || path.dirname(path.dirname(execPath));
  bases.push(path.join(prefix, 'lib', 'node_modules'));
  bases.push(path.join(prefix, 'node_modules'));
  return [...new Set(bases)];
}

function defaultResolveModule(name, bases) {
  for (const base of bases) {
    try {
      const req = createRequire(path.join(base, 'noop.js'));
      return req.resolve(name);
    } catch {
      /* try the next base */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * the checks
 * ------------------------------------------------------------------ */

const PASS = 'pass';
const FAIL = 'fail';
const WARN = 'warn';

/**
 * @param deps everything that touches the outside world, so tests can lie.
 */
export function collectDiagnostics(deps = {}) {
  const {
    nodeVersion = process.version,
    platform = process.platform,
    execPath = process.execPath,
    env = process.env,
    homedir = osDefault.homedir(),
    cwd = process.cwd(),
    fs = fsDefault,
    packageVersion = readOwnVersion(fs),
    resolveModule = defaultResolveModule,
    packageRoot = PACKAGE_ROOT,
  } = deps;

  const checks = [];
  const exists = (p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };

  /* 1 — Node ------------------------------------------------------- */
  const nodeOk = satisfiesMinimum(nodeVersion);
  checks.push({
    id: 'node',
    title: 'Node.js',
    status: nodeOk ? PASS : FAIL,
    detail: nodeOk
      ? `${nodeVersion} — new enough (needs 18.17 or later).`
      : `${nodeVersion} — too old. This needs 18.17 or later.`,
    fix: nodeOk
      ? []
      : [
          'Go to https://nodejs.org and click the big green button to download',
          'the installer for macOS. Open it and click Continue until it finishes.',
          'Then QUIT Terminal completely and open it again — a Terminal window that',
          'was already open will keep using the old version.',
          '',
          'Check it worked:   node --version',
        ],
  });

  /* 2 — the package itself ---------------------------------------- */
  const serverEntry = ['src/server.js', 'src/index.js', 'src/main.js']
    .map((rel) => path.join(packageRoot, rel))
    .find(exists);
  checks.push({
    id: 'install',
    title: 'codex-site-kit files',
    status: serverEntry ? PASS : FAIL,
    detail: serverEntry
      ? `version ${packageVersion}, installed at ${packageRoot}`
      : `the server files are missing from ${packageRoot}`,
    fix: serverEntry
      ? []
      : [
          'The download was probably interrupted. Install it again:',
          '',
          `  npm install -g ${GITHUB_SPEC}`,
        ],
  });

  /* 3 — Playwright the library ------------------------------------ */
  const bases = moduleResolutionBases({ execPath, env, packageRoot });
  const playwrightPath = resolveModule('playwright', bases) || resolveModule('playwright-core', bases);
  checks.push({
    id: 'playwright-module',
    title: 'Playwright (for page measuring)',
    status: playwrightPath ? PASS : WARN,
    detail: playwrightPath
      ? `found at ${playwrightPath}`
      : 'not installed — every tool works except check_responsive.',
    fix: playwrightPath
      ? []
      : [
          'Only needed if you want the site measured at real screen widths.',
          'Install it with this one line:',
          '',
          '  npm install -g playwright && npx playwright install chromium',
          '',
          'It downloads about 150 MB and takes a few minutes. Everything else',
          'in codex-site-kit works without it.',
        ],
  });

  /* 4 — Playwright the browser ------------------------------------ */
  const cacheDir = playwrightCacheDir({ platform, env, homedir });
  let chromiumDirs = [];
  try {
    chromiumDirs = exists(cacheDir)
      ? fs.readdirSync(cacheDir).filter((d) => /^chromium/.test(d))
      : [];
  } catch {
    chromiumDirs = [];
  }
  const chromiumOk = chromiumDirs.length > 0;
  checks.push({
    id: 'playwright-chromium',
    title: 'Chromium browser',
    status: chromiumOk ? PASS : WARN,
    detail: chromiumOk
      ? `${chromiumDirs.length} build(s) in ${cacheDir}`
      : `no browser downloaded yet (looked in ${cacheDir}).`,
    fix: chromiumOk
      ? []
      : [
          'The browser is a separate download from the Playwright library.',
          'This one line gets it:',
          '',
          '  npx playwright install chromium',
        ],
  });

  /* 5 — Codex config ---------------------------------------------- */
  // Codex resolves its config in this order. CODEX_HOME points at the codex
  // directory itself, so the file sits directly inside it — verified against
  // codex-cli 0.154.0, which writes $CODEX_HOME/config.toml, not
  // $CODEX_HOME/.codex/config.toml. Missing this reports a correctly
  // configured machine as broken.
  const configPaths = [
    path.join(cwd, '.codex', 'config.toml'),
    env.CODEX_HOME ? path.join(env.CODEX_HOME, 'config.toml') : null,
    path.join(homedir, '.codex', 'config.toml'),
  ].filter(Boolean);
  const found = [];
  let registered = null;
  let sawUnparsableArray = false;

  for (const p of configPaths) {
    if (!exists(p)) continue;
    let text = '';
    try {
      text = fs.readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    const scan = scanCodexConfig(text);
    if (scan.unparsable) sawUnparsableArray = true;
    found.push({ path: p, servers: scan.servers });
    const hit = scan.servers.find(entryLaunchesSiteKit);
    if (hit && !registered) registered = { ...hit, path: p };
  }

  const addLine = '  codex mcp add site-kit -- codex-site-kit';
  const disabled = registered && registered.enabled === false;
  checks.push({
    id: 'codex-config',
    title: 'Codex knows about this server',
    status: registered && !disabled ? PASS : FAIL,
    detail: disabled
      ? `registered as "${registered.name}" in ${registered.path}, but it is switched off (enabled = false).`
      : registered
        ? `registered as "${registered.name}" in ${registered.path}`
        : found.length
          ? `a Codex config exists (${found.map((f) => f.path).join(', ')}) but no entry runs codex-site-kit.`
          : 'no Codex config found yet — nothing has been registered.',
    fix: disabled
      ? [
          `Open this file:  ${registered.path}`,
          '',
          `Find the line  [mcp_servers.${registered.name}]  and below it change`,
          '',
          '  enabled = false        to        enabled = true',
          '',
          'Save the file, then quit Codex and start it again.',
        ]
      : registered
        ? []
        : [
            'Run this one line, exactly as written:',
            '',
            addLine,
            '',
            "It answers:  Added global MCP server 'site-kit'.",
            '',
            'Check it worked:',
            '',
            '  codex mcp list',
            '',
            'You should see a row for  site-kit  with Status  enabled.',
            'Then quit Codex and start it again — it reads the config once, at startup.',
          ],
  });

  if (sawUnparsableArray) {
    checks.push({
      id: 'codex-config-shape',
      title: 'Codex config shape',
      status: WARN,
      detail:
        'the config contains an args array spread over several lines, which this check reads only partially.',
      fix: [
        'Nothing is necessarily wrong. To see what Codex itself thinks is registered:',
        '',
        '  codex mcp list',
      ],
    });
  }

  const failed = checks.filter((c) => c.status === FAIL);
  const warned = checks.filter((c) => c.status === WARN);

  return {
    ok: failed.length === 0,
    checks,
    failed: failed.map((c) => c.id),
    warned: warned.map((c) => c.id),
    summary: summarise(failed, warned),
  };
}

function summarise(failed, warned) {
  if (failed.length === 0 && warned.length === 0) {
    return 'Everything is ready. Ask Codex to build you a site.';
  }
  if (failed.length === 0) {
    return `Ready to use. ${warned.length} optional thing${warned.length === 1 ? ' is' : 's are'} not installed — see above.`;
  }
  return `${failed.length} thing${failed.length === 1 ? '' : 's'} need${failed.length === 1 ? 's' : ''} fixing. Do the steps under FIX above, in order.`;
}

function readOwnVersion(fs) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

/* ------------------------------------------------------------------ *
 * rendering
 * ------------------------------------------------------------------ */

const MARK = { [PASS]: 'OK  ', [FAIL]: 'FAIL', [WARN]: 'note' };

export function formatDoctorReport(report) {
  const out = [];
  out.push('');
  out.push('codex-site-kit doctor');
  out.push('=====================');
  out.push('');

  for (const check of report.checks) {
    out.push(`  [${MARK[check.status]}]  ${check.title}`);
    out.push(`          ${check.detail}`);
    out.push('');
  }

  const needsFix = report.checks.filter((c) => c.fix && c.fix.length);
  if (needsFix.length) {
    out.push('FIX');
    out.push('---');
    out.push('');
    for (const check of needsFix) {
      out.push(`  ${check.title}`);
      for (const line of check.fix) out.push(line ? `    ${line}` : '');
      out.push('');
    }
  }

  out.push(report.summary);
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

export async function runDoctorCli(args = [], io = {}) {
  const write = io.write ?? ((s) => process.stdout.write(s));
  const report = collectDiagnostics(io.deps ?? {});

  if (args.includes('--json')) {
    write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    write(formatDoctorReport(report));
  }
  return report.ok ? 0 : 1;
}
