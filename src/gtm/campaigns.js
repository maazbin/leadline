// src/gtm/campaigns.js — a campaign links the other teams. It does not do their work.
//
// Owns: campaign rows, which channels a campaign uses, and the start/pause decision.
// Must not: discover people, write copy, or send.
// Writes: campaigns, campaign_channels.
// Human-only: leaving draft status. The agent may create a draft.

import { all, get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { CAMPAIGN_STATUSES, CHANNEL_IDS, oneOf } from '../kernel/enums.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';

/**
 * @param {number} id
 */
export function getCampaign(id) {
  return get('SELECT * FROM campaigns WHERE id = ?', id);
}

/** @returns {Record<string, unknown> | undefined} */
export function activeCampaign() {
  return get("SELECT * FROM campaigns WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1");
}

/** @returns {Record<string, unknown> | undefined} */
export function newestCampaign() {
  return get('SELECT * FROM campaigns ORDER BY id DESC LIMIT 1');
}

/** @returns {Array<Record<string, unknown>>} */
export function listCampaigns() {
  return all('SELECT * FROM campaigns ORDER BY id DESC LIMIT 20');
}

/**
 * @param {number} id
 * @returns {string[]}
 */
export function campaignChannels(id) {
  return all('SELECT channel FROM campaign_channels WHERE campaign_id = ? ORDER BY channel', id)
    .map((row) => row.channel);
}

/**
 * @param {{ name?: string, goal?: string, offerSummary?: string, icpSummary?: string, followupDays?: number, channels?: string[] }} input
 */
export function createCampaign(input) {
  const name = clip(input.name, 120).trim();
  if (!name) return { ok: false, code: 'missing_name' };
  const channels = [...new Set(input.channels || [])].filter((channel) => CHANNEL_IDS.includes(channel));
  if (!channels.length) return { ok: false, code: 'no_channel' };
  const days = Math.min(30, Math.max(1, Number(input.followupDays) || 4));
  const now = nowIso();
  const info = run(
    `INSERT INTO campaigns (name, goal, status, offer_summary, icp_summary, followup_days, created_at, updated_at)
     VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`,
    name,
    clip(input.goal, 500).trim(),
    clip(input.offerSummary || input.offer_summary, 500).trim(),
    clip(input.icpSummary || input.icp_summary, 500).trim(),
    days,
    now,
    now,
  );
  const id = Number(info.lastInsertRowid);
  for (const channel of channels) {
    run('INSERT INTO campaign_channels (campaign_id, channel) VALUES (?, ?)', id, channel);
  }
  recordEvent('gtm', 'campaign_created', String(id), name);
  return { ok: true, id, status: 'draft' };
}

/**
 * Starting, pausing, and finishing are the person's buttons.
 * @param {number} id
 * @param {string} status
 * @param {string} actor
 */
export function setCampaignStatus(id, status, actor) {
  if (!oneOf(CAMPAIGN_STATUSES, status)) return { ok: false, code: 'bad_status' };
  if (status !== 'draft' && actor !== 'person') return { ok: false, code: 'human_only' };
  const row = getCampaign(id);
  if (!row) return { ok: false, code: 'missing' };
  run('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), id);
  recordEvent('gtm', 'campaign_status', String(id), status);
  return { ok: true, id, status };
}

/**
 * Counts for one campaign. Pass no id to use the active campaign, then the newest.
 * @param {number} [id]
 */
export function campaignView(id) {
  const campaign = (id && getCampaign(id)) || activeCampaign() || newestCampaign();
  if (!campaign) return { ok: false, code: 'none' };
  const cid = campaign.id;
  const count = (sql) => Number(get(sql, cid).n);
  return {
    ok: true,
    campaign,
    channels: campaignChannels(cid),
    counts: {
      leads: count('SELECT COUNT(*) AS n FROM leads WHERE campaign_id = ?'),
      qualified: count("SELECT COUNT(*) AS n FROM leads WHERE campaign_id = ? AND fit = 'yes'"),
      sent: count("SELECT COUNT(*) AS n FROM messages WHERE campaign_id = ? AND status = 'sent'"),
      waiting: count("SELECT COUNT(*) AS n FROM messages WHERE campaign_id = ? AND status = 'awaiting_approval'"),
      content: count('SELECT COUNT(*) AS n FROM content_drafts WHERE campaign_id = ?'),
    },
  };
}
