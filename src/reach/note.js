// src/reach/note.js — the next factual note, written by the desk when Full power is on.
//
// Owns: the words of one first message, taken from the campaign the person already saved.
// Must not: open Chrome, click Send, invent proof, prices, or customers, or write when Full power is off.
// Reads: the lead, the active campaign, the business sender name, and the channel mode.
// Writes: one messages draft, through draftMessage. Also app_meta when a channel refuses free notes.

import { get, run } from '../kernel/db.js';
import { fullPower, agentMode } from '../kernel/desk.js';
import { nowIso } from '../kernel/time.js';
import { clip } from '../kernel/text.js';
import { activeCampaign, campaignChannels } from '../gtm/campaigns.js';
import { qualifiedWithoutMessage } from '../discover/leads.js';
import { getBusiness } from '../understand/profile.js';
import { channelMode } from './gate.js';
import { draftMessage } from './messages.js';

/**
 * A short note that fits a LinkedIn invite. Only the campaign text and the sender name.
 * @param {{ name?: string, offer?: string, goal?: string, sender?: string }} input
 * @returns {string}
 */
/** LinkedIn refused free notes. The desk waits six hours instead of opening the wall again. */
export function holdChannel(channel) {
  const key = `${String(channel || '').trim()}_notes_at`;
  if (!key || key === '_notes_at') return { ok: false, code: 'bad_channel' };
  const now = nowIso();
  run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    now,
  );
  return { ok: true, at: now };
}

/** @param {string} channel */
export function channelHeld(channel) {
  const row = get('SELECT value FROM app_meta WHERE key = ?', `${channel}_notes_at`);
  const then = Date.parse(String(row?.value || ''));
  return Number.isFinite(then) && Date.now() - then < 6 * 60 * 60 * 1000;
}

export function noteFor(input) {
  const facts = [input.offer, input.goal].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  if (!facts) return '';
  const url = facts.match(/https?:\/\/\S+/)?.[0] || '';
  const sentence = facts.replace(url, '').split(/(?<=[.!?])\s/)[0].replace(/\s+/g, ' ').trim();
  const who = String(input.name || '').trim().split(/\s+/)[0] || '';
  const sign = String(input.sender || '').trim();
  const tail = [url, sign].filter(Boolean).join(' ');
  const hello = who ? `${who}, ` : '';
  const room = 200 - hello.length - (tail ? tail.length + 1 : 0);
  const line = clip(sentence || facts, Math.max(24, room)).trim();
  return clip(`${hello}${line}${tail ? ` ${tail}` : ''}`.replace(/\s+/g, ' ').trim(), 200);
}

/**
 * Where this person can be reached, limited to channels the campaign uses and Full power may send.
 * @param {{ source_url?: string, email?: string, handle?: string }} lead
 * @param {string[]} channels
 * @returns {string}
 */
export function channelForLead(lead, channels) {
  const open = channels.filter((channel) => {
    const mode = channelMode(channel).mode;
    return mode === 'auto' || (fullPower() && mode === 'approve');
  });
  const url = String(lead.source_url || '');
  if (open.includes('linkedin') && /linkedin\.com/i.test(url)) return 'linkedin';
  if (open.includes('x') && (/x\.com|twitter\.com/i.test(url) || lead.handle)) return 'x';
  if (open.includes('email') && lead.email) return 'email';
  return '';
}

/** Write one first draft for the next qualified person. Full power only. Nothing is sent here. */
export function draftNextNote() {
  if (!fullPower()) return { ok: false, code: 'waiting' };
  if (agentMode('reach') === 'off') return { ok: false, code: 'permission' };
  const lead = qualifiedWithoutMessage();
  if (!lead) return { ok: false, code: 'none' };
  const campaign = activeCampaign();
  if (!campaign) return { ok: false, code: 'no_campaign' };
  const channel = channelForLead(lead, campaignChannels(campaign.id));
  if (!channel) return { ok: false, code: 'no_channel' };
  const business = getBusiness();
  const body = noteFor({
    name: lead.name,
    offer: campaign.offer_summary,
    goal: campaign.goal,
    sender: business.sender_name,
  });
  if (!body) return { ok: false, code: 'empty_body' };
  const subject = channel === 'email' ? clip(campaign.name, 120) : '';
  return draftMessage({
    leadId: lead.id,
    channel,
    subject,
    body,
    campaignId: campaign.id,
  });
}
