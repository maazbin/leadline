// src/kernel/db.js — the only database connection.
//
// Owns: open SQLite in WAL mode, migrate, seed, prepared statements.
// Must not: contain business rules.
// Writes: data/leadline.db (or LEADLINE_DB).

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir, dbFile } from './paths.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

/** @type {import('node:sqlite').DatabaseSync | null} */
let db = null;

/** @returns {import('node:sqlite').DatabaseSync} */
export function getDb() {
  if (db) return db;
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
  db = new DatabaseSync(dbFile());
  db.prepare('PRAGMA foreign_keys = ON').get();
  db.prepare('PRAGMA journal_mode = WAL').get();
  db.prepare('PRAGMA busy_timeout = 5000').get();
  migrate(db);
  seed(db);
  return db;
}

/** Close the connection so tests can delete the file. */
export function closeDb() {
  if (!db) return;
  try {
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    db.prepare('PRAGMA journal_mode = DELETE').get();
  } catch {
    // Closing still has to drop the handle when a pragma fails.
  }
  db.close();
  db = null;
}

/**
 * @param {string} sql
 * @param {...unknown} params
 */
export function run(sql, ...params) {
  return getDb().prepare(sql).run(...params);
}

/**
 * @param {string} sql
 * @param {...unknown} params
 */
export function get(sql, ...params) {
  return getDb().prepare(sql).get(...params);
}

/**
 * @param {string} sql
 * @param {...unknown} params
 */
export function all(sql, ...params) {
  return getDb().prepare(sql).all(...params);
}
