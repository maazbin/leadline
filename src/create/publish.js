// src/create/publish.js — which LinkedIn or X draft Full power may post.
//
// Owns: the choice of the next draft, the factual post text, and the published mark after a real click.
// Must not: open Chrome or click Post. The browser module does that, then calls markDeskPublished.
// Must not: mark a row published while Full power is off.
// Reads: content_drafts, the active campaign.
// Writes: content_drafts.

import { get, run } from '../kernel/db.js';
import { agentMode, fullPower } from '../kernel/desk.js';
import { recordEvent } from '../kernel/events.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { activeCampaign, campaignChannels } from '../gtm/campaigns.js';
import { listContent, saveContent } from './drafts.js';

/**
 * A post made only from the campaign the person saved.
 * @param {{ name?: string, offer_summary?: string, goal?: string }} campaign
 * @returns {string}
 */
export function postBody(campaign) {
  const offer = String(campaign.offer_summary || '').trim();
  const goal = String(campaign.goal || '').trim();
  if (!offer && !goal) return '';
  const name = String(campaign.name || '').trim();
  return clip([name, offer, goal].filter(Boolean).join('\n\n'), 500);
}

function liveDraft(row) {
  return ['draft', 'idea', 'approved'].includes(row.status)
    && (row.channel === 'linkedin' || row.channel === 'x')
    && String(row.body || '').trim()
    && !String(row.title || '').startsWith('Trial:');
}

/** The next LinkedIn or X draft. Trials wait until the campaign posts are up. */
export function nextPublishable() {
  if (!fullPower() || agentMode('create') === 'off') return null;
  return listContent({ limit: 40 }).find(liveDraft) || null;
}

/** Write the missing LinkedIn or X post from the campaign. Does not publish it. */
export function ensureCampaignPost() {
  if (!fullPower() || agentMode('create') === 'off') return { ok: false, code: 'waiting' };
  const campaign = activeCampaign();
  if (!campaign) return { ok: false, code: 'no_campaign' };
  const body = postBody(campaign);
  if (!body) return { ok: false, code: 'empty_body' };
  const have = listContent({ campaignId: campaign.id, limit: 40 });
  const missing = campaignChannels(campaign.id)
    .filter((channel) => channel === 'linkedin' || channel === 'x')
    .find((channel) => !have.some((row) => row.channel === channel && row.status !== 'killed' && !String(row.title || '').startsWith('Trial:')));
  if (!missing) return { ok: false, code: 'none' };
  return saveContent({ campaignId: campaign.id, channel: missing, title: campaign.name, body });
}

/**
 * The desk marks a row published only after the browser click landed.
 * @param {number} id
 */
export function markDeskPublished(id) {
  if (!fullPower()) return { ok: false, code: 'waiting' };
  if (agentMode('create') === 'off') return { ok: false, code: 'permission' };
  const row = get('SELECT * FROM content_drafts WHERE id = ?', id);
  if (!row) return { ok: false, code: 'missing' };
  if (row.status === 'killed') return { ok: false, code: 'killed' };
  if (row.status === 'published') return { ok: true, id, status: 'published' };
  run('UPDATE content_drafts SET status = ?, updated_at = ? WHERE id = ?', 'published', nowIso(), id);
  recordEvent('create', 'published', String(id), `${row.channel} desk`);
  return { ok: true, id, status: 'published' };
}
