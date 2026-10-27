// src/discover/leads.js — people found on the open web and signed-in sites.
//
// Owns: lead identity, dedup, fit, and terminal outcomes.
// Must not: write a message or send one.
// Writes: leads, and the FTS index through SQL triggers.

import { get, all, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { SOURCE_IDS, FITS, oneOf } from '../kernel/enums.js';
import { clip, ftsQuery, looksLikeEmail, normalizeUrl } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { activeCampaign } from '../gtm/campaigns.js';
import { suppressionHit } from '../reach/gate.js';

/**
 * @param {number} id
 */
export function getLead(id) {
  return get('SELECT * FROM leads WHERE id = ?', id);
}

/**
 * @param {{ status?: string, fit?: string, q?: string, campaignId?: number, limit?: number }} [filter]
 */
export function listLeads(filter = {}) {
  const cap = Math.min(50, Math.max(1, Number(filter.limit) || 20));
  if (filter.q) return searchLeads(filter.q, cap);
  const where = [];
  const params = [];
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.fit) {
    where.push('fit = ?');
    params.push(filter.fit);
  }
  if (filter.campaignId) {
    where.push('campaign_id = ?');
    params.push(filter.campaignId);
  }
  const sql = `SELECT * FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
  return all(sql, ...params, cap);
}

/**
 * @param {string} q
 * @param {number} [limit]
 */
export function searchLeads(q, limit = 10) {
  const match = ftsQuery(q);
  const cap = Math.min(50, Math.max(1, limit));
  if (!match) return [];
  try {
    return all(
      `SELECT l.* FROM leads_fts JOIN leads l ON l.id = leads_fts.rowid
       WHERE leads_fts MATCH ? ORDER BY l.id DESC LIMIT ?`,
      match,
      cap,
    );
  } catch {
    const like = `%${clip(q, 40)}%`;
    return all(
      'SELECT * FROM leads WHERE name LIKE ? OR company LIKE ? OR snippet LIKE ? ORDER BY id DESC LIMIT ?',
      like, like, like, cap,
    );
  }
}

/**
 * Insert a lead or return the existing row. Email identity wins over a new URL.
 * @param {Record<string, unknown>} input
 */
export function saveLead(input) {
  const source = String(input.source || '');
  if (!oneOf(SOURCE_IDS, source)) return { ok: false, code: 'bad_source' };
  let sourceUrl = '';
  try {
    sourceUrl = normalizeUrl(input.source_url || input.sourceUrl);
  } catch {
    return { ok: false, code: 'bad_url' };
  }
  const email = clip(input.email, 200).trim();
  if (email && !looksLikeEmail(email)) return { ok: false, code: 'bad_email' };
  const fields = {
    name: clip(input.name, 160).trim(),
    company: clip(input.company, 160).trim(),
    role: clip(input.role, 160).trim(),
    email,
    handle: clip(input.handle, 120).trim().replace(/^@/, ''),
    location: clip(input.location, 160).trim(),
    snippet: clip(input.snippet, 1000).trim(),
  };
  const campaignId = Number(input.campaignId || input.campaign_id) || activeCampaign()?.id || null;

  const existing = (email && get('SELECT * FROM leads WHERE lower(email) = lower(?)', email))
    || get('SELECT * FROM leads WHERE source = ? AND source_url = ?', source, sourceUrl);
  if (existing) {
    run(
      `UPDATE leads SET
         name = CASE WHEN name = '' THEN ? ELSE name END,
         company = CASE WHEN company = '' THEN ? ELSE company END,
         role = CASE WHEN role = '' THEN ? ELSE role END,
         email = CASE WHEN email = '' THEN ? ELSE email END,
         handle = CASE WHEN handle = '' THEN ? ELSE handle END,
         location = CASE WHEN location = '' THEN ? ELSE location END,
         snippet = CASE WHEN snippet = '' THEN ? ELSE snippet END,
         campaign_id = COALESCE(campaign_id, ?),
         updated_at = ?
       WHERE id = ?`,
      fields.name, fields.company, fields.role, fields.email, fields.handle,
      fields.location, fields.snippet, campaignId, nowIso(), existing.id,
    );
    return { ok: true, id: existing.id, created: false };
  }

  const probe = { ...fields, company: fields.company, email: fields.email, handle: fields.handle, name: fields.name };
  const skipped = suppressionHit(probe);
  const now = nowIso();
  const info = run(
    `INSERT INTO leads (
       campaign_id, source, source_url, name, company, role, email, handle, location, snippet,
       fit, fit_reason, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    campaignId, source, sourceUrl, fields.name, fields.company, fields.role, fields.email,
    fields.handle, fields.location, fields.snippet,
    skipped ? 'no' : 'unreviewed',
    skipped ? 'On the do-not-contact list.' : '',
    skipped ? 'skipped' : 'new',
    now, now,
  );
  const id = Number(info.lastInsertRowid);
  recordEvent('discover', skipped ? 'lead_suppressed' : 'lead_saved', String(id), sourceUrl);
  return { ok: true, id, created: true, suppressed: skipped };
}

/**
 * @param {number} id
 * @param {string} fit
 * @param {string} [reason]
 */
export function setFit(id, fit, reason = '') {
  if (!oneOf(FITS, fit)) return { ok: false, code: 'bad_fit' };
  const lead = getLead(id);
  if (!lead) return { ok: false, code: 'missing' };
  let status = lead.status;
  const locked = ['contacted', 'replied', 'won', 'lost', 'queued'].includes(lead.status);
  if (!locked) {
    if (fit === 'no') status = 'skipped';
    else if (fit === 'yes') status = 'qualified';
    else if (fit === 'maybe' && lead.status === 'skipped') status = 'new';
    else if (fit === 'unreviewed' && lead.status === 'skipped') status = 'new';
  }
  run(
    'UPDATE leads SET fit = ?, fit_reason = ?, status = ?, updated_at = ? WHERE id = ?',
    fit, clip(reason, 500).trim(), status, nowIso(), id,
  );
  recordEvent('discover', 'fit', String(id), `${fit} ${reason}`.trim());
  return { ok: true, id, fit, status };
}

/**
 * Terminal outcomes cancel unsent messages. Both the person and the agent may set these.
 * Moving a lead backward is not allowed here.
 * @param {number} id
 * @param {string} status
 * @param {string} actor
 */
export function setLeadOutcome(id, status, actor) {
  if (actor !== 'person' && actor !== 'agent') return { ok: false, code: 'bad_actor' };
  if (!['replied', 'won', 'lost'].includes(status)) return { ok: false, code: 'bad_status' };
  const lead = getLead(id);
  if (!lead) return { ok: false, code: 'missing' };
  const now = nowIso();
  run('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?', status, now, id);
  run(
    `UPDATE messages SET status = 'cancelled', updated_at = ?
     WHERE lead_id = ? AND status IN ('draft', 'awaiting_approval', 'approved')`,
    now, id,
  );
  recordEvent('discover', status, String(id), actor);
  return { ok: true, id, status };
}

/** The next qualified lead that has no live first message. */
export function qualifiedWithoutMessage() {
  return get(
    `SELECT l.* FROM leads l
     WHERE l.fit = 'yes' AND l.status IN ('new', 'qualified', 'queued')
       AND NOT EXISTS (
         SELECT 1 FROM messages m
         WHERE m.lead_id = l.id AND m.kind = 'first' AND m.status != 'cancelled'
       )
     ORDER BY l.id ASC LIMIT 1`,
  );
}
