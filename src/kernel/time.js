// src/kernel/time.js — clock helpers.
//
// Owns: ISO timestamps and local-day boundaries for daily caps.
// Must not: read the database.

/** @returns {string} Current time as ISO-8601. */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
export function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** @returns {string} Local midnight as ISO. Daily caps follow the person's day. */
export function startOfLocalDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
