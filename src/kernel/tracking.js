// src/kernel/tracking.js — series and tallies for the one desk screen.
//
// Owns: read-only trends, result counts, and path outcomes.
// Must not: write, send, or decide the next step.

import { all } from './db.js';

const DAY = 86400000;

/**
 * @param {number} span
 * @returns {string[]}
 */
function dayKeys(span) {
  const keys = [];
  const start = Date.now();
  for (let i = span - 1; i >= 0; i -= 1) {
    keys.push(new Date(start - i * DAY).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * @param {string} sql
 */
function byDay(sql) {
  const map = new Map();
  for (const row of all(sql)) map.set(String(row.day), Number(row.n));
  return map;
}

/**
 * Daily counts for the trend charts. Dates are the UTC day stored on each row.
 * @param {number} [span]
 */
export function trendSeries(span = 14) {
  const keys = dayKeys(span);
  const events = byDay('SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM events GROUP BY day');
  const leads = byDay('SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM leads GROUP BY day');
  const sent = byDay("SELECT substr(sent_at, 1, 10) AS day, COUNT(*) AS n FROM messages WHERE status = 'sent' AND sent_at IS NOT NULL GROUP BY day");
  return keys.map((day) => ({
    day,
    label: day.slice(5),
    events: events.get(day) || 0,
    leads: leads.get(day) || 0,
    sent: sent.get(day) || 0,
  }));
}

/** @returns {{ strategies: Array<Record<string, unknown>>, paths: Array<Record<string, unknown>>, messages: Array<Record<string, unknown>>, leads: Array<Record<string, unknown>> }} */
export function resultBoard() {
  return {
    strategies: all('SELECT platform, step, result, evidence, human_verdict, human_note, tries FROM strategies ORDER BY platform ASC, sort_order ASC'),
    paths: all('SELECT outcome, COUNT(*) AS n FROM path_branches GROUP BY outcome'),
    messages: all('SELECT status, COUNT(*) AS n FROM messages GROUP BY status'),
    leads: all('SELECT fit, status, COUNT(*) AS n FROM leads GROUP BY fit, status'),
  };
}
