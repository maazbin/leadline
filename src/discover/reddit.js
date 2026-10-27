// src/discover/reddit.js — one public search. Candidates are not saved.
//
// Owns: a single rate-limited read of Reddit's public search JSON.
// Must not: log in, vote, comment, or message. The browser path does that later.
// Writes: app_meta.reddit_at so two calls cannot stampede.

import { get, run } from '../kernel/db.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { searchUrl } from './sources.js';

/**
 * @param {string} query
 * @param {number} [limit]
 */
export async function redditPublicSearch(query, limit = 8) {
  if (process.env.LEADLINE_DISABLE_NETWORK === '1') return { ok: false, code: 'network_disabled' };
  const q = clip(query, 160).trim();
  if (q.length < 2) return { ok: false, code: 'empty' };
  const last = get("SELECT value FROM app_meta WHERE key = 'reddit_at'")?.value;
  if (last && Date.now() - Date.parse(last) < 10_000) {
    return { ok: false, code: 'rate_limit', detail: 'Wait 10 seconds between Reddit reads.' };
  }
  run(
    `INSERT INTO app_meta (key, value) VALUES ('reddit_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    nowIso(),
  );
  const cap = Math.min(8, Math.max(1, Number(limit) || 8));
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&limit=${cap}&sort=new`;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Leadline/0.1 (local research)', accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { ok: false, code: 'http', detail: `Reddit returned ${res.status}. Open the search in Chrome instead.`, url: searchUrl('reddit', q) };
    }
    const json = await res.json();
    const children = json?.data?.children || [];
    const candidates = children.slice(0, cap).map((child) => {
      const post = child.data || {};
      const permalink = post.permalink ? `https://www.reddit.com${post.permalink}` : '';
      return {
        source: 'reddit',
        source_url: permalink || post.url || '',
        name: post.author || '',
        handle: post.author || '',
        company: post.subreddit_name_prefixed || '',
        snippet: clip(`${post.title || ''} ${post.selftext || ''}`, 400),
      };
    }).filter((row) => row.source_url);
    return { ok: true, candidates };
  } catch (err) {
    return {
      ok: false,
      code: 'network',
      detail: clip(err.message, 200),
      url: searchUrl('reddit', q),
    };
  }
}
