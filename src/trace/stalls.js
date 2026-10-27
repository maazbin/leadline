// src/trace/stalls.js — where the run stopped.
//
// Owns: stalls.
// Must not: send, approve, draft a message, or change a mode.
// Reads: leads and messages, to see whether the stall is still true.
// Writes: stalls.

import { all, get, run } from '../kernel/db.js';
import { agentMode, fullPower } from '../kernel/desk.js';
import { recordEvent } from '../kernel/events.js';
import { STALL_CODES, oneOf } from '../kernel/enums.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { leadsAwaitingMessage } from '../discover/leads.js';

export const STALL_LABEL = {
  no_message: 'No message written',
  composer: 'Note not in the box',
};

/**
 * @param {'open' | 'resolved'} [status]
 */
export function listStalls(status = 'open') {
  const wanted = status === 'resolved' ? 'resolved' : 'open';
  return all(
    `SELECT id, code, flow, step, ref, detail, status, resolution, created_at, updated_at
     FROM stalls WHERE status = ? ORDER BY id ASC`,
    wanted,
  );
}

/**
 * @param {{ code: string, flow?: string, step?: string, ref?: string, detail?: string }} input
 */
export function recordStall(input) {
  const code = String(input.code || '');
  if (!oneOf(STALL_CODES, code)) return { ok: false, code: 'bad_code' };
  if (agentMode('trace') === 'off') return { ok: true, skipped: true };
  const ref = clip(input.ref, 80);
  const detail = clip(input.detail, 500).trim();
  const flow = clip(input.flow, 40);
  const step = clip(input.step, 40);
  const now = nowIso();
  const existing = get(
    `SELECT id FROM stalls WHERE code = ? AND ref = ? AND status = 'open'`,
    code,
    ref,
  );
  if (existing) {
    run(
      'UPDATE stalls SET flow = ?, step = ?, detail = ?, updated_at = ? WHERE id = ?',
      flow, step, detail, now, existing.id,
    );
    return { ok: true, id: existing.id, updated: true };
  }
  const info = run(
    `INSERT INTO stalls (code, flow, step, ref, detail, status, resolution, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', '', ?, ?)`,
    code, flow, step, ref, detail, now, now,
  );
  const id = Number(info.lastInsertRowid);
  recordEvent('trace', 'stall', ref || String(id), code);
  return { ok: true, id, updated: false };
}

/**
 * @param {number} id
 * @param {string} note
 * @param {string} actor
 */
export function resolveStall(id, note, actor) {
  if (actor !== 'agent' && actor !== 'person') return { ok: false, code: 'bad_actor' };
  const row = get('SELECT id, status FROM stalls WHERE id = ?', Number(id));
  if (!row) return { ok: false, code: 'missing' };
  if (row.status === 'resolved') return { ok: true, id: row.id, already: true };
  const resolution = clip(note, 500).trim();
  run(
    `UPDATE stalls SET status = 'resolved', resolution = ?, updated_at = ? WHERE id = ?`,
    resolution, nowIso(), row.id,
  );
  recordEvent('trace', 'stall_cleared', String(row.id), resolution || 'cleared');
  return { ok: true, id: row.id };
}

/**
 * @param {Record<string, unknown>} lead
 */
function noMessageDetail(lead) {
  const name = String(lead.name || 'A person').trim() || 'A person';
  const parts = [`${name} is marked yes and has no message.`];
  if (!String(lead.email || '').trim()) parts.push('No email is on file.');
  parts.push(fullPower()
    ? 'Full power writes the note on the next pass.'
    : 'A message has to be written before a send can be asked.');
  if (lead.source === 'linkedin' || lead.source === 'x') {
    parts.push(`A ${lead.source} send stays unclicked until the note is in the box.`);
  }
  return parts.join(' ');
}

/** Write the open stalls, and clear any whose step has moved. */
export function syncStalls() {
  if (agentMode('trace') === 'off') return { ok: true, skipped: true, open: listStalls('open') };
  const waiting = leadsAwaitingMessage();
  const waitingIds = new Set(waiting.map((lead) => String(lead.id)));
  for (const lead of waiting) {
    recordStall({
      code: 'no_message',
      flow: 'reach',
      step: 'draft',
      ref: String(lead.id),
      detail: noMessageDetail(lead),
    });
  }
  for (const stall of listStalls('open')) {
    if (stall.code === 'no_message' && !waitingIds.has(String(stall.ref))) {
      resolveStall(stall.id, 'A message exists, or that person is no longer waiting.', 'agent');
    }
    if (stall.code === 'composer') {
      const msg = get('SELECT status FROM messages WHERE id = ?', Number(stall.ref));
      if (!msg || !['draft', 'awaiting_approval', 'approved'].includes(msg.status)) {
        resolveStall(stall.id, 'That message is no longer waiting to send.', 'agent');
      }
    }
  }
  return { ok: true, open: listStalls('open') };
}
