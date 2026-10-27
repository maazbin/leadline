// src/kernel/paths.js — repo and data paths.
//
// Owns: where the database, Chrome profile, and encounter files live.
// Must not: read or write those files.
// Reads: LEADLINE_DATA_DIR, LEADLINE_DB, LEADLINE_PORT, LEADLINE_CDP_PORT.
// Writes: nothing.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @returns {string} Absolute repo root. */
export function rootDir() {
  return root;
}

/** @returns {string} Gitignored data directory. */
export function dataDir() {
  return process.env.LEADLINE_DATA_DIR || path.join(root, 'data');
}

/** @returns {string} SQLite file. One database holds all operational state. */
export function dbFile() {
  return process.env.LEADLINE_DB || path.join(dataDir(), 'leadline.db');
}

/** @returns {string} Dedicated Chrome profile. Never the person's daily profile. */
export function chromeProfileDir() {
  return path.join(dataDir(), 'chrome-profile');
}

/** @returns {string} Screenshot evidence for stuck pages. Not queried as state. */
export function encounterDir() {
  return path.join(dataDir(), 'encounters');
}

/** @returns {number} Chrome DevTools port. 9333 avoids Jobpilot's 9222. */
export function cdpPort() {
  const n = Number(process.env.LEADLINE_CDP_PORT || 9333);
  return Number.isFinite(n) && n > 0 ? n : 9333;
}
