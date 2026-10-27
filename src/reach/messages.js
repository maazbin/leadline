// src/reach/messages.js — drafts, approval requests, and the sent bit.
//
// Owns: message rows except the follow-up shell (followups.js) and the gate (gate.js).
// Must not: open Chrome.
// Human-only: approveMessage. The agent can draft, request approval, and cancel.
// Writes: messages, and leads.status when a draft or a send changes the pipeline.

import { get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { CHANNEL_IDS, oneOf } from '../kernel/enums.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { getLead } from '../discover/leads.js';
import { canSend, suppressionHit } from './gate.js';
import { scheduleFollowup } from './followups.js';
import { getMessage } from './rows.js';

export { getMessage };

/**
 * Create or update the open draft for this lead and channel.
 * A first message requires fit = yes. Nothing here is sent.
 * @param {{ leadId: number, channel: string, subject?: string, body: string, kind?: string, parentId?: number, campaignId?: number }} input
 */
export function draftMessage(input) {
  const channel = String(input.channel || '');
  const kind = input.kind || 'first';
  if (!oneOf(CHANNEL_IDS, channel)) return { ok: false, code: 'bad_channel' };
  if (kind !== 'first' && kind !== 'followup') return { ok: false, code: 'bad_kind' };
  const lead = getLead(input.leadId);
  if (!lead) return { ok: false, code: 'no_lead' };
  if (kind === 'first' && lead.fit !== 'yes') return { ok: false, code: 'not_qualified' };
  if (suppressionHit(lead)) return { ok: false, code: 'suppressed' };
  const body = clip(input.body, 8000).trim();
  if (!body) return { ok: false, code: 'empty_body' };
  const subject = clip(input.subject, 200).trim();
  const campaignId = Number(input.campaignId) || lead.campaign_id || null;

  if (kind === 'first') {
    const sent = get(
      "SELECT id FROM messages WHERE lead_id = ? AND channel = ? AND kind = 'first' AND status = 'sent'",
      lead.id, channel,
    );
    if (sent) return { ok: false, code: 'already_sent' };
    const open = get(
      `SELECT id FROM messages
       WHERE lead_id = ? AND channel = ? AND kind = 'first'
         AND status IN ('draft', 'awaiting_approval', 'approved')`,
      lead.id, channel,
    );
    if (open) {
      run(
        'UPDATE messages SET subject = ?, body = ?, campaign_id = COALESCE(?, campaign_id), updated_at = ? WHERE id = ?',
        subject, body, campaignId, nowIso(), open.id,
      );
      recordEvent('reach', 'draft', String(open.id), channel);
      return { ok: true, id: open.id, updated: true };
    }
  }

  const now = nowIso();
  const info = run(
    `INSERT INTO messages (
       lead_id, campaign_id, channel, kind, parent_id, subject, body, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    lead.id, campaignId, channel, kind, input.parentId || null, subject, body, now, now,
  );
  const id = Number(info.lastInsertRowid);
  if (['new', 'qualified'].includes(lead.status)) {
    run("UPDATE leads SET status = 'queued', updated_at = ? WHERE id = ?", now, lead.id);
  }
  recordEvent('reach', 'draft', String(id), channel);
  return { ok: true, id, updated: false };
}

/**
 * Move a draft to the Reach page. Does not approve it.
 * @param {number} id
 */
export function requestApproval(id) {
  const msg = getMessage(id);
  if (!msg) return { ok: false, code: 'missing' };
  if (!String(msg.body || '').trim()) return { ok: false, code: 'empty_body' };
  if (msg.status === 'sent') return { ok: false, code: 'already_sent' };
  if (msg.status === 'approved') return { ok: true, id, status: 'approved' };
  const gate = canSend(id);
  if (gate.ok) return { ok: true, id, status: msg.status, detail: 'This channel can already send. Call execute_send only when next_action says so.' };
  if (gate.code === 'permission') return { ok: false, code: 'permission', mode: gate.mode };
  if (gate.code !== 'not_approved') return gate;
  run("UPDATE messages SET status = 'awaiting_approval', updated_at = ? WHERE id = ?", nowIso(), id);
  recordEvent('reach', 'awaiting_approval', String(id), msg.channel);
  return { ok: true, id, status: 'awaiting_approval' };
}

/**
 * The Reach page calls this with actor "person". There is no tool for it.
 * @param {number} id
 * @param {string} actor
 */
export function approveMessage(id, actor) {
  if (actor !== 'person') return { ok: false, code: 'human_only' };
  const msg = getMessage(id);
  if (!msg) return { ok: false, code: 'missing' };
  if (!String(msg.body || '').trim()) return { ok: false, code: 'empty_body' };
  if (msg.status === 'sent') return { ok: false, code: 'already_sent' };
  const mode = get('SELECT mode FROM channel_permissions WHERE channel = ?', msg.channel)?.mode;
  if (mode !== 'approve' && mode !== 'auto') return { ok: false, code: 'permission', mode: mode || 'off' };
  run("UPDATE messages SET status = 'approved', updated_at = ? WHERE id = ?", nowIso(), id);
  recordEvent('reach', 'approved', String(id), msg.channel);
  return { ok: true, id, status: 'approved' };
}

/**
 * @param {number} id
 */
export function cancelMessage(id) {
  const msg = getMessage(id);
  if (!msg) return { ok: false, code: 'missing' };
  if (msg.status === 'sent') return { ok: false, code: 'already_sent' };
  run("UPDATE messages SET status = 'cancelled', updated_at = ? WHERE id = ?", nowIso(), id);
  recordEvent('reach', 'cancelled', String(id), msg.channel);
  return { ok: true, id };
}

/**
 * Record that the message left the browser. Re-checks the gate so a race cannot double-send.
 * Schedules one empty follow-up for a first message.
 * @param {number} id
 */
export function markSent(id) {
  const gate = canSend(id);
  if (!gate.ok) return gate;
  const now = nowIso();
  const info = run(
    `UPDATE messages SET status = 'sent', sent_at = ?, updated_at = ?, error = ''
     WHERE id = ? AND status != 'sent'`,
    now, now, id,
  );
  if (!info.changes) return { ok: false, code: 'already_sent' };
  run("UPDATE leads SET status = 'contacted', updated_at = ? WHERE id = ? AND status NOT IN ('replied', 'won', 'lost')", now, gate.message.lead_id);
  recordEvent('reach', 'sent', String(id), gate.message.channel);
  const followup = gate.message.kind === 'first' ? scheduleFollowup(gate.message) : { ok: false, code: 'not_first' };
  return { ok: true, id, followup };
}

/**
 * @param {number} id
 * @param {string} error
 */
export function markFailed(id, error) {
  const msg = getMessage(id);
  if (!msg) return { ok: false, code: 'missing' };
  if (msg.status === 'sent') return { ok: false, code: 'already_sent' };
  run(
    "UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
    clip(error, 400), nowIso(), id,
  );
  recordEvent('reach', 'failed', String(id), clip(error, 160));
  return { ok: true, id };
}
