// src/reach/gate.js — the send gate. Every send passes through canSend.
//
// Owns: channel mode, daily cap, suppression, dedup, and whether this row may go out.
// Must not: change a mode, approve a row, or click Send.
// Reads: channel_permissions, messages, leads, business.
// Writes: channel_permissions only from setChannelMode, and only for actor "person".

import { get, run } from '../kernel/db.js';
import { agentMode, fullPower } from '../kernel/desk.js';
import { recordEvent } from '../kernel/events.js';
import { CHANNEL_IDS, MODES, oneOf } from '../kernel/enums.js';
import { nowIso, startOfLocalDayIso } from '../kernel/time.js';
import { getBusiness } from '../understand/profile.js';
import { getMessage } from './rows.js';

/**
 * @param {string} channel
 */
export function channelMode(channel) {
  return get('SELECT * FROM channel_permissions WHERE channel = ?', channel)
    || { channel, mode: 'off', daily_cap: 0, note: '' };
}

/**
 * @param {string} channel
 * @returns {number}
 */
export function sentToday(channel) {
  return Number(get(
    `SELECT COUNT(*) AS n FROM messages
     WHERE channel = ? AND status = 'sent' AND sent_at >= ?`,
    channel,
    startOfLocalDayIso(),
  ).n);
}

/**
 * The do-not-contact box. Short rules match the whole field. Longer rules match inside it.
 * @param {{ email?: string, handle?: string, company?: string, name?: string }} lead
 */
export function suppressionHit(lead) {
  const raw = String(getBusiness().do_not_contact || '').toLowerCase();
  const rules = raw.split(/[\n,;]+/).map((part) => part.trim()).filter((part) => part.length >= 3);
  if (!rules.length) return false;
  const fields = [lead.email, lead.handle, lead.company, lead.name]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);
  return rules.some((rule) => fields.some((field) => (
    rule.length < 6 ? field === rule : field === rule || field.includes(rule)
  )));
}

/**
 * @param {number} messageId
 * @returns {{ ok: true, message: Record<string, unknown> } | { ok: false, code: string, mode?: string, due_at?: string }}
 */
export function canSend(messageId) {
  const msg = getMessage(messageId);
  if (!msg) return { ok: false, code: 'missing' };
  if (!String(msg.body || '').trim()) return { ok: false, code: 'empty_body' };
  if (msg.status === 'sent') return { ok: false, code: 'already_sent' };
  if (msg.status === 'cancelled' || msg.status === 'failed') return { ok: false, code: msg.status };
  if (['replied', 'won', 'lost', 'skipped'].includes(msg.lead_status)) return { ok: false, code: 'lead_closed' };
  if (msg.kind === 'first' && msg.lead_fit !== 'yes') return { ok: false, code: 'not_qualified' };
  if (suppressionHit({
    email: msg.lead_email,
    handle: msg.lead_handle,
    company: msg.lead_company,
    name: msg.lead_name,
  })) return { ok: false, code: 'suppressed' };

  if (agentMode('reach') === 'off') return { ok: false, code: 'permission', mode: 'off' };
  const perm = channelMode(msg.channel);
  const power = fullPower();
  if (perm.mode === 'off' || perm.mode === 'draft') return { ok: false, code: 'permission', mode: perm.mode };
  if (msg.kind === 'followup' && msg.due_at && msg.due_at > nowIso()) {
    return { ok: false, code: 'not_due', due_at: msg.due_at };
  }
  const ready = ['draft', 'awaiting_approval', 'approved'];
  if (power && perm.mode === 'approve') {
    if (!ready.includes(msg.status)) return { ok: false, code: 'not_approved' };
  } else if (perm.mode === 'approve' && msg.status !== 'approved') {
    return { ok: false, code: 'not_approved' };
  } else if (perm.mode === 'auto' && !ready.includes(msg.status)) {
    return { ok: false, code: 'not_approved' };
  }
  if (sentToday(msg.channel) >= Number(perm.daily_cap)) return { ok: false, code: 'daily_cap' };

  if (msg.kind === 'first') {
    const sent = get(
      `SELECT id FROM messages
       WHERE lead_id = ? AND channel = ? AND kind = 'first' AND status = 'sent' AND id != ?`,
      msg.lead_id, msg.channel, msg.id,
    );
    if (sent) return { ok: false, code: 'already_sent' };
    if (msg.channel === 'email' && msg.lead_email) {
      const sameEmail = get(
        `SELECT m.id FROM messages m
         JOIN leads l ON l.id = m.lead_id
         WHERE m.status = 'sent' AND m.channel = 'email' AND m.kind = 'first'
           AND lower(l.email) = lower(?) AND m.id != ?`,
        msg.lead_email, msg.id,
      );
      if (sameEmail) return { ok: false, code: 'already_sent' };
    }
  }
  return { ok: true, message: msg };
}

/** @returns {Array<Record<string, unknown>>} */
export function listPermissions() {
  return CHANNEL_IDS.map((id) => ({ ...channelMode(id), sent_today: sentToday(id) }));
}

/**
 * The Permissions page is the only writer. Tools must not call this.
 * @param {string} channel
 * @param {string} mode
 * @param {number} dailyCap
 * @param {string} actor
 */
export function setChannelMode(channel, mode, dailyCap, actor) {
  if (actor !== 'person') return { ok: false, code: 'human_only' };
  if (!oneOf(CHANNEL_IDS, channel)) return { ok: false, code: 'bad_channel' };
  if (!oneOf(MODES, mode)) return { ok: false, code: 'bad_mode' };
  const cap = Math.min(200, Math.max(0, Number(dailyCap) || 0));
  run(
    'UPDATE channel_permissions SET mode = ?, daily_cap = ?, updated_at = ? WHERE channel = ?',
    mode, cap, nowIso(), channel,
  );
  recordEvent('reach', 'permission', channel, `${mode} cap ${cap}`);
  return { ok: true, channel, mode, daily_cap: cap };
}
