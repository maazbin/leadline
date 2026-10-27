// src/discover/communities.js — X communities named on a page the desk has opened.
//
// Owns: which community links are real, and the memory that one was opened.
// Must not: open Chrome or post. The browser module does that.
// Reads: events, app_meta.
// Writes: events, app_meta key x_communities_at.

import { get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';

const RELEVANT = /job|career|hiring|engineer|interview|recruit|open to work|software/i;

/**
 * @param {string} query
 * @returns {string}
 */
export function communitySearchUrl(query) {
  const q = encodeURIComponent(String(query || 'job search').trim() || 'job search');
  return `https://x.com/search?q=${q}&src=typed_query&f=live`;
}

/**
 * @param {Array<string | { href?: string, text?: string }>} links
 * @returns {Array<{ id: string, url: string, text: string }>}
 */
export function extractCommunityLinks(links) {
  const found = [];
  for (const link of links) {
    const href = typeof link === 'string' ? link : link?.href;
    const text = typeof link === 'string' ? '' : String(link?.text || '');
    const match = String(href || '').match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/communities\/(\d+)/i);
    if (!match) continue;
    const url = `https://x.com/i/communities/${match[1]}`;
    if (found.some((row) => row.id === match[1])) continue;
    found.push({ id: match[1], url, text: text.trim() });
  }
  return found;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function communityLooksRelevant(text) {
  return RELEVANT.test(String(text || ''));
}

/**
 * @param {Array<{ id: string, url: string, text: string }>} links
 */
export function pickCommunity(links) {
  return links.find((link) => communityLooksRelevant(`${link.text} ${link.url}`)) || null;
}

/**
 * @param {string} id
 * @param {string} detail
 */
export function rememberCommunity(id, detail) {
  const existing = get(
    "SELECT id FROM events WHERE team = 'discover' AND kind = 'community' AND ref = ? LIMIT 1",
    String(id),
  );
  if (existing) return { ok: true, id: String(id), existed: true };
  recordEvent('discover', 'community', String(id), clip(detail, 300));
  return { ok: true, id: String(id), existed: false };
}

/** @returns {boolean} */
export function communityAlreadyPosted() {
  return Boolean(get("SELECT id FROM events WHERE team = 'discover' AND kind = 'community_post' LIMIT 1"));
}

/**
 * @param {string} id
 * @param {string} detail
 */
export function rememberCommunityPost(id, detail) {
  recordEvent('discover', 'community_post', String(id), clip(detail, 300));
  return { ok: true, id: String(id) };
}

/** @returns {boolean} */
export function exploredRecently() {
  const row = get("SELECT value FROM app_meta WHERE key = 'x_communities_at'");
  const then = Date.parse(String(row?.value || ''));
  return Number.isFinite(then) && Date.now() - then < 6 * 60 * 60 * 1000;
}

export function markExplored() {
  const now = nowIso();
  run(
    `INSERT INTO app_meta (key, value) VALUES ('x_communities_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    now,
  );
  return { ok: true, at: now };
}
