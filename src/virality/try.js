// src/virality/try.js — one shorter pattern, posted once when Full power is on.
//
// Owns: the trial draft. The words are a shorter cut of a post that already exists.
// Must not: invent a new claim, post to every platform at once, or open Chrome.
// Reads: content_drafts.
// Writes: one content draft titled "Trial:".

import { agentMode, fullPower } from '../kernel/desk.js';
import { clip } from '../kernel/text.js';
import { listContent, saveContent } from '../create/drafts.js';

/**
 * One change: a shorter hook. A link in the original stays in the trial.
 * @param {string} body
 * @returns {string}
 */
export function shorterHook(body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const url = text.match(/https?:\/\/\S+/)?.[0] || '';
  const sentence = text.replace(url, '').split(/(?<=[.!?])\s/)[0].trim();
  let short = sentence || text;
  if (short.length > 140) short = clip(short, 140).trim();
  if (url && !short.includes(url)) short = `${short} ${url}`.trim();
  if (short === text) short = clip(text, Math.min(140, Math.max(40, text.length - 20))).trim();
  return clip(short, 240);
}

/** The open trial, or one new shorter draft on the same channel. */
export function ensureTrial() {
  if (!fullPower() || agentMode('virality') === 'off') return { ok: false, code: 'waiting' };
  const rows = listContent({ limit: 40 });
  const open = rows.find((row) => String(row.title || '').startsWith('Trial:') && (row.status === 'draft' || row.status === 'idea'));
  if (open) return { ok: true, id: open.id, channel: open.channel, body: open.body };
  if (rows.some((row) => String(row.title || '').startsWith('Trial:') && row.status === 'published')) {
    return { ok: false, code: 'none' };
  }
  const source = rows.find((row) => (
    (row.channel === 'x' || row.channel === 'linkedin')
    && row.status !== 'killed'
    && !String(row.title || '').startsWith('Trial:')
    && String(row.body || '').trim()
  ));
  if (!source) return { ok: false, code: 'none' };
  const body = shorterHook(source.body);
  if (!body) return { ok: false, code: 'empty_body' };
  const saved = saveContent({
    campaignId: source.campaign_id,
    channel: source.channel,
    title: 'Trial: shorter hook',
    body,
  });
  if (!saved.ok) return saved;
  return { ok: true, id: saved.id, channel: source.channel, body };
}
