// src/kernel/migrate.js — apply sql files in src/kernel/migrations once.
//
// Owns: schema_migrations.
// Must not: seed business data. seed.js does that.
// Writes: schema_migrations and whatever the sql file creates.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowIso } from './time.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(file, nowIso());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
