// src/kernel/runtime.js — make sure npm dependencies exist before the desk starts.
//
// Owns: the one-time npm install when a dependency folder is missing.
// Must not: write to stdout. MCP shares that stream. Logs go to stderr.
// Must not: run during tests (LEADLINE_DISABLE_BROWSER=1).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function present(parts) {
  return fs.existsSync(path.join(root, ...parts));
}

/** Install dependencies when they are not on disk. A second call does nothing. */
export function ensureInstalled() {
  if (process.env.LEADLINE_DISABLE_BROWSER === '1') return { ok: true, skipped: true };
  const ready = present(['node_modules', '@modelcontextprotocol', 'sdk', 'package.json'])
    && present(['node_modules', 'playwright-core', 'package.json']);
  if (ready) return { ok: true, installed: false };
  const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) return { ok: false, code: 'npm_install_failed' };
  return { ok: true, installed: true };
}
