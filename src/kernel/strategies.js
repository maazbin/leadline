// src/kernel/strategies.js — what to try on a platform, and what already failed.
//
// Owns: the strategies table.
// Must not: clear a human verdict of "wrong". The person does that on Memory.
// Reads: desk_settings, for Adapt.
// Writes: strategies, from recordStrategy and trainStrategy.

import { all, get, run } from './db.js';
import { adaptabilityOn } from './desk.js';
import { recordEvent } from './events.js';
import { clip } from './text.js';
import { nowIso } from './time.js';

/** @returns {Array<Record<string, unknown>>} */
export function listStrategies() {
  return all('SELECT * FROM strategies ORDER BY platform ASC, sort_order ASC, id ASC');
}

/**
 * The step to try next. "wrong" is always skipped. Adapt also skips a failed step
 * unless the person marked it "try".
 * @param {string} platform
 */
export function nextStrategy(platform) {
  const rows = all(
    'SELECT * FROM strategies WHERE platform = ? ORDER BY sort_order ASC, id ASC',
    String(platform || ''),
  );
  const open = rows.filter((row) => row.human_verdict !== 'wrong');
  if (!open.length) return null;
  if (!adaptabilityOn()) return open[0];
  return open.find((row) => row.human_verdict === 'try')
    || open.find((row) => row.result === 'worked')
    || open.find((row) => row.result === 'open')
    || null;
}

/**
 * The person marks a step to try next, or blocks it. An agent cannot call this.
 * @param {string} id
 * @param {string} verdict '' | 'try' | 'wrong'
 * @param {string} note
 * @param {string} actor
 */
export function trainStrategy(id, verdict, note, actor) {
  if (actor !== 'person') return { ok: false, code: 'human_only' };
  if (!['', 'try', 'wrong'].includes(verdict)) return { ok: false, code: 'bad_status' };
  const row = get('SELECT id FROM strategies WHERE id = ?', id);
  if (!row) return { ok: false, code: 'missing' };
  run(
    'UPDATE strategies SET human_verdict = ?, human_note = ?, updated_at = ? WHERE id = ?',
    verdict,
    clip(note, 500),
    nowIso(),
    id,
  );
  recordEvent('kernel', 'train', id, `${verdict || 'cleared'} ${clip(note, 160)}`);
  return { ok: true, id, verdict };
}

/**
 * Record one real attempt. A "wrong" verdict stays in place.
 * @param {string} id
 * @param {string} result
 * @param {string} evidence
 * @param {string} actor
 */
export function recordStrategy(id, result, evidence, actor) {
  if (actor !== 'agent' && actor !== 'person') return { ok: false, code: 'human_only' };
  if (!['open', 'worked', 'failed'].includes(result)) return { ok: false, code: 'bad_status' };
  const row = get('SELECT * FROM strategies WHERE id = ?', id);
  if (!row) return { ok: false, code: 'missing' };
  run(
    'UPDATE strategies SET result = ?, evidence = ?, tries = tries + 1, updated_at = ? WHERE id = ?',
    result,
    clip(evidence, 500),
    nowIso(),
    id,
  );
  recordEvent('kernel', 'strategy', id, `${result}: ${clip(evidence, 180)}`);
  return { ok: true, id, result, blocked: row.human_verdict === 'wrong' };
}
