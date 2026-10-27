// src/reach/followups.js — one follow-up shell after a first send, then only what the brain writes.
//
// Owns: due dates and follow-up drafts.
// Must not: mark a message sent or approve it.
// Writes: messages rows whose kind is followup.

import { all, get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { clip } from '../kernel/text.js';
import { addDays, nowIso } from '../kernel/time.js';
import { getCampaign } from '../gtm/campaigns.js';
import { getMessage } from './rows.js';

/**
 * Create the empty follow-up that waits after a first message is sent.
 * A second call returns the row that already exists.
 * @param {Record<string, unknown>} parent
 */
export function scheduleFollowup(parent) {
  if (!parent || parent.kind !== 'first') return { ok: false, code: 'not_first' };
  const existing = get(
    "SELECT id FROM messages WHERE parent_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1",
    parent.id,
  );
  if (existing) return { ok: true, id: existing.id, existed: true };
  const campaign = parent.campaign_id ? getCampaign(parent.campaign_id) : null;
  const days = Number(campaign?.followup_days) || 4;
  const due = addDays(nowIso(), days);
  const now = nowIso();
  const info = run(
    `INSERT INTO messages (
       lead_id, campaign_id, channel, kind, parent_id, subject, body, status, due_at, created_at, updated_at
     ) VALUES (?, ?, ?, 'followup', ?, ?, '', 'draft', ?, ?, ?)`,
    parent.lead_id,
    parent.campaign_id,
    parent.channel,
    parent.id,
    parent.subject ? clip(`Re: ${parent.subject}`, 200) : '',
    due,
    now,
    now,
  );
  const id = Number(info.lastInsertRowid);
  recordEvent('reach', 'followup_scheduled', String(id), parent.channel);
  return { ok: true, id, due_at: due };
}

/**
 * Write the follow-up the brain composed. Does not send it.
 * messageId may be the sent parent or the follow-up row.
 * @param {{ messageId: number, days?: number, body?: string }} input
 */
export function writeFollowup(input) {
  const named = getMessage(input.messageId);
  if (!named) return { ok: false, code: 'missing' };
  let row = named;
  if (named.kind === 'first') {
    if (named.status !== 'sent') return { ok: false, code: 'parent_not_sent' };
    const created = scheduleFollowup(named);
    if (!created.ok) return created;
    row = getMessage(created.id);
  }
  if (!row) return { ok: false, code: 'missing' };
  if (row.status === 'sent') return { ok: false, code: 'already_sent' };
  const due = input.days ? addDays(nowIso(), Math.min(30, Math.max(1, Number(input.days) || 4))) : row.due_at;
  const body = typeof input.body === 'string' && input.body.trim() ? clip(input.body, 8000).trim() : row.body;
  run('UPDATE messages SET body = ?, due_at = ?, updated_at = ? WHERE id = ?', body, due, nowIso(), row.id);
  recordEvent('reach', 'followup_draft', String(row.id), row.channel);
  return { ok: true, id: row.id, due_at: due, status: row.status };
}

/**
 * @param {number} [limit]
 */
export function dueFollowups(limit = 10) {
  const cap = Math.min(20, Math.max(1, limit));
  return all(
    `SELECT m.*, l.name AS lead_name, l.company AS lead_company
     FROM messages m JOIN leads l ON l.id = m.lead_id
     WHERE m.kind = 'followup'
       AND m.status IN ('draft', 'awaiting_approval', 'approved')
       AND m.due_at IS NOT NULL AND m.due_at <= ?
     ORDER BY m.due_at ASC LIMIT ?`,
    nowIso(),
    cap,
  );
}
