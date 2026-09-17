/**
 * Filesystem walking, path safety, and the case-sensitivity trap.
 *
 * The case trap matters more than it looks. macOS ships a case-INsensitive
 * filesystem, so `<img src="Logo.png">` finds `logo.png` on the machine the
 * site was built on and 404s on every Linux host it is published to. The site
 * looks perfect right up until it is live. `resolveReference` below reports
 * that as its own category rather than as "found".
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  'vendor',
  '.venv',
  '__pycache__',
  '.DS_Store',
  // Build output and scratch directories. A bundled copy of a price is not a
  // second source of truth; it is the same source, compiled. Reporting it
  // buries the real duplicate under a dozen generated ones.
  '.wrangler',
  '.turbo',
  '.parcel-cache',
  '.svelte-kit',
  '.astro',
  '.output',
  '.vercel',
  '.netlify',
  'tmp',
  '.tmp'
];

export const TEXT_EXTENSIONS = [
  '.html', '.htm', '.md', '.markdown', '.txt',
  '.css', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.vue', '.svelte', '.astro', '.json'
];

export class PathError extends Error {
  constructor(message, { code, fix } = {}) {
    super(message);
    this.name = 'PathError';
    this.code = code || 'PATH_ERROR';
    this.fix = fix || null;
  }
}

/** Resolve and confirm a directory exists, with a message a beginner can act on. */
export async function requireDirectory(dir, label = 'folder') {
  if (typeof dir !== 'string' || dir.trim() === '') {
    throw new PathError(`No ${label} was given.`, {
      code: 'PATH_MISSING',
      fix: 'Pass the full path to the site folder, for example /Users/brian/Sites/chess.'
    });
  }
  const abs = path.resolve(dir);
  let info;
  try {
    info = await stat(abs);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new PathError(`There is no ${label} at ${abs}`, {
        code: 'PATH_NOT_FOUND',
        fix: [
          'Check the spelling of the path.',
          'In Finder, right-click the folder, hold Option, and choose "Copy … as Pathname" to get the exact path.'
        ]
      });
    }
    throw new PathError(`Could not open ${abs}: ${err.code || err.message}`, {
      code: 'PATH_UNREADABLE',
      fix: 'Check that you have permission to open that folder.'
    });
  }
  if (!info.isDirectory()) {
    throw new PathError(`${abs} is a file, not a ${label}.`, {
      code: 'PATH_NOT_DIRECTORY',
      fix: 'Pass the folder that contains the site, not one of the files inside it.'
    });
  }
  return abs;
}

function shouldIgnore(name, ignore) {
  return ignore.some((pattern) => {
    if (pattern.includes('*')) {
      const re = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
      return re.test(name);
    }
    return name === pattern;
  });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Walk a directory tree, returning absolute file paths.
 * @param {string} root
 * @param {{extensions?: string[], ignore?: string[], maxFiles?: number}} opts
 */
export async function walk(root, { extensions = null, ignore = DEFAULT_IGNORE, maxFiles = 5000 } = {}) {
  const found = [];
  const exts = extensions ? extensions.map((e) => (e.startsWith('.') ? e : '.' + e).toLowerCase()) : null;

  async function visit(dir) {
    if (found.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // an unreadable subfolder is not a reason to abandon the scan
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (shouldIgnore(entry.name, ignore)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        if (exts && !exts.includes(path.extname(entry.name).toLowerCase())) continue;
        found.push(full);
        if (found.length >= maxFiles) return;
      }
    }
  }

  await visit(root);
  return found;
}

/** Read a text file, returning null rather than throwing when it is binary or unreadable. */
export async function readText(file) {
  try {
    const buf = await readFile(file);
    // A NUL byte in the first 8 KB means this is not text.
    if (buf.subarray(0, 8192).includes(0)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

/** Split into lines once, so every reporter can convert an offset to a line number. */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return {
    /** 1-based line number for a character offset. */
    lineAt(offset) {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    },
    /** 1-based column for a character offset. */
    columnAt(offset) {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return offset - starts[lo] + 1;
    }
  };
}

/** Path relative to root, always with forward slashes, so reports are stable across platforms. */
export function rel(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Resolve a reference found in markup against the filesystem.
 *
 * @returns {Promise<{kind:'found'|'missing'|'case_mismatch'|'empty'|'directory', target:string, actual?:string, bytes?:number}>}
 */
export async function resolveReference(fromFile, reference, { root } = {}) {
  const clean = reference.split('#')[0].split('?')[0];
  if (clean === '') return { kind: 'found', target: fromFile, bytes: -1 };

  const base = clean.startsWith('/')
    ? path.join(root ?? path.dirname(fromFile), '.' + clean)
    : path.resolve(path.dirname(fromFile), clean);

  try {
    const info = await stat(base);
    if (info.isDirectory()) return { kind: 'directory', target: base };
    if (info.size === 0) return { kind: 'empty', target: base, bytes: 0 };

    // The file resolved, but on a case-insensitive disk that proves nothing.
    // Confirm the name on disk matches the name that was asked for.
    const actual = await actualCasing(base);
    if (actual && actual !== base) {
      return { kind: 'case_mismatch', target: base, actual, bytes: info.size };
    }
    return { kind: 'found', target: base, bytes: info.size };
  } catch {
    return { kind: 'missing', target: base };
  }
}

/**
 * Read back the exact spelling of a path as the directory lists it.
 * Returns null if it cannot be determined.
 */
async function actualCasing(target) {
  try {
    const dir = path.dirname(target);
    const wanted = path.basename(target);
    const entries = await readdir(dir);
    const exact = entries.find((e) => e === wanted);
    if (exact) return target;
    const insensitive = entries.find((e) => e.toLowerCase() === wanted.toLowerCase());
    return insensitive ? path.join(dir, insensitive) : null;
  } catch {
    return null;
  }
}
