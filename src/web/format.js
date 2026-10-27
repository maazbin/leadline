// src/web/format.js — small shared bits of desk HTML.
//
// Owns: a stat, a timestamp, and one activity line.
// Must not: read or write the database. Callers pass the row.

import { esc } from '../kernel/text.js';
import { STALL_LABEL } from '../trace/stalls.js';

/**
 * @param {string} label
 * @param {number | string} value
 */
export function stat(label, value) {
  return `<div class="statbox"><span class="stat">${esc(value)}</span><span>${esc(label)}</span></div>`;
}

/**
 * @param {string} iso
 */
export function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '');
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {Record<string, string>} row
 */
export function activityLine(row) {
  if (row.kind === 'desk') return 'Settings updated';
  if (row.kind === 'lane') return `${row.ref} set to ${row.detail}`;
  if (row.kind === 'permission') return `${row.ref}: ${row.detail}`;
  if (row.kind === 'train') return `Playbook updated for ${row.ref}`;
  if (row.kind === 'strategy') return `${row.ref}: ${row.detail}`;
  if (row.kind === 'material') return `Material saved: ${row.detail}`;
  if (row.kind === 'plan') return `Plan ${row.detail}`;
  if (row.kind === 'stall') return `Trace: ${STALL_LABEL[row.detail] || row.detail}`;
  if (row.kind === 'stall_cleared') return 'Trace cleared a stall';
  if (row.kind === 'ledger') return row.detail === 'crew fine' ? 'Master checked the crew' : `Master check: ${row.detail}`;
  const detail = row.detail ? ` — ${row.detail}` : '';
  return `${row.team} ${row.kind}${detail}`;
}
