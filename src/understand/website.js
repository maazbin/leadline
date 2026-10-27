// src/understand/website.js — read the person's site into site_pages.
//
// Owns: fetch and store public pages they point at.
// Must not: overwrite offer, audience, or other answers. The person saves those.
// Writes: site_pages.

import { all, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { extractPage, sameSiteLinks } from './extract.js';

const UA = 'Leadline/0.1 (local; reading the operator site)';

/**
 * @param {string} url
 */
async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(12000),
  });
  const finalUrl = res.url || url;
  if (!res.ok) return { ok: false, code: 'http', detail: `${res.status} for ${finalUrl}` };
  const type = res.headers.get('content-type') || '';
  if (type && !/html|text\/plain/i.test(type)) return { ok: false, code: 'not_html', detail: type };
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 400_000) return { ok: false, code: 'too_large' };
  return { ok: true, url: finalUrl, html: new TextDecoder().decode(buf) };
}

/**
 * @param {{ url: string, title: string, description: string, headings: string, excerpt: string }} page
 */
export function savePage(page) {
  const now = nowIso();
  run(
    `INSERT INTO site_pages (url, title, description, headings, excerpt, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       headings = excluded.headings,
       excerpt = excluded.excerpt,
       fetched_at = excluded.fetched_at`,
    page.url,
    clip(page.title, 200),
    clip(page.description, 400),
    clip(page.headings, 1000),
    clip(page.excerpt, 4000),
    now,
  );
}

/** @returns {Array<Record<string, string>>} */
export function listPages() {
  return all('SELECT url, title, description, headings, excerpt, fetched_at FROM site_pages ORDER BY fetched_at DESC LIMIT 6');
}

/**
 * Read the URL and up to three same-site pages about the offer.
 * @param {string} raw
 */
export async function readWebsite(raw) {
  if (process.env.LEADLINE_DISABLE_NETWORK === '1') return { ok: false, code: 'network_disabled' };
  let start;
  try {
    start = new URL(String(raw || '').trim());
  } catch {
    return { ok: false, code: 'bad_url' };
  }
  if (start.protocol !== 'http:' && start.protocol !== 'https:') return { ok: false, code: 'bad_url' };
  let first;
  try {
    first = await fetchHtml(start.toString());
  } catch (err) {
    return { ok: false, code: 'network', detail: clip(err instanceof Error ? err.message : String(err), 200) };
  }
  if (!first.ok) return first;
  const page = extractPage(first.html, first.url);
  savePage(page);
  const pages = [page];
  for (const link of sameSiteLinks(first.html, first.url)) {
    if (pages.length >= 4) break;
    try {
      const next = await fetchHtml(link);
      if (!next.ok) continue;
      const extracted = extractPage(next.html, next.url);
      savePage(extracted);
      pages.push(extracted);
    } catch {
      // One failed inner page does not fail the read.
    }
  }
  recordEvent('understand', 'read_site', start.hostname, `${pages.length} pages`);
  const suggestedOffer = clip(page.description || page.headings.split('\n')[0] || page.title, 400);
  return {
    ok: true,
    pages: pages.map((item) => ({
      url: item.url,
      title: item.title,
      description: item.description,
      excerpt: clip(item.excerpt, 700),
    })),
    suggestedOffer,
  };
}
