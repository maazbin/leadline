// src/kernel/events.js — append-only activity log in SQLite.
//
// Owns: events rows and the short list the Today page shows.
// Must not: decide the next step.
// Writes: events. Keeps the newest 2000 rows.

import { all, run } from './db.js';
import { clip } from './text.js';
import { nowIso } from './time.js';

/**
 * @param {string} team understand | discover | reach | create | gtm | browser | kernel
 * @param {string} kind
 * @param {string} ref
 * @param {string} detail
 */
export function recordEvent(team, kind, ref, detail) {
  run(
    'INSERT INTO events (at, team, kind, ref, detail) VALUES (?, ?, ?, ?, ?)',
    nowIso(),
    clip(team, 40),
    clip(kind, 60),
    clip(ref, 80),
    clip(detail, 500),
  );
  run('DELETE FROM events WHERE id < (SELECT MAX(id) FROM events) - 2000');
}

/**
 * @param {number} [limit]
 */
export function recentEvents(limit = 8) {
  const cap = Math.min(30, Math.max(1, limit));
  return all('SELECT * FROM events ORDER BY id DESC LIMIT ?', cap);
}
