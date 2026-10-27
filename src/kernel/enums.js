// src/kernel/enums.js — the only list of channels, modes, and statuses.
//
// Owns: closed sets every other module checks.
// Must not: store rows. Add a value here and in a new migration together.

export const CHANNELS = [
  { id: 'email', cap: 30, note: 'Gmail in the Leadline Chrome window.' },
  { id: 'linkedin', cap: 20, note: 'LinkedIn session in the Leadline Chrome window.' },
  { id: 'x', cap: 20, note: 'X session in the Leadline Chrome window.' },
  { id: 'reddit', cap: 10, note: 'Reddit session in the Leadline Chrome window.' },
  { id: 'instagram', cap: 10, note: 'Instagram session in the Leadline Chrome window.' },
  { id: 'facebook', cap: 10, note: 'Facebook session in the Leadline Chrome window.' },
  { id: 'tiktok', cap: 10, note: 'TikTok session in the Leadline Chrome window.' },
  { id: 'whatsapp', cap: 10, note: 'WhatsApp Web only. A QR code waits for you.' },
  { id: 'web_form', cap: 15, note: 'Public forms on the open web. A captcha stops the run.' },
];

/** @type {string[]} */
export const CHANNEL_IDS = CHANNELS.map((channel) => channel.id);

/** Discover sources. `web` is research. The rest can also be outreach channels. */
export const SOURCE_IDS = ['web', ...CHANNEL_IDS];

export const MODES = ['off', 'draft', 'approve', 'auto'];

/** Lanes the master runs. Reach follows the platform switches, so it is not listed here. */
export const LANES = [
  { id: 'understand', label: 'Understand', hint: 'Learns the offer from the site and your answers.' },
  { id: 'discover', label: 'Discover', hint: 'Finds people and marks who fits.' },
  { id: 'create', label: 'Create', hint: 'Writes posts and assets.' },
  { id: 'gtm', label: 'GTM', hint: 'Keeps the campaign, the mix, and the follow-up delay.' },
  { id: 'virality', label: 'Virality', hint: 'Tries one pattern at a time and records what moved.' },
];

export const LANE_IDS = ['reach', ...LANES.map((lane) => lane.id)];

/** Playbook name for a channel. */
export const CHANNEL_PLATFORM = {
  email: 'Email',
  linkedin: 'LinkedIn',
  x: 'X',
  reddit: 'Reddit',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  web_form: 'Web',
};

export const FITS = ['unreviewed', 'yes', 'no', 'maybe'];

export const LEAD_STATUSES = ['new', 'qualified', 'skipped', 'queued', 'contacted', 'replied', 'won', 'lost'];

export const MESSAGE_STATUSES = ['draft', 'awaiting_approval', 'approved', 'sent', 'failed', 'cancelled'];

export const CONTENT_STATUSES = ['idea', 'draft', 'approved', 'published', 'killed'];

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'done'];

export const PATH_OUTCOMES = ['reached', 'success', 'stop', 'refused', 'retry'];

export const ENCOUNTER_KINDS = ['captcha', 'login', 'stuck', 'error'];

/**
 * @param {string[]} allowed
 * @param {unknown} value
 * @returns {boolean}
 */
export function oneOf(allowed, value) {
  return allowed.includes(String(value || ''));
}
