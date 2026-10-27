// src/reach/rows.js — read a message with the lead it belongs to.
//
// Owns: the joined select used by the gate, the sender, and the Reach page.
// Must not: write.

import { all, get } from '../kernel/db.js';

const SELECT = `
  SELECT m.*,
    l.name AS lead_name,
    l.email AS lead_email,
    l.company AS lead_company,
    l.handle AS lead_handle,
    l.source AS lead_source,
    l.source_url AS lead_url,
    l.fit AS lead_fit,
    l.status AS lead_status
  FROM messages m
  JOIN leads l ON l.id = m.lead_id
`;

/**
 * @param {number} id
 */
export function getMessage(id) {
  return get(`${SELECT} WHERE m.id = ?`, id);
}

/**
 * @param {{ status?: string, limit?: number }} [filter]
 */
export function listMessages(filter = {}) {
  const cap = Math.min(50, Math.max(1, Number(filter.limit) || 20));
  if (filter.open) {
    return all(
      `${SELECT} WHERE m.status IN ('draft', 'awaiting_approval', 'approved') ORDER BY m.updated_at DESC LIMIT ?`,
      cap,
    );
  }
  if (filter.status) {
    return all(`${SELECT} WHERE m.status = ? ORDER BY m.updated_at DESC LIMIT ?`, filter.status, cap);
  }
  return all(`${SELECT} ORDER BY m.updated_at DESC LIMIT ?`, cap);
}
