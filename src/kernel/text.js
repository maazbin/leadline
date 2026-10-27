// src/kernel/text.js — small string helpers shared by every team.
//
// Owns: clipping, HTML escaping, URL identity, email shape.
// Must not: touch the network or the database.

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
export function clip(value, max) {
  const s = String(value ?? '');
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * @param {unknown} value
 * @returns {string} Safe to place in HTML text or an attribute.
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/**
 * Canonical http(s) URL for dedup. Drops the hash and common click ids.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeUrl(raw) {
  const u = new URL(String(raw || '').trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const err = new Error('bad_url');
    err.code = 'bad_url';
    throw err;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  for (const key of [...u.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') u.searchParams.delete(key);
  }
  return u.toString();
}

/**
 * Quote tokens so a person cannot break FTS5 syntax.
 * @param {unknown} raw
 * @returns {string}
 */
export function ftsQuery(raw) {
  const tokens = String(raw || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return tokens.slice(0, 8).map((token) => `"${token}"`).join(' AND ');
}
