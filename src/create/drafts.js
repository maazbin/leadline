// src/create/drafts.js — posts and assets. Publishing is a person's mark, not a send.
//
// Owns: content_drafts.
// Must not: discover leads or send outreach. Must not open a social composer.
// Human-only: approved, published, killed.
// Writes: content_drafts.

import { all, get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { CHANNEL_IDS, CONTENT_STATUSES, oneOf } from '../kernel/enums.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';

/**
 * @param {{ campaignId?: number, channel: string, title?: string, body: string }} input
 */
export function saveContent(input) {
  const channel = String(input.channel || '');
  if (!oneOf(CHANNEL_IDS, channel)) return { ok: false, code: 'bad_channel' };
  const body = clip(input.body, 8000).trim();
  if (!body) return { ok: false, code: 'empty_body' };
  const now = nowIso();
  const info = run(
    `INSERT INTO content_drafts (campaign_id, channel, title, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
    input.campaignId || null,
    channel,
    clip(input.title, 160).trim(),
    body,
    now,
    now,
  );
  const id = Number(info.lastInsertRowid);
  recordEvent('create', 'draft', String(id), channel);
  return { ok: true, id, status: 'draft' };
}

/**
 * The agent may rewrite a draft. The person approves and marks it published.
 * @param {number} id
 * @param {string} status
 * @param {string} actor
 */
export function setContentStatus(id, status, actor) {
  if (!oneOf(CONTENT_STATUSES, status)) return { ok: false, code: 'bad_status' };
  const row = get('SELECT * FROM content_drafts WHERE id = ?', id);
  if (!row) return { ok: false, code: 'missing' };
  if (row.status === 'published') return { ok: false, code: 'published' };
  const personOnly = ['approved', 'published', 'killed'];
  if (personOnly.includes(status) && actor !== 'person') return { ok: false, code: 'human_only' };
  if (actor !== 'person' && !['idea', 'draft'].includes(status)) return { ok: false, code: 'human_only' };
  run('UPDATE content_drafts SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), id);
  recordEvent('create', status, String(id), row.channel);
  return { ok: true, id, status };
}

/**
 * @param {{ campaignId?: number, limit?: number }} [filter]
 */
export function listContent(filter = {}) {
  const cap = Math.min(40, Math.max(1, Number(filter.limit) || 20));
  if (filter.campaignId) {
    return all('SELECT * FROM content_drafts WHERE campaign_id = ? ORDER BY id DESC LIMIT ?', filter.campaignId, cap);
  }
  return all('SELECT * FROM content_drafts ORDER BY id DESC LIMIT ?', cap);
}
