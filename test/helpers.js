/**
 * Shared test scaffolding: disposable folders, synthetic images, and a real
 * MCP client wired to a real server over an in-memory transport.
 *
 * Tools are driven through the client rather than called directly wherever it
 * matters, so the tests also prove the schemas round-trip.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from '../src/server.js';

const scratch = [];

/* The variety ledger lives in the user's home folder. A test run must never
   read it (results would depend on what the machine built last week) and must
   never write to it (a test run would poison the real one). This redirects it
   into the OS temp folder for the whole process. */
process.env.CODEX_SITE_KIT_STATE =
  process.env.CODEX_SITE_KIT_STATE ?? path.join(tmpdir(), `csk-ledger-${process.pid}`);

/** A fresh empty folder that is removed when the test file finishes. */
export async function tempDir(label = 'site') {
  const dir = await mkdtemp(path.join(tmpdir(), `csk-${label}-`));
  scratch.push(dir);
  return dir;
}

/** Remove everything tempDir handed out. Call from an `after` hook. */
export async function cleanup() {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

/** Write a file, creating parent folders. Returns the absolute path. */
export async function write(dir, relative, contents) {
  const target = path.join(dir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
  return target;
}

/**
 * Build a PNG with exact, known colours, so quantiser tests assert against
 * planted values rather than against whatever the quantiser happened to do.
 *
 * @param {Array<{hex:string, weight:number}>} bands
 */
export async function writePng(dir, relative, bands, { width = 60, height = 60 } = {}) {
  const { PNG } = await import('pngjs');
  const png = new PNG({ width, height });

  const total = bands.reduce((s, b) => s + b.weight, 0);
  const rows = bands.map((b) => ({
    ...b,
    rows: Math.max(1, Math.round((b.weight / total) * height))
  }));

  let y = 0;
  for (const band of rows) {
    const value = band.hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    for (let n = 0; n < band.rows && y < height; n++, y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
    }
  }
  // Fill any remainder with the first band so no row is left transparent.
  const first = rows[0];
  const fv = first.hex.replace('#', '');
  for (; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      png.data[i] = parseInt(fv.slice(0, 2), 16);
      png.data[i + 1] = parseInt(fv.slice(2, 4), 16);
      png.data[i + 2] = parseInt(fv.slice(4, 6), 16);
      png.data[i + 3] = 255;
    }
  }

  const target = path.join(dir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, PNG.sync.write(png));
  return target;
}

/** A fully transparent PNG, for the "nothing to read" failure path. */
export async function writeTransparentPng(dir, relative, { width = 20, height = 20 } = {}) {
  const { PNG } = await import('pngjs');
  const png = new PNG({ width, height });
  png.data.fill(0);
  const target = path.join(dir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, PNG.sync.write(png));
  return target;
}

/**
 * A connected MCP client/server pair. `call` returns the tool result with the
 * structured payload already unwrapped.
 */
export async function connect() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'codex-site-kit-tests', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    async call(name, args) {
      const result = await client.callTool({ name, arguments: args });
      return {
        raw: result,
        text: result.content?.map((c) => c.text ?? '').join('\n') ?? '',
        data: result.structuredContent ?? {},
        isError: result.isError === true
      };
    },
    async close() {
      await client.close();
      await server.close();
    }
  };
}

/** Is Playwright usable on this machine? Decides which branch of the responsive tests runs. */
export async function playwrightAvailable() {
  const { loadPlaywright } = await import('../src/lib/browser.js');
  const { module: mod } = await loadPlaywright({});
  return Boolean(mod?.chromium);
}
