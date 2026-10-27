// src/kernel/stats.js — counts for the Today page and the home context slice.
//
// Owns: read-only totals.
// Must not: write.

import { get } from './db.js';

function num(sql) {
  return Number(get(sql).n);
}

/** @returns {Record<string, number>} */
export function dashboard() {
  return {
    leads: num('SELECT COUNT(*) AS n FROM leads'),
    qualified: num("SELECT COUNT(*) AS n FROM leads WHERE fit = 'yes'"),
    unreviewed: num("SELECT COUNT(*) AS n FROM leads WHERE fit = 'unreviewed'"),
    waiting: num("SELECT COUNT(*) AS n FROM messages WHERE status = 'awaiting_approval'"),
    drafts: num("SELECT COUNT(*) AS n FROM messages WHERE status = 'draft'"),
    sent: num("SELECT COUNT(*) AS n FROM messages WHERE status = 'sent'"),
    content: num("SELECT COUNT(*) AS n FROM content_drafts WHERE status IN ('idea', 'draft')"),
    campaigns: num('SELECT COUNT(*) AS n FROM campaigns'),
    active: num("SELECT COUNT(*) AS n FROM campaigns WHERE status = 'active'"),
    questions: num("SELECT COUNT(*) AS n FROM questions WHERE status = 'open'"),
    encounters: num("SELECT COUNT(*) AS n FROM encounters WHERE status = 'open'"),
  };
}
