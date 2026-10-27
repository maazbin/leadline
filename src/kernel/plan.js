// src/kernel/plan.js — the plan for one local day, which the person can edit.
//
// Owns: day_plans and day_plan_items.
// Must not: send, approve, or start a campaign.
// Writes: the plan for a day. A proposal does nothing once that day already has lines.

import { all, get, run } from './db.js';
import { recordEvent } from './events.js';
import { clip } from './text.js';
import { nowIso } from './time.js';

/**
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD in the machine's local timezone.
 */
export function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function many(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value == null || value === '') return [];
  return [String(value)];
}

/**
 * @param {string} [day]
 */
export function getPlan(day = localDay()) {
  const note = get('SELECT note, updated_at FROM day_plans WHERE day = ?', day);
  const items = all(
    'SELECT id, body, done, sort_order FROM day_plan_items WHERE day = ? ORDER BY sort_order ASC, id ASC',
    day,
  );
  return {
    day,
    note: note?.note || '',
    updatedAt: note?.updated_at || '',
    items: items.map((row) => ({ ...row, done: Number(row.done) === 1 })),
  };
}

/**
 * Replace the day's note and lines from the form. An empty line is removed.
 * @param {string} day
 * @param {Record<string, unknown>} input
 * @param {string} actor
 */
export function saveDayPlan(day, input, actor) {
  if (actor !== 'person' && actor !== 'agent') return { ok: false, code: 'bad_actor' };
  const when = nowIso();
  const note = clip(input.note, 2000).trim();
  run(
    `INSERT INTO day_plans (day, note, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    day, note, when,
  );
  const done = new Set(many(input.done));
  const remove = new Set(many(input.remove));
  for (const id of many(input.item)) {
    const body = clip(input[`body_${id}`], 500).trim();
    if (!body || remove.has(id)) {
      run('DELETE FROM day_plan_items WHERE id = ? AND day = ?', Number(id), day);
      continue;
    }
    run(
      'UPDATE day_plan_items SET body = ?, done = ?, updated_at = ? WHERE id = ? AND day = ?',
      body, done.has(id) ? 1 : 0, when, Number(id), day,
    );
  }
  const added = clip(input.new_body, 500).trim();
  if (added) insertItem(day, added, when);
  recordEvent('kernel', 'plan', day, actor === 'person' ? 'edited' : 'proposed');
  return { ok: true, day, plan: getPlan(day) };
}

/**
 * Write a plan only when that day has no lines yet.
 * @param {string} day
 * @param {{ note?: string, items?: string[] }} proposal
 * @param {string} actor
 */
export function proposeDayPlan(day, proposal, actor) {
  if (actor !== 'agent' && actor !== 'person') return { ok: false, code: 'bad_actor' };
  const current = getPlan(day);
  if (current.items.length) return { ok: true, skipped: true, day };
  const when = nowIso();
  run(
    `INSERT INTO day_plans (day, note, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    day, clip(proposal.note, 2000).trim(), when,
  );
  for (const line of proposal.items || []) {
    const body = clip(line, 500).trim();
    if (body) insertItem(day, body, when);
  }
  recordEvent('kernel', 'plan', day, 'proposed');
  return { ok: true, skipped: false, day, plan: getPlan(day) };
}

/**
 * @param {string} day
 * @param {string} body
 * @param {string} when
 */
function insertItem(day, body, when) {
  const next = get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM day_plan_items WHERE day = ?', day);
  run(
    'INSERT INTO day_plan_items (day, body, done, sort_order, updated_at) VALUES (?, ?, 0, ?, ?)',
    day, body, Number(next?.n || 0) + 1, when,
  );
}
