/**
 * Finding Playwright, and failing loudly when it is not there.
 *
 * Playwright is a heavy thing to ask of someone who has never opened a
 * terminal, so it is an OPTIONAL peer dependency: it is not installed with
 * this kit and nothing here breaks without it.
 *
 * What must never happen is a silent pass. "No overflow was found" and "no
 * measurement was taken" look identical in a summary and mean opposite things.
 * Every exit from here is explicit about which one it is.
 */

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const INSTALL_COMMAND = 'npm install -g playwright && npx playwright install chromium';
export const BROWSER_ONLY_COMMAND = 'npx playwright install chromium';

let globalRootCache;

async function npmGlobalRoot() {
  if (globalRootCache !== undefined) return globalRootCache;
  try {
    const { stdout } = await execFileAsync('npm', ['root', '-g'], {
      timeout: 10000,
      windowsHide: true,
      shell: process.platform === 'win32'
    });
    globalRootCache = stdout.trim() || null;
  } catch {
    globalRootCache = null;
  }
  return globalRootCache;
}

function candidateDirs(startDir) {
  const dirs = [];
  let current = startDir ? path.resolve(startDir) : null;
  while (current) {
    dirs.push(path.join(current, 'node_modules'));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

/**
 * Try hard to find Playwright, in the places a beginner might have put it.
 *
 * @param {{near?: string}} opts  a folder to search upward from, usually the site
 * @returns {Promise<{module: object|null, from: string|null, tried: string[]}>}
 */
export async function loadPlaywright({ near } = {}) {
  const tried = [];

  // 1. Next to this kit.
  for (const name of ['playwright', 'playwright-core']) {
    try {
      tried.push(`import("${name}") from codex-site-kit`);
      const mod = await import(name);
      return { module: mod.default ?? mod, from: 'installed alongside codex-site-kit', tried };
    } catch {
      /* keep looking */
    }
  }

  // 2. Walking up from the site folder, then from the working directory.
  const roots = [...candidateDirs(near), ...candidateDirs(process.cwd())];
  const globalRoot = await npmGlobalRoot();
  if (globalRoot) roots.push(globalRoot);

  const seen = new Set();
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    for (const name of ['playwright', 'playwright-core']) {
      const entry = path.join(root, name);
      tried.push(entry);
      try {
        const require = createRequire(path.join(root, 'anchor.cjs'));
        const resolved = require.resolve(name);
        const mod = await import(pathToFileURL(resolved).href);
        return { module: mod.default ?? mod, from: entry, tried };
      } catch {
        /* keep looking */
      }
    }
  }

  return { module: null, from: null, tried };
}

const MISSING_BROWSER = /Executable doesn't exist|please run the following command|browserType\.launch.*install/i;

/**
 * Launch Chromium, distinguishing "Playwright is not installed" from
 * "Playwright is installed but the browser was never downloaded". Those need
 * different commands, and telling someone to run the wrong one is worse than
 * telling them nothing.
 *
 * @returns {Promise<{browser: object|null, reason: string|null, detail: string|null, command: string|null, from: string|null}>}
 */
export async function launchChromium({ near } = {}) {
  const { module: playwright, from, tried } = await loadPlaywright({ near });

  if (!playwright) {
    return {
      browser: null,
      reason: 'playwright_not_installed',
      detail: 'Playwright is not installed on this machine.',
      command: INSTALL_COMMAND,
      from: null,
      tried
    };
  }

  if (!playwright.chromium || typeof playwright.chromium.launch !== 'function') {
    return {
      browser: null,
      reason: 'playwright_unusable',
      detail: 'Playwright was found but does not expose a Chromium launcher.',
      command: INSTALL_COMMAND,
      from,
      tried
    };
  }

  try {
    const browser = await playwright.chromium.launch({ headless: true });
    return { browser, reason: null, detail: null, command: null, from, tried };
  } catch (err) {
    const message = String(err?.message ?? err);
    if (MISSING_BROWSER.test(message)) {
      return {
        browser: null,
        reason: 'browser_not_downloaded',
        detail: 'Playwright is installed, but the Chromium browser it drives has not been downloaded.',
        command: BROWSER_ONLY_COMMAND,
        from,
        tried
      };
    }
    return {
      browser: null,
      reason: 'launch_failed',
      detail: message.split('\n')[0],
      command: BROWSER_ONLY_COMMAND,
      from,
      tried
    };
  }
}
